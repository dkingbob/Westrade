import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/hooks/use-theme";
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
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Activity, BarChart2, ShieldAlert, AlertTriangle, Info, AlertCircle, Power, Loader2, Copy, Bot, Settings, LogOut } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { MarketHours } from "@/components/MarketHours";

function fmt(n: number, dec = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtUsd(n: number) {
  return `$${fmt(n)}`;
}
function fmtPct(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}

function FearGreedGauge({ value, label, darkMode }: { value: number; label: string; darkMode: boolean }) {
  const cx = 60, cy = 65, r = 50;
  const needleColor = darkMode ? "white" : "#1e293b";
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
        <line x1={cx} y1={cy} x2={nx.toFixed(2)} y2={ny.toFixed(2)} stroke={needleColor} strokeWidth="2" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="3" fill={needleColor} />
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
    <div className="flex items-center gap-3 py-1.5 border-b border-border/50 last:border-0 text-xs font-mono min-w-[540px]" data-testid={`position-row-${pos.id}`}>
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

function AlertRow({ alert, darkMode }: { alert: any; darkMode: boolean }) {
  const icons: Record<string, typeof Info> = { critical: AlertCircle, warning: AlertTriangle, info: Info };
  const colors: Record<string, string> = {
    critical: "text-red-400",
    warning: darkMode ? "text-yellow-400" : "text-amber-700",
    info: darkMode ? "text-blue-400" : "text-blue-600",
  };
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


function ModeSwitch({ tradingMode, onToggle }: { tradingMode: "forex" | "crypto"; onToggle: () => void }) {
  const isCrypto = tradingMode === "crypto";
  return (
    <button
      onClick={onToggle}
      className="relative flex items-center h-7 rounded-full p-0.5 transition-all shrink-0"
      style={{
        background: isCrypto ? "rgba(249,115,22,0.12)" : "rgba(99,102,241,0.12)",
        border: isCrypto ? "1px solid rgba(249,115,22,0.3)" : "1px solid rgba(99,102,241,0.3)",
        width: "108px",
      }}
      title={`Switch to ${isCrypto ? "Forex" : "Crypto"} mode`}
    >
      {/* sliding pill */}
      <span
        className="absolute top-0.5 bottom-0.5 w-[50px] rounded-full transition-all duration-300"
        style={{
          left: isCrypto ? "calc(100% - 52px)" : "2px",
          background: isCrypto ? "rgba(249,115,22,0.85)" : "rgba(99,102,241,0.85)",
        }}
      />
      <span className={cn("relative z-10 flex-1 text-center text-[9px] font-mono font-bold transition-colors", !isCrypto ? "text-white" : "text-muted-foreground")}>
        FOREX
      </span>
      <span className={cn("relative z-10 flex-1 text-center text-[9px] font-mono font-bold transition-colors", isCrypto ? "text-white" : "text-muted-foreground")}>
        ₿ BTC
      </span>
    </button>
  );
}

function ProfileDropdown({ user }: { user: any }) {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { logout } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const initials = user?.firstName ? user.firstName.slice(0, 2).toUpperCase() : "ME";
  const name = user?.firstName ? `${user.firstName} ${user.lastName ?? ""}`.trim() : "Trader";

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 rounded-full p-0.5 transition-all hover:ring-2 hover:ring-primary/40 focus:outline-none">
        <Avatar className="w-7 h-7">
          <AvatarImage src={user?.profileImageUrl ?? undefined} />
          <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-mono">{initials}</AvatarFallback>
        </Avatar>
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-52 rounded-xl overflow-hidden shadow-2xl"
          style={{ background: "rgba(15,17,28,0.97)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(16px)" }}>
          <div className="px-4 py-3 border-b border-white/5">
            <p className="text-xs font-semibold text-foreground truncate">{name}</p>
            <p className="text-[10px] text-muted-foreground truncate">{user?.email ?? "—"}</p>
          </div>
          <div className="py-1">
            <button onClick={() => { setLocation("/settings"); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
              <Settings size={12} /> Profile &amp; Settings
            </button>
            <button onClick={() => { logout(); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
              <LogOut size={12} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { mode } = useTheme();
  const { user } = useAuth();
  const [tradingMode, setTradingMode] = useState<"forex" | "crypto">(() =>
    (localStorage.getItem("wt_trading_mode") as "forex" | "crypto") ?? "forex"
  );

  function toggleTradingMode() {
    const next = tradingMode === "forex" ? "crypto" : "forex";
    setTradingMode(next);
    localStorage.setItem("wt_trading_mode", next);
  }

  const isCrypto = tradingMode === "crypto";
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

  const { data: sessionEquity } = useQuery({
    queryKey: ["session-equity"],
    queryFn: () => fetch("/api/analytics/session-equity", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 60_000,
  });

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

  const [copied, setCopied] = useState(false);
  const BOT_CMD = 'cd C:\\Users\\Ilyes\\westrade\\artifacts\\python-bot; git reset --hard HEAD; git pull origin claude/fix-empty-message-error-3H3Wn; python bot.py';

  const copyBotCmd = () => {
    navigator.clipboard.writeText(BOT_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const { data: botCfg } = useQuery({
    queryKey: ["bot-config-dash"],
    queryFn: () => fetch("/api/bot/config", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 10000,
  });
  const paperMode = (botCfg as any)?.paperMode ?? false;
  const toggleMode = useMutation({
    mutationFn: (paper: boolean) =>
      fetch("/api/bot/config", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperMode: paper }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bot-config-dash"] }),
  });

  const alpacaConnected = !!(localStorage.getItem("alpaca_key_id") && localStorage.getItem("alpaca_secret"));
  const displayPositions = isCrypto ? [] : positions;
  const unreviewedAlerts = alerts?.filter((a) => !a.acknowledged) ?? [];
  const dailyUp = (summary?.dailyPnl ?? 0) >= 0;
  const totalUp = (summary?.totalPnl ?? 0) >= 0;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-mono font-bold text-foreground uppercase tracking-widest">Dashboard</h1>
            {isCrypto && (
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border font-semibold"
                style={{ background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.3)", color: "#fb923c" }}>
                ₿ CRYPTO MODE
              </span>
            )}
          </div>
          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
            <span className="hidden sm:inline">{engineStatus?.running ? "STOP SERVER ENGINE" : "START SERVER ENGINE"}</span>
            <span className="sm:hidden">{engineStatus?.running ? "STOP" : "START"}</span>
          </Button>
          <ModeSwitch tradingMode={tradingMode} onToggle={toggleTradingMode} />
          <ProfileDropdown user={user} />
        </div>
      </div>

      {/* Bot banner — forex vs crypto */}
      {isCrypto ? (
        alpacaConnected ? (
          <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 rounded border border-orange-500/30 bg-orange-500/5">
            <span className="text-base leading-none">₿</span>
            <span className="text-[10px] font-mono text-orange-400 font-semibold">Alpaca Paper Trading</span>
            <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline">— connected · paper-api.alpaca.markets · 24/7 including weekends</span>
            <Link to="/settings" className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded border border-orange-400/40 text-orange-400 hover:bg-orange-400/10 transition-colors">
              Manage keys
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-3 px-3 py-2 rounded border border-orange-500/40 bg-orange-500/5">
            <span className="text-base leading-none shrink-0">₿</span>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-mono text-orange-300 font-semibold">Alpaca not connected</span>
              <span className="text-[10px] font-mono text-muted-foreground ml-2">— add your free paper trading API key to start crypto bot</span>
              <p className="text-[9px] font-mono text-muted-foreground mt-0.5">Sign up free at alpaca.markets → Paper Trading → API Keys</p>
            </div>
            <Link to="/settings">
              <Button size="sm" variant="outline" className="h-6 px-2 text-[9px] font-mono shrink-0 border-orange-500/40 text-orange-400">
                Add API Key
              </Button>
            </Link>
          </div>
        )
      ) : (
        <>
          {!botOnline && (
            <div className="flex flex-wrap items-start gap-3 px-3 py-2 rounded border border-amber-500/40 bg-amber-500/5">
              <Bot size={12} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-mono text-amber-300 font-semibold">Python Bot OFFLINE</span>
                <span className="text-[10px] font-mono text-muted-foreground ml-2 hidden sm:inline">— Open PowerShell on your PC and paste:</span>
                <code className="block text-[9px] font-mono text-primary mt-0.5 break-all">{BOT_CMD}</code>
              </div>
              <Button size="sm" variant="outline" className="h-6 px-2 text-[9px] font-mono shrink-0 border-amber-500/40 text-amber-400" onClick={copyBotCmd}>
                <Copy size={9} className="mr-1" />{copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          )}
          {botOnline && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 rounded border border-green-500/30 bg-green-500/5">
              <Bot size={12} className="text-green-400 shrink-0" />
              <span className="text-[10px] font-mono text-green-400 font-semibold">Python Bot ONLINE</span>
              <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline">
                — {paperMode ? "PAPER MODE (simulated)" : "LIVE MODE (real MT5 orders)"}
              </span>
              <button onClick={() => toggleMode.mutate(!paperMode)} disabled={toggleMode.isPending}
                className={cn("ml-auto text-[9px] font-mono px-2 py-0.5 rounded border transition-colors",
                  paperMode ? "border-blue-400/40 text-blue-400 hover:bg-blue-400/10" : "border-green-400/40 text-green-400 hover:bg-green-400/10")}>
                {paperMode ? "→ LIVE" : "→ PAPER"}
              </button>
            </div>
          )}
        </>
      )}

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
                <FearGreedGauge value={Number(fng.value)} label={fng.value_classification} darkMode={mode === "dark"} />
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

      {/* Session summary bar */}
      {displayPositions && displayPositions.length > 0 && (() => {
        const totalNotional = displayPositions.reduce((sum: number, p: any) => sum + (Number(p.entry_price ?? p.entryPrice ?? 0) * Number(p.quantity ?? 0)), 0);
        const totalPnl = displayPositions.reduce((sum: number, p: any) => sum + Number(p.pnl ?? 0), 0);
        const pnlUp = totalPnl >= 0;
        return (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-3 py-2 rounded border border-border bg-card text-[10px] font-mono text-muted-foreground">
            <span className="font-semibold text-foreground uppercase tracking-wider">Open Exposure</span>
            <span>Positions: <span className="text-foreground">{displayPositions.length}</span></span>
            <span>Total Notional: <span className="text-foreground">${totalNotional.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span></span>
            <span>Unrealised P&L: <span className={pnlUp ? "text-green-400" : "text-red-400"}>{pnlUp ? "+" : ""}{fmtUsd(totalPnl)}</span></span>
            <span>Avg per trade: <span className="text-foreground">{fmtUsd(totalPnl / displayPositions.length)}</span></span>
          </div>
        );
      })()}

      {/* Intraday Session Chart */}
      {sessionEquity && sessionEquity.length > 1 && (() => {
        const first = sessionEquity[0].equity;
        const last = sessionEquity[sessionEquity.length - 1].equity;
        const delta = last - first;
        const up = delta >= 0;
        const chartData = sessionEquity.map((p: any) => ({
          t: new Date(p.t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          equity: p.equity,
        }));
        const ttStyle = { background: "#0d0f12", border: "1px solid #1f2937", fontSize: 9, fontFamily: "monospace", color: "#e5e7eb" };
        return (
          <Card className="bg-card border-card-border">
            <CardHeader className="py-2 px-3 border-b border-border flex-row items-center justify-between">
              <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <BarChart2 size={11} />
                Today's Equity — 24h
              </CardTitle>
              <span className={cn("text-[10px] font-mono font-bold", up ? "text-green-400" : "text-red-400")}>
                {up ? "+" : ""}{delta >= 0 ? "" : "-"}${Math.abs(delta).toFixed(2)} today
              </span>
            </CardHeader>
            <CardContent className="p-3">
              <ResponsiveContainer width="100%" height={80}>
                <LineChart data={chartData} margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="t" tick={{ fontSize: 8, fontFamily: "monospace", fill: "#6b7280" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis hide domain={["auto", "auto"]} />
                  <Tooltip contentStyle={ttStyle} formatter={(v: any) => [`$${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "Equity"]} />
                  <ReferenceLine y={first} stroke="rgba(255,255,255,0.1)" strokeDasharray="2 2" />
                  <Line type="monotone" dataKey="equity" stroke={up ? "#22c55e" : "#ef4444"} strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );
      })()}

      {/* Open Positions, Market Hours & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Open Positions */}
        <div className="lg:col-span-2">
          <Card className="bg-card border-card-border">
            <CardHeader className="py-2 px-3 border-b border-border">
              <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Activity size={11} />
                Open Positions {isCrypto ? "(Alpaca Paper)" : `(${positions?.length ?? 0})`}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!botOnline && !isCrypto && positions && (positions?.length ?? 0) > 0 && (
                <div className="mx-4 mt-3 mb-2 p-2 rounded border border-amber-500/30 bg-amber-500/5 flex items-center gap-2">
                  <AlertTriangle size={11} className="text-amber-400 shrink-0" />
                  <p className={cn("text-[10px] font-mono", mode === "dark" ? "text-amber-300" : "text-amber-700")}>Bot offline — positions shown may be stale. Start the bot to sync.</p>
                </div>
              )}
              <div className="p-3 pt-0">
              {isCrypto ? (
                <div className="flex flex-col items-center justify-center h-20 gap-2">
                  {alpacaConnected ? (
                    <p className="text-[11px] font-mono text-muted-foreground">No open crypto positions</p>
                  ) : (
                    <>
                      <p className="text-[11px] font-mono text-muted-foreground">Alpaca not connected — no positions to show</p>
                      <Link to="/settings">
                        <Button size="sm" variant="outline" className="h-6 px-3 text-[9px] font-mono border-orange-500/40 text-orange-400">
                          Connect Alpaca in Settings → Crypto API
                        </Button>
                      </Link>
                    </>
                  )}
                </div>
              ) : posLoading ? (
                <div className="space-y-1 pt-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
                </div>
              ) : displayPositions && displayPositions.length > 0 ? (
                <div className="pt-3 overflow-x-auto">
                  <div className="min-w-[540px]">
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
                    {displayPositions.map((pos: any) => <PositionRow key={pos.id} pos={pos} />)}
                  </div>
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
                unreviewedAlerts.slice(0, 6).map((alert) => <AlertRow key={alert.id} alert={alert} darkMode={mode === "dark"} />)
              ) : (
                <div className="flex items-center justify-center h-16 text-[11px] font-mono text-muted-foreground">
                  No active alerts
                </div>
              )}
            </CardContent>
          </Card>

          {/* Market Hours */}
          <MarketHours className="mt-4" />
        </div>
      </div>

      {/* Engine stats */}
      {engineStatus && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-muted-foreground border border-border rounded px-3 py-2 bg-card">
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
