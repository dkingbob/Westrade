import { useState } from "react";
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
import { Save, Copy, Trash2, Play, Download, Upload, Plus, Star } from "lucide-react";

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
