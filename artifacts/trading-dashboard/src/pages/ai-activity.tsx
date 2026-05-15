import { useEffect, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Brain, CheckCircle2, XCircle, Trash2 } from "lucide-react";

interface AiDecision {
  id: string;
  symbol: string;
  side: string;
  strategy: string;
  decision: "YES" | "NO";
  reason: string;
  price: number;
  timestamp: string;
}

// Module-level store — decisions survive navigation (WS pushes add here in real-time)
const wsDecisions = new Map<string, AiDecision>();
let listeners = new Set<() => void>();

function notify() { listeners.forEach(fn => fn()); }

// Called from use-websocket.ts when bot sends an ai_decision
export function ingestAiDecision(data: Omit<AiDecision, "id">) {
  const id = `${data.timestamp}-${data.symbol}-${data.strategy}`;
  if (!wsDecisions.has(id)) {
    wsDecisions.set(id, { ...data, id });
    // Keep last 200
    if (wsDecisions.size > 200) {
      const oldest = wsDecisions.keys().next().value;
      if (oldest) wsDecisions.delete(oldest);
    }
    notify();
  }
}

function useAiDecisions() {
  const [, tick] = useState(0);
  const serverIds = useRef(new Set<string>());

  useEffect(() => {
    const refresh = () => tick(n => n + 1);
    listeners.add(refresh);
    return () => { listeners.delete(refresh); };
  }, []);

  // Poll server every 3s to catch decisions that happened before WS connected
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/ai-decisions", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const items: Omit<AiDecision, "id">[] = await res.json();
        let changed = false;
        for (const item of items) {
          const id = `${item.timestamp}-${item.symbol}-${item.strategy}`;
          if (!wsDecisions.has(id) && !serverIds.current.has(id)) {
            serverIds.current.add(id);
            wsDecisions.set(id, { ...item, id });
            changed = true;
          }
        }
        if (changed && !cancelled) tick(n => n + 1);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return Array.from(wsDecisions.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export default function AiActivity() {
  const items = useAiDecisions();
  const approved = items.filter(d => d.decision === "YES").length;
  const rejected = items.filter(d => d.decision === "NO").length;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-mono font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
          <Brain size={14} className="text-primary" /> AI Activity
        </h1>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] font-mono border-green-500/50 text-green-400 gap-1">
            <CheckCircle2 size={9} /> {approved} approved
          </Badge>
          <Badge variant="outline" className="text-[10px] font-mono border-red-500/50 text-red-400 gap-1">
            <XCircle size={9} /> {rejected} rejected
          </Badge>
          {items.length > 0 && (
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] font-mono gap-1"
              onClick={() => { wsDecisions.clear(); notify(); }}>
              <Trash2 size={9} /> Clear
            </Button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <Card className="bg-card border-card-border">
          <CardContent className="p-8 flex flex-col items-center gap-3 text-center">
            <Brain size={28} className="text-muted-foreground/40" />
            <p className="text-xs font-mono text-muted-foreground">No decisions yet this session.</p>
            <p className="text-[10px] font-mono text-muted-foreground">
              Decisions appear live as the bot evaluates signals. Start the bot with <span className="text-primary">GEMINI_API_KEY</span> set — each trade Gemini approves or rejects will stream here in real-time.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((d) => (
            <Card key={d.id} className={cn(
              "bg-card border-l-2",
              d.decision === "YES" ? "border-l-green-500 border-card-border" : "border-l-red-500 border-card-border"
            )}>
              <CardContent className="p-3 flex items-start gap-3">
                {d.decision === "YES"
                  ? <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" />
                  : <XCircle size={14} className="text-red-400 mt-0.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-mono font-bold text-foreground">{d.symbol}</span>
                    <Badge variant={d.side === "long" ? "default" : "destructive"} className="text-[9px] px-1 h-4">
                      {d.side.toUpperCase()}
                    </Badge>
                    <span className="text-[10px] font-mono text-muted-foreground">{d.strategy}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">@ {Number(d.price).toFixed(4)}</span>
                    <span className={cn("text-[10px] font-mono font-bold ml-auto", d.decision === "YES" ? "text-green-400" : "text-red-400")}>
                      {d.decision === "YES" ? "APPROVED" : "REJECTED"}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-muted-foreground mt-0.5 italic">"{d.reason}"</p>
                  <p className="text-[9px] font-mono text-muted-foreground/50 mt-0.5">
                    {new Date(d.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
