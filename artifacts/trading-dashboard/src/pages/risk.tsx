import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  useGetRiskState,
  useGetRiskSettings,
  useUpdateRiskSettings,
  useTriggerKillSwitch,
  getGetRiskStateQueryKey,
  getGetRiskSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { Shield, AlertTriangle, Zap, Loader2 } from "lucide-react";

function fmt(n: number, dec = 2) { return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function fmtUsd(n: number) { return `$${fmt(n)}`; }
function fmtPct(n: number) { return `${(n * 100).toFixed(2)}%`; }

function GaugeBar({ value, max, label, warn = 0.7, danger = 0.9 }: { value: number; max: number; label: string; warn?: number; danger?: number }) {
  const pct = Math.min(value / max, 1);
  const color = pct >= danger ? "bg-red-500" : pct >= warn ? "bg-yellow-400" : "bg-green-400";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-mono">
        <span className="text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className={cn("font-bold", pct >= danger ? "text-red-400" : pct >= warn ? "text-yellow-400" : "text-green-400")}>
          {fmt(value * 100, 1)}% / {fmt(max * 100, 0)}%
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

function RiskScoreMeter({ score }: { score: number }) {
  const pct = Math.min(score, 1) * 100;
  const color = score >= 0.8 ? "text-red-400" : score >= 0.5 ? "text-yellow-400" : "text-green-400";
  const label = score >= 0.8 ? "CRITICAL" : score >= 0.5 ? "ELEVATED" : "NORMAL";
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-baseline">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Risk Score</span>
        <span className={cn("text-xl font-mono font-bold", color)}>{fmt(score * 100, 1)}</span>
      </div>
      <div className="relative h-3 bg-gradient-to-r from-green-500 via-yellow-400 to-red-500 rounded-full overflow-hidden">
        <div
          className="absolute top-0 bottom-0 w-1 bg-white rounded-full shadow-lg transition-all duration-500"
          style={{ left: `calc(${pct}% - 2px)` }}
        />
      </div>
      <div className="flex justify-between text-[9px] font-mono text-muted-foreground">
        <span>LOW</span>
        <span className={cn("font-bold tracking-widest", color)}>{label}</span>
        <span>HIGH</span>
      </div>
    </div>
  );
}

function SettingField({
  label, value, onChange, step = 0.001, suffix = "%"
}: {
  label: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string;
}) {
  return (
    <div className="space-y-0.5">
      <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={suffix === "%" ? fmt(value * 100, 3) : value}
          step={suffix === "%" ? step * 100 : step}
          min={0}
          className="h-7 text-xs font-mono bg-background border-border"
          onChange={(e) => {
            const raw = parseFloat(e.target.value);
            onChange(suffix === "%" ? raw / 100 : raw);
          }}
          data-testid={`risk-field-${label.toLowerCase().replace(/\s/g, "-")}`}
        />
        {suffix && <span className="text-[10px] font-mono text-muted-foreground shrink-0">{suffix}</span>}
      </div>
    </div>
  );
}

export default function Risk() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: riskState, isLoading: stateLoading } = useGetRiskState({ query: { queryKey: getGetRiskStateQueryKey(), refetchInterval: 3000 } });
  const { data: settings, isLoading: settingsLoading } = useGetRiskSettings();
  const updateSettings = useUpdateRiskSettings();
  const killSwitch = useTriggerKillSwitch();

  const deactivateKillSwitch = useMutation({
    mutationFn: () =>
      fetch("/api/bot/kill-switch", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Kill switch deactivated — bot can resume trading" });
      qc.invalidateQueries({ queryKey: getGetRiskStateQueryKey() });
    },
    onError: () => toast({ title: "Failed to deactivate", variant: "destructive" }),
  });

  const resetData = useMutation({
    mutationFn: () => fetch("/api/trades/reset", { method: "DELETE", credentials: "include" }).then(r => r.json()),
    onSuccess: () => { toast({ title: "Trading data cleared" }); qc.invalidateQueries(); },
    onError: () => toast({ title: "Reset failed", variant: "destructive" }),
  });

  const [maxDailyLossPct, setMaxDailyLossPct] = useState<number | null>(null);
  const [maxDrawdownPct, setMaxDrawdownPct] = useState<number | null>(null);
  const [maxExposurePct, setMaxExposurePct] = useState<number | null>(null);
  const [riskPerTradePct, setRiskPerTradePct] = useState<number | null>(null);
  const [maxOpenPositions, setMaxOpenPositions] = useState<number | null>(null);
  const [correlationThreshold, setCorrelationThreshold] = useState<number | null>(null);
  const [slippagePct, setSlippagePct] = useState<number | null>(null);
  const [feesPct, setFeesPct] = useState<number | null>(null);
  const [maxPositionUsd, setMaxPositionUsd] = useState<number | null>(null);

  const eff = {
    maxDailyLossPct: maxDailyLossPct ?? settings?.maxDailyLossPct ?? 0.02,
    maxDrawdownPct: maxDrawdownPct ?? settings?.maxDrawdownPct ?? 0.10,
    maxExposurePct: maxExposurePct ?? settings?.maxExposurePct ?? 0.80,
    riskPerTradePct: riskPerTradePct ?? settings?.riskPerTradePct ?? 0.01,
    maxOpenPositions: maxOpenPositions ?? settings?.maxOpenPositions ?? 5,
    correlationThreshold: correlationThreshold ?? settings?.correlationThreshold ?? 0.70,
    slippagePct: slippagePct ?? settings?.slippagePct ?? 0.001,
    feesPct: feesPct ?? settings?.feesPct ?? 0.001,
  };

  const handleSave = async () => {
    await updateSettings.mutateAsync({ data: eff });
    if (maxPositionUsd !== null) {
      await fetch("/api/bot/config", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxPositionUsd: maxPositionUsd <= 0 ? null : maxPositionUsd }),
      });
    }
    qc.invalidateQueries({ queryKey: getGetRiskSettingsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetRiskStateQueryKey() });
  };

  const handleKillSwitch = async () => {
    await killSwitch.mutateAsync();
    qc.invalidateQueries({ queryKey: getGetRiskStateQueryKey() });
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-sm font-mono font-bold text-foreground uppercase tracking-widest">Risk Engine</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Live Risk State */}
        <Card className={cn("bg-card border-card-border", riskState?.killSwitchActive && "border-red-500/50")}>
          <CardHeader className="py-2 px-3 border-b border-border flex-row items-center gap-2">
            <Shield size={13} className={cn(riskState?.killSwitchActive ? "text-red-400" : "text-green-400")} />
            <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Live Risk Monitor
            </CardTitle>
            {riskState?.killSwitchActive && (
              <span className="text-[10px] font-mono text-red-400 font-bold ml-auto animate-pulse">⚠ KILL SWITCH ACTIVE</span>
            )}
          </CardHeader>
          <CardContent className="p-3 space-y-4">
            {stateLoading ? (
              <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : riskState ? (
              <>
                <RiskScoreMeter score={riskState.riskScore} />

                <div className="space-y-3 pt-1">
                  <GaugeBar
                    label="Daily Loss"
                    value={Math.abs(Math.min(riskState.dailyPnl, 0))}
                    max={riskState.dailyLossLimit}
                    warn={0.6}
                    danger={0.85}
                  />
                  <GaugeBar
                    label="Drawdown"
                    value={riskState.currentDrawdown}
                    max={riskState.maxDrawdownLimit}
                    warn={0.6}
                    danger={0.85}
                  />
                  <GaugeBar
                    label="Exposure"
                    value={riskState.exposure}
                    max={riskState.exposureCap}
                    warn={0.7}
                    danger={0.9}
                  />
                </div>

                {/* Breach indicators */}
                <div className="flex gap-2 flex-wrap">
                  {[
                    { label: "Daily Loss", breached: riskState.dailyLossBreached },
                    { label: "Drawdown", breached: riskState.drawdownBreached },
                    { label: "Exposure", breached: riskState.exposureBreached },
                  ].map(({ label, breached }) => (
                    <div key={label} className={cn(
                      "text-[10px] font-mono px-2 py-0.5 rounded border",
                      breached
                        ? "border-red-400/50 text-red-400 bg-red-400/10"
                        : "border-green-400/30 text-green-400 bg-green-400/5"
                    )}>
                      {label}: {breached ? "BREACHED" : "OK"}
                    </div>
                  ))}
                </div>

                {/* P&L summary */}
                <div className="border-t border-border/50 pt-2 grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div>
                    <span className="text-muted-foreground">Daily P&L: </span>
                    <span className={cn("font-bold", riskState.dailyPnl >= 0 ? "text-green-400" : "text-red-400")}>
                      {riskState.dailyPnl >= 0 ? "+" : ""}{fmtUsd(riskState.dailyPnl)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Loss Limit: </span>
                    <span className="text-foreground">{fmtUsd(riskState.dailyLossLimit)}</span>
                  </div>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* Settings */}
        <Card className="bg-card border-card-border">
          <CardHeader className="py-2 px-3 border-b border-border">
            <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Risk Settings</CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-3">
            {settingsLoading ? (
              <div className="space-y-2">{[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <SettingField label="Max Daily Loss" value={eff.maxDailyLossPct} onChange={setMaxDailyLossPct} />
                  <SettingField label="Max Drawdown" value={eff.maxDrawdownPct} onChange={setMaxDrawdownPct} />
                  <SettingField label="Max Exposure" value={eff.maxExposurePct} onChange={setMaxExposurePct} />
                  <SettingField label="Risk Per Trade" value={eff.riskPerTradePct} onChange={setRiskPerTradePct} />
                  <SettingField label="Max Positions" value={eff.maxOpenPositions} onChange={setMaxOpenPositions} step={1} suffix="" />
                  <SettingField label="Correlation Cap" value={eff.correlationThreshold} onChange={setCorrelationThreshold} />
                  <SettingField label="Slippage" value={eff.slippagePct} onChange={setSlippagePct} step={0.0001} />
                  <SettingField label="Fees" value={eff.feesPct} onChange={setFeesPct} step={0.0001} />
                </div>

                <div className="space-y-0.5 pt-1 border-t border-border/50">
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Max $ Per Trade (0 = no limit)</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={maxPositionUsd ?? ""}
                      step={10}
                      min={0}
                      placeholder="e.g. 500"
                      className="h-7 text-xs font-mono bg-background border-border w-32"
                      onChange={(e) => setMaxPositionUsd(parseFloat(e.target.value) || 0)}
                    />
                    <span className="text-[10px] font-mono text-muted-foreground">USD — caps each trade's position size</span>
                  </div>
                </div>
                </div>

                <Button
                  onClick={handleSave}
                  disabled={updateSettings.isPending}
                  className="w-full h-8 text-xs font-mono"
                  data-testid="save-risk-settings"
                >
                  {updateSettings.isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                  Save Settings
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reset Paper Trading Data */}
      <Card className="bg-card border-yellow-500/30">
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div>
            <span className="text-sm font-mono font-bold text-yellow-400 uppercase tracking-wider">Reset Trading Data</span>
            <p className="text-[11px] font-mono text-muted-foreground mt-1">
              Delete all trades and portfolio history. Use this when switching from paper to live trading.
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0 font-mono text-xs h-8 px-4 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10">
                Reset Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-card font-mono">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-yellow-400">Reset All Trading Data?</AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground text-xs">
                  This will permanently delete all trades and portfolio snapshots. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="text-xs h-8">Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-yellow-600 hover:bg-yellow-700 text-xs h-8" onClick={() => resetData.mutate()}>
                  {resetData.isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                  Confirm Reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Kill Switch */}
      <Card className={cn("bg-card border-card-border", riskState?.killSwitchActive ? "border-red-500/60" : "border-red-500/30")}>
        <CardContent className="p-4 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-400" />
              <span className="text-sm font-mono font-bold text-red-400 uppercase tracking-wider">Emergency Kill Switch</span>
              {riskState?.killSwitchActive && (
                <span className="text-[10px] font-mono text-red-400 animate-pulse font-bold">● ACTIVE</span>
              )}
            </div>
            <p className="text-[11px] font-mono text-muted-foreground mt-1">
              {riskState?.killSwitchActive
                ? "All trading halted. Click Deactivate to allow trading to resume."
                : "Immediately close all open positions and halt trading."}
            </p>
          </div>

          <div className="flex gap-2 shrink-0">
            {riskState?.killSwitchActive ? (
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-xs h-8 px-4 border-green-500/50 text-green-400 hover:bg-green-500/10"
                onClick={() => deactivateKillSwitch.mutate()}
                disabled={deactivateKillSwitch.isPending}
              >
                {deactivateKillSwitch.isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : <Zap size={12} className="mr-1" />}
                Deactivate
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="font-mono text-xs h-8 px-4 font-bold"
                    data-testid="kill-switch-btn"
                  >
                    <Zap size={12} className="mr-1" />
                    Kill Switch
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-card border-red-500/50 font-mono">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-red-400 flex items-center gap-2">
                      <AlertTriangle size={16} />
                      Confirm Kill Switch
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground text-xs">
                      This will immediately close ALL open positions at market price and halt the trading bot.
                      Click Deactivate afterwards to resume trading.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="text-xs h-8" data-testid="kill-switch-cancel">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700 text-xs h-8"
                      onClick={handleKillSwitch}
                      data-testid="kill-switch-confirm"
                    >
                      {killSwitch.isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                      Confirm Kill Switch
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
