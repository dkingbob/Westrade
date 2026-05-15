import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/hooks/use-websocket";
import { useTheme } from "@/hooks/use-theme";
import { useGetEngineStatus, useGetTicker, useGetRiskState, useTriggerKillSwitch, getGetEngineStatusQueryKey, getGetTickerQueryKey, getGetRiskStateQueryKey } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserProfileWidget } from "@/components/UserProfile";
import {
  LayoutDashboard, BookOpen, PieChart, BarChart2, Cpu, Shield, Brain,
  Activity, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Plug,
  HelpCircle, Layers, Settings2, Sparkles, Sun, Moon, Menu, X, Bot,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/trades", label: "Trade Journal", icon: BookOpen },
  { path: "/portfolio", label: "Portfolio", icon: PieChart },
  { path: "/analytics", label: "Analytics", icon: BarChart2 },
  { path: "/strategies", label: "Strategies", icon: Cpu },
  { path: "/risk", label: "Risk Engine", icon: Shield },
  { path: "/sentiment", label: "Sentiment", icon: Brain },
  { path: "/ai-activity", label: "AI Activity", icon: Sparkles },
  { path: "/auto-tuner", label: "Auto-Tuner", icon: Bot },
];

const bottomNavItems = [
  { path: "/presets", label: "Presets", icon: Layers },
  { path: "/connections", label: "Connections", icon: Plug },
  { path: "/help", label: "Help & Glossary", icon: HelpCircle },
  { path: "/settings", label: "Settings", icon: Settings2 },
];

