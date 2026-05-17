import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface Session {
  id: string;
  name: string;
  city: string;
  flag: string;
  openH: number;
  closeH: number; // if closeH < openH the session crosses midnight (e.g. Sydney 22→07)
  cx: number;
  cy: number;
}

// All times UTC. Sydney crosses midnight so closeH < openH.
const SESSIONS: Session[] = [
  { id: "sydney",    name: "Sydney",    city: "AUS",  flag: "🇦🇺", openH: 22, closeH: 7,  cx: 272, cy: 116 },
  { id: "tokyo",     name: "Tokyo",     city: "JPN",  flag: "🇯🇵", openH: 0,  closeH: 9,  cx: 268, cy: 60  },
  { id: "hk",        name: "Hong Kong", city: "HKG",  flag: "🇭🇰", openH: 1,  closeH: 10, cx: 252, cy: 71  },
  { id: "frankfurt", name: "Frankfurt", city: "DEU",  flag: "🇩🇪", openH: 7,  closeH: 16, cx: 160, cy: 49  },
  { id: "london",    name: "London",    city: "GBR",  flag: "🇬🇧", openH: 7,  closeH: 16, cx: 147, cy: 43  },
  { id: "ny",        name: "New York",  city: "USA",  flag: "🇺🇸", openH: 13, closeH: 22, cx: 68,  cy: 72  },
];

function getStatus(openH: number, closeH: number, now: Date) {
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const openMin = openH * 60;
  const closeMin = closeH * 60;
  const total = 24 * 60;

  if (closeH > openH) {
    // Normal session — doesn't cross midnight
    if (utcMin >= openMin && utcMin < closeMin) {
      return { open: true, minutes: closeMin - utcMin };
    }
    const toOpen = utcMin < openMin ? openMin - utcMin : total - utcMin + openMin;
    return { open: false, minutes: toOpen };
  } else {
    // Overnight session (e.g. Sydney 22:00 → 07:00 next day)
    if (utcMin >= openMin || utcMin < closeMin) {
      const left = utcMin >= openMin ? total - utcMin + closeMin : closeMin - utcMin;
      return { open: true, minutes: left };
    }
    return { open: false, minutes: openMin - utcMin };
  }
}

function fmt(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  return `${h}h ${min < 10 ? "0" + min : min}m`;
}

// Continent fill paths — 320×150 viewBox
const CONTINENTS = [
  "M 30,28 L 42,20 L 58,18 L 72,22 L 82,32 L 86,45 L 82,58 L 76,70 L 68,82 L 58,88 L 48,92 L 42,104 L 36,108 L 30,100 L 24,88 L 20,70 L 20,50 L 25,35 Z",
  "M 54,108 L 64,104 L 74,108 L 80,120 L 78,134 L 70,144 L 60,146 L 52,138 L 48,124 L 50,112 Z",
  "M 138,28 L 150,22 L 164,26 L 172,34 L 168,46 L 156,52 L 144,50 L 136,42 Z",
  "M 142,56 L 158,52 L 172,56 L 180,68 L 182,82 L 176,98 L 162,110 L 148,108 L 138,94 L 136,78 L 138,64 Z",
  "M 170,22 L 196,16 L 220,18 L 240,22 L 258,28 L 274,36 L 282,50 L 278,62 L 264,70 L 244,74 L 220,72 L 198,66 L 180,58 L 172,46 L 170,32 Z",
  "M 268,52 L 274,48 L 280,54 L 276,60 L 270,58 Z",
  "M 250,106 L 268,100 L 284,106 L 290,118 L 284,130 L 268,134 L 252,128 L 246,116 Z",
  "M 50,8 L 62,6 L 72,10 L 70,20 L 58,22 L 46,18 Z",
  "M 140,34 L 146,30 L 150,34 L 148,40 L 142,40 Z",
];

export function MarketHours({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());

  // Tick every second so UTC clock is live; session states update via same tick
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const statuses = SESSIONS.map(s => getStatus(s.openH, s.closeH, now));
  const openCount = statuses.filter(s => s.open).length;

  const utcTime = now.toUTCString().slice(17, 22); // "HH:MM"

  return (
    <div
      className={cn("rounded-xl overflow-hidden border border-border/60", className)}
      style={{ background: "linear-gradient(160deg, #081510 0%, #060d0a 100%)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">Market Hours</span>
          <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}
          >
            {openCount} open
          </span>
        </div>
        <span className="text-[10px] font-mono" style={{ color: "#4ade80" }}>
          {utcTime} UTC
        </span>
      </div>

      {/* Dot-matrix world map */}
      <div className="px-2 pb-0.5">
        <svg viewBox="0 0 320 150" className="w-full" style={{ height: "116px" }}>
          <defs>
            <pattern id="mh-dots" x="0" y="0" width="4.5" height="4.5" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.1" fill="#1a4a2e" />
            </pattern>
            <pattern id="mh-ocean" x="0" y="0" width="4.5" height="4.5" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="0.55" fill="#0a1f14" />
            </pattern>
            <filter id="mh-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Ocean */}
          <rect x="0" y="0" width="320" height="150" fill="url(#mh-ocean)" />

          {/* Continents */}
          {CONTINENTS.map((d, i) => (
            <path key={i} d={d} fill="url(#mh-dots)" />
          ))}

          {/* City dots — no text labels to keep map clean with 6 cities */}
          {SESSIONS.map((s, i) => {
            const st = statuses[i];
            return (
              <g key={s.id}>
                {st.open && (
                  <circle cx={s.cx} cy={s.cy} r="8" fill="none" stroke="#22c55e" strokeWidth="0.8" opacity="0.4">
                    <animate attributeName="r" values="5;12;5" dur="2.6s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0;0.5" dur="2.6s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle
                  cx={s.cx} cy={s.cy} r="3.8"
                  fill={st.open ? "#22c55e" : "#374151"}
                  filter={st.open ? "url(#mh-glow)" : undefined}
                />
                <circle
                  cx={s.cx} cy={s.cy} r="2"
                  fill={st.open ? "#86efac" : "#1f2937"}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Session grid — 2 rows × 3 cols, ordered east→west */}
      <div className="grid grid-cols-3 border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
        {SESSIONS.map((s, i) => {
          const st = statuses[i];
          return (
            <div
              key={s.id}
              className={cn(
                "flex flex-col items-center gap-0.5 px-1 py-2 text-center",
                // subtle right border except last in each row
                [1, 4].includes(i) && "border-x"
              )}
              style={{ borderColor: "rgba(255,255,255,0.05)" }}
            >
              <span className="text-sm leading-none">{s.flag}</span>
              <span className="text-[10px] font-semibold text-foreground mt-0.5 leading-tight">{s.name}</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: st.open ? "#22c55e" : "#374151", boxShadow: st.open ? "0 0 4px #22c55e" : "none" }}
                />
                <span
                  className="text-[9px] font-mono leading-none"
                  style={{ color: st.open ? "#4ade80" : "#6b7280" }}
                >
                  {st.open ? `${fmt(st.minutes)}` : `${fmt(st.minutes)}`}
                </span>
              </div>
              <span className="text-[8px]" style={{ color: st.open ? "#16a34a" : "#4b5563" }}>
                {st.open ? "OPEN" : "CLOSED"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
