"""
Mia Laurent — Fiverr Automation Bot
Entry point and main orchestration loop.

Flow per order:
  1. Gmail receives Fiverr order notification
  2. Parse order details from email
  3. Send one clarifying question to buyer on Fiverr (human delay)
  4. Gmail receives buyer's reply
  5. Generate script via Claude API
  6. Apply 1-3 hour delivery hold
  7. Send Telegram preview → wait for YES/NO
  8. YES → deliver on Fiverr (upload .docx + message)
  9. Log to console (and optionally Google Calendar)
"""

import asyncio
import logging
import random
import sys

import config
import state_manager as sm
import gmail_watcher
import order_parser
import script_writer
import telegram_notifier
from fiverr_deliverer import FiverrClient
from humanizer import human_delay, delivery_hold, is_working_hours
from personas.mia import CLARIFYING_QUESTIONS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("main")

GMAIL_POLL_INTERVAL = 120  # seconds between Gmail checks


async def handle_new_order(email_data: dict, fiverr: FiverrClient) -> None:
    """Process a new order notification email end-to-end."""
    parsed = order_parser.parse_order_email(email_data)
    if not parsed:
        log.warning("Could not parse order from email — skipping.")
        return

    order_id = parsed["order_id"]

    # Idempotency — don't process the same order twice
    if sm.exists(order_id):
        log.info("Order %s already in state machine — skipping.", order_id)
        return

    order = sm.create(parsed)
    log.info(
        "New order: %s | Buyer: %s | Tier: %s | Price: €%s",
        order_id,
        order["buyer_name"],
        order["service_tier"],
        order.get("price_eur"),
    )

    await telegram_notifier.notify(
        f"📦 New order arrived: `{order_id}`\n"
        f"Buyer: *{order['buyer_name']}* | Tier: *{order['service_tier']}*\n"
        f"Brief: {order['requirements'][:200]}…"
    )

    # Step 1: Send clarifying question after human delay
    await human_delay("before clarifying question")

    question = random.choice(CLARIFYING_QUESTIONS).format(name=order["buyer_name"])
    success = await fiverr.send_message(order_id, question)

    if success:
        sm.update_state(order_id, "CLARIFYING", clarifying_question=question)
        log.info("Clarifying question sent for order %s.", order_id)
    else:
        # If Playwright fails, log and move directly to writing
        log.warning("Could not send clarifying question for %s — proceeding without.", order_id)
        await generate_and_queue(order, fiverr)


async def handle_buyer_reply(email_data: dict, fiverr: FiverrClient) -> None:
    """Process a buyer message reply — typically their answer to the clarifying question."""
    parsed = order_parser.parse_message_email(email_data)
    if not parsed or not parsed.get("order_id"):
        return

    order_id = parsed["order_id"]
    order = sm.load(order_id)

    if not order or order["state"] != "CLARIFYING":
        return

    buyer_answer = parsed.get("message_text", "")
    log.info("Buyer replied on order %s: %s", order_id, buyer_answer[:100])

    # React to the message (thumbs up / heart)
    await human_delay("before reaction")
    await fiverr.react_to_message(order_id)

    # Update state and generate script
    order = sm.update_state(order_id, "WRITING", buyer_answer=buyer_answer)
    await generate_and_queue(order, fiverr)


async def generate_and_queue(order: dict, fiverr: FiverrClient) -> None:
    """Generate the script with Claude and queue for Telegram approval."""
    order_id = order["order_id"]
    sm.update_state(order_id, "WRITING")

    result = script_writer.generate_script(
        order_id=order_id,
        buyer_name=order["buyer_name"],
        tier=order["service_tier"],
        requirements=order["requirements"],
        buyer_answer=order.get("buyer_answer"),
    )

    sm.update_state(
        order_id,
        "PENDING",
        generated_script=result["script"],
        client_message=result["client_message"],
    )
    log.info("Script generated for order %s. Applying delivery hold.", order_id)

    # 1-3 hour human hold before delivering
    await delivery_hold()

    order = sm.load(order_id)
    await queue_for_approval(order, fiverr)


async def queue_for_approval(order: dict, fiverr: FiverrClient) -> None:
    """Send script preview to Telegram and wait for operator YES/NO."""
    order_id = order["order_id"]

    approved, msg_id = await telegram_notifier.send_script_preview(
        order_id=order_id,
        buyer_name=order["buyer_name"],
        tier=order["service_tier"],
        client_message=order["client_message"],
        script_preview=order["generated_script"],
    )

    sm.update_state(order_id, "PENDING", telegram_message_id=msg_id)

    if not approved:
        sm.update_state(order_id, "REJECTED")
        await telegram_notifier.notify(f"❌ Order `{order_id}` skipped. Edit and deliver manually.")
        return

    # Approved — deliver on Fiverr
    sm.update_state(order_id, "DELIVERING")
    await human_delay("before delivery")

    success = await fiverr.deliver_order(
        order_id=order_id,
        client_message=order["client_message"],
        script_text=order["generated_script"],
        buyer_name=order["buyer_name"],
    )

    if success:
        sm.update_state(order_id, "COMPLETE")
        log.info("Order %s delivered.", order_id)
        await telegram_notifier.notify(f"✅ Order `{order_id}` delivered to *{order['buyer_name']}*!")
    else:
        sm.update_state(order_id, "PENDING")
        await telegram_notifier.notify(
            f"⚠️ Delivery automation failed for `{order_id}`. Please deliver manually.\n"
            f"Script saved in orders/{order_id}.json"
        )


async def resume_pending_orders(fiverr: FiverrClient) -> None:
    """On startup, pick up any orders that were mid-flight when the bot last stopped."""
    open_orders = sm.all_open()
    if not open_orders:
        return
    log.info("Resuming %d open order(s) from previous session.", len(open_orders))
    for order in open_orders:
        state = order.get("state")
        log.info("Resuming order %s (state=%s).", order["order_id"], state)

        if state == "PENDING" and order.get("generated_script"):
            # Script exists but approval not confirmed — re-send to Telegram
            asyncio.create_task(queue_for_approval(order, fiverr))
        elif state in ("NEW", "WRITING"):
            # Script not generated yet — generate now
            asyncio.create_task(generate_and_queue(order, fiverr))
        # CLARIFYING — nothing to do, waiting on buyer via Gmail


async def main() -> None:
    log.info("Starting Mia Laurent Fiverr bot...")

    # Start Telegram bot
    tg_app = await telegram_notifier.build_app()
    log.info("Telegram bot running.")

    # Start Fiverr Playwright session
    fiverr = FiverrClient()
    await fiverr.start()
    await fiverr.login()

    # Resume any mid-flight orders from last session
    await resume_pending_orders(fiverr)

    await telegram_notifier.notify("🤖 Mia bot started and online ✨")

    # Main Gmail polling loop
    try:
        async for email_data in gmail_watcher.poll_gmail(GMAIL_POLL_INTERVAL):
            email_type = email_data.get("type")
            if email_type == "order":
                asyncio.create_task(handle_new_order(email_data, fiverr))
            elif email_type == "message":
                asyncio.create_task(handle_buyer_reply(email_data, fiverr))
    except asyncio.CancelledError:
        log.info("Bot shutting down.")
    finally:
        await fiverr.stop()
        if tg_app:
            await tg_app.updater.stop()
            await tg_app.stop()
            await tg_app.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