function TickerMarquee() {
  const { data: tickers } = useGetTicker({ query: { queryKey: getGetTickerQueryKey(), refetchInterval: 3000 } });
  if (!tickers || tickers.length === 0) return null;
  const items = [...tickers, ...tickers];
  return (
    <div className="h-7 border-b border-border bg-card overflow-hidden flex items-center relative shrink-0">
      <div className="flex animate-marquee whitespace-nowrap gap-6 pl-4" style={{ animationDuration: "30s" }}>
        {items.map((ticker, i) => {
          const up = ticker.changePct >= 0;
          return (
            <span key={i} className="inline-flex items-center gap-1.5 text-xs font-mono">
              <span className="text-muted-foreground font-medium">{ticker.symbol}</span>
              <span className="text-foreground">{ticker.price.toFixed(2)}</span>
              {up ? (
                <span className="text-green-400 flex items-center gap-0.5"><TrendingUp size={10} />{ticker.changePct.toFixed(2)}%</span>
              ) : (
                <span className="text-red-400 flex items-center gap-0.5"><TrendingDown size={10} />{ticker.changePct.toFixed(2)}%</span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function NavItem({ path, label, icon: Icon, collapsed, location, onNavigate }: {
  path: string; label: string; icon: React.ElementType;
  collapsed: boolean; location: string; onNavigate?: () => void;
}) {
  const active = path === "/" ? location === "/" : location.startsWith(path);
  const inner = (
    <Link href={path}>
      <div
        data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
        onClick={onNavigate}
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
  if (collapsed) {
    return (
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent side="right" className="text-[10px] font-mono">{label}</TooltipContent>
      </Tooltip>
    );
  }
  return inner;
}

function KillSwitchWidget({ collapsed }: { collapsed: boolean }) {
  const qc = useQueryClient();
  const { data: riskState } = useGetRiskState({
    query: { queryKey: getGetRiskStateQueryKey(), refetchInterval: 3000 },
  });
  const isActive = riskState?.killSwitchActive ?? false;

  const toggle = useMutation({
    mutationFn: () =>
      fetch("/api/bot/kill-switch", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !isActive }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: getGetRiskStateQueryKey() }),
  });

  const inner = (
    <button
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 w-full transition-colors text-xs font-mono",
        collapsed && "justify-center",
        isActive
          ? "text-red-400 hover:bg-red-400/10"
          : "text-green-400 hover:bg-green-400/10"
      )}
    >
      <div className={cn(
        "w-2 h-2 rounded-full shrink-0",
        isActive ? "bg-red-500 animate-pulse" : "bg-green-400"
      )} />
      {!collapsed && (
        <span className="font-bold tracking-wider uppercase text-[10px]">
          {isActive ? "PAUSED — Resume" : "Running — Pause"}
        </span>
      )}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent side="right" className="text-[10px] font-mono">
          {isActive ? "Bot paused — click to resume" : "Bot running — click to pause"}
        </TooltipContent>
      </Tooltip>
    );
  }
  return inner;
}

function SidebarContent({ collapsed, location, onNavigate, mode, setMode }: {
  collapsed: boolean; location: string; onNavigate?: () => void;
  mode: string; setMode: (m: "dark" | "light") => void;
}) {
  const { data: engineStatus } = useGetEngineStatus({ query: { queryKey: getGetEngineStatusQueryKey(), refetchInterval: 5000 } });
  return (
    <>
      {/* Logo */}
      <div className={cn("flex items-center gap-2 px-3 py-3 border-b border-sidebar-border", collapsed && "justify-center")}>
        <Activity size={16} className="text-primary shrink-0" />
        {!collapsed && <span className="text-xs font-mono font-bold text-foreground tracking-widest uppercase">Westrade</span>}
      </div>

      {/* Engine Status */}
      {!collapsed && (
        <div className="px-3 py-2 border-b border-sidebar-border">
          <div className="flex items-center gap-1.5">
            <div className={cn("w-1.5 h-1.5 rounded-full", engineStatus?.running ? "bg-green-400 animate-pulse" : "bg-red-400")} />
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              {engineStatus?.running ? `LIVE · ${engineStatus.mode ?? "paper"}` : "ENGINE OFF"}
            </span>
          </div>
        </div>
      )}

      <KillSwitchWidget collapsed={collapsed} />

      {/* Main Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map((item) => (
          <NavItem key={item.path} {...item} collapsed={collapsed} location={location} onNavigate={onNavigate} />
        ))}
        <div className="my-1 mx-3 border-t border-sidebar-border/50" />
        {bottomNavItems.map((item) => (
          <NavItem key={item.path} {...item} collapsed={collapsed} location={location} onNavigate={onNavigate} />
        ))}
      </nav>

      {/* Light / Dark toggle */}
      <div className={cn("flex items-center border-t border-sidebar-border px-3 py-2", collapsed && "justify-center")}>
        <button
          onClick={() => setMode(mode === "dark" ? "light" : "dark")}
          className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          {mode === "dark" ? <Sun size={13} className="shrink-0" /> : <Moon size={13} className="shrink-0" />}
          {!collapsed && <span>{mode === "dark" ? "Light Mode" : "Dark Mode"}</span>}
        </button>
      </div>

      {/* User Profile */}
      <UserProfileWidget collapsed={collapsed} />
    </>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useWebSocket();
  const { mode, setMode } = useTheme();

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [location]);

  // Close on resize to desktop
  useEffect(() => {
    const handler = () => { if (window.innerWidth >= 768) setMobileOpen(false); };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* ── Desktop sidebar ── */}
      <aside className={cn(
        "hidden md:flex flex-col border-r border-border bg-sidebar transition-all duration-200 shrink-0",
        collapsed ? "w-12" : "w-48"
      )}>
        <SidebarContent collapsed={collapsed} location={location} mode={mode} setMode={setMode} />
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center justify-center h-8 border-t border-sidebar-border text-muted-foreground hover:text-foreground transition-colors"
          data-testid="sidebar-collapse"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>

      {/* ── Mobile overlay backdrop ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile sidebar drawer ── */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex flex-col w-64 border-r border-border bg-sidebar transition-transform duration-250 md:hidden",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
        >
          <X size={16} />
        </button>
        <SidebarContent
          collapsed={false}
          location={location}
          onNavigate={() => setMobileOpen(false)}
          mode={mode}
          setMode={setMode}
        />
      </aside>

      {/* ── Main content ── */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card md:hidden shrink-0">
          <button onClick={() => setMobileOpen(true)} className="text-muted-foreground hover:text-foreground">
            <Menu size={18} />
          </button>
          <span className="text-xs font-mono font-bold text-foreground tracking-widest uppercase flex-1">Westrade</span>
          <KillSwitchWidget collapsed={true} />
          <button onClick={() => setMode(mode === "dark" ? "light" : "dark")} className="text-muted-foreground hover:text-foreground">
            {mode === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>

        <TickerMarquee />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee { animation: marquee linear infinite; }
      `}</style>
    </div>
  );
}
