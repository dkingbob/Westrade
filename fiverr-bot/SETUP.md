# Mia Laurent — Fiverr Bot Setup

Complete setup in ~15 minutes once you have the credentials.

---

## 1. Prerequisites

- Python 3.11+
- A Fiverr account for Mia (already created)
- A Gmail account for Mia (already created)
- Anthropic API key
- A Telegram bot + your chat ID

---

## 2. Install dependencies

```bash
cd fiverr-bot
pip install -r requirements.txt
playwright install chromium
```

---

## 3. Create your .env file

```bash
cp .env.example .env
```

Open `.env` and fill in every value:

| Key | Where to get it |
|-----|----------------|
| `GMAIL_ADDRESS` | Mia's Gmail address |
| `GMAIL_APP_PASSWORD` | Google Account → Security → 2-Step Verification → App Passwords → "Mail" |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `TELEGRAM_BOT_TOKEN` | Message @BotFather on Telegram → /newbot |
| `TELEGRAM_CHAT_ID` | Message @userinfobot after starting your bot — it shows your numeric ID |
| `FIVERR_EMAIL` | Email used to log into Fiverr |
| `FIVERR_PASSWORD` | Fiverr account password |

**Important:** `GMAIL_APP_PASSWORD` is a 16-character code from Google, NOT your real password.
You must have 2-Step Verification enabled to generate it.

---

## 4. Enable Gmail IMAP

In Mia's Gmail:
1. Settings (gear) → See all settings → Forwarding and POP/IMAP
2. Enable IMAP
3. Save

---

## 5. Run the bot

```bash
python main.py
```

The bot will:
- Start polling Gmail every 2 minutes
- Log into Fiverr via headless Chrome
- Send you a Telegram message: "Mia bot started and online ✨"

---

## 6. When an order arrives

1. You get a Telegram notification with the order details
2. The bot automatically sends a clarifying question to the buyer on Fiverr
3. When the buyer replies, the bot generates the script with Claude
4. After a 1-3 hour hold, you get a Telegram message with:
   - The client message (what Mia will say)
   - A script preview
   - ✅ YES — Deliver  |  ❌ NO — Skip buttons
5. Tap YES → bot delivers automatically
6. Tap NO → script is saved in `orders/<order_id>.json`, deliver manually

---

## 7. Keep it running (server/VPS)

Use `screen` or `tmux` to keep it alive:

```bash
screen -S mia
python main.py
# Ctrl+A then D to detach
```

Or create a simple systemd service.

---

## 8. Order files

Every order is saved in `orders/<FO1234567890>.json`.
If the bot crashes mid-order it will resume automatically on next start.

---

## Spain timezone

The bot is online 08:00–23:00 Europe/Madrid.
Outside those hours it queues everything and resumes at 08:00.
US clients wake up to finished work — this is a feature, not a bug.
