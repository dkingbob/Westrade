"""
WebSocket client — connects to AlgoDesk backend for real-time sync.
Sends heartbeats, receives config updates, and emits trade events.
"""

import asyncio
import json
import logging
import time
from datetime import datetime

import aiohttp

log = logging.getLogger("algodesk.ws")

RECONNECT_DELAY = 3  # seconds


class BackendWSClient:
    def __init__(self, ws_url: str, api_url: str, heartbeat_interval: int = 10):
        self.ws_url = ws_url
        self.api_url = api_url
        self.heartbeat_interval = heartbeat_interval
        self.ws = None
        self.connected = False
        self._config_handlers = []
        self._kill_switch_handlers = []
        self.mt5_connected = False
        self.mt5_account_id = None
        self.mt5_server = None
        self.mt5_equity = None

    def on_config_update(self, handler):
        """Register a callback for config updates from dashboard."""
        self._config_handlers.append(handler)

    def on_kill_switch(self, handler):
        """Register a callback for kill switch activation."""
        self._kill_switch_handlers.append(handler)

    async def send_heartbeat(self):
        """POST heartbeat to backend REST API."""
        while True:
            try:
                async with aiohttp.ClientSession() as session:
                    payload = {
                        "mt5Connected": self.mt5_connected,
                        "mt5AccountId": self.mt5_account_id,
                        "mt5Server": self.mt5_server,
                        "mt5Equity": self.mt5_equity,
                    }
                    async with session.post(
                        f"{self.api_url}/connections/bot/heartbeat",
                        json=payload,
                        timeout=aiohttp.ClientTimeout(total=5),
                    ) as resp:
                        if resp.status == 200:
                            log.debug("Heartbeat sent OK")
                        else:
                            log.warning(f"Heartbeat returned {resp.status}")
            except Exception as e:
                log.warning(f"Heartbeat failed: {e}")
            await asyncio.sleep(self.heartbeat_interval)

    async def emit_trade(self, trade: dict):
        """Send a trade event to the dashboard via WebSocket."""
        if self.ws and not self.ws.closed:
            try:
                await self.ws.send_str(json.dumps({"type": "bot_trade", "data": trade}))
            except Exception as e:
                log.warning(f"Failed to emit trade: {e}")

    async def emit_position_update(self, positions: list):
        """Send position update to the dashboard."""
        if self.ws and not self.ws.closed:
            try:
                await self.ws.send_str(json.dumps({"type": "bot_positions", "data": positions}))
            except Exception as e:
                log.warning(f"Failed to emit positions: {e}")

    async def _listen(self, ws):
        """Listen for messages from the dashboard."""
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                    msg_type = data.get("type", "")

                    if msg_type == "config_update":
                        log.info(f"Config update received: {data.get('data', {})}")
                        for handler in self._config_handlers:
                            await handler(data.get("data", {}))

                    elif msg_type == "kill_switch":
                        log.warning("KILL SWITCH ACTIVATED from dashboard!")
                        for handler in self._kill_switch_handlers:
                            await handler()

                    elif msg_type == "ping":
                        await ws.send_str(json.dumps({"type": "pong"}))

                except json.JSONDecodeError:
                    log.warning(f"Received non-JSON message: {msg.data}")
            elif msg.type == aiohttp.WSMsgType.ERROR:
                log.error(f"WebSocket error: {ws.exception()}")
                break
            elif msg.type == aiohttp.WSMsgType.CLOSED:
                break

    async def run(self):
        """Main WebSocket connection loop with auto-reconnect."""
        asyncio.create_task(self.send_heartbeat())

        while True:
            try:
                log.info(f"Connecting to dashboard WebSocket: {self.ws_url}")
                async with aiohttp.ClientSession() as session:
                    async with session.ws_connect(
                        self.ws_url,
                        heartbeat=30,
                        timeout=aiohttp.ClientWSTimeout(ws_close=10),
                    ) as ws:
                        self.ws = ws
                        self.connected = True
                        log.info("Connected to AlgoDesk dashboard")

                        # Identify ourselves
                        await ws.send_str(json.dumps({
                            "type": "bot_connect",
                            "data": {"client": "python_bot", "timestamp": datetime.utcnow().isoformat()},
                        }))

                        await self._listen(ws)

            except Exception as e:
                log.warning(f"WebSocket disconnected: {e}. Reconnecting in {RECONNECT_DELAY}s...")

            finally:
                self.ws = None
                self.connected = False

            await asyncio.sleep(RECONNECT_DELAY)
