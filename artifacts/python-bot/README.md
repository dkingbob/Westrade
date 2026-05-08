# AlgoDesk Python Trading Bot

A production-grade Python trading bot that connects to the AlgoDesk dashboard via WebSocket and executes trades through MetaTrader 5.

## Architecture

```
AlgoDesk Dashboard (React)
        ↕ WebSocket
AlgoDesk Backend (Node.js/Express)
        ↕ WebSocket / REST API  
Python Trading Bot (this directory)
        ↕ MT5 Library (Windows only)
MetaTrader 5 Terminal
        ↕
Live Broker / Demo Account
```

## Setup

### Requirements
- Python 3.10+
- MetaTrader 5 terminal (Windows only — Linux/Mac runs in simulation mode)
- A broker account with MT5 access (demo accounts work)

### Installation

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 3. Run the bot
python bot.py
```

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `ALGODESK_WS_URL` | Dashboard WebSocket URL | `ws://localhost:80/api/ws` |
| `ALGODESK_API_URL` | Dashboard REST API URL | `http://localhost:80/api` |
| `BOT_MODE` | `paper` or `live` | `paper` |
| `MT5_ACCOUNT` | MT5 account number | — |
| `MT5_PASSWORD` | MT5 account password | — |
| `MT5_SERVER` | MT5 broker server | — |
| `TWITTER_BEARER_TOKEN` | Twitter API v2 Bearer Token | — |
| `REDDIT_CLIENT_ID` | Reddit API client ID | — |
| `REDDIT_CLIENT_SECRET` | Reddit API client secret | — |
| `NEWS_API_KEY` | NewsAPI.org API key | — |

## Modes

### Paper Mode (default)
- Runs on all platforms (Windows/Linux/Mac)
- Simulates trades using GBM price model
- Connects to dashboard and sends real-time updates
- No real money at risk

### Live Mode (Windows + MT5 required)
- Connects to your MT5 terminal
- Places real orders through your broker
- Full risk management (stop loss, kill switch)
- Requires `BOT_MODE=live` and MT5 credentials

## Strategies

| Strategy | Description |
|---|---|
| Mean Reversion | Z-score based — trades when price deviates 2σ from 20-period mean |
| Momentum | RSI-based — trades overbought/oversold conditions |
| Statistical Arbitrage | VWAP deviation — trades price divergence from volume-weighted average |

## Dashboard Integration

The bot connects to the AlgoDesk dashboard and:
- Sends **heartbeats** every 10 seconds (visible in Connection Hub)
- Receives **config updates** (paused symbols, kill switch, mode changes)
- Streams **trade events** in real time
- Syncs **position data** every 5 ticks

## Kill Switch

The kill switch can be activated from the dashboard Risk Engine page. When activated:
1. Dashboard sends kill switch command via WebSocket
2. Bot immediately stops opening new positions
3. All open positions are closed
4. Kill switch remains active until manually deactivated
