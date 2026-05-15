import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Brain, TrendingUp, TrendingDown, Loader2 } from "lucide-react";

interface TunerLogEntry {
  timestamp: string;
  strategy: string;
  reason: string;
  changes: Record<string, { from: number; to: number }>;
  performance: { winRate: number; avgPnl: number; avgWin: number; avgLoss: number; sharpe: number; tradeCount: number };
}

interface CurrentParams {
  z_threshold: number | null;
  risk_pct: number;
}

export default function AutoTuner() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const { data: botConfig } = useQuery({
    queryKey: ["bot-config"],
    queryFn: () => fetch("/api/bot/config", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 5000,
  });

  const extra = (botConfig?.botExtra as Record<string, unknown>) ?? {};
  const tunerState = (extra.autoTuner as Record<string, unknown> | undefined) ?? {};
  const currentParams = (tunerState.currentParams as Record<string, CurrentParams> | undefined) ?? {};
  const tunerLog = (tunerState.log as TunerLogEntry[]) ?? [];
  const totalTrades = (tunerState.totalTradesEvaluated as number | undefined) ?? 0;
  const serverEnabled = Boolean(extra.autoTunerEnabled);

  const [enabled, setEnabled] = useState(serverEnabled);
  const initialized = useRef(false);
  useEffect(() => {
    if (!botConfig || initialized.current) return;
    initialized.current = true;
    setEnabled(serverEnabled);
  }, [botConfig]);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    try {
      await fetch("/api/bot/config", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoTunerEnabled: next }),
      });
      qc.invalidateQueries({ queryKey: ["bot-config"] });
      toast({ title: next ? "Auto-Tuner enabled" : "Auto-Tuner disabled" });
    } catch {
      toast({ title: "Failed to update setting", variant: "destructive" });
      setEnabled(!next);
    } finally {
      setSaving(false);
    }
  };

  const strategyEntries = Object.entries(currentParams);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-mono font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
          <Brain size={14} className="text-purple-400" /> Auto-Tuner
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-muted-foreground">
            {totalTrades} trades evaluated
          </span>
          <button
            onClick={toggle}
            disabled={saving}
            className={cn(
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors border",
              enabled
                ? "bg-purple-500/20 border-purple-400/50"
                : "bg-muted border-border"
            )}
          >
            {saving
              ? <Loader2 size={10} className="absolute inset-0 m-auto animate-spin text-muted-foreground" />
              : <span className={cn(
                  "inline-block h-3.5 w-3.5 transform rounded-full transition-transform",
                  enabled ? "translate-x-4 bg-purple-400" : "translate-x-1 bg-muted-foreground"
                )} />
            }
          </button>
          <span className={cn("text-[10px] font-mono font-bold w-7", enabled ? "text-purple-400" : "text-muted-foreground")}>
            {enabled ? "ON" : "OFF"}
          </span>
        </div>
      </div>

      {/* What it does */}
      <Card className="bg-card border-card-border">
        <CardContent className="p-3">
          <p className="text-[10px] font-mono text-muted-foreground leading-relaxed">
            When enabled, the bot evaluates every closed trade and automatically adjusts strategy parameters using performance data.
            Entry thresholds tighten when win rate is below 35%, relax when above 60%.
            Position sizing uses fractional Kelly Criterion (25%) based on actual win/loss ratios.
            Needs at least <span className="text-foreground">5 closed trades</span> per strategy to start adjusting.
          </p>
        </CardContent>
      </Card>

      {/* Current strategy parameters */}
      <Card className="bg-card border-card-border">
        <CardHeader className="py-2 px-3 border-b border-border">
          <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Live Strategy Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          {strategyEntries.length === 0 ? (
            <p className="text-[10px] font-mono text-muted-foreground text-center py-3">
              No parameter data yet — enable the tuner and wait for closed trades
            </p>
          ) : (
            <div className="space-y-2">
              {strategyEntries.map(([name, p]) => (
                <div key={name} className="flex items-center gap-3 text-[11px] font-mono bg-background/50 rounded px-3 py-2 border border-border/40">
                  <span className="text-foreground font-bold flex-1">{name}</span>
                  {p.z_threshold != null && (
                    <div className="text-center">
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Z-Threshold</div>
                      <div className="text-blue-300 font-bold">{p.z_threshold.toFixed(2)}</div>
                    </div>
                  )}
                  <div className="text-center">
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Risk / Trade</div>
                    <div className="text-green-300 font-bold">{p.risk_pct.toFixed(3)}%</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Adjustment log */}
      <Card className="bg-card border-card-border">
        <CardHeader className="py-2 px-3 border-b border-border flex-row items-center justify-between">
          <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Adjustment Log
          </CardTitle>
          {tunerLog.length > 0 && (
            <span className="text-[10px] font-mono text-muted-foreground">{tunerLog.length} entries</span>
          )}
        </CardHeader>
        <CardContent className="p-3">
          {tunerLog.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Brain size={24} className="text-muted-foreground/30" />
              <p className="text-[10px] font-mono text-muted-foreground">No adjustments yet.</p>
              <p className="text-[9px] font-mono text-muted-foreground/70">
                Each time the bot tweaks a parameter, the change appears here with full reasoning and performance data.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {tunerLog.map((entry, i) => (
                <div key={i} className="text-[10px] font-mono bg-background/50 rounded px-3 py-2 border border-border/40 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-purple-300">{entry.strategy}</span>
                    <span className="text-muted-foreground text-[9px] ml-auto">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-muted-foreground italic">"{entry.reason}"</p>
                  <div className="flex flex-wrap items-center gap-3 text-[9px] pt-0.5">
                    <span className={cn("font-bold", entry.performance.winRate >= 0.5 ? "text-green-400" : "text-red-400")}>
                      {(entry.performance.winRate * 100).toFixed(0)}% win rate
                    </span>
                    <span className={cn(entry.performance.avgPnl >= 0 ? "text-green-400" : "text-red-400")}>
                      {entry.performance.avgPnl >= 0 ? "+" : ""}${entry.performance.avgPnl.toFixed(2)} avg P&L
                    </span>
                    <span className="text-muted-foreground">{entry.performance.tradeCount} trades</span>
                    <span className="text-muted-foreground">Sharpe {entry.performance.sharpe.toFixed(2)}</span>
                    <div className="flex gap-2 ml-auto">
                      {Object.entries(entry.changes).map(([param, ch]) => (
                        <span key={param} className="flex items-center gap-1 text-blue-300">
                          {param}:
                          <span className="text-muted-foreground">{typeof ch.from === "number" ? ch.from.toFixed(3) : ch.from}</span>
                          {ch.to > ch.from
                            ? <TrendingUp size={9} className="text-yellow-400" />
                            : <TrendingDown size={9} className="text-blue-400" />}
                          <span className="font-bold">{typeof ch.to === "number" ? ch.to.toFixed(3) : ch.to}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
