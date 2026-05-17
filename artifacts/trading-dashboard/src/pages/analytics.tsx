import { useState } from "react";
import { useTheme } from "@/hooks/use-theme";
import {
  useGetPerformanceMetrics,
  useGetTimeBreakdown,
  useGetStrategyBreakdown,
  getGetTimeBreakdownQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  LabelList,
} from "recharts";

function fmt(n: number, dec = 2) { return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function fmtUsd(n: number) { return `$${fmt(n)}`; }
function fmtPct(n: number) { return `${(n * 100).toFixed(2)}%`; }

function SharpeBlock({ value, sortino }: { value: number; sortino: number }) {
  const target = 1.5;
  const barPct = Math.min((value / 2.0) * 100, 100);
  const targetPct = (target / 2.0) * 100;
  const color = value >= target ? "text-green-400" : value >= 0.5 ? "text-yellow-400" : "text-red-400";
  const barColor = value >= target ? "bg-green-400" : value >= 0.5 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="bg-card border border-card-border rounded p-2.5 col-span-2 sm:col-span-1">
      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
        <span>Sharpe Ratio</span>
        <span className="text-[9px] normal-case tracking-normal text-muted-foreground/60">target 1.5</span>
      </div>
      <div className={cn("text-base font-mono font-bold", color)}>{fmt(value)}</div>
      <div className="relative mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${barPct}%` }} />
        <div className="absolute top-0 bottom-0 w-px bg-white/60" style={{ left: `${targetPct}%` }} />
      </div>
      <div className="text-[10px] font-mono text-muted-foreground mt-0.5">Sortino: {fmt(sortino)}</div>
    </div>
  );
}

