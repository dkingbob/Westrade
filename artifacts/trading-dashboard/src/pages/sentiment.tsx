import { useState } from "react";
import {
  useGetSentimentState,
  useGetSentimentSettings,
  useUpdateSentimentSettings,
  getGetSentimentSettingsQueryKey,
  getGetSentimentStateQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Brain, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";

function fmt(n: number, dec = 2) { return n.toFixed(dec); }

function CircularGauge({ value, label, size = 80 }: { value: number; label: string; size?: number }) {
  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;
  const filled = value * circumference;
  const color = value >= 0.7 ? "#22c55e" : value >= 0.4 ? "#f59e0b" : "#ef4444";
  const pct = Math.round(value * 100);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="5"
        />
        {/* Fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - filled}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
        {/* Value text */}
        <text
          x={size / 2}
          y={size / 2 + 4}
          textAnchor="middle"
          fontSize="13"
          fontFamily="monospace"
          fontWeight="bold"
          fill={color}
        >
          {pct}
        </text>
      </svg>
      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );
}

function TrendBadge({ trend }: { trend: "bullish" | "bearish" | "neutral" }) {
  const configs = {
    bullish: { color: "border-green-400 text-green-400 bg-green-400/10", Icon: TrendingUp, label: "BULLISH" },
    bearish: { color: "border-red-400 text-red-400 bg-red-400/10", Icon: TrendingDown, label: "BEARISH" },
    neutral: { color: "border-yellow-400 text-yellow-400 bg-yellow-400/10", Icon: Minus, label: "NEUTRAL" },
  };
  const { color, Icon, label } = configs[trend];
  return (
    <Badge variant="outline" className={cn("text-xs font-mono font-bold px-3 py-1", color)}>
      <Icon size={12} className="mr-1" />
      {label}
    </Badge>
  );
}

