"""
Claude API wrapper — generates video scripts in Mia Laurent's voice.

Uses the Anthropic Messages API with prompt caching for the system prompt.
"""

import logging
import re
from typing import Optional

import anthropic

import config
from personas.mia import SYSTEM_PROMPT, TIERS

log = logging.getLogger(__name__)

_client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)


def generate_script(
    order_id: str,
    buyer_name: str,
    tier: str,
    requirements: str,
    buyer_answer: Optional[str] = None,
) -> dict:
    """
    Generate a video script and client message using Claude.

    Returns:
        {
            "client_message": str,   # Short warm message to send to buyer
            "script": str,           # Full formatted script
            "full_response": str,    # Raw Claude output
        }
    """
    tier_info = TIERS.get(tier, TIERS["standard"])
    word_count = {
        "basic": "up to 800 words",
        "standard": "up to 2,000 words",
        "premium": "up to 4,000 words",
    }.get(tier, "up to 1,500 words")

    brief_section = f"BUYER BRIEF:\n{requirements}"
    if buyer_answer:
        brief_section += f"\n\nBUYER ANSWERED YOUR CLARIFYING QUESTION:\n{buyer_answer}"

    user_prompt = f"""
Order ID: {order_id}
Tier: {tier_info['name']} ({word_count})
Buyer first name: {buyer_name}

{brief_section}

Write the client message (warm, Mia's style, 2-3 sentences) then the full video script.
The script must be {word_count}. Format exactly as specified — client message first,
then ---SCRIPT START--- ... ---SCRIPT END--- markers.
"""

    log.info("Calling Claude API for order %s (tier=%s).", order_id, tier)

    response = _client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8192,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_prompt}],
    )

    full_text = response.content[0].text
    log.info(
        "Claude response received. Input tokens=%d, output tokens=%d.",
        response.usage.input_tokens,
        response.usage.output_tokens,
    )

    client_message, script = _split_response(full_text)

    return {
        "client_message": client_message,
        "script": script,
        "full_response": full_text,
    }


def _split_response(text: str) -> tuple[str, str]:
    """Split Claude's response into the client message and the script."""
    start_marker = "---SCRIPT START---"
    end_marker = "---SCRIPT END---"

    start_idx = text.find(start_marker)
    end_idx = text.find(end_marker)

    if start_idx == -1 or end_idx == -1:
        # Fallback: treat first paragraph as client message, rest as script
        parts = text.strip().split("\n\n", 1)
        if len(parts) == 2:
            return parts[0].strip(), parts[1].strip()
        return "", text.strip()

    client_message = text[:start_idx].strip()
    script = text[start_idx + len(start_marker): end_idx].strip()
    return client_message, script
