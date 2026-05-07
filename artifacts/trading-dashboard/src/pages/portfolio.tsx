import React from "react";
import {
  useGetPortfolioSummary,
  useGetEquityCurve,
  useGetDrawdown,
  useGetPositions,
  useGetAllocation,
  useGetCorrelation,
  getGetPortfolioSummaryQueryKey,
  getGetEquityCurveQueryKey,
  getGetDrawdownQueryKey,
} from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#f97316", "#ec4899"];

function fmt(n: number, dec = 2) { return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function fmtUsd(n: number) { return `$${fmt(n)}`; }
function fmtPct(n: number) { return `${(n * 100).toFixed(2)}%`; }

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: "up" | "down" | "neutral" }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
      <span className="text-[11px] font-mono text-muted-foreground">{label}</span>
      <span className={cn("text-[11px] font-mono font-medium", highlight === "up" ? "text-green-400" : highlight === "down" ? "text-red-400" : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

export default function Portfolio() {
  const [period, setPeriod] = useState("1m");
  const { data: summary, isLoading } = useGetPortfolioSummary({ query: { refetchInterval: 5000 } });
  const { data: equity } = useGetEquityCurve({ period }, {
    query: { queryKey: getGetEquityCurveQueryKey({ period }), refetchInterval: 30000 }
  });
  const { data: drawdown } = useGetDrawdown({ period }, {
    query: { queryKey: getGetDrawdownQueryKey({ period }), refetchInterval: 30000 }
  });
  const { data: positions } = useGetPositions({ query: { refetchInterval: 5000 } });
  const { data: allocation } = useGetAllocation();
  const { data: correlation } = useGetCorrelation();

  const equityData = equity?.map((p) => ({
    t: new Date(p.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    equity: p.equity,
    benchmark: p.benchmark,
  })) ?? [];

  const drawdownData = drawdown?.map((p) => ({
    t: new Date(p.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    drawdown: (p.drawdown * 100),
  })) ?? [];

  const dailyUp = (summary?.dailyPnl ?? 0) >= 0;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-sm font-mono font-bold text-foreground uppercase tracking-widest">Portfolio</h1>

      {/* Period selector */}
      <div className="flex gap-1">
        {["1d", "1w", "1m", "3m", "6m", "1y"].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            data-testid={`period-${p}`}
            className={cn(
              "text-[10px] font-mono px-2 py-0.5 rounded border transition-colors",
              period === p ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {p.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Portfolio stats */}
        <Card className="bg-card border-card-border">
          <CardHeader className="py-2 px-3 border-b border-border">
            <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Overview</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {isLoading ? (
              <div className="space-y-1">{[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="h-5 w-full" />)}</div>
            ) : (
              <>
                <StatRow label="Equity" value={fmtUsd(summary?.equity ?? 0)} />
                <StatRow label="Cash" value={fmtUsd(summary?.cash ?? 0)} />
                <StatRow label="Total P&L" value={`${(summary?.totalPnl ?? 0) >= 0 ? "+" : ""}${fmtUsd(summary?.totalPnl ?? 0)}`} highlight={(summary?.totalPnl ?? 0) >= 0 ? "up" : "down"} />
                <StatRow label="Daily P&L" value={`${dailyUp ? "+" : ""}${fmtUsd(summary?.dailyPnl ?? 0)}`} highlight={dailyUp ? "up" : "down"} />
                <StatRow label="Open Positions" value={String(summary?.openPositions ?? 0)} />
                <StatRow label="Exposure" value={fmtPct(summary?.exposure ?? 0)} />
                <StatRow label="Sharpe" value={fmt(summary?.sharpeRatio ?? 0)} />
                <StatRow label="Sortino" value={fmt(summary?.sortinoRatio ?? 0)} />
                <StatRow label="Max Drawdown" value={fmtPct(summary?.maxDrawdown ?? 0)} highlight="down" />
                <StatRow label="Win Rate" value={fmtPct(summary?.winRate ?? 0)} />
                <StatRow label="Profit Factor" value={fmt(summary?.profitFactor ?? 0)} />
                <StatRow label="Total Trades" value={String(summary?.totalTrades ?? 0)} />
              </>
            )}
          </CardContent>
        </Card>

        {/* Equity curve */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-card border-card-border">
            <CardHeader className="py-2 px-3 border-b border-border">
              <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Equity vs Benchmark</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              {equityData.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={equityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="t" tick={{ fontSize: 9, fontFamily: "monospace", fill: "#6b7280" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fontFamily: "monospace", fill: "#6b7280" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ background: "#0d0f12", border: "1px solid #1f2937", fontSize: 10, fontFamily: "monospace" }} formatter={(v: any) => [`$${fmt(v)}`, ""]} />
                    <Area type="monotone" dataKey="benchmark" stroke="#4b5563" fill="rgba(75,85,99,0.1)" dot={false} name="Benchmark" strokeWidth={1} />
                    <Area type="monotone" dataKey="equity" stroke="#3b82f6" fill="rgba(59,130,246,0.1)" dot={false} name="Portfolio" strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-40 flex items-center justify-center text-[11px] font-mono text-muted-foreground">No data</div>
              )}
            </CardContent>
          </Card>

          {/* Drawdown */}
          <Card className="bg-card border-card-border">
            <CardHeader className="py-2 px-3 border-b border-border">
              <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Drawdown (%)</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              {drawdownData.length > 0 ? (
                <ResponsiveContainer width="100%" height={100}>
                  <AreaChart data={drawdownData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="t" tick={{ fontSize: 9, fontFamily: "monospace", fill: "#6b7280" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fontFamily: "monospace", fill: "#6b7280" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v.toFixed(1)}%`} />
                    <Tooltip contentStyle={{ background: "#0d0f12", border: "1px solid #1f2937", fontSize: 10, fontFamily: "monospace" }} formatter={(v: any) => [`${fmt(v)}%`, "Drawdown"]} />
                    <Area type="monotone" dataKey="drawdown" stroke="#ef4444" fill="rgba(239,68,68,0.15)" dot={false} strokeWidth={1} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-24 flex items-center justify-center text-[11px] font-mono text-muted-foreground">No data</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Allocation & Correlation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Allocation */}
        <Card className="bg-card border-card-border">
          <CardHeader className="py-2 px-3 border-b border-border">
            <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Allocation</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {allocation && allocation.length > 0 ? (
              <div className="flex gap-4 items-center">
                <ResponsiveContainer width="50%" height={140}>
                  <PieChart>
                    <Pie data={allocation} dataKey="value" nameKey="symbol" cx="50%" cy="50%" innerRadius={35} outerRadius={60} strokeWidth={1} stroke="rgba(0,0,0,0.3)">
                      {allocation.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0d0f12", border: "1px solid #1f2937", fontSize: 10, fontFamily: "monospace" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1">
                  {allocation.map((a, i) => (
                    <div key={a.symbol} className="flex items-center gap-2 text-[11px] font-mono">
                      <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-foreground font-medium w-12">{a.symbol}</span>
                      <span className="text-muted-foreground flex-1">{fmtPct(a.pct)}</span>
                      <span className="text-muted-foreground">{fmtUsd(a.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-28 flex items-center justify-center text-[11px] font-mono text-muted-foreground">No open positions</div>
            )}
          </CardContent>
        </Card>

        {/* Correlation matrix */}
        <Card className="bg-card border-card-border">
          <CardHeader className="py-2 px-3 border-b border-border">
            <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Correlation Matrix</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {correlation && correlation.symbols.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: `40px repeat(${correlation.symbols.length}, 1fr)` }} className="gap-px">
                {/* Header */}
                <div />
                {correlation.symbols.map((s) => (
                  <div key={s} className="text-[9px] font-mono text-muted-foreground text-center py-0.5 truncate">{s}</div>
                ))}
                {/* Rows */}
                {correlation.matrix.map((row, ri) => (
                  <React.Fragment key={`row-${ri}`}>
                    <div className="text-[9px] font-mono text-muted-foreground flex items-center pr-1 truncate">
                      {correlation.symbols[ri]}
                    </div>
                    {row.map((val, ci) => {
                      const intensity = Math.abs(val);
                      const isPos = val >= 0;
                      const bg = val === 1
                        ? `rgba(59,130,246,0.7)`
                        : isPos
                          ? `rgba(239,68,68,${intensity * 0.7})`
                          : `rgba(34,197,94,${intensity * 0.7})`;
                      return (
                        <div
                          key={ci}
                          className="text-[9px] font-mono text-center py-1 rounded-sm"
                          style={{ background: bg, color: intensity > 0.5 ? "#fff" : "#9ca3af" }}
                          title={`${correlation.symbols[ri]} / ${correlation.symbols[ci]}: ${val.toFixed(2)}`}
                        >
                          {val.toFixed(2)}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <div className="h-28 flex items-center justify-center text-[11px] font-mono text-muted-foreground">No positions to correlate</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Positions table */}
      {positions && positions.length > 0 && (
        <Card className="bg-card border-card-border">
          <CardHeader className="py-2 px-3 border-b border-border">
            <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Positions Detail</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-border">
                    {["Symbol","Side","Qty","Entry","Current","P&L $","P&L %","SL","TP","MAE","MFE","Exposure","Strategy"].map(h => (
                      <th key={h} className="px-3 py-1.5 text-left text-[10px] text-muted-foreground font-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => {
                    const up = pos.pnl >= 0;
                    return (
                      <tr key={pos.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors" data-testid={`position-detail-${pos.id}`}>
                        <td className="px-3 py-1.5 font-bold text-foreground">{pos.symbol}</td>
                        <td className="px-3 py-1.5">
                          <Badge variant={pos.side === "long" ? "default" : "destructive"} className="text-[10px] h-4 px-1 py-0">{pos.side.toUpperCase()}</Badge>
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">{fmt(pos.quantity, 4)}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{fmtUsd(pos.entryPrice)}</td>
                        <td className="px-3 py-1.5 text-foreground">{fmtUsd(pos.currentPrice)}</td>
                        <td className={cn("px-3 py-1.5 font-bold", up ? "text-green-400" : "text-red-400")}>{up ? "+" : ""}{fmtUsd(pos.pnl)}</td>
                        <td className={cn("px-3 py-1.5", up ? "text-green-400" : "text-red-400")}>{up ? "+" : ""}{fmtPct(pos.pnlPct)}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{pos.stopLoss ? fmtUsd(pos.stopLoss) : "—"}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{pos.takeProfit ? fmtUsd(pos.takeProfit) : "—"}</td>
                        <td className="px-3 py-1.5 text-red-400">{pos.mae ? fmtUsd(pos.mae) : "—"}</td>
                        <td className="px-3 py-1.5 text-green-400">{pos.mfe ? fmtUsd(pos.mfe) : "—"}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{fmtPct(pos.exposure)}</td>
                        <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[120px]">{pos.strategy}</td>
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