export default function Sentiment() {
  const qc = useQueryClient();
  const { data: state, isLoading: stateLoading } = useGetSentimentState({ query: { queryKey: getGetSentimentStateQueryKey(), refetchInterval: 5000 } });
  const { data: settings, isLoading: settingsLoading } = useGetSentimentSettings();
  const updateSettings = useUpdateSentimentSettings();

  const [mode, setMode] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [instWeight, setInstWeight] = useState<number | null>(null);
  const [retailWeight, setRetailWeight] = useState<number | null>(null);
  const [momWeight, setMomWeight] = useState<number | null>(null);
  const [maxMult, setMaxMult] = useState<number | null>(null);
  const [minMult, setMinMult] = useState<number | null>(null);

  const eff = {
    mode: mode ?? settings?.mode ?? "clean",
    enabled: enabled ?? settings?.enabled ?? true,
    institutionalWeight: instWeight ?? settings?.institutionalWeight ?? 0.6,
    retailWeight: retailWeight ?? settings?.retailWeight ?? 0.2,
    momentumWeight: momWeight ?? settings?.momentumWeight ?? 0.2,
    maxMultiplier: maxMult ?? settings?.maxMultiplier ?? 1.5,
    minMultiplier: minMult ?? settings?.minMultiplier ?? 0.5,
  };

  const handleSave = async () => {
    await updateSettings.mutateAsync({ data: eff as any });
    qc.invalidateQueries({ queryKey: getGetSentimentSettingsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetSentimentStateQueryKey() });
  };

  const totalWeight = eff.institutionalWeight + eff.retailWeight + eff.momentumWeight;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-sm font-mono font-bold text-foreground uppercase tracking-widest">Sentiment Engine</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Live sentiment state */}
        <Card className="bg-card border-card-border">
          <CardHeader className="py-2 px-3 border-b border-border flex-row items-center gap-2">
            <Brain size={12} className="text-primary" />
            <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Live Sentiment</CardTitle>
            {state && (
              <div className="ml-auto">
                <TrendBadge trend={state.trend as any} />
              </div>
            )}
          </CardHeader>
          <CardContent className="p-4">
            {stateLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
            ) : state ? (
              <>
                {/* Gauges */}
                <div className="flex justify-around items-end py-2">
                  <CircularGauge value={state.institutional} label="Institutional" />
                  <CircularGauge value={state.composite} label="Composite" size={96} />
                  <CircularGauge value={state.retail} label="Retail" />
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4 text-[11px] font-mono">
                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-border/30 pb-1">
                      <span className="text-muted-foreground">Momentum</span>
                      <span className={cn("font-bold", state.momentum >= 0.5 ? "text-green-400" : "text-red-400")}>{(state.momentum * 100).toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/30 pb-1">
                      <span className="text-muted-foreground">Model Score</span>
                      <span className="text-foreground">{(state.modelSentiment * 100).toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/30 pb-1">
                      <span className="text-muted-foreground">Mode</span>
                      <span className="text-foreground uppercase">{state.mode}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-border/30 pb-1">
                      <span className="text-muted-foreground">Composite</span>
                      <span className={cn("font-bold", state.composite >= 0.5 ? "text-green-400" : "text-red-400")}>{(state.composite * 100).toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/30 pb-1">
                      <span className="text-muted-foreground">Divergence</span>
                      <span className={cn("font-bold", state.divergence > 0.2 ? "text-yellow-400" : "text-green-400")}>{(state.divergence * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Updated</span>
                      <span className="text-muted-foreground text-[10px]">{new Date(state.updatedAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>

                {/* Divergence indicator */}
                {state.divergence > 0.2 && (
                  <div className="mt-3 p-2 rounded border border-yellow-400/30 bg-yellow-400/5 text-[10px] font-mono text-yellow-400">
                    ⚠ High divergence ({(state.divergence * 100).toFixed(1)}%) between composite and model sentiment — signal reliability reduced
                  </div>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* Settings */}
        <Card className="bg-card border-card-border">
          <CardHeader className="py-2 px-3 border-b border-border">
            <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Sentiment Settings</CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-4">
            {settingsLoading ? (
              <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <>
                <div className="space-y-0.5">
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
                  <Select value={eff.mode} onValueChange={setMode}>
                    <SelectTrigger className="h-7 text-xs font-mono bg-background border-border" data-testid="sentiment-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border text-xs font-mono">
                      <SelectItem value="clean">Clean (Institutional Only)</SelectItem>
                      <SelectItem value="hype">Hype (Retail-Heavy)</SelectItem>
                      <SelectItem value="custom">Custom Weights</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-muted-foreground">Enabled (affects position sizing)</span>
                  <Switch checked={eff.enabled} onCheckedChange={setEnabled} data-testid="sentiment-enabled" />
                </div>

                {eff.mode === "custom" && (
                  <div className="space-y-3 border border-border/50 rounded p-2.5">
                    <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
                      Custom Weights (total: {(totalWeight * 100).toFixed(0)}%)
                    </div>
                    {[
                      { label: "Institutional", value: eff.institutionalWeight, set: setInstWeight },
                      { label: "Retail", value: eff.retailWeight, set: setRetailWeight },
                      { label: "Momentum", value: eff.momentumWeight, set: setMomWeight },
                    ].map(({ label, value, set }) => (
                      <div key={label} className="space-y-1">
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="text-foreground">{(value * 100).toFixed(0)}%</span>
                        </div>
                        <Slider
                          value={[value * 100]}
                          onValueChange={([v]) => set(v / 100)}
                          min={0}
                          max={100}
                          step={5}
                          className="h-1.5"
                          data-testid={`slider-${label.toLowerCase()}`}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-3 border border-border/50 rounded p-2.5">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Position Size Multiplier Range</div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-muted-foreground">Min Multiplier</span>
                      <span className="text-foreground">{fmt(eff.minMultiplier)}×</span>
                    </div>
                    <Slider
                      value={[eff.minMultiplier * 100]}
                      onValueChange={([v]) => setMinMult(v / 100)}
                      min={10}
                      max={100}
                      step={5}
                      className="h-1.5"
                      data-testid="slider-min-mult"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-muted-foreground">Max Multiplier</span>
                      <span className="text-foreground">{fmt(eff.maxMultiplier)}×</span>
                    </div>
                    <Slider
                      value={[eff.maxMultiplier * 100]}
                      onValueChange={([v]) => setMaxMult(v / 100)}
                      min={100}
                      max={300}
                      step={5}
                      className="h-1.5"
                      data-testid="slider-max-mult"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleSave}
                  disabled={updateSettings.isPending}
                  className="w-full h-8 text-xs font-mono"
                  data-testid="save-sentiment-settings"
                >
                  {updateSettings.isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                  Save Settings
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
