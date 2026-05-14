import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Brain, CheckCircle2, XCircle, Trash2, Wifi, WifiOff } from "lucide-react";

interface AiDecision {
  id: number;
  symbol: string;
  side: string;
  strategy: string;
  decision: "YES" | "NO";
  reason: string;
  price: number;
  timestamp: string;
}

// Module-level store so decisions persist across re-renders / navigation
const decisions: AiDecision[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function notify() { listeners.forEach(fn => fn()); }

export function ingestAiDecision(data: Omit<AiDecision, "id">) {
  decisions.unshift({ ...data, id: nextId++ });
  if (decisions.length > 100) decisions.pop(); // keep last 100
  notify();
}

function useAiDecisions() {
  const [, tick] = useState(0);
  useEffect(() => {
    const refresh = () => tick(n => n + 1);
    listeners.add(refresh);
    return () => { listeners.delete(refresh); };
  }, []);
  return decisions;
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
              onClick={() => { decisions.length = 0; nextId = 1; notify(); }}>
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
