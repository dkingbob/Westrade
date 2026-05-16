import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Activity, Trash2, PauseCircle, PlayCircle } from "lucide-react";

export interface BotLogEntry {
  id: string;
  category: string;
  message: string;
  level: string;
  timestamp: string;
}

const logStore: BotLogEntry[] = [];
let logListeners = new Set<() => void>();

function notifyLog() { logListeners.forEach(fn => fn()); }

export function ingestBotLog(data: Omit<BotLogEntry, "id">) {
  const id = `${data.timestamp}-${Math.random()}`;
  logStore.unshift({ ...data, id });
  if (logStore.length > 500) logStore.length = 500;
  notifyLog();
}

const CATEGORY_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  scan:   { label: "SCAN",   color: "text-slate-400",   bg: "bg-slate-500/10 border-slate-500/20" },
  signal: { label: "SIGNAL", color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20" },
  ai:     { label: "AI",     color: "text-purple-400",  bg: "bg-purple-500/10 border-purple-500/20" },
  trade:  { label: "TRADE",  color: "text-green-400",   bg: "bg-green-500/10 border-green-500/20" },
  risk:   { label: "RISK",   color: "text-orange-400",  bg: "bg-orange-500/10 border-orange-500/20" },
  tuner:  { label: "TUNER",  color: "text-yellow-400",  bg: "bg-yellow-500/10 border-yellow-500/20" },
  warn:   { label: "WARN",   color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20" },
};

const DEFAULT_STYLE = { label: "INFO", color: "text-muted-foreground", bg: "bg-muted/10 border-border/20" };

const CATEGORY_ICONS: Record<string, string> = {
  scan: "🔍", signal: "📡", ai: "🧠", trade: "✅", risk: "🛡", tuner: "🎯", warn: "⚠️",
};

function useLogEntries() {
  const [, tick] = useState(0);
  useEffect(() => {
    const refresh = () => tick(n => n + 1);
    logListeners.add(refresh);
    return () => { logListeners.delete(refresh); };
  }, []);
  return logStore;
}

export default function BotFeed() {
  const entries = useLogEntries();
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [, tick] = useState(0);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const filtered = filter === "all" ? entries : entries.filter(e => e.category === filter);

  const categories = ["all", "signal", "ai", "trade", "risk", "tuner", "scan"];

  return (
    <div className="p-4 space-y-3 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-sm font-mono font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
          <Activity size={14} className="text-green-400" /> Bot Feed
          <span className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
            — real-time thinking log
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground">{filtered.length} entries</span>
          <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] font-mono gap-1"
            onClick={() => setPaused(p => !p)}>
            {paused ? <><PlayCircle size={9} /> Resume</> : <><PauseCircle size={9} /> Pause</>}
          </Button>
          <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] font-mono gap-1"
            onClick={() => { logStore.length = 0; tick(n => n + 1); notifyLog(); }}>
            <Trash2 size={9} /> Clear
          </Button>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-1 flex-wrap shrink-0">
        {categories.map(cat => {
          const s = cat === "all" ? null : CATEGORY_STYLES[cat] ?? DEFAULT_STYLE;
          const active = filter === cat;
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={cn(
                "text-[9px] font-mono px-2 py-0.5 rounded border transition-colors uppercase tracking-wider",
                active
                  ? (s ? `${s.color} border-current bg-current/10` : "text-primary border-primary bg-primary/10")
                  : "text-muted-foreground border-border hover:text-foreground"
              )}
            >
              {cat === "all" ? "ALL" : `${CATEGORY_ICONS[cat] ?? ""} ${cat}`}
            </button>
          );
        })}
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto space-y-1 font-mono">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Activity size={28} className="text-muted-foreground/30" />
            <p className="text-[11px] font-mono text-muted-foreground">
              Waiting for bot activity...
            </p>
            <p className="text-[10px] font-mono text-muted-foreground/70">
              Start the bot on your Windows machine and trades will stream here in real-time.
              You'll see every scan, signal, AI evaluation, and trade decision as it happens.
            </p>
          </div>
        ) : (
          filtered.map(entry => {
            const s = CATEGORY_STYLES[entry.category] ?? DEFAULT_STYLE;
            const icon = CATEGORY_ICONS[entry.category] ?? "•";
            const isWarn = entry.level === "warn";
            return (
              <div
                key={entry.id}
                className={cn(
                  "flex items-start gap-2 px-3 py-1.5 rounded border text-[10px]",
                  isWarn ? "bg-red-500/5 border-red-500/20" : s.bg
                )}
              >
                {/* Time */}
                <span className="text-muted-foreground/50 shrink-0 tabular-nums text-[9px] pt-0.5">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                {/* Category badge */}
                <span className={cn(
                  "shrink-0 text-[9px] font-bold uppercase tracking-wider w-12 text-right",
                  isWarn ? "text-red-400" : s.color
                )}>
                  {icon} {s.label}
                </span>
                {/* Message */}
                <span className={cn(
                  "flex-1 break-all",
                  isWarn ? "text-red-300" : entry.category === "trade" ? "text-foreground font-bold" : "text-muted-foreground"
                )}>
                  {entry.message}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
