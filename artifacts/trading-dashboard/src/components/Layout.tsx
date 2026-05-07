import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/hooks/use-websocket";
import { useGetEngineStatus, useGetTicker } from "@workspace/api-client-react";
import {
  LayoutDashboard,
  BookOpen,
  PieChart,
  BarChart2,
  Cpu,
  Shield,
  FlaskConical,
  Brain,
  Bell,
  Activity,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/trades", label: "Trade Journal", icon: BookOpen },
  { path: "/portfolio", label: "Portfolio", icon: PieChart },
  { path: "/analytics", label: "Analytics", icon: BarChart2 },
  { path: "/strategies", label: "Strategies", icon: Cpu },
  { path: "/risk", label: "Risk Engine", icon: Shield },
  { path: "/backtest", label: "Backtester", icon: FlaskConical },
  { path: "/sentiment", label: "Sentiment", icon: Brain },
  { path: "/notifications", label: "Alerts", icon: Bell },
];

function TickerMarquee() {
  const { data: tickers } = useGetTicker({ query: { refetchInterval: 3000 } });

  if (!tickers || tickers.length === 0) return null;

  const items = [...tickers, ...tickers];

  return (
    <div className="h-7 border-b border-border bg-card overflow-hidden flex items-center relative">
      <div className="flex animate-marquee whitespace-nowrap gap-6 pl-4" style={{ animationDuration: "30s" }}>
        {items.map((ticker, i) => {
          const up = ticker.changePct >= 0;
          return (
            <span key={i} className="inline-flex items-center gap-1.5 text-xs font-mono">
              <span className="text-muted-foreground font-medium">{ticker.symbol}</span>
              <span className="text-foreground">{ticker.price.toFixed(2)}</span>
              {up ? (
                <span className="text-green-400 flex items-center gap-0.5">
                  <TrendingUp size={10} />
                  {ticker.changePct.toFixed(2)}%
                </span>
              ) : (
                <span className="text-red-400 flex items-center gap-0.5">
                  <TrendingDown size={10} />
                  {ticker.changePct.toFixed(2)}%
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  useWebSocket();

  const { data: engineStatus } = useGetEngineStatus({ query: { refetchInterval: 5000 } });

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-sidebar transition-all duration-200 shrink-0",
          collapsed ? "w-12" : "w-48"
        )}
      >
        {/* Logo */}
        <div className={cn("flex items-center gap-2 px-3 py-3 border-b border-sidebar-border", collapsed && "justify-center")}>
          <Activity size={16} className="text-primary shrink-0" />
          {!collapsed && (
            <span className="text-xs font-mono font-bold text-foreground tracking-widest uppercase">
              AlgoDesk
            </span>
          )}
        </div>

        {/* Engine Status */}
        {!collapsed && (
          <div className="px-3 py-2 border-b border-sidebar-border">
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  engineStatus?.running ? "bg-green-400 animate-pulse" : "bg-red-400"
                )}
              />
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                {engineStatus?.running ? `LIVE · ${engineStatus.mode ?? "paper"}` : "ENGINE OFF"}
              </span>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {navItems.map(({ path, label, icon: Icon }) => {
            const active = path === "/" ? location === "/" : location.startsWith(path);
            return (
              <Link key={path} href={path}>
                <div
                  data-testid={`nav-${label.toLowerCase().replace(/\s/g, "-")}`}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors text-xs font-mono",
                    collapsed && "justify-center",
                    active
                      ? "bg-primary/10 text-primary border-r-2 border-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                  )}
                >
                  <Icon size={13} className="shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Collapse button */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center justify-center h-8 border-t border-sidebar-border text-muted-foreground hover:text-foreground transition-colors"
          data-testid="sidebar-collapse"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <TickerMarquee />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee linear infinite;
        }
      `}</style>
    </div>
  );
}
