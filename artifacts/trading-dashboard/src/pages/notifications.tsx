import {
  useGetAlerts,
  useGetNotificationSettings,
  useUpdateNotificationSettings,
  getGetNotificationSettingsQueryKey,
  getGetAlertsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Bell, AlertCircle, AlertTriangle, Info, Loader2 } from "lucide-react";

function fmt(n: number, dec = 2) { return n.toFixed(dec); }
function fmtPct(n: number) { return `${(n * 100).toFixed(1)}%`; }

const SEVERITY_CONFIGS: Record<string, { icon: typeof Info; color: string; badge: string }> = {
  critical: { icon: AlertCircle, color: "text-red-400", badge: "destructive" },
  warning: { icon: AlertTriangle, color: "text-yellow-400", badge: "secondary" },
  info: { icon: Info, color: "text-blue-400", badge: "default" },
};

function AlertItem({ alert }: { alert: any }) {
  const cfg = SEVERITY_CONFIGS[alert.severity] ?? SEVERITY_CONFIGS.info;
  const Icon = cfg.icon;
  const timeAgo = (ms: number) => {
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 py-2.5 px-3 border-b border-border/40 last:border-0 transition-colors",
        !alert.acknowledged && "bg-primary/5"
      )}
      data-testid={`alert-item-${alert.id}`}
    >
      <Icon size={13} className={cn("mt-0.5 shrink-0", cfg.color)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-foreground">{alert.message}</span>
          {alert.symbol && (
            <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 text-muted-foreground">{alert.symbol}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] font-mono text-muted-foreground">{timeAgo(Date.now() - new Date(alert.createdAt).getTime())}</span>
          <span className="text-[10px] font-mono text-muted-foreground">·</span>
          <span className="text-[10px] font-mono text-muted-foreground">{alert.type.replace(/_/g, " ")}</span>
          {!alert.acknowledged && (
            <span className="text-[10px] font-mono text-primary ml-1">● UNREAD</span>
          )}
        </div>
      </div>
      <Badge
        variant={cfg.badge as any}
        className={cn("text-[10px] shrink-0 h-4 px-1 py-0", cfg.color, "border-current bg-transparent")}
      >
        {alert.severity.toUpperCase()}
      </Badge>
    </div>
  );
}

function SettingField({
  label, value, onChange, description
}: {
  label: string; value: number; onChange: (v: number) => void; description?: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between">
        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</label>
        <span className="text-[10px] font-mono text-foreground">{fmtPct(value)}</span>
      </div>
      <Input
        type="number"
        value={fmt(value * 100, 2)}
        step={0.1}
        min={0}
        max={100}
        className="h-7 text-xs font-mono bg-background border-border"
        onChange={(e) => onChange(parseFloat(e.target.value) / 100 || 0)}
        data-testid={`notif-field-${label.toLowerCase().replace(/\s/g, "-")}`}
      />
      {description && <p className="text-[10px] font-mono text-muted-foreground">{description}</p>}
    </div>
  );
}

export default function Notifications() {
  const qc = useQueryClient();
  const { data: alerts, isLoading: alertsLoading } = useGetAlerts({ query: { queryKey: getGetAlertsQueryKey(), refetchInterval: 10000 } });
  const { data: settings } = useGetNotificationSettings();
  const updateSettings = useUpdateNotificationSettings();

  const [profitThresholdPct, setProfitThresholdPct] = useState<number | null>(null);
  const [lossThresholdPct, setLossThresholdPct] = useState<number | null>(null);
  const [marginRiskPct, setMarginRiskPct] = useState<number | null>(null);
  const [drawdownWarningPct, setDrawdownWarningPct] = useState<number | null>(null);
  const [emailEnabled, setEmailEnabled] = useState<boolean | null>(null);
  const [dashboardEnabled, setDashboardEnabled] = useState<boolean | null>(null);

  const eff = {
    profitThresholdPct: profitThresholdPct ?? settings?.profitThresholdPct ?? 0.05,
    lossThresholdPct: lossThresholdPct ?? settings?.lossThresholdPct ?? 0.02,
    marginRiskPct: marginRiskPct ?? settings?.marginRiskPct ?? 0.80,
    drawdownWarningPct: drawdownWarningPct ?? settings?.drawdownWarningPct ?? 0.05,
    emailEnabled: emailEnabled ?? settings?.emailEnabled ?? false,
    dashboardEnabled: dashboardEnabled ?? settings?.dashboardEnabled ?? true,
  };

  const handleSave = async () => {
    await updateSettings.mutateAsync({ data: eff });
    qc.invalidateQueries({ queryKey: getGetNotificationSettingsQueryKey() });
  };

  const unread = alerts?.filter((a) => !a.acknowledged) ?? [];
  const allAlerts = alerts ?? [];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-mono font-bold text-foreground uppercase tracking-widest">Alerts & Notifications</h1>
        {unread.length > 0 && (
          <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
            {unread.length} unread
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Alert feed */}
        <div className="lg:col-span-2">
          <Card className="bg-card border-card-border">
            <CardHeader className="py-2 px-3 border-b border-border flex-row items-center gap-2">
              <Bell size={12} className="text-muted-foreground" />
              <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Alert Feed ({allAlerts.length})
              </CardTitle>
              <div className="ml-auto flex gap-2 text-[10px] font-mono">
                <span className="text-red-400">{allAlerts.filter(a => a.severity === "critical").length} critical</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-yellow-400">{allAlerts.filter(a => a.severity === "warning").length} warnings</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {alertsLoading ? (
                <div className="p-3 space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : allAlerts.length > 0 ? (
                <div className="max-h-[500px] overflow-y-auto">
                  {allAlerts.map((alert) => <AlertItem key={alert.id} alert={alert} />)}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-[11px] font-mono text-muted-foreground">
                  <Bell size={16} className="opacity-30" />
                  No alerts — system running normally
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Settings */}
        <div>
          <Card className="bg-card border-card-border">
            <CardHeader className="py-2 px-3 border-b border-border">
              <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Alert Thresholds</CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-3">
              <SettingField
                label="Profit Target"
                value={eff.profitThresholdPct}
                onChange={setProfitThresholdPct}
                description="Alert when daily profit exceeds this %"
              />
              <SettingField
                label="Loss Limit"
                value={eff.lossThresholdPct}
                onChange={setLossThresholdPct}
                description="Alert when daily loss exceeds this %"
              />
              <SettingField
                label="Drawdown Warning"
                value={eff.drawdownWarningPct}
                onChange={setDrawdownWarningPct}
                description="Alert when drawdown reaches this %"
              />
              <SettingField
                label="Margin Risk Cap"
                value={eff.marginRiskPct}
                onChange={setMarginRiskPct}
                description="Alert when exposure reaches this %"
              />

              <div className="border-t border-border/50 pt-3 space-y-2">
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Notification Channels</div>
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-muted-foreground">Dashboard alerts</span>
                  <Switch checked={eff.dashboardEnabled} onCheckedChange={setDashboardEnabled} data-testid="notif-dashboard-toggle" />
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-muted-foreground">Email alerts</span>
                  <Switch checked={eff.emailEnabled} onCheckedChange={setEmailEnabled} data-testid="notif-email-toggle" />
                </div>
                {eff.emailEnabled && (
                  <p className="text-[10px] font-mono text-muted-foreground">Email delivery requires SMTP configuration</p>
                )}
              </div>

              <Button
                onClick={handleSave}
                disabled={updateSettings.isPending}
                className="w-full h-8 text-xs font-mono"
                data-testid="save-notif-settings"
              >
                {updateSettings.isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
