import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPortfolioSummaryQueryKey,
  getGetPositionsQueryKey,
  getGetRiskStateQueryKey,
  getGetSentimentStateQueryKey,
  getGetEngineStatusQueryKey,
  getGetAlertsQueryKey
} from "@workspace/api-client-react";
import { ingestAiDecision } from "@/pages/ai-activity";
import { ingestBotLog } from "@/pages/bot-feed";

export function useWebSocket() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const wsUrl =
      import.meta.env.VITE_WS_URL ||
      (() => {
        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        return `${protocol}://${window.location.host}/api/ws`;
      })();
    let ws: WebSocket;
    let reconnectTimer: number;

    const connect = () => {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("WS Connected");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case "tick":
              break;
            case "positions":
            case "trade_opened":
            case "trade_closed":
              queryClient.invalidateQueries({ queryKey: getGetPositionsQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetPortfolioSummaryQueryKey() });
              break;

            // Real MT5 positions pushed by the Python bot every 2 s.
            // Inject directly into the positions query cache so the dashboard
            // shows live data without an extra API round-trip.
            case "bot_positions": {
              const raw: any[] = Array.isArray(data.data) ? data.data : [];
              const mapped = raw.map((pos) => ({
                id: pos.ticket ?? Math.random(),
                symbol: pos.symbol,
                side: pos.side as "long" | "short",
                entryPrice: pos.entry_price,
                currentPrice: pos.current_price,
                quantity: pos.volume,
                pnl: pos.pnl ?? 0,
                pnlPct: pos.entry_price > 0
                  ? (pos.pnl ?? 0) / (pos.entry_price * pos.volume)
                  : 0,
                strategy: pos.strategy ?? "bot",
                stopLoss: pos.sl ?? null,
                takeProfit: pos.tp ?? null,
                openedAt: new Date().toISOString(),
              }));
              queryClient.setQueryData(getGetPositionsQueryKey(), mapped);
              queryClient.invalidateQueries({ queryKey: getGetPortfolioSummaryQueryKey() });
              break;
            }

            case "equity_update":
              queryClient.invalidateQueries({ queryKey: getGetPortfolioSummaryQueryKey() });
              break;
            case "alert":
              queryClient.invalidateQueries({ queryKey: getGetAlertsQueryKey() });
              break;
            case "kill_switch":
              queryClient.invalidateQueries({ queryKey: getGetRiskStateQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetEngineStatusQueryKey() });
              break;
            case "ai_decision":
              ingestAiDecision(data.data);
              break;
            case "bot_log":
              ingestBotLog(data.data);
              break;
          }
        } catch (e) {
          console.error("WS Parse Error", e);
        }
      };

      ws.onclose = () => {
        console.log("WS Disconnected, reconnecting...");
        reconnectTimer = window.setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [queryClient]);
}
