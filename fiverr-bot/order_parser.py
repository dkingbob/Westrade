"""
Extract structured order data from Fiverr notification emails.

Fiverr email bodies are plain-text summaries. We extract:
- order_id (e.g. FO1234567890)
- buyer_username
- buyer_name (display name if present)
- service_tier (basic / standard / premium — inferred from price or gig title)
- requirements (buyer's brief text)
- delivery_due (deadline string)
- price_eur (float)
"""

import logging
import re
from typing import Optional

log = logging.getLogger(__name__)

# Matches Fiverr order IDs like FO1234567890
_ORDER_ID_RE = re.compile(r"\bFO\d{7,12}\b")
# Matches lines like "Delivery Time: 3 days"
_DELIVERY_RE = re.compile(r"delivery.*?(\d+\s*days?)", re.IGNORECASE)
# Matches price like €40, €90, $40, $180
_PRICE_RE = re.compile(r"[€$£](\d+(?:\.\d{2})?)")
# Fiverr message notification — sender username appears as "username sent you a message"
_SENDER_RE = re.compile(r"^([a-zA-Z0-9_]+)\s+sent you a message", re.IGNORECASE | re.MULTILINE)


def _infer_tier(price: Optional[float], subject: str) -> str:
    if price is None:
        return "standard"
    if price <= 50:
        return "basic"
    if price <= 100:
        return "standard"
    return "premium"


def parse_order_email(email_data: dict) -> Optional[dict]:
    """
    Parse a raw email dict (from gmail_watcher) into a structured order dict.
    Returns None if the email can't be parsed as a valid order.
    """
    body = email_data.get("body", "")
    subject = email_data.get("subject", "")

    # Extract order ID
    order_id_match = _ORDER_ID_RE.search(body) or _ORDER_ID_RE.search(subject)
    if not order_id_match:
        log.debug("No order ID found in email — skipping.")
        return None
    order_id = order_id_match.group()

    # Extract price
    price = None
    price_match = _PRICE_RE.search(body)
    if price_match:
        price = float(price_match.group(1))

    # Extract delivery deadline
    delivery_days = None
    delivery_match = _DELIVERY_RE.search(body)
    if delivery_match:
        delivery_days = delivery_match.group(1).strip()

    # Extract buyer username — Fiverr emails often contain "from @username" or similar
    buyer_username = _extract_buyer(body, subject)

    # Extract requirements — the buyer's brief is usually after "Requirements:" or "Buyer Instructions:"
    requirements = _extract_requirements(body)

    tier = _infer_tier(price, subject)

    return {
        "order_id": order_id,
        "buyer_username": buyer_username or "buyer",
        "buyer_name": _title_case(buyer_username) if buyer_username else "there",
        "service_tier": tier,
        "price_eur": price,
        "delivery_days": delivery_days,
        "requirements": requirements,
        "raw_email_body": body,
    }


def parse_message_email(email_data: dict) -> Optional[dict]:
    """
    Parse a buyer reply message email. Returns dict with sender + message text.
    """
    body = email_data.get("body", "")
    subject = email_data.get("subject", "")

    order_id_match = _ORDER_ID_RE.search(body) or _ORDER_ID_RE.search(subject)
    order_id = order_id_match.group() if order_id_match else None

    # Try to find sender
    sender_match = _SENDER_RE.search(subject)
    sender = sender_match.group(1) if sender_match else None

    # The actual message content is usually in the body after a separator
    message_text = _extract_message_body(body)

    return {
        "order_id": order_id,
        "sender_username": sender,
        "message_text": message_text,
        "raw_email_body": body,
    }


# ── Helpers ──────────────────────────────────────────────────────────────────

def _extract_buyer(body: str, subject: str) -> Optional[str]:
    # Pattern: "Order from username" or "New order by username"
    for pattern in [
        r"order from\s+([a-zA-Z0-9_]+)",
        r"placed by\s+([a-zA-Z0-9_]+)",
        r"buyer[:\s]+([a-zA-Z0-9_]+)",
        r"@([a-zA-Z0-9_]+)",
    ]:
        m = re.search(pattern, body + " " + subject, re.IGNORECASE)
        if m:
            username = m.group(1).strip()
            # Filter out generic words
            if username.lower() not in ("fiverr", "com", "the", "a", "an"):
                return username
    return None


def _extract_requirements(body: str) -> str:
    """Extract buyer brief / requirements from email body."""
    markers = [
        "requirements:",
        "buyer instructions:",
        "order requirements:",
        "what do you need:",
        "your message:",
    ]
    body_lower = body.lower()
    for marker in markers:
        idx = body_lower.find(marker)
        if idx != -1:
            snippet = body[idx + len(marker):].strip()
            # Take up to 2000 chars
            return snippet[:2000].strip()

    # Fallback: return last third of body (usually contains the brief)
    lines = [l.strip() for l in body.strip().split("\n") if l.strip()]
    if len(lines) > 6:
        return "\n".join(lines[-(len(lines) // 3):])[:2000]
    return body[:2000]


def _extract_message_body(body: str) -> str:
    """Extract the actual message text from a notification email."""
    # Usually after "wrote:" or a horizontal separator
    for sep in ["wrote:", "said:", "message:", "-----"]:
        idx = body.lower().find(sep)
        if idx != -1:
            return body[idx + len(sep):].strip()[:2000]
    return body[:1000].strip()


def _title_case(username: Optional[str]) -> str:
    if not username:
        return "there"
    # Convert underscore_names to Title Case
    return username.replace("_", " ").title()