function MetricBlock({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: "up" | "down" }) {
  return (
    <div className="bg-card border border-card-border rounded p-2.5">
      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      <div className={cn("text-base font-mono font-bold", highlight === "up" ? "text-green-400" : highlight === "down" ? "text-red-400" : "text-foreground")}>{value}</div>
      {sub && <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Analytics() {
  const { mode } = useTheme();
  const ttStyle = mode === "light"
    ? { background: "#ffffff", border: "1px solid #e5e7eb", fontSize: 10, fontFamily: "monospace", color: "#111827" }
    : { background: "#0d0f12", border: "1px solid #1f2937", fontSize: 10, fontFamily: "monospace", color: "#e5e7eb" };
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly" | "yearly">("monthly");
  const { data: metrics, isLoading } = useGetPerformanceMetrics();
  const { data: breakdown } = useGetTimeBreakdown({ period }, {
    query: { queryKey: getGetTimeBreakdownQueryKey({ period }) }
  });
  const { data: stratBreakdown } = useGetStrategyBreakdown();

  const breakdownData = breakdown?.map((b) => ({
    period: b.period,
    pnl: b.pnl,
    winRate: parseFloat((b.winRate * 100).toFixed(1)),
    trades: b.trades,
  })) ?? [];

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-sm font-mono font-bold text-foreground uppercase tracking-widest">Analytics</h1>

      {/* Performance Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
        {isLoading ? (
          Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-16" />)
        ) : metrics ? (
          <>
            <SharpeBlock value={metrics.sharpeRatio} sortino={metrics.sortinoRatio} />
            <MetricBlock label="Calmar Ratio" value={fmt(metrics.calmarRatio)} />
            <MetricBlock label="Win Rate" value={fmtPct(metrics.winRate)} highlight={(metrics.winRate ?? 0) >= 0.5 ? "up" : "down"} />
            <MetricBlock label="Profit Factor" value={fmt(metrics.profitFactor)} highlight={(metrics.profitFactor ?? 0) >= 1 ? "up" : "down"} />
            <MetricBlock label="Avg Win" value={fmtUsd(metrics.avgWin)} sub={`Loss: ${fmtUsd(metrics.avgLoss)}`} highlight="up" />
            <MetricBlock label="Avg R:R" value={fmt(metrics.avgRR)} />
            <MetricBlock label="Expectancy" value={fmtUsd(metrics.expectancy)} highlight={(metrics.expectancy ?? 0) >= 0 ? "up" : "down"} />
            <MetricBlock label="Total Return" value={fmtPct(metrics.totalReturn)} highlight={(metrics.totalReturn ?? 0) >= 0 ? "up" : "down"} />
            <MetricBlock label="Volatility" value={fmtPct(metrics.volatility)} sub="Annualized" />
            <MetricBlock label="Max Drawdown" value={fmtPct(metrics.maxDrawdown)} highlight="down" sub={`Recovery: ${fmt(metrics.recoveryFactor)}`} />
            <MetricBlock label="Consec Wins" value={String(metrics.maxConsecWins)} highlight="up" sub={`Losses: ${metrics.maxConsecLosses}`} />
            <MetricBlock label="Total Trades" value={String(metrics.totalTrades)} sub={`Avg ${fmt(metrics.avgTradeDuration, 1)}h hold`} />
          </>
        ) : (
          <div className="col-span-full text-center text-[11px] font-mono text-muted-foreground py-4">No trade data yet</div>
        )}
      </div>

      {/* Time breakdown */}
      <Card className="bg-card border-card-border">
        <CardHeader className="py-2 px-3 border-b border-border flex-row items-center justify-between">
          <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">P&L Over Time</CardTitle>
          <div className="flex gap-1">
            {(["daily", "weekly", "monthly", "yearly"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                data-testid={`breakdown-${p}`}
                className={cn(
                  "text-[10px] font-mono px-2 py-0.5 rounded border transition-colors",
                  period === p ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-3">
          {breakdownData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={breakdownData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="period" tick={{ fontSize: 9, fontFamily: "monospace", fill: "#6b7280" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fontFamily: "monospace", fill: "#6b7280" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={ttStyle}
                  formatter={(v: any, name: string) => [name === "pnl" ? `$${fmt(v)}` : `${v}%`, name === "pnl" ? "P&L" : "Win Rate"]}
                />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 2" />
                <Bar dataKey="pnl" name="P&L" radius={[2,2,0,0]} fill="#22c55e">
                  {breakdownData.map((entry, i) => (
                    <Cell key={i} fill={entry.pnl >= 0 ? "#22c55e" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-44 flex items-center justify-center text-[11px] font-mono text-muted-foreground">No trade history</div>
          )}
        </CardContent>
      </Card>

      {/* Strategy P&L ranking chart */}
      {stratBreakdown && stratBreakdown.length > 0 && (
        <Card className="bg-card border-card-border">
          <CardHeader className="py-2 px-3 border-b border-border">
            <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Strategy P&L Ranking</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <ResponsiveContainer width="100%" height={Math.max(80, stratBreakdown.length * 36)}>
              <BarChart data={[...stratBreakdown].sort((a, b) => b.pnl - a.pnl)} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fontFamily: "monospace", fill: "#6b7280" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v >= 0 ? "" : "-"}${Math.abs(v/1000).toFixed(1)}k`} />
                <YAxis type="category" dataKey="strategy" width={110} tick={{ fontSize: 9, fontFamily: "monospace", fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={ttStyle} formatter={(v: any) => [`$${fmt(v)}`, "P&L"]} />
                <ReferenceLine x={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 2" />
                <Bar dataKey="pnl" radius={[0,2,2,0]} maxBarSize={18}>
                  {[...stratBreakdown].sort((a, b) => b.pnl - a.pnl).map((s, i) => (
                    <Cell key={i} fill={s.pnl >= 0 ? "#22c55e" : "#ef4444"} />
                  ))}
                  <LabelList dataKey="pnl" position="right" style={{ fontSize: 9, fontFamily: "monospace", fill: "#9ca3af" }} formatter={(v: number) => `${v >= 0 ? "+" : ""}$${fmt(v)}`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Strategy breakdown */}
      {stratBreakdown && stratBreakdown.length > 0 && (
        <Card className="bg-card border-card-border">
          <CardHeader className="py-2 px-3 border-b border-border">
            <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Strategy Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-border">
                    {["Strategy", "Trades", "Win Rate", "Total P&L", "Avg P&L", "Profit Factor", "Sharpe"].map(h => (
                      <th key={h} className="px-3 py-1.5 text-left text-[10px] text-muted-foreground font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stratBreakdown.map((s) => {
                    const up = s.pnl >= 0;
                    return (
                      <tr key={s.strategy} className="border-b border-border/40 hover:bg-muted/20 transition-colors" data-testid={`strategy-row-${s.strategy}`}>
                        <td className="px-3 py-1.5 font-bold text-foreground">{s.strategy}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{s.totalTrades}</td>
                        <td className={cn("px-3 py-1.5 font-bold", s.winRate >= 0.5 ? "text-green-400" : "text-red-400")}>{fmtPct(s.winRate)}</td>
                        <td className={cn("px-3 py-1.5 font-bold", up ? "text-green-400" : "text-red-400")}>{up ? "+" : ""}{fmtUsd(s.pnl)}</td>
                        <td className={cn("px-3 py-1.5", s.avgPnl >= 0 ? "text-green-400" : "text-red-400")}>{fmtUsd(s.avgPnl)}</td>
                        <td className={cn("px-3 py-1.5", s.profitFactor >= 1 ? "text-green-400" : "text-red-400")}>{fmt(s.profitFactor)}</td>
                        <td className={cn("px-3 py-1.5", s.sharpe >= 0 ? "text-green-400" : "text-red-400")}>{fmt(s.sharpe)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
