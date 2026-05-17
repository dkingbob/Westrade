import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface Session {
  id: string;
  name: string;
  flag: string;
  openH: number;
  closeH: number;
  cx: number;
  cy: number;
}

const SESSIONS: Session[] = [
  { id: "ny",     name: "New York", flag: "🇺🇸", openH: 13, closeH: 21, cx: 68,  cy: 72 },
  { id: "london", name: "London",   flag: "🇬🇧", openH: 7,  closeH: 16, cx: 152, cy: 44 },
  { id: "tokyo",  name: "Tokyo",    flag: "🇯🇵", openH: 0,  closeH: 9,  cx: 264, cy: 60 },
];

function getStatus(openH: number, closeH: number) {
  const now = new Date();
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const openMin = openH * 60;
  const closeMin = closeH * 60;
  if (utcMin >= openMin && utcMin < closeMin) {
    return { open: true, minutes: closeMin - utcMin };
  }
  const toOpen = utcMin < openMin ? openMin - utcMin : 24 * 60 - utcMin + openMin;
  return { open: false, minutes: toOpen };
}

function fmt(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  return `${h}h ${min}m`;
}

// Simplified dot-matrix world map continents as SVG paths (320×150 viewBox)
const CONTINENTS = [
  // North America
  "M 30,28 L 42,20 L 58,18 L 72,22 L 82,32 L 86,45 L 82,58 L 76,70 L 68,82 L 58,88 L 48,92 L 42,104 L 36,108 L 30,100 L 24,88 L 20,70 L 20,50 L 25,35 Z",
  // South America
  "M 54,108 L 64,104 L 74,108 L 80,120 L 78,134 L 70,144 L 60,146 L 52,138 L 48,124 L 50,112 Z",
  // Europe
  "M 138,28 L 150,22 L 164,26 L 172,34 L 168,46 L 156,52 L 144,50 L 136,42 Z",
  // Africa
  "M 142,56 L 158,52 L 172,56 L 180,68 L 182,82 L 176,98 L 162,110 L 148,108 L 138,94 L 136,78 L 138,64 Z",
  // Asia (split)
  "M 170,22 L 196,16 L 220,18 L 240,22 L 258,28 L 274,36 L 282,50 L 278,62 L 264,70 L 244,74 L 220,72 L 198,66 L 180,58 L 172,46 L 170,32 Z",
  // Japan island group (near Tokyo)
  "M 268,52 L 274,48 L 280,54 L 276,60 L 270,58 Z",
  // Australia
  "M 250,106 L 268,100 L 284,106 L 290,118 L 284,130 L 268,134 L 252,128 L 246,116 Z",
  // Greenland
  "M 50,8 L 62,6 L 72,10 L 70,20 L 58,22 L 46,18 Z",
  // UK
  "M 140,34 L 146,30 L 150,34 L 148,40 L 142,40 Z",
];

export function MarketHours({ className }: { className?: string }) {
  const [statuses, setStatuses] = useState(() =>
    SESSIONS.map(s => getStatus(s.openH, s.closeH))
  );

  useEffect(() => {
    const refresh = () => setStatuses(SESSIONS.map(s => getStatus(s.openH, s.closeH)));
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={cn("rounded-xl overflow-hidden border border-border/60", className)}
      style={{ background: "linear-gradient(160deg, #081510 0%, #060d0a 100%)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-xs font-semibold text-foreground">Market hours</span>
        <button className="w-5 h-5 rounded-full border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-[10px]">›</button>
      </div>

      {/* Dot-matrix world map */}
      <div className="relative px-2 pb-1">
        <svg viewBox="0 0 320 150" className="w-full" style={{ height: "130px" }}>
          <defs>
            {/* Dot pattern for inactive land */}
            <pattern id="mh-dots" x="0" y="0" width="4.5" height="4.5" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.1" fill="#1a4a2e" />
            </pattern>
            {/* Dot pattern for ocean */}
            <pattern id="mh-ocean" x="0" y="0" width="4.5" height="4.5" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="0.6" fill="#0a1f14" />
            </pattern>
            {/* Glow filters */}
            <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="glow-sm" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Ocean dots background */}
          <rect x="0" y="0" width="320" height="150" fill="url(#mh-ocean)" />

          {/* Continent dot fills */}
          {CONTINENTS.map((d, i) => (
            <path key={i} d={d} fill="url(#mh-dots)" stroke="none" />
          ))}

          {/* City markers */}
          {SESSIONS.map((s, i) => {
            const st = statuses[i];
            const color = st.open ? "#22c55e" : "#4b5563";
            const pulse = st.open;
            return (
              <g key={s.id}>
                {/* Pulse ring when open */}
                {pulse && (
                  <circle cx={s.cx} cy={s.cy} r="10" fill="none" stroke="#22c55e" strokeWidth="1" opacity="0.35">
                    <animate attributeName="r" values="6;14;6" dur="2.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0;0.5" dur="2.4s" repeatCount="indefinite" />
                  </circle>
                )}
                {/* City dot */}
                <circle cx={s.cx} cy={s.cy} r="4" fill={color}
                  filter={pulse ? "url(#glow-sm)" : undefined} />
                <circle cx={s.cx} cy={s.cy} r="2.5" fill={pulse ? "#86efac" : "#374151"} />

                {/* Label pill */}
                <g>
                  <rect
                    x={s.cx + (s.id === "tokyo" ? -54 : 8)}
                    y={s.cy - 11}
                    width={s.id === "ny" ? 54 : s.id === "london" ? 46 : 42}
                    height={18}
                    rx="9"
                    fill="rgba(10,20,14,0.85)"
                    stroke={st.open ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.1)"}
                    strokeWidth="1"
                  />
                  <text
                    x={s.cx + (s.id === "tokyo" ? -27 : s.id === "ny" ? 35 : 29)}
                    y={s.cy + 2.5}
                    textAnchor="middle"
                    fill={st.open ? "#d1fae5" : "#9ca3af"}
                    fontSize="8"
                    fontFamily="system-ui, sans-serif"
                    fontWeight="600"
                  >
                    {s.flag.slice(0, 2)} {s.name.split(" ")[s.name.split(" ").length - 1]}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Session status row */}
      <div className="grid grid-cols-3 gap-px border-t border-white/5">
        {SESSIONS.map((s, i) => {
          const st = statuses[i];
          return (
            <div key={s.id} className="flex flex-col items-center gap-0.5 px-2 py-2.5">
              <span className="text-base leading-none">{st.open ? "☀️" : "🌙"}</span>
              <span className="text-[11px] font-semibold text-foreground mt-0.5">{s.name}</span>
              <span className={cn("text-[10px]", st.open ? "text-green-400" : "text-muted-foreground")}>
                {st.open
                  ? `${fmt(st.minutes)} left`
                  : `${fmt(st.minutes)} to go`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
