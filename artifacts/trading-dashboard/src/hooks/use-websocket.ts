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
              // We could manually update some small caches here if needed, 
              // but standard queries with refetchInterval handle bulk data.
              // For high-frequency stuff, we might want to update local state directly.
              break;
            case "positions":
            case "trade_opened":
            case "trade_closed":
              queryClient.invalidateQueries({ queryKey: getGetPositionsQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetPortfolioSummaryQueryKey() });
              break;
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
