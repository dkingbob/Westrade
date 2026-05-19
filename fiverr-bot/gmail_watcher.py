"""
Gmail IMAP watcher.

Polls for unread Fiverr notification emails and returns structured raw data.
Uses App Password authentication — never the real account password.
"""

import asyncio
import email
import imaplib
import logging
import re
from email.header import decode_header
from typing import Optional

import config

log = logging.getLogger(__name__)

# Fiverr sends notifications from these addresses
FIVERR_SENDERS = [
    "noreply@fiverr.com",
    "orders@fiverr.com",
    "support@fiverr.com",
    "notifications@fiverr.com",
]

# Keywords that identify a new order email vs a message notification
ORDER_SUBJECT_KEYWORDS = [
    "new order",
    "order confirmed",
    "you have a new order",
]

MESSAGE_SUBJECT_KEYWORDS = [
    "sent you a message",
    "replied to your message",
    "new message",
]


def _decode_header_value(value: str) -> str:
    parts = decode_header(value)
    result = []
    for part, enc in parts:
        if isinstance(part, bytes):
            result.append(part.decode(enc or "utf-8", errors="replace"))
        else:
            result.append(part)
    return " ".join(result)


def _get_body(msg: email.message.Message) -> str:
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            if content_type == "text/plain":
                try:
                    body = part.get_payload(decode=True).decode("utf-8", errors="replace")
                    break
                except Exception:
                    pass
    else:
        try:
            body = msg.get_payload(decode=True).decode("utf-8", errors="replace")
        except Exception:
            pass
    return body


def _connect() -> imaplib.IMAP4_SSL:
    conn = imaplib.IMAP4_SSL(config.GMAIL_IMAP_HOST, config.GMAIL_IMAP_PORT)
    conn.login(config.GMAIL_ADDRESS, config.GMAIL_APP_PASSWORD)
    conn.select("INBOX")
    return conn


def fetch_new_order_emails() -> list[dict]:
    """
    Return a list of unread order notification emails from Fiverr.
    Each dict: {uid, subject, body, from, date}
    Marks fetched emails as read.
    """
    results = []
    try:
        conn = _connect()
        # Search for unread emails from any Fiverr sender
        _, data = conn.search(None, '(UNSEEN FROM "fiverr.com")')
        uids = data[0].split()
        for uid in uids:
            _, raw = conn.fetch(uid, "(RFC822)")
            msg = email.message_from_bytes(raw[0][1])
            subject = _decode_header_value(msg.get("Subject", ""))
            sender = msg.get("From", "").lower()
            body = _get_body(msg)

            # Only care about order notifications
            subject_lower = subject.lower()
            is_order = any(kw in subject_lower for kw in ORDER_SUBJECT_KEYWORDS)
            is_message = any(kw in subject_lower for kw in MESSAGE_SUBJECT_KEYWORDS)

            if not (is_order or is_message):
                continue

            # Mark as read
            conn.store(uid, "+FLAGS", "\\Seen")

            results.append({
                "uid": uid.decode(),
                "subject": subject,
                "body": body,
                "from": sender,
                "date": msg.get("Date", ""),
                "type": "order" if is_order else "message",
            })

        conn.logout()
    except Exception as exc:
        log.error("Gmail fetch error: %s", exc)
    return results


async def poll_gmail(interval_seconds: int = 120):
    """
    Async generator that yields new Fiverr emails every `interval_seconds`.
    """
    log.info("Gmail watcher started. Polling every %ds.", interval_seconds)
    while True:
        emails = fetch_new_order_emails()
        for e in emails:
            log.info("New Fiverr email — type=%s subject=%s", e["type"], e["subject"])
            yield e
        await asyncio.sleep(interval_seconds)
