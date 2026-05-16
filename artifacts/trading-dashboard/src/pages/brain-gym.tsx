import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Dumbbell, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Clock, BarChart2, Microscope, BrainCircuit, Sparkles } from "lucide-react";

type Lookback = "1d" | "7d" | "30d" | "all_time";

interface BrainGymReport {
  id: number;
  lookback: string;
  tradeCount: string;
  createdAt: string;
  report: {
    generated_at: string;
    total_trades: number;
    sufficient_data: boolean;
    summary: {
      wins: number;
      losses: number;
      win_rate: number;
      total_pnl: number;
      avg_win: number;
      avg_loss: number;
      profit_factor: number | string;
      expectancy: number;
    };
    channel_a_post_mortem: {
      correlation_clusters: Array<{
        group: string;
        window: string;
        simultaneous_losses: number;
        pairs: string[];
        total_pnl: number;
        risk: string;
      }>;
      loss_indicator_distributions: Record<string, {
        n: number; mean: number; std: number; p25: number; p50: number; p75: number;
      }>;
    };
    channel_b_alpha: {
      win_indicator_distributions: Record<string, {
        n: number; mean: number; std: number; p25: number; p50: number; p75: number;
      }>;
    };
    session_matrix: Array<{
      session: string; strategy: string; trades: number; wins: number;
      losses: number; win_rate: number; pnl: number; avg_pnl: number;
    }>;
    mae_mfe_analysis: {
      winner_mae: { n: number; mean?: number; p50_median?: number; p90?: number; note?: string };
      loser_mfe: { n: number; mean?: number; p50_median?: number; p75?: number; note?: string };
      sl_recommendation?: string;
      tp_recommendation?: string;
    };
    blacklisted_conditions: string[];
    high_confidence_thresholds: string[];
  };
}

const LOOKBACK_LABELS: Record<string, string> = {
  "1d": "Last 24h",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "all_time": "All time",
};

interface DeepAnalysis {
  mae_pips: number;
  mfe_pips: number;
  duration_hours: number;
  trend_at_entry: string;
  entry_alignment: string;
  ema200: string;
  rsi_at_entry: number;
  post_exit_move: string | null;
  verdict: string;
  analyzed_at: string;
}

interface TradeWithAnalysis {
  id: number;
  symbol: string;
  side: string;
  strategy: string;
  pnl: number | null;
  openedAt: string;
  closedAt: string | null;
  session: string | null;
  deepAnalysis: DeepAnalysis | null;
  analyzedAt: string | null;
}

function fmt(v: number | undefined | null, decimals = 2) {
  if (v == null || isNaN(v)) return "—";
  return v.toFixed(decimals);
}

