"""
Telegram notification + approval flow.

When a script is ready, sends a preview to the operator via Telegram.
Operator replies YES to deliver, NO to skip/edit manually.

Uses python-telegram-bot in async mode.
"""

import asyncio
import logging
from typing import Optional

from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.ext import Application, CallbackQueryHandler, ContextTypes

import config

log = logging.getLogger(__name__)

_app: Optional[Application] = None

# Maps telegram_message_id → asyncio.Future (resolved with True/False)
_pending: dict[int, asyncio.Future] = {}


async def build_app() -> Application:
    global _app
    _app = Application.builder().token(config.TELEGRAM_BOT_TOKEN).build()
    _app.add_handler(CallbackQueryHandler(_handle_callback))
    await _app.initialize()
    await _app.start()
    # Start polling in background
    await _app.updater.start_polling(drop_pending_updates=True)
    return _app


async def _handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    data = query.data  # "approve:{msg_id}" or "reject:{msg_id}"
    action, msg_id_str = data.split(":", 1)
    msg_id = int(msg_id_str)

    fut = _pending.get(msg_id)
    if fut and not fut.done():
        fut.set_result(action == "approve")

    icon = "✅" if action == "approve" else "❌"
    await query.edit_message_text(f"{icon} {action.upper()}")


async def send_script_preview(
    order_id: str,
    buyer_name: str,
    tier: str,
    client_message: str,
    script_preview: str,
) -> bool:
    """
    Send a Telegram message with script preview + YES/NO buttons.
    Blocks until the operator replies.
    Returns True if approved.
    """
    bot = Bot(token=config.TELEGRAM_BOT_TOKEN)

    preview = script_preview[:800] + ("…" if len(script_preview) > 800 else "")

    text = (
        f"📦 *Order ready — {order_id}*\n"
        f"Buyer: `{buyer_name}` | Tier: `{tier}`\n\n"
        f"*Message to client:*\n{client_message}\n\n"
        f"*Script preview:*\n```\n{preview}\n```"
    )

    msg = await bot.send_message(
        chat_id=config.TELEGRAM_CHAT_ID,
        text=text,
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=InlineKeyboardMarkup([
            [
                InlineKeyboardButton("✅ YES — Deliver", callback_data=f"approve:{{msg_id}}"),
                InlineKeyboardButton("❌ NO — Skip", callback_data=f"reject:{{msg_id}}"),
            ]
        ]),
    )

    # Fix callback data with real message ID
    keyboard = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ YES — Deliver", callback_data=f"approve:{msg.message_id}"),
            InlineKeyboardButton("❌ NO — Skip", callback_data=f"reject:{msg.message_id}"),
        ]
    ])
    await bot.edit_message_reply_markup(
        chat_id=config.TELEGRAM_CHAT_ID,
        message_id=msg.message_id,
        reply_markup=keyboard,
    )

    loop = asyncio.get_event_loop()
    fut: asyncio.Future = loop.create_future()
    _pending[msg.message_id] = fut

    log.info("Telegram approval request sent for order %s (msg_id=%d).", order_id, msg.message_id)

    # Wait for operator response — no timeout (operator can respond any time)
    approved = await fut
    del _pending[msg.message_id]
    log.info("Telegram response for order %s: %s.", order_id, "APPROVED" if approved else "REJECTED")
    return approved, msg.message_id


async def notify(text: str) -> None:
    """Send a plain text notification to the operator."""
    bot = Bot(token=config.TELEGRAM_BOT_TOKEN)
    await bot.send_message(
        chat_id=config.TELEGRAM_CHAT_ID,
        text=text,
        parse_mode=ParseMode.MARKDOWN,
    )
