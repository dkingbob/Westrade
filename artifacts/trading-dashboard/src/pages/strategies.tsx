import { useState } from "react";
import {
  useGetStrategies,
  useToggleStrategy,
  useUpdateStrategy,
  getGetStrategiesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Cpu, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

function fmt(n: number, dec = 2) { return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function fmtUsd(n: number) { return `$${fmt(n)}`; }
function fmtPct(n: number) { return `${(n * 100).toFixed(2)}%`; }

const TYPE_LABELS: Record<string, string> = {
  trend_pullback: "Trend Pullback",
  bb_reversion: "BB Mean Reversion",
  mean_reversion: "Mean Reversion",
  momentum: "Momentum",
  statistical: "Statistical Arb",
};

const TYPE_COLORS: Record<string, string> = {
  trend_pullback: "border-green-400/50 text-green-400",
  bb_reversion: "border-blue-400/50 text-blue-400",
  mean_reversion: "border-blue-400/50 text-blue-400",
  momentum: "border-purple-400/50 text-purple-400",
  statistical: "border-amber-400/50 text-amber-400",
};

function ParamEditor({ params, onChange }: { params: Record<string, number>; onChange: (p: Record<string, number>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {Object.entries(params).map(([key, val]) => (
        <div key={key} className="space-y-0.5">
          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            {key.replace(/([A-Z])/g, " $1").trim()}
          </label>
          <Input
            type="number"
            value={val}
            step={key.includes("Period") ? 1 : 0.001}
            className="h-6 text-xs font-mono bg-background border-border"
            data-testid={`param-${key}`}
            onChange={(e) => {
              const newParams = { ...params, [key]: parseFloat(e.target.value) || 0 };
              onChange(newParams);
            }}
          />
        </div>
      ))}
    </div>
  );
}

function StrategyCard({ strategy }: { strategy: any }) {
  const [expanded, setExpanded] = useState(false);
  const [params, setParams] = useState<Record<string, number>>(strategy.parameters ?? {});
  const [riskPct, setRiskPct] = useState(strategy.riskPct ?? 0.01);
  const [symbols, setSymbols] = useState((strategy.symbols ?? []).join(", "));
  const qc = useQueryClient();
  const toggle = useToggleStrategy();
  const update = useUpdateStrategy();

  const handleToggle = async () => {
    await toggle.mutateAsync({ id: strategy.id });
    qc.invalidateQueries({ queryKey: getGetStrategiesQueryKey() });
  };

  const handleSave = async () => {
    await update.mutateAsync({
      id: strategy.id,
      data: {
        riskPct,
        parameters: params,
        symbols: symbols.split(",").map((s: string) => s.trim()).filter(Boolean),
      }
    });
    qc.invalidateQueries({ queryKey: getGetStrategiesQueryKey() });
  };

  const up = strategy.pnl >= 0;

  return (
    <Card className={cn("bg-card border-card-border transition-all", strategy.active ? "border-l-2 border-l-primary" : "border-l-2 border-l-border opacity-70")}>
      <CardContent className="p-3 space-y-2">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-bold text-foreground">{strategy.name}</span>
              <Badge variant="outline" className={cn("text-[10px] h-4 px-1 py-0", TYPE_COLORS[strategy.type])}>
                {TYPE_LABELS[strategy.type] ?? strategy.type}
              </Badge>
              {!strategy.active && (
                <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 text-muted-foreground border-muted">PAUSED</Badge>
              )}
            </div>
            <p className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate">{strategy.description}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {toggle.isPending ? (
              <Loader2 size={13} className="animate-spin text-muted-foreground" />
            ) : (
              <Switch
                checked={strategy.active}
                onCheckedChange={handleToggle}
                data-testid={`strategy-toggle-${strategy.id}`}
              />
            )}
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              data-testid={`strategy-expand-${strategy.id}`}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-4 text-[10px] font-mono">
          <span className="text-muted-foreground">Win Rate: <span className={cn("font-bold", strategy.winRate >= 0.5 ? "text-green-400" : "text-red-400")}>{fmtPct(strategy.winRate)}</span></span>
          <span className="text-muted-foreground">Trades: <span className="text-foreground font-bold">{strategy.totalTrades}</span></span>
          <span className="text-muted-foreground">P&L: <span className={cn("font-bold", up ? "text-green-400" : "text-red-400")}>{up ? "+" : ""}{fmtUsd(strategy.pnl)}</span></span>
          <span className="text-muted-foreground">Risk: <span className="text-foreground font-bold">{fmtPct(strategy.riskPct)}</span></span>
          {strategy.symbols && (
            <span className="text-muted-foreground">Symbols: <span className="text-foreground">{strategy.symbols.join(", ")}</span></span>
          )}
        </div>

        {/* Expanded editor */}
        {expanded && (
          <div className="pt-2 border-t border-border/50 space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Risk Per Trade (%)</label>
              <Input
                type="number"
                value={riskPct * 100}
                step={0.1}
                min={0.1}
                max={10}
                className="h-6 text-xs font-mono bg-background border-border w-32"
                data-testid={`risk-pct-${strategy.id}`}
                onChange={(e) => setRiskPct(parseFloat(e.target.value) / 100 || 0.01)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Symbols (comma separated)</label>
              <Input
                value={symbols}
                className="h-6 text-xs font-mono bg-background border-border"
                data-testid={`symbols-${strategy.id}`}
                onChange={(e) => setSymbols(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Parameters</label>
              <ParamEditor params={params} onChange={setParams} />
            </div>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={update.isPending}
              className="h-7 text-xs font-mono"
              data-testid={`save-strategy-${strategy.id}`}
            >
              {update.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Strategies() {
  const { data: strategies, isLoading } = useGetStrategies();

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-mono font-bold text-foreground uppercase tracking-widest">Strategies</h1>
        {strategies && (
          <span className="text-[10px] font-mono text-muted-foreground">
            {strategies.filter((s) => s.active).length}/{strategies.length} active
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : strategies && strategies.length > 0 ? (
        <div className="space-y-3">
          {strategies.map((s) => <StrategyCard key={s.id} strategy={s} />)}
        </div>
      ) : (
        <Card className="bg-card border-card-border">
          <CardContent className="flex items-center justify-center h-32 text-[11px] font-mono text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <Cpu size={20} className="text-muted-foreground/50" />
              No strategies configured
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
