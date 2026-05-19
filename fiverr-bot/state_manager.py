"""
Persistent order state — one JSON file per open order in ./orders/

States:
  NEW          → order received, clarifying question not yet sent
  CLARIFYING   → question sent to buyer, waiting for their reply
  WRITING      → buyer answered, generating script
  PENDING      → script ready, waiting for Telegram YES/NO
  DELIVERING   → approved, delivering on Fiverr
  COMPLETE     → delivered
  REJECTED     → operator said NO via Telegram
"""

import json
import logging
import os
from datetime import datetime
from typing import Optional

import config

log = logging.getLogger(__name__)

os.makedirs(config.ORDERS_DIR, exist_ok=True)


def _path(order_id: str) -> str:
    return os.path.join(config.ORDERS_DIR, f"{order_id}.json")


def load(order_id: str) -> Optional[dict]:
    p = _path(order_id)
    if not os.path.exists(p):
        return None
    with open(p) as f:
        return json.load(f)


def save(order: dict) -> None:
    order["updated_at"] = datetime.utcnow().isoformat()
    with open(_path(order["order_id"]), "w") as f:
        json.dump(order, f, indent=2)
    log.debug("Order %s saved — state=%s.", order["order_id"], order.get("state"))


def create(parsed: dict) -> dict:
    order = {
        **parsed,
        "state": "NEW",
        "clarifying_question": None,
        "buyer_answer": None,
        "generated_script": None,
        "client_message": None,
        "telegram_message_id": None,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    save(order)
    log.info("Order %s created.", order["order_id"])
    return order


def all_open() -> list[dict]:
    """Return all orders that are not COMPLETE or REJECTED."""
    orders = []
    for fname in os.listdir(config.ORDERS_DIR):
        if not fname.endswith(".json"):
            continue
        try:
            with open(os.path.join(config.ORDERS_DIR, fname)) as f:
                o = json.load(f)
            if o.get("state") not in ("COMPLETE", "REJECTED"):
                orders.append(o)
        except Exception as exc:
            log.warning("Could not read %s: %s", fname, exc)
    return orders


def update_state(order_id: str, new_state: str, **kwargs) -> dict:
    order = load(order_id)
    if not order:
        raise ValueError(f"Order {order_id} not found.")
    order["state"] = new_state
    order.update(kwargs)
    save(order)
    return order


def exists(order_id: str) -> bool:
    return os.path.exists(_path(order_id))
