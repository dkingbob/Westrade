import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Wifi, WifiOff, Database, Activity, RefreshCw,
  Terminal, Globe, Key, Server, CheckCircle2, XCircle,
  AlertTriangle, Clock, Zap,
} from "lucide-react";

interface ConnectionStatus {
  mt5: { connected: boolean; accountId: string | null; server: string | null; lastSync: string | null };
  pythonBot: { connected: boolean; lastHeartbeat: string | null; heartbeatAge: number | null };
  websocket: { connected: boolean; endpoint: string };
  database: { connected: boolean };
  sentimentApis: { twitter: boolean; reddit: boolean; newsApi: boolean };
  aiValidation: boolean;
  updatedAt: string;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-green-400 animate-pulse" : "bg-red-500"}`} />
  );
}

function StatusBadge({ connected, label }: { connected: boolean; label?: string }) {
  return (
    <Badge variant="outline" className={`text-[10px] font-mono gap-1 ${connected ? "border-green-500 text-green-400" : "border-red-500 text-red-400"}`}>
      {connected ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
      {label ?? (connected ? "Connected" : "Disconnected")}
    </Badge>
  );
}

function TimeSince({ ts }: { ts: string | null }) {
  if (!ts) return <span className="text-muted-foreground text-[10px]">Never</span>;
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  const str = secs < 60 ? `${secs}s ago` : secs < 3600 ? `${Math.floor(secs / 60)}m ago` : `${Math.floor(secs / 3600)}h ago`;
  return <span className="text-muted-foreground text-[10px] font-mono">{str}</span>;
}

export default function Connections() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [mt5Account, setMt5Account] = useState("");
  const [mt5Server, setMt5Server] = useState("");

  const { data: status, isLoading } = useQuery<ConnectionStatus>({
    queryKey: ["connections-status"],
    queryFn: () => fetch("/api/connections/status", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 10_000,
  });

  const saveMt5 = useMutation({
    mutationFn: (body: object) =>
      fetch("/api/bot/config", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["connections-status"] }); toast({ title: "MT5 settings saved" }); },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["connections-status"] });

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-mono font-bold uppercase tracking-widest text-foreground">Connection Hub</h1>
        <Button variant="outline" size="sm" onClick={refresh} className="text-[10px] font-mono h-6 px-2 gap-1">
          <RefreshCw size={10} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Server, label: "Python Bot", ok: status?.pythonBot.connected ?? false, sub: <TimeSince ts={status?.pythonBot.lastHeartbeat ?? null} /> },
          { icon: Terminal, label: "MetaTrader 5", ok: status?.mt5.connected ?? false, sub: <span className="text-[10px] font-mono text-muted-foreground">{status?.mt5.accountId ?? "Not configured"}</span> },
          { icon: Wifi, label: "WebSocket", ok: status?.websocket.connected ?? true, sub: <span className="text-[10px] font-mono text-muted-foreground">{status?.websocket.endpoint}</span> },
          { icon: Database, label: "Database", ok: status?.database.connected ?? true, sub: <span className="text-[10px] font-mono text-muted-foreground">PostgreSQL</span> },
        ].map(({ icon: Icon, label, ok, sub }) => (
          <Card key={label} className={`border ${ok ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
            <CardContent className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot ok={ok} />
                  <Icon size={12} className={ok ? "text-green-400" : "text-red-400"} />
                </div>
                <StatusBadge connected={ok} />
              </div>
              <p className="text-[11px] font-mono font-semibold text-foreground">{label}</p>
              {sub}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* MetaTrader 5 Config */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-[11px] font-mono uppercase tracking-wider flex items-center gap-2">
              <Terminal size={12} className="text-primary" /> MetaTrader 5 Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {!status?.mt5.connected && (
              <div className="p-3 rounded border border-amber-500/30 bg-amber-500/5 flex items-start gap-2">
                <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
                <p className="text-[10px] font-mono text-amber-300">
                  MT5 requires Windows + MetaTrader 5 terminal. The Python bot must be running on your local machine with MT5 installed and connected here via WebSocket.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-[10px] font-mono text-muted-foreground uppercase">Account ID</Label>
              <Input
                className="h-7 text-xs font-mono bg-background"
                placeholder={status?.mt5.accountId ?? "Enter MT5 account number"}
                value={mt5Account}
                onChange={e => setMt5Account(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-mono text-muted-foreground uppercase">Server</Label>
              <Input
                className="h-7 text-xs font-mono bg-background"
                placeholder={status?.mt5.server ?? "e.g. MetaQuotes-Demo"}
                value={mt5Server}
                onChange={e => setMt5Server(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              className="w-full h-7 text-[10px] font-mono"
              onClick={() => saveMt5.mutate({ mt5AccountId: mt5Account, mt5Server })}
              disabled={saveMt5.isPending}
            >
              Save MT5 Settings
            </Button>
            <Separator />
            <div className="space-y-1">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Connection Details</p>
              {[
                { label: "Account", value: status?.mt5.accountId ?? "—" },
                { label: "Server", value: status?.mt5.server ?? "—" },
                { label: "Last Sync", value: status?.mt5.lastSync ? new Date(status.mt5.lastSync).toLocaleTimeString() : "Never" },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
                  <span className="text-[10px] font-mono text-foreground">{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Python Bot */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-[11px] font-mono uppercase tracking-wider flex items-center gap-2">
              <Activity size={12} className="text-primary" /> Python Trading Bot
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="flex items-center justify-between p-3 rounded border border-border bg-muted/20">
              <div>
                <p className="text-[11px] font-mono font-semibold text-foreground">Bot Status</p>
                <TimeSince ts={status?.pythonBot.lastHeartbeat ?? null} />
              </div>
              <StatusBadge connected={status?.pythonBot.connected ?? false} label={status?.pythonBot.connected ? "ALIVE" : "OFFLINE"} />
            </div>
            {!status?.pythonBot.connected && (
              <div className="p-3 rounded border border-border bg-muted/10 space-y-2">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Setup Instructions</p>
                <div className="space-y-1 text-[10px] font-mono text-muted-foreground">
                  <p>1. Navigate to <span className="text-primary">artifacts/python-bot/</span></p>
                  <p>2. Run: <span className="text-primary">pip install -r requirements.txt</span></p>
                  <p>3. Configure <span className="text-primary">.env</span> with MT5 credentials</p>
                  <p>4. Run: <span className="text-primary">python bot.py</span></p>
                  <p>5. Bot auto-connects to this dashboard via WebSocket</p>
                </div>
              </div>
            )}
            <div className="space-y-1">
              {[
                { label: "Heartbeat", value: status?.pythonBot.heartbeatAge ? `${Math.floor(status.pythonBot.heartbeatAge / 1000)}s ago` : "—" },
                { label: "AI Validation", value: status?.aiValidation ? "Gemini + DeepSeek" : "Not configured" },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
                  <span className={`text-[10px] font-mono ${label === "AI Validation" && status?.aiValidation ? "text-green-400" : "text-foreground"}`}>{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sentiment APIs */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-[11px] font-mono uppercase tracking-wider flex items-center gap-2">
              <Globe size={12} className="text-primary" /> Sentiment API Sources
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {[
              { label: "Twitter / X API", key: "twitter" as const, ok: status?.sentimentApis.twitter ?? false, note: "Set TWITTER_BEARER_TOKEN in bot .env" },
              { label: "Reddit API", key: "reddit" as const, ok: status?.sentimentApis.reddit ?? false, note: "Set REDDIT_CLIENT_ID + SECRET in bot .env" },
              { label: "NewsAPI", key: "newsApi" as const, ok: status?.sentimentApis.newsApi ?? false, note: "Set NEWS_API_KEY in bot .env" },
            ].map(({ label, ok, note }) => (
              <div key={label} className="flex items-center justify-between p-2 rounded border border-border">
                <div>
                  <p className="text-[10px] font-mono font-semibold text-foreground">{label}</p>
                  <p className="text-[9px] font-mono text-muted-foreground">{note}</p>
                </div>
                <StatusBadge connected={ok} label={ok ? "Active" : "Not configured"} />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* WebSocket Info */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-[11px] font-mono uppercase tracking-wider flex items-center gap-2">
              <Zap size={12} className="text-primary" /> WebSocket & API
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="space-y-2">
              {[
                { label: "WS Endpoint", value: `${window.location.origin}/api/ws` },
                { label: "REST Base", value: `${window.location.origin}/api` },
                { label: "Status", value: "Connected", ok: true },
                { label: "Auth", value: "Session cookie" },
                { label: "Reconnect", value: "Auto (3s backoff)" },
              ].map(({ label, value, ok }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
                  <span className={`text-[10px] font-mono ${ok ? "text-green-400" : "text-foreground"}`}>{value}</span>
                </div>
              ))}
            </div>
            <Separator />
            <div className="space-y-1">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Webhook endpoints (for external bots)</p>
              <div className="p-2 rounded bg-muted/20 font-mono text-[9px] text-muted-foreground space-y-0.5">
                <p>POST /api/connections/bot/heartbeat</p>
                <p>POST /api/bot/kill-switch</p>
                <p>POST /api/bot/positions/force-close</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading && (
        <div className="text-center text-[10px] font-mono text-muted-foreground py-4">Loading connection status...</div>
      )}
    </div>
  );
}
