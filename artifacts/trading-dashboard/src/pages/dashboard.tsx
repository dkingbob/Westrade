import { useState, useEffect } from "react";
import {
  useGetPortfolioSummary,
  useGetPositions,
  useGetAlerts,
  useGetEngineStatus,
  useStartEngine,
  useStopEngine,
  getGetPortfolioSummaryQueryKey,
  getGetEngineStatusQueryKey,
  getGetPositionsQueryKey,
  getGetAlertsQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, TrendingUp, TrendingDown, DollarSign, BarChart2, ShieldAlert, AlertTriangle, Info, AlertCircle, Power, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function fmt(n: number, dec = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtUsd(n: number) {
  return `$${fmt(n)}`;
}
function fmtPct(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}

function FearGreedGauge({ value, label }: { value: number; label: string }) {
  const cx = 60, cy = 65, r = 50;
  const color = value <= 25 ? "#ef4444" : value <= 45 ? "#f97316" : value <= 55 ? "#eab308" : value <= 75 ? "#84cc16" : "#22c55e";

  const zones = [
    { start: 0, end: 36, color: "#ef4444" },
    { start: 36, end: 72, color: "#f97316" },
    { start: 72, end: 108, color: "#eab308" },
    { start: 108, end: 144, color: "#84cc16" },
    { start: 144, end: 180, color: "#22c55e" },
  ];

  // 0=left, 90=top, 180=right  (gauge sweeps left→top→right)
  const toXY = (deg: number, radius: number) => ({
    x: cx - radius * Math.cos(deg * Math.PI / 180),
    y: cy - radius * Math.sin(deg * Math.PI / 180),
  });

  // Needle: value 0→left, 100→right (angle relative to vertical)
  const needleRad = ((value / 100) * 180 - 90) * Math.PI / 180;
  const nx = cx + (r - 10) * Math.sin(needleRad);
  const ny = cy - (r - 10) * Math.cos(needleRad);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 80" className="w-full max-w-[140px]">
        {zones.map(({ start, end, color: c }) => {
          const s = toXY(start, r);
          const e = toXY(end, r);
          return (
            <path
              key={start}
              d={`M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 0 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`}
              stroke={c}
              strokeWidth="9"
              fill="none"
              strokeLinecap="butt"
            />
          );
        })}
        <line x1={cx} y1={cy} x2={nx.toFixed(2)} y2={ny.toFixed(2)} stroke="white" strokeWidth="2" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="3" fill="white" />
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="12" fontWeight="bold" fill={color} fontFamily="monospace">{value}</text>
      </svg>
      <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider -mt-1">{label}</p>
    </div>
  );
}

function MetricCard({ label, value, sub, up, loading }: { label: string; value: string; sub?: string; up?: boolean; loading?: boolean }) {
  return (
    <Card className="bg-card border-card-border">
      <CardContent className="p-3">
        {loading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <>
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
            <div className={cn("text-lg font-mono font-bold", up === true ? "text-green-400" : up === false ? "text-red-400" : "text-foreground")}>
              {value}
            </div>
            {sub && <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{sub}</div>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PositionRow({ pos }: { pos: any }) {
  const up = pos.pnl >= 0;
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-border/50 last:border-0 text-xs font-mono" data-testid={`position-row-${pos.id}`}>
      <div className="w-16 font-bold text-foreground">{pos.symbol}</div>
      <Badge variant={pos.side === "long" ? "default" : "destructive"} className="text-[10px] px-1 py-0 h-4">
        {pos.side.toUpperCase()}
      </Badge>
      <div className="flex-1 text-muted-foreground">×{fmt(pos.quantity, 4)}</div>
      <div className="text-right text-muted-foreground">{fmtUsd(pos.entryPrice)}</div>
      <div className="w-16 text-right text-muted-foreground">{fmtUsd(pos.currentPrice)}</div>
      <div className={cn("w-20 text-right font-bold", up ? "text-green-400" : "text-red-400")}>
        {up ? "+" : ""}{fmtUsd(pos.pnl)}
      </div>
      <div className={cn("w-14 text-right", up ? "text-green-400" : "text-red-400")}>
        {up ? "+" : ""}{fmtPct(pos.pnlPct)}
      </div>
      <div className="w-28 text-right text-muted-foreground truncate">{pos.strategy}</div>
    </div>
  );
}

function AlertRow({ alert }: { alert: any }) {
  const icons: Record<string, typeof Info> = { critical: AlertCircle, warning: AlertTriangle, info: Info };
  const colors: Record<string, string> = { critical: "text-red-400", warning: "text-yellow-400", info: "text-blue-400" };
  const Icon = icons[alert.severity] ?? Info;
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0" data-testid={`alert-row-${alert.id}`}>
      <Icon size={12} className={cn("mt-0.5 shrink-0", colors[alert.severity])} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-mono text-foreground truncate">{alert.message}</div>
        <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
          {new Date(alert.createdAt).toLocaleTimeString()}
        </div>
      </div>
      <Badge
        variant="outline"
        className={cn("text-[10px] shrink-0", colors[alert.severity], "border-current")}
      >
        {alert.severity}
      </Badge>
    </div>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useGetPortfolioSummary({ query: { queryKey: getGetPortfolioSummaryQueryKey(), refetchInterval: 5000 } });
  const { data: positions, isLoading: posLoading } = useGetPositions({ query: { queryKey: getGetPositionsQueryKey(), refetchInterval: 5000 } });
  const { data: alerts } = useGetAlerts({ query: { queryKey: getGetAlertsQueryKey() } });
  const { data: engineStatus } = useGetEngineStatus({ query: { queryKey: getGetEngineStatusQueryKey(), refetchInterval: 5000 } });

  const { data: fng } = useQuery({
    queryKey: ["fear-greed"],
    queryFn: () => fetch("https://api.alternative.me/fng/?limit=1").then(r => r.json()).then(d => d.data?.[0]),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
  });

  const { data: connStatus } = useQuery({
    queryKey: ["connections-status"],
    queryFn: () => fetch("/api/connections/status", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 15_000,
  });
  const botOnline = connStatus?.pythonBot?.connected ?? false;

  const qc = useQueryClient();
  const startEngine = useStartEngine();
  const stopEngine = useStopEngine();

  const toggleEngine = async () => {
    if (engineStatus?.running) {
      await stopEngine.mutateAsync();
    } else {
      await startEngine.mutateAsync();
    }
    qc.invalidateQueries({ queryKey: getGetEngineStatusQueryKey() });
    qc.invalidateQueries({ queryKey: getGetPortfolioSummaryQueryKey() });
  };

  const unreviewedAlerts = alerts?.filter((a) => !a.acknowledged) ?? [];
  const dailyUp = (summary?.dailyPnl ?? 0) >= 0;
  const totalUp = (summary?.totalPnl ?? 0) >= 0;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-mono font-bold text-foreground uppercase tracking-widest">Dashboard</h1>
          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <Button
          size="sm"
          variant={engineStatus?.running ? "destructive" : "default"}
          onClick={toggleEngine}
          disabled={startEngine.isPending || stopEngine.isPending}
          data-testid="engine-toggle-btn"
          className="font-mono text-xs h-7 px-3"
        >
          {startEngine.isPending || stopEngine.isPending ? (
            <Loader2 size={12} className="animate-spin mr-1" />
          ) : (
            <Power size={12} className="mr-1" />
          )}
          {engineStatus?.running ? "STOP ENGINE" : "START ENGINE"}
        </Button>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <MetricCard
          label="Equity"
          value={fmtUsd(summary?.equity ?? 0)}
          sub={`${summary?.openPositions ?? 0} open positions`}
          loading={summaryLoading}
        />
        <MetricCard
          label="Daily P&L"
          value={`${dailyUp ? "+" : ""}${fmtUsd(summary?.dailyPnl ?? 0)}`}
          sub={fmtPct(summary?.dailyPnlPct ?? 0)}
          up={dailyUp}
          loading={summaryLoading}
        />
        <MetricCard
          label="Total P&L"
          value={`${totalUp ? "+" : ""}${fmtUsd(summary?.totalPnl ?? 0)}`}
          sub={fmtPct(summary?.totalPnlPct ?? 0)}
          up={totalUp}
          loading={summaryLoading}
        />
        <MetricCard
          label="Sharpe Ratio"
          value={fmt(summary?.sharpeRatio ?? 0)}
          sub={`Sortino: ${fmt(summary?.sortinoRatio ?? 0)}`}
          loading={summaryLoading}
        />
        <MetricCard
          label="Win Rate"
          value={fmtPct(summary?.winRate ?? 0)}
          sub={`Profit Factor: ${fmt(summary?.profitFactor ?? 0)}`}
          loading={summaryLoading}
        />
        <MetricCard
          label="Max Drawdown"
          value={fmtPct(summary?.maxDrawdown ?? 0)}
          sub={`Risk Score: ${fmt(summary?.riskScore ?? 0)}`}
          up={false}
          loading={summaryLoading}
        />
        <Card className="bg-card border-card-border">
          <CardContent className="p-3">
            {fng ? (
              <>
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Fear & Greed</div>
                <FearGreedGauge value={Number(fng.value)} label={fng.value_classification} />
              </>
            ) : (
              <>
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Fear & Greed</div>
                <div className="text-xs font-mono text-muted-foreground">Loading...</div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Open Positions & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Open Positions */}
        <div className="lg:col-span-2">
          <Card className="bg-card border-card-border">
            <CardHeader className="py-2 px-3 border-b border-border">
              <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Activity size={11} />
                Open Positions ({positions?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!botOnline && positions && positions.length > 0 && (
                <div className="mx-4 mt-3 mb-2 p-2 rounded border border-amber-500/30 bg-amber-500/5 flex items-center gap-2">
                  <AlertTriangle size={11} className="text-amber-400 shrink-0" />
                  <p className="text-[10px] font-mono text-amber-300">Bot offline — positions shown may be stale. Start the bot to sync.</p>
                </div>
              )}
              <div className="p-3 pt-0">
              {posLoading ? (
                <div className="space-y-1 pt-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
                </div>
              ) : positions && positions.length > 0 ? (
                <div className="pt-3">
                  <div className="flex items-center gap-3 pb-1 border-b border-border/30 text-[10px] font-mono text-muted-foreground">
                    <div className="w-16">SYMBOL</div>
                    <div className="w-10">SIDE</div>
                    <div className="flex-1">QTY</div>
                    <div className="text-right">ENTRY</div>
                    <div className="w-16 text-right">CURRENT</div>
                    <div className="w-20 text-right">P&L $</div>
                    <div className="w-14 text-right">P&L %</div>
                    <div className="w-28 text-right">STRATEGY</div>
                  </div>
                  {positions.map((pos) => <PositionRow key={pos.id} pos={pos} />)}
                </div>
              ) : (
                <div className="flex items-center justify-center h-16 text-[11px] font-mono text-muted-foreground">
                  No open positions
                </div>
              )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Alerts */}
        <div>
          <Card className="bg-card border-card-border">
            <CardHeader className="py-2 px-3 border-b border-border">
              <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ShieldAlert size={11} />
                Recent Alerts
                {unreviewedAlerts.length > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4 ml-auto">
                    {unreviewedAlerts.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              {unreviewedAlerts.length > 0 ? (
                unreviewedAlerts.slice(0, 6).map((alert) => <AlertRow key={alert.id} alert={alert} />)
              ) : (
                <div className="flex items-center justify-center h-16 text-[11px] font-mono text-muted-foreground">
                  No active alerts
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Engine stats */}
      {engineStatus && (
        <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground border border-border rounded px-3 py-2 bg-card">
          <span className={cn("flex items-center gap-1", engineStatus.running ? "text-green-400" : "text-red-400")}>
            <span className={cn("w-1.5 h-1.5 rounded-full", engineStatus.running ? "bg-green-400" : "bg-red-400")} />
            {engineStatus.running ? "ENGINE RUNNING" : "ENGINE STOPPED"}
          </span>
          <span>Mode: <span className="text-foreground uppercase">{engineStatus.mode}</span></span>
          {engineStatus.running && (
            <>
              <span>Uptime: <span className="text-foreground">{Math.floor((engineStatus.uptime ?? 0) / 60)}m {(engineStatus.uptime ?? 0) % 60}s</span></span>
              <span>Active Strategies: <span className="text-foreground">{engineStatus.activeStrategies}</span></span>
            </>
          )}
          <span className="ml-auto">Total Trades: <span className="text-foreground">{summary?.totalTrades ?? 0}</span></span>
        </div>
      )}
    </div>
  );
}