function pct(v: number | undefined | null) {
  if (v == null || isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function IndicatorTable({ label, data }: {
  label: string;
  data: Record<string, { n: number; mean: number; std: number; p25: number; p50: number; p75: number }>;
}) {
  const rows = Object.entries(data);
  if (!rows.length || rows.every(([, v]) => v.n === 0)) {
    return <p className="text-xs text-muted-foreground">No indicator data recorded yet.</p>;
  }
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      <div className="grid grid-cols-6 gap-1 text-[10px] text-muted-foreground font-medium uppercase px-1">
        <span>Indicator</span><span className="text-right">n</span>
        <span className="text-right">mean</span><span className="text-right">p25</span>
        <span className="text-right">p50</span><span className="text-right">p75</span>
      </div>
      {rows.map(([key, s]) => s.n > 0 && (
        <div key={key} className="grid grid-cols-6 gap-1 text-xs px-1 py-0.5 rounded hover:bg-muted/30">
          <span className="font-mono text-foreground">{key}</span>
          <span className="text-right text-muted-foreground">{s.n}</span>
          <span className="text-right">{fmt(s.mean, 1)}</span>
          <span className="text-right">{fmt(s.p25, 1)}</span>
          <span className="text-right">{fmt(s.p50, 1)}</span>
          <span className="text-right">{fmt(s.p75, 1)}</span>
        </div>
      ))}
    </div>
  );
}

export default function BrainGymPage() {
  const qc = useQueryClient();
  const [triggerLookback, setTriggerLookback] = useState<Lookback>("7d");

  const { data: latest, isLoading } = useQuery<BrainGymReport>({
    queryKey: ["brain-gym-latest"],
    queryFn: () => fetch("/api/analytics/brain-gym/latest", { credentials: "include" }).then(r => {
      if (!r.ok) return null;
      return r.json();
    }),
    refetchInterval: 15_000,
  });

  const { data: progress } = useQuery<{ total: number; analyzed: number; pct: number; lookback: string }>({
    queryKey: ["brain-gym-progress", triggerLookback],
    queryFn: () =>
      fetch(`/api/analytics/brain-gym/progress?lookback=${triggerLookback}`, { credentials: "include" })
        .then(r => r.json()),
    refetchInterval: 5_000,
  });

  const [verdictFilter, setVerdictFilter] = useState<"all" | "loss" | "win">("all");

  const { data: briefing } = useQuery<{
    briefing: string;
    equity: number;
    symbols: string[];
    generatedAt: string;
  } | null>({
    queryKey: ["market-briefing"],
    queryFn: () =>
      fetch("/api/analytics/market-briefing", { credentials: "include" }).then(r => {
        if (r.status === 404) return null;
        return r.json();
      }),
    refetchInterval: 30_000,
  });

  const { data: tradesData } = useQuery<{ trades: TradeWithAnalysis[]; total: number }>({
    queryKey: ["brain-gym-trades", triggerLookback],
    queryFn: () =>
      fetch(`/api/trades?status=closed&limit=200`, { credentials: "include" })
        .then(r => r.json()),
    refetchInterval: 15_000,
  });

  const trigger = useMutation({
    mutationFn: (lookback: Lookback) =>
      fetch("/api/analytics/brain-gym/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ lookback }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brain-gym-latest"] });
    },
  });

  const report = latest?.report;
  const summary = report?.summary;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Dumbbell size={20} className="text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Brain Gym</h1>
            <p className="text-xs text-muted-foreground">
              Offline post-trade analytics — runs automatically on weekends
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={triggerLookback} onValueChange={v => setTriggerLookback(v as Lookback)}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LOOKBACK_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            disabled={trigger.isPending}
            onClick={() => trigger.mutate(triggerLookback)}
          >
            <RefreshCw size={12} className={trigger.isPending ? "animate-spin" : ""} />
            {trigger.isPending ? "Running…" : "Run Now"}
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground text-center py-12">Loading latest report…</div>
      )}

      {!isLoading && !report && (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <Dumbbell size={32} className="mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No reports yet.</p>
            <p className="text-xs text-muted-foreground">
              Brain Gym runs automatically on weekends, or click "Run Now" above.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Deep Analysis Progress Bar ── */}
      {progress && (
        <Card className={progress.pct === 100 ? "border-emerald-500/30 bg-emerald-500/5" : "border-border"}>
          <CardContent className="py-3 px-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Microscope size={13} className={progress.pct === 100 ? "text-emerald-400" : "text-primary"} />
                <span className="text-xs font-medium text-foreground">
                  Deep Analysis — {LOOKBACK_LABELS[triggerLookback]}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono">
                  {progress.analyzed} / {progress.total} trades
                </span>
                <span className={`text-xs font-bold font-mono ${progress.pct === 100 ? "text-emerald-400" : "text-primary"}`}>
                  {progress.pct}%
                </span>
              </div>
            </div>
            <Progress value={progress.pct} className="h-2" />
            <p className="text-[10px] text-muted-foreground">
              {progress.pct === 100
                ? "✓ All trades fully dissected — MAE/MFE, trend context, entry alignment, verdicts complete. Will update when new trades are added."
                : progress.analyzed === 0
                  ? "Restart the bot to begin deep per-trade bar analysis (requires MT5 connection)."
                  : `Bot is analyzing trades in the background using real MT5 bar data — MAE/MFE, trend, entry alignment, verdict per trade.`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Pre-Market Briefing (Gemini) ── */}
      {briefing && (
        <Card className="border-violet-500/30 bg-violet-500/5">
          <CardHeader className="py-3 px-4 pb-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <BrainCircuit size={14} className="text-violet-400" />
              Pre-Market Briefing
              <Badge variant="outline" className="ml-auto text-[10px] border-violet-500/40 text-violet-400 flex items-center gap-1">
                <Sparkles size={9} />
                Gemini
              </Badge>
              <span className="text-[10px] font-normal text-muted-foreground">
                {new Date(briefing.generatedAt).toLocaleString()}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 py-3">
            <div className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed font-mono bg-background/40 rounded p-3 max-h-80 overflow-y-auto border border-violet-500/10">
              {briefing.briefing}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Generated at startup using Gemini AI — account equity ${briefing.equity?.toLocaleString()} | {briefing.symbols?.length} pairs
            </p>
          </CardContent>
        </Card>
      )}

      {report && (
        <>
          {/* Meta bar */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {new Date(report.generated_at).toLocaleString()}
            </span>
            <span>·</span>
            <span>Lookback: <strong className="text-foreground">{LOOKBACK_LABELS[report.lookback] ?? report.lookback}</strong></span>
            <span>·</span>
            <span>{report.total_trades} trades analysed</span>
            {!report.sufficient_data && (
              <Badge variant="outline" className="border-amber-500/50 text-amber-400 text-[10px]">
                <AlertTriangle size={9} className="mr-1" />
                &lt;15 trades — low confidence
              </Badge>
            )}
          </div>

          {/* Summary row */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {[
                { label: "Win rate", value: pct(summary.win_rate), up: summary.win_rate >= 0.5 },
                { label: "Total PnL", value: `$${fmt(summary.total_pnl)}`, up: summary.total_pnl >= 0 },
                { label: "Avg win", value: `$${fmt(summary.avg_win)}` },
                { label: "Avg loss", value: `$${fmt(summary.avg_loss)}` },
                { label: "Profit factor", value: String(summary.profit_factor), up: Number(summary.profit_factor) >= 1 },
                { label: "Expectancy", value: `$${fmt(summary.expectancy)}`, up: summary.expectancy >= 0 },
                { label: "Trades W/L", value: `${summary.wins}/${summary.losses}` },
              ].map(({ label, value, up }) => (
                <Card key={label} className="py-3">
                  <CardContent className="p-0 px-3 space-y-0.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className={`text-base font-semibold ${up === true ? "text-emerald-400" : up === false ? "text-red-400" : ""}`}>
                      {value}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Channel A — Post-Mortem */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingDown size={14} className="text-red-400" />
                  Channel A — Post-Mortem (Losses)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <IndicatorTable
                  label="Indicator values at entry for losing trades"
                  data={report.channel_a_post_mortem.loss_indicator_distributions}
                />
                {report.channel_a_post_mortem.correlation_clusters.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-foreground">Correlation clusters</p>
                    {report.channel_a_post_mortem.correlation_clusters.map((c, i) => (
                      <div key={i} className="text-xs bg-red-500/5 border border-red-500/20 rounded p-2 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">{c.group}</span>
                          <Badge variant="outline" className={`text-[10px] ${c.risk === "HIGH" ? "border-red-500/50 text-red-400" : "border-amber-500/50 text-amber-400"}`}>
                            {c.risk}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground">{c.pairs.join(", ")} · {c.simultaneous_losses} simultaneous losses · ${fmt(c.total_pnl)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Channel B — Alpha */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp size={14} className="text-emerald-400" />
                  Channel B — Alpha (Winners)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <IndicatorTable
                  label="Indicator values at entry for winning trades"
                  data={report.channel_b_alpha.win_indicator_distributions}
                />
              </CardContent>
            </Card>
          </div>

          {/* Session matrix */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart2 size={14} className="text-blue-400" />
                Session Matrix
              </CardTitle>
            </CardHeader>
            <CardContent>
              {report.session_matrix.length === 0 ? (
                <p className="text-xs text-muted-foreground">No session data yet.</p>
              ) : (
                <div className="space-y-1">
                  <div className="grid grid-cols-6 gap-2 text-[10px] text-muted-foreground font-medium uppercase px-1">
                    <span className="col-span-2">Session · Strategy</span>
                    <span className="text-right">Trades</span>
                    <span className="text-right">Win rate</span>
                    <span className="text-right">Avg PnL</span>
                    <span className="text-right">Total PnL</span>
                  </div>
                  {report.session_matrix.map((row, i) => (
                    <div key={i} className="grid grid-cols-6 gap-2 text-xs px-1 py-0.5 rounded hover:bg-muted/30">
                      <span className="col-span-2 text-foreground capitalize">
                        {row.session.replace(/_/g, " ")} · <span className="text-muted-foreground">{row.strategy}</span>
                      </span>
                      <span className="text-right text-muted-foreground">{row.trades}</span>
                      <span className={`text-right font-medium ${row.win_rate >= 0.5 ? "text-emerald-400" : "text-red-400"}`}>
                        {pct(row.win_rate)}
                      </span>
                      <span className={`text-right ${row.avg_pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        ${fmt(row.avg_pnl)}
                      </span>
                      <span className={`text-right ${row.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        ${fmt(row.pnl)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* MAE/MFE */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">MAE / MFE Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-foreground">Winner MAE (drawdown before profit)</p>
                  {report.mae_mfe_analysis.winner_mae.n === 0 ? (
                    <p className="text-xs text-muted-foreground">No data yet</p>
                  ) : (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>n={report.mae_mfe_analysis.winner_mae.n} · mean={fmt(report.mae_mfe_analysis.winner_mae.mean, 4)}</p>
                      <p>median={fmt(report.mae_mfe_analysis.winner_mae.p50_median, 4)} · p90={fmt(report.mae_mfe_analysis.winner_mae.p90, 4)}</p>
                    </div>
                  )}
                  {report.mae_mfe_analysis.sl_recommendation && (
                    <p className="text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded p-1.5 mt-1">
                      {report.mae_mfe_analysis.sl_recommendation}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-foreground">Loser MFE (closest to TP before reversing)</p>
                  {report.mae_mfe_analysis.loser_mfe.n === 0 ? (
                    <p className="text-xs text-muted-foreground">No data yet</p>
                  ) : (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>n={report.mae_mfe_analysis.loser_mfe.n} · mean={fmt(report.mae_mfe_analysis.loser_mfe.mean, 4)}</p>
                      <p>p75={fmt(report.mae_mfe_analysis.loser_mfe.p75, 4)}</p>
                    </div>
                  )}
                  {report.mae_mfe_analysis.tp_recommendation && (
                    <p className="text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded p-1.5 mt-1">
                      {report.mae_mfe_analysis.tp_recommendation}
                    </p>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                Note: MAE/MFE approximated from H1 OHLC — sub-hour precision not available
              </p>
            </CardContent>
          </Card>

          {/* Blacklist & Thresholds */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle size={14} className="text-red-400" />
                  Blacklist Conditions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {report.blacklisted_conditions.map((rule, i) => (
                  <div key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-red-400 mt-0.5 shrink-0">•</span>
                    <span>{rule}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle size={14} className="text-emerald-400" />
                  High-Confidence Thresholds
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {report.high_confidence_thresholds.map((t, i) => (
                  <div key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5 shrink-0">•</span>
                    <span>{t}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* ── Gemini Strategy Recommendations ── */}
          {(report as any).strategy_recommendations && (
            <Card className="border-violet-500/30 bg-violet-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles size={14} className="text-violet-400" />
                  Strategy Improvement Recommendations
                  <Badge variant="outline" className="ml-1 text-[10px] border-violet-500/40 text-violet-400">Gemini AI</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed font-mono bg-background/40 rounded p-3 max-h-72 overflow-y-auto border border-violet-500/10">
                  {(report as any).strategy_recommendations}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Per-Trade Verdicts ── */}
          {(() => {
            const allTrades = (tradesData?.trades ?? []).filter(t => t.deepAnalysis);
            const filtered = verdictFilter === "win"
              ? allTrades.filter(t => (t.pnl ?? 0) > 0)
              : verdictFilter === "loss"
                ? allTrades.filter(t => (t.pnl ?? 0) <= 0)
                : allTrades;
            const sorted = [...filtered].sort((a, b) => (a.pnl ?? 0) - (b.pnl ?? 0)); // worst first

            return (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Microscope size={14} className="text-primary" />
                      Per-Trade Deep Analysis
                      {allTrades.length > 0 && (
                        <span className="text-[10px] font-normal text-muted-foreground">
                          {allTrades.length} trades dissected
                        </span>
                      )}
                    </CardTitle>
                    <div className="flex gap-1">
                      {(["all", "loss", "win"] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => setVerdictFilter(f)}
                          className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase transition-colors ${
                            verdictFilter === f
                              ? f === "win" ? "bg-emerald-500/20 text-emerald-400" : f === "loss" ? "bg-red-500/20 text-red-400" : "bg-primary/20 text-primary"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {f === "all" ? `All (${allTrades.length})` : f === "win" ? `Wins (${allTrades.filter(t => (t.pnl ?? 0) > 0).length})` : `Losses (${allTrades.filter(t => (t.pnl ?? 0) <= 0).length})`}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {sorted.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      {allTrades.length === 0
                        ? "No trades analyzed yet — restart the bot to run deep analysis"
                        : "No trades match this filter"}
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                      {sorted.map(trade => {
                        const da = trade.deepAnalysis!;
                        const win = (trade.pnl ?? 0) > 0;
                        const alignColor = da.entry_alignment === "with_trend"
                          ? "text-emerald-400" : da.entry_alignment === "against_trend"
                            ? "text-red-400" : "text-muted-foreground";
                        const trendIcon = da.trend_at_entry === "uptrend" ? "↑" : da.trend_at_entry === "downtrend" ? "↓" : "→";
                        const verdict = da.verdict.split(": ").slice(1).join(": ") || da.verdict;

                        return (
                          <div
                            key={trade.id}
                            className={`rounded border p-3 space-y-2 text-xs ${
                              win ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"
                            }`}
                          >
                            {/* Top row */}
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <span className={`font-bold font-mono text-sm ${win ? "text-emerald-400" : "text-red-400"}`}>
                                  {win ? "WIN" : "LOSS"}
                                </span>
                                <span className="font-mono font-semibold text-foreground">{trade.symbol}</span>
                                <span className="text-muted-foreground uppercase text-[10px]">{trade.side}</span>
                                <span className="text-muted-foreground text-[10px]">{trade.strategy}</span>
                              </div>
                              <div className="flex items-center gap-3 text-[10px] font-mono">
                                <span className={win ? "text-emerald-400" : "text-red-400"}>
                                  {(trade.pnl ?? 0) >= 0 ? "+" : ""}${(trade.pnl ?? 0).toFixed(2)}
                                </span>
                                <span className="text-muted-foreground">
                                  {new Date(trade.openedAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>

                            {/* Stats row */}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
                              <span>
                                <span className="text-muted-foreground">Trend </span>
                                <span className="font-mono">{da.trend_at_entry}{trendIcon}</span>
                              </span>
                              <span>
                                <span className="text-muted-foreground">Entry </span>
                                <span className={`font-mono font-medium ${alignColor}`}>
                                  {da.entry_alignment === "with_trend" ? "WITH trend" : da.entry_alignment === "against_trend" ? "AGAINST trend" : "neutral"}
                                </span>
                              </span>
                              <span>
                                <span className="text-muted-foreground">MAE </span>
                                <span className="font-mono text-red-400">{da.mae_pips > 0 ? "+" : ""}{da.mae_pips.toFixed(0)}p</span>
                              </span>
                              <span>
                                <span className="text-muted-foreground">MFE </span>
                                <span className="font-mono text-emerald-400">+{da.mfe_pips.toFixed(0)}p</span>
                              </span>
                              <span>
                                <span className="text-muted-foreground">RSI </span>
                                <span className="font-mono">{da.rsi_at_entry}</span>
                              </span>
                              <span>
                                <span className="text-muted-foreground">{da.ema200.replace("_", " ")}</span>
                              </span>
                              <span>
                                <span className="text-muted-foreground">{da.duration_hours}h held</span>
                              </span>
                              {da.post_exit_move && (
                                <span>
                                  <span className="text-muted-foreground">After exit: </span>
                                  <span className={`font-mono ${da.post_exit_move.startsWith("reversed") && !win ? "text-amber-400" : "text-muted-foreground"}`}>
                                    {da.post_exit_move.replace("_", " ")}
                                  </span>
                                </span>
                              )}
                            </div>

                            {/* Verdict */}
                            <p className={`text-[10px] leading-relaxed ${win ? "text-emerald-300/80" : "text-red-300/80"}`}>
                              {verdict}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </>
      )}
    </div>
  );
}
