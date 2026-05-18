import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Save, Copy, Trash2, Play, Download, Upload, Plus, Star, Shield, Zap, FlaskConical, CheckCircle } from "lucide-react";

interface Preset {
  id: number;
  name: string;
  description: string;
  isDefault: boolean;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

function apiPresets(path = "", opts?: RequestInit) {
  return fetch(`/api/presets${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
}

interface BuiltinPreset {
  id: string;
  name: string;
  tag: string;
  tagColor: string;
  icon: React.ElementType;
  iconColor: string;
  description: string;
  bullets: string[];
  risk: {
    maxDailyLossPct: number; maxDrawdownPct: number; maxExposurePct: number;
    riskPerTradePct: number; maxOpenPositions: number; correlationThreshold: number;
    slippagePct: number; feesPct: number;
  };
  botConfig: {
    paperMode: boolean; aiEnabled: boolean; autoTunerEnabled: boolean;
    dailyLossLimitUsd: number; dailyProfitTargetUsd: number;
    lossBufferUsd: number; winBufferUsd: number; sessionHours: number;
    limitOrderOnly: boolean; adaptiveSentiment: boolean;
  };
}

const BUILTIN_PRESETS: BuiltinPreset[] = [
  {
    id: "optimal",
    name: "Optimal Profit",
    tag: "RECOMMENDED",
    tagColor: "border-green-500/50 text-green-400 bg-green-500/5",
    icon: Shield,
    iconColor: "text-green-400",
    description: "Steady consistent returns with tight risk controls. Best setting to run with real money.",
    bullets: [
      "Risk 1% per trade, max 3 open positions",
      "Daily loss cap $30, profit target $60",
      "8h session, AI-guided entries only",
      "Correlation cap 60% — avoids cluster losses",
    ],
    risk: { maxDailyLossPct: 0.02, maxDrawdownPct: 0.08, maxExposurePct: 0.60, riskPerTradePct: 0.01, maxOpenPositions: 3, correlationThreshold: 0.60, slippagePct: 0.001, feesPct: 0.001 },
    botConfig: { paperMode: false, aiEnabled: true, autoTunerEnabled: false, dailyLossLimitUsd: 30, dailyProfitTargetUsd: 60, lossBufferUsd: 8, winBufferUsd: 12, sessionHours: 8, limitOrderOnly: false, adaptiveSentiment: true },
  },
  {
    id: "aggressive",
    name: "High Risk / High Reward",
    tag: "HIGH RISK",
    tagColor: "border-red-500/50 text-red-400 bg-red-500/5",
    icon: Zap,
    iconColor: "text-red-400",
    description: "More positions, higher risk per trade — calculated aggression, not gambling.",
    bullets: [
      "Risk 3% per trade, up to 8 open positions",
      "Daily loss cap $100, profit target $200",
      "12h session, auto-tuner ON to adapt fast",
      "Higher exposure — suitable for proven edge only",
    ],
    risk: { maxDailyLossPct: 0.05, maxDrawdownPct: 0.20, maxExposurePct: 0.90, riskPerTradePct: 0.03, maxOpenPositions: 8, correlationThreshold: 0.80, slippagePct: 0.001, feesPct: 0.001 },
    botConfig: { paperMode: false, aiEnabled: true, autoTunerEnabled: true, dailyLossLimitUsd: 100, dailyProfitTargetUsd: 200, lossBufferUsd: 25, winBufferUsd: 40, sessionHours: 12, limitOrderOnly: false, adaptiveSentiment: true },
  },
  {
    id: "experimental",
    name: "Experimental",
    tag: "PAPER MODE",
    tagColor: "border-violet-500/50 text-violet-400 bg-violet-500/5",
    icon: FlaskConical,
    iconColor: "text-violet-400",
    description: "Tests all strategies in paper mode 24/7. Use this to benchmark before going live.",
    bullets: [
      "Paper mode — zero real money risk",
      "All strategies enabled, 24h session",
      "Auto-tuner + AI both active",
      "Loose risk limits to see strategy potential",
    ],
    risk: { maxDailyLossPct: 0.04, maxDrawdownPct: 0.20, maxExposurePct: 0.85, riskPerTradePct: 0.02, maxOpenPositions: 6, correlationThreshold: 0.75, slippagePct: 0.001, feesPct: 0.001 },
    botConfig: { paperMode: true, aiEnabled: true, autoTunerEnabled: true, dailyLossLimitUsd: 0, dailyProfitTargetUsd: 0, lossBufferUsd: 0, winBufferUsd: 0, sessionHours: 24, limitOrderOnly: false, adaptiveSentiment: true },
  },
];

export default function Presets() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [importJson, setImportJson] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(() => localStorage.getItem("wt_preset") ?? null);
  const [scaledLoss, setScaledLoss] = useState(() => parseInt(localStorage.getItem("wt_loss") ?? "30", 10));
  const [optimalPaper, setOptimalPaper] = useState(() => localStorage.getItem("wt_paper") !== "false");

  const { data: presets = [], isLoading } = useQuery<Preset[]>({
    queryKey: ["presets"],
    queryFn: () => apiPresets().then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (body: object) => apiPresets("", { method: "POST", body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["presets"] }); setNewName(""); setNewDesc(""); toast({ title: "Preset saved" }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) => apiPresets(`/${id}`, { method: "PUT", body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["presets"] }); setEditId(null); toast({ title: "Preset updated" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiPresets(`/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["presets"] }); toast({ title: "Preset deleted" }); },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => apiPresets(`/${id}/duplicate`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["presets"] }); toast({ title: "Preset duplicated" }); },
  });

  const applyMutation = useMutation({
    mutationFn: (id: number) => apiPresets(`/${id}/apply`, { method: "POST" }).then(r => r.json()),
    onSuccess: (data) => {
      toast({ title: `Applied preset: ${data.preset.name}` });
    },
  });

  const applyBuiltinPreset = async (preset: BuiltinPreset, botConfigOverride?: Partial<BuiltinPreset["botConfig"]>) => {
    setApplying(preset.id);
    const botConfig = { ...preset.botConfig, ...botConfigOverride };
    try {
      await Promise.all([
        fetch("/api/risk/settings", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(preset.risk),
        }),
        fetch("/api/bot/config", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(botConfig),
        }),
      ]);
      setApplied(preset.id);
      localStorage.setItem("wt_preset", preset.id);
      toast({ title: `Applied: ${preset.name}`, description: "Risk settings and bot config updated." });
    } catch {
      toast({ title: "Apply failed", variant: "destructive" });
    } finally {
      setApplying(null);
    }
  };

  const saveCurrentConfig = () => {
    if (!newName.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    createMutation.mutate({
      name: newName.trim(),
      description: newDesc.trim(),
      data: {
        savedAt: new Date().toISOString(),
        note: "Saved from dashboard",
      },
    });
  };

  const exportPreset = (preset: Preset) => {
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${preset.name.toLowerCase().replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Preset exported" });
  };

  const importPreset = () => {
    try {
      const parsed = JSON.parse(importJson);
      createMutation.mutate({ name: parsed.name ?? "Imported Preset", description: parsed.description ?? "", data: parsed.data ?? parsed });
      setImportOpen(false);
      setImportJson("");
    } catch {
      toast({ title: "Invalid JSON", variant: "destructive" });
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-mono font-bold uppercase tracking-widest text-foreground">Strategy Presets</h1>
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-[10px] font-mono h-6 px-2 gap-1">
              <Upload size={10} /> Import
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xs font-mono">Import Preset JSON</DialogTitle>
            </DialogHeader>
            <Textarea
              className="h-40 text-xs font-mono bg-background"
              placeholder='{"name": "My Preset", "data": {...}}'
              value={importJson}
              onChange={e => setImportJson(e.target.value)}
            />
            <Button size="sm" className="text-[10px] font-mono" onClick={importPreset}>Import</Button>
          </DialogContent>
        </Dialog>
      </div>

      {/* Built-in recommended presets */}
      <div className="space-y-2">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Recommended Presets</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {BUILTIN_PRESETS.map((preset) => {
            const Icon = preset.icon;
            const isApplying = applying === preset.id;
            const isApplied = applied === preset.id;
            const isOptimal = preset.id === "optimal";
            const isActive = applied === preset.id;
            const scaledProfit = scaledLoss * 2;

            const bullets = isOptimal
              ? [
                  optimalPaper ? "Paper mode — simulated trades, no real money" : "Live mode — real MT5 orders",
                  "Risk 1% per trade, max 3 open positions",
                  `Daily loss cap $${scaledLoss}, profit target $${scaledProfit} (2:1 ratio)`,
                  "8h session, AI + all analysis active",
                ]
              : preset.bullets;

            return (
              <Card key={preset.id} className={`bg-card transition-all ${isActive ? "border-2 border-green-500/60 shadow-[0_0_12px_rgba(34,197,94,0.15)]" : "border-border"}`}>
                <CardContent className="p-4 flex flex-col gap-3 h-full">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon size={15} className={preset.iconColor} />
                      <span className="text-[11px] font-mono font-bold text-foreground">{preset.name}</span>
                      {isActive && (
                        <span className="text-[9px] font-mono font-bold text-green-400 bg-green-500/10 border border-green-500/30 px-1.5 py-0.5 rounded">● ACTIVE</span>
                      )}
                    </div>
                    <Badge variant="outline" className={`text-[9px] font-mono shrink-0 ${preset.tagColor}`}>{preset.tag}</Badge>
                  </div>
                  <p className="text-[10px] font-mono text-muted-foreground leading-relaxed flex-1">{preset.description}</p>
                  <ul className="space-y-0.5">
                    {bullets.map((b, i) => (
                      <li key={i} className="text-[9px] font-mono text-muted-foreground flex items-start gap-1">
                        <span className="text-primary mt-0.5 shrink-0">›</span>{b}
                      </li>
                    ))}
                  </ul>

                  {/* Mode + scaler — Optimal Profit only */}
                  {isOptimal && (
                    <div className="rounded border border-green-500/20 bg-green-500/5 px-3 py-2 space-y-2">
                      {/* Paper / Live toggle */}
                      <div className="flex items-center justify-between">
                        <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</p>
                        <div className="flex items-center rounded overflow-hidden border border-border text-[9px] font-mono">
                          <button
                            onClick={() => { setOptimalPaper(true); localStorage.setItem("wt_paper", "true"); }}
                            className={`px-2 py-0.5 transition-colors ${optimalPaper ? "bg-blue-500/20 text-blue-400" : "text-muted-foreground hover:text-foreground"}`}
                          >Paper</button>
                          <button
                            onClick={() => { setOptimalPaper(false); localStorage.setItem("wt_paper", "false"); }}
                            className={`px-2 py-0.5 transition-colors ${!optimalPaper ? "bg-green-500/20 text-green-400" : "text-muted-foreground hover:text-foreground"}`}
                          >Live</button>
                        </div>
                      </div>
                      {optimalPaper && (
                        <p className="text-[8px] font-mono text-blue-400/80">
                          Simulated trades — no real money. Switch to Live when ready.
                        </p>
                      )}
                      {!optimalPaper && (
                        <p className="text-[8px] font-mono text-amber-400/80">
                          ⚠ Real MT5 orders. Only use after proving profitable in paper mode.
                        </p>
                      )}
                      <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Adjust limits (2:1 ratio locked)</p>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { const v = Math.max(5, scaledLoss - 5); setScaledLoss(v); localStorage.setItem("wt_loss", String(v)); }}
                            className="w-6 h-6 rounded border border-border text-muted-foreground hover:text-foreground hover:border-green-400 transition-colors text-xs font-mono flex items-center justify-center"
                          >−</button>
                          <div className="text-center min-w-[56px]">
                            <div className="text-[11px] font-mono font-bold text-red-400">−${scaledLoss}</div>
                            <div className="text-[8px] font-mono text-muted-foreground">loss cap</div>
                          </div>
                          <button
                            onClick={() => { const v = Math.min(500, scaledLoss + 5); setScaledLoss(v); localStorage.setItem("wt_loss", String(v)); }}
                            className="w-6 h-6 rounded border border-border text-muted-foreground hover:text-foreground hover:border-green-400 transition-colors text-xs font-mono flex items-center justify-center"
                          >+</button>
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground">→</div>
                        <div className="text-center min-w-[56px]">
                          <div className="text-[11px] font-mono font-bold text-green-400">+${scaledProfit}</div>
                          <div className="text-[8px] font-mono text-muted-foreground">profit target</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <Button
                    size="sm"
                    variant={isApplied ? "default" : "outline"}
                    className={`h-7 text-[10px] font-mono w-full gap-1.5 mt-auto ${isApplied ? "bg-green-600 hover:bg-green-700 border-0" : ""}`}
                    disabled={isApplying || isApplied}
                    onClick={() => applyBuiltinPreset(
                      preset,
                      isOptimal ? { paperMode: optimalPaper, dailyLossLimitUsd: scaledLoss, dailyProfitTargetUsd: scaledProfit, lossBufferUsd: Math.round(scaledLoss * 0.25), winBufferUsd: Math.round(scaledProfit * 0.2) } : undefined
                    )}
                  >
                    {isApplied ? (
                      <><CheckCircle size={10} /> Applied!</>
                    ) : isApplying ? (
                      "Applying…"
                    ) : (
                      <><Play size={10} /> Apply Preset</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Save new preset */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-[11px] font-mono uppercase tracking-wider flex items-center gap-2">
            <Save size={12} className="text-primary" /> Save Current Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] font-mono text-muted-foreground uppercase">Name</Label>
              <Input className="h-7 text-xs font-mono bg-background" placeholder="My Strategy Config" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-mono text-muted-foreground uppercase">Description</Label>
              <Input className="h-7 text-xs font-mono bg-background" placeholder="Optional description" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
            </div>
          </div>
          <Button size="sm" className="h-7 text-[10px] font-mono gap-1" onClick={saveCurrentConfig} disabled={createMutation.isPending}>
            <Save size={10} /> Save Preset
          </Button>
        </CardContent>
      </Card>

      {/* Preset list */}
      <div className="space-y-2">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{presets.length} saved presets</p>
        {isLoading && <p className="text-[10px] font-mono text-muted-foreground">Loading...</p>}
        {presets.map(preset => (
          <Card key={preset.id} className={`border ${preset.isDefault ? "border-primary/40 bg-primary/5" : "border-border"}`}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {editId === preset.id ? (
                      <Input className="h-6 text-xs font-mono bg-background" value={editName} onChange={e => setEditName(e.target.value)} />
                    ) : (
                      <p className="text-[11px] font-mono font-semibold text-foreground truncate">{preset.name}</p>
                    )}
                    {preset.isDefault && <Star size={10} className="text-yellow-400 shrink-0" />}
                  </div>
                  {editId === preset.id ? (
                    <Input className="h-6 text-[10px] font-mono bg-background mt-1" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
                  ) : (
                    <p className="text-[10px] font-mono text-muted-foreground">{preset.description || "No description"}</p>
                  )}
                  <p className="text-[9px] font-mono text-muted-foreground/60 mt-0.5">
                    Saved {new Date(preset.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {editId === preset.id ? (
                    <>
                      <Button size="sm" className="h-6 text-[9px] font-mono px-2" onClick={() => updateMutation.mutate({ id: preset.id, body: { name: editName, description: editDesc } })}>Save</Button>
                      <Button variant="ghost" size="sm" className="h-6 text-[9px] font-mono px-2" onClick={() => setEditId(null)}>Cancel</Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" className="h-6 text-[9px] font-mono px-2 gap-1" onClick={() => applyMutation.mutate(preset.id)}>
                        <Play size={8} /> Apply
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => exportPreset(preset)} title="Export">
                        <Download size={10} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => duplicateMutation.mutate(preset.id)} title="Duplicate">
                        <Copy size={10} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditId(preset.id); setEditName(preset.name); setEditDesc(preset.description); }} title="Rename">
                        ✎
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-300">
                            <Trash2 size={10} />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-card border-border">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-xs font-mono">Delete preset?</AlertDialogTitle>
                            <AlertDialogDescription className="text-[10px] font-mono">
                              This will permanently delete &quot;{preset.name}&quot;.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="text-xs font-mono h-7">Cancel</AlertDialogCancel>
                            <AlertDialogAction className="text-xs font-mono h-7 bg-red-600 hover:bg-red-700" onClick={() => deleteMutation.mutate(preset.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {Object.keys(preset.data as object).slice(0, 4).map(k => (
                  <Badge key={k} variant="outline" className="text-[8px] font-mono border-border">{k}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && presets.length === 0 && (
          <div className="text-center py-8 text-[10px] font-mono text-muted-foreground">
            No presets saved yet. Save your current configuration above.
          </div>
        )}
      </div>
    </div>
  );
}
