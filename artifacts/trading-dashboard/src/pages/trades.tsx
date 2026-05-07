import { useState } from "react";
import {
  useGetTrades,
  useGetTradeCalendar,
  useUpdateTradeNotes,
  getGetTradesQueryKey,
  getGetTradeCalendarQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

function fmt(n: number, dec = 2) { return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function fmtUsd(n: number) { return `$${fmt(n)}`; }
function fmtPct(n: number) { return `${(n * 100).toFixed(2)}%`; }

const STATUS_COLORS: Record<string, string> = {
  open: "border-blue-400 text-blue-400",
  closed: "border-green-400/50 text-muted-foreground",
  cancelled: "border-muted text-muted-foreground",
};

function TradeRow({ trade, onSelect, selected }: { trade: any; onSelect: (t: any) => void; selected: boolean }) {
  const up = (trade.pnl ?? 0) >= 0;
  return (
    <tr
      className={cn("border-b border-border/40 cursor-pointer hover:bg-muted/20 transition-colors", selected && "bg-primary/5")}
      onClick={() => onSelect(trade)}
      data-testid={`trade-row-${trade.id}`}
    >
      <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">#{trade.id}</td>
      <td className="px-3 py-1.5 font-mono text-[11px] font-bold text-foreground">{trade.symbol}</td>
      <td className="px-3 py-1.5">
        <Badge variant={trade.side === "long" ? "default" : "destructive"} className="text-[10px] h-4 px-1 py-0">
          {trade.side.toUpperCase()}
        </Badge>
      </td>
      <td className="px-3 py-1.5">
        <Badge variant="outline" className={cn("text-[10px] h-4 px-1 py-0", STATUS_COLORS[trade.status])}>
          {trade.status.toUpperCase()}
        </Badge>
      </td>
      <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground truncate max-w-[120px]">{trade.strategy}</td>
      <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{fmtUsd(trade.entryPrice)}</td>
      <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{trade.exitPrice ? fmtUsd(trade.exitPrice) : "—"}</td>
      <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{fmt(trade.quantity, 4)}</td>
      <td className={cn("px-3 py-1.5 font-mono text-[11px] font-bold", trade.pnl === null ? "text-muted-foreground" : up ? "text-green-400" : "text-red-400")}>
        {trade.pnl === null ? "—" : `${up ? "+" : ""}${fmtUsd(trade.pnl)}`}
      </td>
      <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
        {new Date(trade.openedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </td>
    </tr>
  );
}

function CalendarCell({ day, data }: { day: Date; data?: any }) {
  if (!day) return <div className="h-10 bg-card/40 rounded" />;
  const up = data ? data.pnl >= 0 : null;
  return (
    <div
      className={cn(
        "h-10 rounded border border-border/40 p-1 text-[10px] font-mono flex flex-col justify-between transition-colors",
        data
          ? up ? "border-green-400/30 bg-green-400/5" : "border-red-400/30 bg-red-400/5"
          : "bg-card/20"
      )}
    >
      <span className="text-muted-foreground">{day.getDate()}</span>
      {data && (
        <span className={cn("text-[9px] font-bold truncate", up ? "text-green-400" : "text-red-400")}>
          {up ? "+" : ""}{fmtUsd(data.pnl)}
        </span>
      )}
    </div>
  );
}

function TradeDetail({ trade, onClose }: { trade: any; onClose: () => void }) {
  const [notes, setNotes] = useState(trade.notes ?? "");
  const [tags, setTags] = useState((trade.tags ?? []).join(", "));
  const qc = useQueryClient();
  const updateNotes = useUpdateTradeNotes();

  const up = (trade.pnl ?? 0) >= 0;

  const save = async () => {
    await updateNotes.mutateAsync({
      id: trade.id,
      data: { notes, tags: tags.split(",").map((t: string) => t.trim()).filter(Boolean) }
    });
    qc.invalidateQueries({ queryKey: getGetTradesQueryKey() });
  };

  return (
    <Card className="bg-card border-card-border h-full">
      <CardHeader className="py-2 px-3 border-b border-border flex-row items-center justify-between">
        <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Trade #{trade.id} — {trade.symbol}
        </CardTitle>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs font-mono">✕</button>
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
          {[
            ["Symbol", trade.symbol],
            ["Side", trade.side.toUpperCase()],
            ["Status", trade.status.toUpperCase()],
            ["Strategy", trade.strategy],
            ["Entry", fmtUsd(trade.entryPrice)],
            ["Exit", trade.exitPrice ? fmtUsd(trade.exitPrice) : "Open"],
            ["Qty", fmt(trade.quantity, 6)],
            ["P&L", trade.pnl !== null ? `${up ? "+" : ""}${fmtUsd(trade.pnl)}` : "—"],
            ["P&L %", trade.pnlPct !== null ? `${up ? "+" : ""}${fmtPct(trade.pnlPct)}` : "—"],
            ["Fees", fmtUsd(trade.fees)],
            ["Slippage", fmtUsd(trade.slippage)],
            ["Stop Loss", trade.stopLoss ? fmtUsd(trade.stopLoss) : "—"],
            ["Take Profit", trade.takeProfit ? fmtUsd(trade.takeProfit) : "—"],
            ["MAE", trade.mae ? fmtUsd(trade.mae) : "—"],
            ["MFE", trade.mfe ? fmtUsd(trade.mfe) : "—"],
            ["Z-Score", trade.zScore?.toFixed(4) ?? "—"],
            ["Sent. Mult.", trade.sentimentMultiplier?.toFixed(4) ?? "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-border/30 pb-0.5">
              <span className="text-muted-foreground">{k}</span>
              <span className={cn("font-medium", k === "P&L" ? up ? "text-green-400" : "text-red-400" : "text-foreground")}>{v}</span>
            </div>
          ))}
        </div>

        {trade.tags && trade.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {trade.tags.map((tag: string) => (
              <Badge key={tag} variant="outline" className="text-[10px] h-4 px-1 py-0 text-muted-foreground">{tag}</Badge>
            ))}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[10px] font-mono text-muted-foreground uppercase">Notes</label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="text-xs font-mono h-20 resize-none bg-background border-border"
            placeholder="Trade notes..."
            data-testid="trade-notes-input"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-muted-foreground uppercase">Tags (comma separated)</label>
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="text-xs font-mono h-7 bg-background border-border"
            placeholder="momentum, winner, breakout..."
            data-testid="trade-tags-input"
          />
        </div>
        <Button
          size="sm"
          onClick={save}
          disabled={updateNotes.isPending}
          className="text-xs font-mono h-7 w-full"
          data-testid="trade-save-notes-btn"
        >
          {updateNotes.isPending ? "Saving..." : "Save Notes"}
        </Button>
      </CardContent>
    </Card>
  );
}

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Trades() {
  const [page, setPage] = useState(0);
  const [strategy, setStrategy] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedTrade, setSelectedTrade] = useState<any>(null);
  const [calMonth, setCalMonth] = useState(new Date());
  const LIMIT = 25;

  const qp: any = { limit: LIMIT, offset: page * LIMIT };
  if (strategy !== "all") qp.strategy = strategy;
  if (status !== "all") qp.status = status;

  const { data, isLoading } = useGetTrades(qp, {
    query: { queryKey: getGetTradesQueryKey(qp), refetchInterval: 10000 }
  });

  const { data: calendar } = useGetTradeCalendar(
    { year: calMonth.getFullYear(), month: calMonth.getMonth() + 1 },
    { query: { queryKey: getGetTradeCalendarQueryKey({ year: calMonth.getFullYear(), month: calMonth.getMonth() + 1 }) } }
  );

  const calMap = new Map(calendar?.map((c) => [c.date, c]) ?? []);

  // Generate calendar grid
  const firstDay = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
  const lastDay = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0);
  const startPad = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const grid: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) grid.push(null);
  for (let d = 1; d <= totalDays; d++) {
    grid.push(new Date(calMonth.getFullYear(), calMonth.getMonth(), d));
  }

  const trades = data?.trades ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-sm font-mono font-bold text-foreground uppercase tracking-widest">Trade Journal</h1>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Main panel */}
        <div className="xl:col-span-2 space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-2">
            <Select value={strategy} onValueChange={setStrategy}>
              <SelectTrigger className="h-7 text-xs font-mono w-40 bg-card border-border" data-testid="filter-strategy">
                <SelectValue placeholder="Strategy" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-xs font-mono">
                <SelectItem value="all">All Strategies</SelectItem>
                <SelectItem value="Mean Rev Alpha">Mean Rev Alpha</SelectItem>
                <SelectItem value="Momentum Rider">Momentum Rider</SelectItem>
                <SelectItem value="Stat Arb Beta">Stat Arb Beta</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-7 text-xs font-mono w-32 bg-card border-border" data-testid="filter-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-xs font-mono">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-[10px] font-mono text-muted-foreground ml-auto">
              {total} trades
            </span>
          </div>

          {/* Table */}
          <Card className="bg-card border-card-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["ID","Symbol","Side","Status","Strategy","Entry","Exit","Qty","P&L","Date"].map(h => (
                        <th key={h} className="px-3 py-1.5 text-left text-[10px] font-mono text-muted-foreground font-normal">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i}><td colSpan={10} className="px-3 py-1.5"><Skeleton className="h-4 w-full" /></td></tr>
                      ))
                    ) : trades.length > 0 ? (
                      trades.map((t) => (
                        <TradeRow
                          key={t.id}
                          trade={t}
                          onSelect={setSelectedTrade}
                          selected={selectedTrade?.id === t.id}
                        />
                      ))
                    ) : (
                      <tr><td colSpan={10} className="px-3 py-8 text-center text-[11px] font-mono text-muted-foreground">No trades</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-3 py-2 border-t border-border">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="h-6 text-xs font-mono"
                    data-testid="pagination-prev"
                  >
                    <ChevronLeft size={12} />
                  </Button>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {page + 1} / {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    className="h-6 text-xs font-mono"
                    data-testid="pagination-next"
                  >
                    <ChevronRight size={12} />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Calendar */}
          <Card className="bg-card border-card-border">
            <CardHeader className="py-2 px-3 border-b border-border flex-row items-center justify-between">
              <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">P&L Calendar</CardTitle>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1))}
                  className="text-muted-foreground hover:text-foreground"
                  data-testid="cal-prev"
                >
                  <ChevronLeft size={12} />
                </button>
                <span className="text-[11px] font-mono text-foreground">
                  {calMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </span>
                <button
                  onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1))}
                  className="text-muted-foreground hover:text-foreground"
                  data-testid="cal-next"
                >
                  <ChevronRight size={12} />
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-3">
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAYS_OF_WEEK.map(d => (
                  <div key={d} className="text-[10px] font-mono text-muted-foreground text-center pb-0.5">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {grid.map((day, i) => (
                  <div key={i}>
                    {day ? (
                      <CalendarCell
                        day={day}
                        data={calMap.get(day.toISOString().split("T")[0])}
                      />
                    ) : (
                      <div className="h-10" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detail panel */}
        <div>
          {selectedTrade ? (
            <TradeDetail trade={selectedTrade} onClose={() => setSelectedTrade(null)} />
          ) : (
            <Card className="bg-card border-card-border">
              <CardContent className="flex items-center justify-center h-40 text-[11px] font-mono text-muted-foreground">
                Select a trade to view details
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
