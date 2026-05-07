import { useState } from "react";
import {
  useRunBacktest,
  useGetBacktestResults,
  getGetBacktestResultsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FlaskConical, Loader2, TrendingUp } from "lucide-react";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

function fmt(n: number, dec = 2) { return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function fmtUsd(n: number) { return `$${fmt(n)}`; }
function fmtPct(n: number) { return `${(n * 100).toFixed(2)}%`; }

const STRATEGY_TYPES = [
  { value: "mean_reversion", label: "Mean Reversion" },
  { value: "momentum", label: "Momentum" },
  { value: "statistical", label: "Statistical Arb" },
];

const SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "SPY", "QQQ", "JPM", "GS"];

function MetricCard({ label, value, highlight }: { label: string; value: string; highlight?: "up" | "down" }) {
  return (
    <div className="bg-card border border-border rounded p-2.5">
      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      <div className={cn("text-sm font-mono font-bold", highlight === "up" ? "text-green-400" : highlight === "down" ? "text-red-400" : "text-foreground")}>
        {value}
      </div>
    </div>
  );
}

export default function Backtest() {
  const qc = useQueryClient();
  const { data: history } = useGetBacktestResults();
  const runBacktest = useRunBacktest();

  const [strategyType, setStrategyType] = useState("mean_reversion");
  const [symbol, setSymbol] = useState("AAPL");
  const [startDate, setStartDate] = useState("2024-01-01");
  const [endDate, setEndDate] = useState("2025-01-01");
  const [initialCapital, setInitialCapital] = useState(100000);
  const [lookbackPeriod, setLookbackPeriod] = useState(20);
  const [zScoreThreshold, setZScoreThreshold] = useState(2.0);
  const [walkForward, setWalkForward] = useState(false);
  const [monteCarlo, setMonteCarlo] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleRun = async () => {
    const params = strategyType === "mean_reversion" || strategyType === "statistical"
      ? { lookbackPeriod, zScoreThreshold }
      : { momentumPeriod: lookbackPeriod, momentumThreshold: 0.03 };

    const res = await runBacktest.mutateAsync({
      data: {
        strategyType,
        symbol,
        startDate,
        endDate,
        initialCapital,
        parameters: params,
        walkForward,
        monteCarlo,
        monteCarloRuns: 100,
      }
    });
    setResult(res);
    qc.invalidateQueries({ queryKey: getGetBacktestResultsQueryKey() });
  };

  const equityData = result?.equityCurve?.map((p: any, i: number) => ({
    t: new Date(p.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    portfolio: p.equity,
    benchmark: p.benchmark,
  })) ?? [];

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-sm font-mono font-bold text-foreground uppercase tracking-widest">Backtester</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Config panel */}
        <Card className="bg-card border-card-border">
          <CardHeader className="py-2 px-3 border-b border-border flex-row items-center gap-2">
            <FlaskConical size={12} className="text-muted-foreground" />
            <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-3">
            <div className="space-y-0.5">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Strategy Type</label>
              <Select value={strategyType} onValueChange={setStrategyType}>
                <SelectTrigger className="h-7 text-xs font-mono bg-background border-border" data-testid="backtest-strategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border text-xs font-mono">
                  {STRATEGY_TYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-0.5">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Symbol</label>
              <Select value={symbol} onValueChange={setSymbol}>
                <SelectTrigger className="h-7 text-xs font-mono bg-background border-border" data-testid="backtest-symbol">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border text-xs font-mono">
                  {SYMBOLS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Start Date</label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-7 text-xs font-mono bg-background border-border" data-testid="backtest-start-date" />
              </div>
              <div className="space-y-0.5">
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">End Date</label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-7 text-xs font-mono bg-background border-border" data-testid="backtest-end-date" />
              </div>
            </div>

            <div className="space-y-0.5">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Initial Capital ($)</label>
              <Input type="number" value={initialCapital} onChange={(e) => setInitialCapital(parseFloat(e.target.value))} className="h-7 text-xs font-mono bg-background border-border" data-testid="backtest-capital" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Lookback Period</label>
                <Input type="number" value={lookbackPeriod} onChange={(e) => setLookbackPeriod(parseInt(e.target.value))} className="h-7 text-xs font-mono bg-background border-border" data-testid="backtest-lookback" />
              </div>
              <div className="space-y-0.5">
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Z-Score Threshold</label>
                <Input type="number" step={0.1} value={zScoreThreshold} onChange={(e) => setZScoreThreshold(parseFloat(e.target.value))} className="h-7 text-xs font-mono bg-background border-border" data-testid="backtest-zscore" />
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-muted-foreground">Walk-Forward</span>
              <Switch checked={walkForward} onCheckedChange={setWalkForward} data-testid="backtest-walkforward" />
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-muted-foreground">Monte Carlo (100 runs)</span>
              <Switch checked={monteCarlo} onCheckedChange={setMonteCarlo} data-testid="backtest-montecarlo" />
            </div>

            <Button
              onClick={handleRun}
              disabled={runBacktest.isPending}
              className="w-full h-8 text-xs font-mono"
              data-testid="run-backtest-btn"
            >
              {runBacktest.isPending ? (
                <><Loader2 size={12} className="animate-spin mr-1" />Running...</>
              ) : (
                <><TrendingUp size={12} className="mr-1" />Run Backtest</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results panel */}
        <div className="lg:col-span-2 space-y-4">
          {runBacktest.isPending && (
            <Card className="bg-card border-card-border">
              <CardContent className="flex items-center justify-center h-32">
                <div className="flex flex-col items-center gap-2 text-[11px] font-mono text-muted-foreground">
                  <Loader2 size={20} className="animate-spin text-primary" />
                  Running backtest simulation...
                </div>
              </CardContent>
            </Card>
          )}

          {result && !runBacktest.isPending && (
            <>
              {/* Metrics */}
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-4 gap-2">
                <MetricCard label="Total Return" value={fmtPct(result.totalReturn)} highlight={result.totalReturn >= 0 ? "up" : "down"} />
                <MetricCard label="Final Capital" value={fmtUsd(result.finalCapital)} highlight={result.finalCapital >= initialCapital ? "up" : "down"} />
                <MetricCard label="Sharpe Ratio" value={fmt(result.sharpeRatio)} highlight={result.sharpeRatio >= 1 ? "up" : "down"} />
                <MetricCard label="Sortino Ratio" value={fmt(result.sortinoRatio)} highlight={result.sortinoRatio >= 1 ? "up" : "down"} />
                <MetricCard label="Max Drawdown" value={fmtPct(result.maxDrawdown)} highlight="down" />
                <MetricCard label="Win Rate" value={fmtPct(result.winRate)} highlight={result.winRate >= 0.5 ? "up" : "down"} />
                <MetricCard label="Profit Factor" value={fmt(result.profitFactor)} highlight={result.profitFactor >= 1 ? "up" : "down"} />
                <MetricCard label="Total Trades" value={String(result.totalTrades)} />
              </div>

              {/* Equity curve */}
              {equityData.length > 0 && (
                <Card className="bg-card border-card-border">
                  <CardHeader className="py-2 px-3 border-b border-border">
                    <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Equity Curve vs Benchmark</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={equityData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="t" tick={{ fontSize: 9, fontFamily: "monospace", fill: "#6b7280" }} tickLine={false} axisLine={false} interval={Math.floor(equityData.length / 10)} />
                        <YAxis tick={{ fontSize: 9, fontFamily: "monospace", fill: "#6b7280" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                        <Tooltip contentStyle={{ background: "#0d0f12", border: "1px solid #1f2937", fontSize: 10, fontFamily: "monospace" }} formatter={(v: any) => [`$${fmt(v)}`, ""]} />
                        <Area type="monotone" dataKey="benchmark" stroke="#4b5563" fill="rgba(75,85,99,0.05)" dot={false} name="Benchmark" strokeWidth={1} />
                        <Area type="monotone" dataKey="portfolio" stroke="#3b82f6" fill="rgba(59,130,246,0.1)" dot={false} name="Strategy" strokeWidth={1.5} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Monte Carlo */}
              {result.monteCarloPaths && result.monteCarloPaths.length > 0 && (
                <Card className="bg-card border-card-border">
                  <CardHeader className="py-2 px-3 border-b border-border">
                    <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      Monte Carlo Simulation ({result.monteCarloPaths.length} runs)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    <ResponsiveContainer width="100%" height={140}>
                      <LineChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                        <XAxis tick={{ fontSize: 9, fontFamily: "monospace", fill: "#6b7280" }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 9, fontFamily: "monospace", fill: "#6b7280" }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                        <Tooltip contentStyle={{ background: "#0d0f12", border: "1px solid #1f2937", fontSize: 10, fontFamily: "monospace" }} />
                        {result.monteCarloPaths.slice(0, 30).map((path: number[], i: number) => {
                          const data = path.map((v, j) => ({ x: j, y: v }));
                          const finalVal = path[path.length - 1];
                          const color = finalVal >= initialCapital ? `rgba(34,197,94,0.2)` : `rgba(239,68,68,0.2)`;
                          return (
                            <Line
                              key={i}
                              data={data}
                              dataKey="y"
                              dot={false}
                              stroke={color}
                              strokeWidth={0.8}
                              isAnimationActive={false}
                            />
                          );
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                    <p className="text-[10px] font-mono text-muted-foreground mt-1">
                      Green = profitable outcome · Red = loss outcome
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Walk-forward results */}
              {result.walkForwardResults && (
                <Card className="bg-card border-card-border">
                  <CardHeader className="py-2 px-3 border-b border-border">
                    <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Walk-Forward Analysis</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="space-y-1">
                      {(result.walkForwardResults.windows as any[]).map((w: any) => (
                        <div key={w.window} className="flex items-center gap-3 text-[11px] font-mono border-b border-border/30 pb-1 last:border-0">
                          <span className="text-muted-foreground w-16">Window {w.window}</span>
                          <span className="text-foreground">{w.trades} trades</span>
                          <span className="text-muted-foreground">Win: <span className={cn(w.winRate >= 0.5 ? "text-green-400" : "text-red-400")}>{fmtPct(w.winRate)}</span></span>
                          <span className={cn("ml-auto font-bold", w.pnl >= 0 ? "text-green-400" : "text-red-400")}>
                            {w.pnl >= 0 ? "+" : ""}{fmtUsd(w.pnl)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Trades */}
              {result.trades && result.trades.length > 0 && (
                <Card className="bg-card border-card-border">
                  <CardHeader className="py-2 px-3 border-b border-border">
                    <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      Backtest Trades ({result.trades.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto max-h-48 overflow-y-auto">
                      <table className="w-full text-[11px] font-mono">
                        <thead className="sticky top-0 bg-card">
                          <tr className="border-b border-border">
                            {["#","Side","Entry","Exit","Qty","P&L","P&L%","Opened","Closed"].map(h => (
                              <th key={h} className="px-3 py-1 text-left text-[10px] text-muted-foreground font-normal">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.trades.slice(0, 50).map((t: any) => {
                            const up = t.pnl >= 0;
                            return (
                              <tr key={t.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                                <td className="px-3 py-1 text-muted-foreground">{t.id}</td>
                                <td className="px-3 py-1">
                                  <Badge variant={t.side === "long" ? "default" : "destructive"} className="text-[9px] h-3.5 px-1 py-0">{t.side.toUpperCase()}</Badge>
                                </td>
                                <td className="px-3 py-1 text-muted-foreground">{fmtUsd(t.entryPrice)}</td>
                                <td className="px-3 py-1 text-muted-foreground">{fmtUsd(t.exitPrice)}</td>
                                <td className="px-3 py-1 text-muted-foreground">{fmt(t.quantity, 4)}</td>
                                <td className={cn("px-3 py-1 font-bold", up ? "text-green-400" : "text-red-400")}>{up ? "+" : ""}{fmtUsd(t.pnl)}</td>
                                <td className={cn("px-3 py-1", up ? "text-green-400" : "text-red-400")}>{up ? "+" : ""}{fmtPct(t.pnlPct)}</td>
                                <td className="px-3 py-1 text-muted-foreground">{new Date(t.openedAt).toLocaleDateString()}</td>
                                <td className="px-3 py-1 text-muted-foreground">{new Date(t.closedAt).toLocaleDateString()}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* History */}
          {!result && history && history.length > 0 && (
            <Card className="bg-card border-card-border">
              <CardHeader className="py-2 px-3 border-b border-border">
                <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Previous Backtests</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] font-mono">
                    <thead>
                      <tr className="border-b border-border">
                        {["Strategy","Symbol","Period","Return","Sharpe","Max DD","Win Rate","Trades","Date"].map(h => (
                          <th key={h} className="px-3 py-1.5 text-left text-[10px] text-muted-foreground font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => {
                        const up = h.totalReturn >= 0;
                        return (
                          <tr key={h.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors" data-testid={`backtest-history-${h.id}`}>
                            <td className="px-3 py-1.5 font-bold text-foreground">{h.strategyType}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{h.symbol}</td>
                            <td className="px-3 py-1.5 text-muted-foreground text-[10px]">{h.startDate} → {h.endDate}</td>
                            <td className={cn("px-3 py-1.5 font-bold", up ? "text-green-400" : "text-red-400")}>{up ? "+" : ""}{fmtPct(h.totalReturn)}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{fmt(h.sharpeRatio)}</td>
                            <td className="px-3 py-1.5 text-red-400">{fmtPct(h.maxDrawdown)}</td>
                            <td className={cn("px-3 py-1.5", h.winRate >= 0.5 ? "text-green-400" : "text-red-400")}>{fmtPct(h.winRate)}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{h.totalTrades}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{new Date(h.createdAt).toLocaleDateString()}</td>
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
      </div>
    </div>
  );
}
