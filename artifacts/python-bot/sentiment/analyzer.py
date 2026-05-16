"""
Sentiment Analyzer — fetches market sentiment from configured sources.
Supports Twitter/X, Reddit, NewsAPI, and falls back to simulation.
"""

import asyncio
import logging
import os
import random
from datetime import datetime
from typing import Optional

import aiohttp

log = logging.getLogger("algodesk.sentiment")

FETCH_INTERVAL = 60  # seconds between sentiment refreshes


class SentimentAnalyzer:
    def __init__(self):
        self.score = 50.0  # 0-100: 50 = neutral, >50 bullish, <50 bearish
        self.institutional = 54.0
        self.retail = 46.0
        self.momentum_score = 51.0
        self.mode = "simulation"
        self.last_update = None

        # API keys from environment
        self.twitter_token = os.getenv("TWITTER_BEARER_TOKEN", "")
        self.reddit_client_id = os.getenv("REDDIT_CLIENT_ID", "")
        self.reddit_secret = os.getenv("REDDIT_CLIENT_SECRET", "")
        self.news_api_key = os.getenv("NEWS_API_KEY", "")

    def get_score(self) -> float:
        """Return current composite sentiment score (0-100)."""
        return self.score

    def get_api_status(self) -> dict:
        """Return which external sentiment API keys are configured."""
        return {
            "twitter": bool(self.twitter_token),
            "reddit": bool(self.reddit_client_id),
            "newsApi": bool(self.news_api_key),
        }

    def get_full_sentiment(self) -> dict:
        return {
            "composite": round(self.score, 2),
            "institutional": round(self.institutional, 2),
            "retail": round(self.retail, 2),
            "momentum": round(self.momentum_score, 2),
            "mode": self.mode,
            "lastUpdate": self.last_update,
        }

    async def _fetch_twitter_sentiment(self) -> Optional[float]:
        """Fetch sentiment from Twitter/X API."""
        if not self.twitter_token:
            return None
        try:
            async with aiohttp.ClientSession() as session:
                headers = {"Authorization": f"Bearer {self.twitter_token}"}
                query = "($AAPL OR $MSFT OR #stocks OR #trading) -is:retweet lang:en"
                url = "https://api.twitter.com/2/tweets/search/recent"
                params = {"query": query, "max_results": 100, "tweet.fields": "public_metrics"}
                async with session.get(url, headers=headers, params=params) as resp:
                    if resp.status != 200:
                        return None
                    data = await resp.json()
                    tweets = data.get("data", [])
                    if not tweets:
                        return None
                    # Simple keyword-based scoring
                    bullish_words = {"up", "bull", "buy", "long", "moon", "pump", "surge", "rally", "gain", "profit"}
                    bearish_words = {"down", "bear", "sell", "short", "crash", "dump", "drop", "fall", "loss", "sell"}
                    score = 0.0
                    for tweet in tweets:
                        text = tweet.get("text", "").lower()
                        bull_count = sum(1 for w in bullish_words if w in text)
                        bear_count = sum(1 for w in bearish_words if w in text)
                        score += bull_count - bear_count
                    normalized = 50 + (score / max(len(tweets), 1)) * 10
                    return max(0, min(100, normalized))
        except Exception as e:
            log.warning(f"Twitter sentiment error: {e}")
            return None

    async def _fetch_reddit_sentiment(self) -> Optional[float]:
        """Fetch sentiment from Reddit (r/investing, r/stocks, r/wallstreetbets)."""
        if not self.reddit_client_id:
            return None
        try:
            async with aiohttp.ClientSession() as session:
                auth = aiohttp.BasicAuth(self.reddit_client_id, self.reddit_secret)
                token_data = {"grant_type": "client_credentials"}
                async with session.post("https://www.reddit.com/api/v1/access_token", data=token_data, auth=auth) as resp:
                    if resp.status != 200:
                        return None
                    token = (await resp.json()).get("access_token")

                headers = {"Authorization": f"Bearer {token}", "User-Agent": "AlgoDesk/1.0"}
                subreddits = ["investing", "stocks", "wallstreetbets"]
                scores = []
                for sub in subreddits:
                    async with session.get(f"https://oauth.reddit.com/r/{sub}/hot?limit=25", headers=headers) as resp:
                        if resp.status != 200:
                            continue
                        posts = (await resp.json()).get("data", {}).get("children", [])
                        bull = sum(1 for p in posts if any(w in p["data"]["title"].lower() for w in ["buy", "bull", "long", "moon", "surge"]))
                        bear = sum(1 for p in posts if any(w in p["data"]["title"].lower() for w in ["sell", "bear", "short", "crash", "drop"]))
                        scores.append(50 + (bull - bear) * 3)
                return sum(scores) / len(scores) if scores else None
        except Exception as e:
            log.warning(f"Reddit sentiment error: {e}")
            return None

    async def _simulate_sentiment(self):
        """Simulate market sentiment with realistic random walk."""
        drift = random.gauss(0, 1.5)
        self.score = max(10, min(90, self.score + drift))
        self.institutional = max(10, min(90, self.institutional + random.gauss(0, 0.8)))
        self.retail = max(10, min(90, self.retail + random.gauss(0, 1.2)))
        self.momentum_score = max(10, min(90, self.momentum_score + random.gauss(0, 1.0)))
        self.mode = "simulation"
        log.debug(f"Simulated sentiment: composite={self.score:.1f}, inst={self.institutional:.1f}, retail={self.retail:.1f}")

    async def run(self):
        """Main sentiment refresh loop."""
        log.info("Sentiment analyzer started")
        while True:
            try:
                # Try real APIs first
                twitter_score = await self._fetch_twitter_sentiment()
                reddit_score = await self._fetch_reddit_sentiment()

                real_scores = [s for s in [twitter_score, reddit_score] if s is not None]
                if real_scores:
                    self.score = sum(real_scores) / len(real_scores)
                    self.mode = "live"
                    log.info(f"Live sentiment: {self.score:.1f} (from {len(real_scores)} source(s))")
                else:
                    await self._simulate_sentiment()

                self.last_update = datetime.utcnow().isoformat()
            except Exception as e:
                log.error(f"Sentiment error: {e}")

            await asyncio.sleep(FETCH_INTERVAL)
