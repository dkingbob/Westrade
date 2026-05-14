import { useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useTheme, type ThemeStyle } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { User, Palette, Bell, LogOut, Check } from "lucide-react";

function api(path: string, opts?: RequestInit) {
  return fetch(path, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
}

const STYLE_OPTIONS: { value: ThemeStyle; label: string; desc: string; bg: string; accent: string }[] = [
  { value: "glass",    label: "Glass",    desc: "Blue-tinted glass with subtle blur",       bg: "bg-gradient-to-br from-blue-950/80 to-slate-900/80",  accent: "bg-blue-400" },
  { value: "frosted",  label: "Frosted",  desc: "Apple-style heavy blur, macOS feel",        bg: "bg-gradient-to-br from-slate-800/60 to-blue-900/60 backdrop-blur",  accent: "bg-sky-400" },
  { value: "terminal", label: "Terminal", desc: "Matrix green-on-black hacker terminal",     bg: "bg-black",  accent: "bg-green-400" },
  { value: "midnight", label: "Midnight", desc: "Deep navy, premium institutional look",     bg: "bg-gradient-to-br from-indigo-950 to-slate-900",  accent: "bg-indigo-400" },
];

export default function Settings() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { style, setStyle } = useTheme();
  const [tab, setTab] = useState<"profile" | "appearance" | "notifications">("profile");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [emailAddr, setEmailAddr] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [emailEvents, setEmailEvents] = useState({ killSwitch: true, sessionLimit: true, profitTarget: true, newTrade: false });

  const { data: profile } = useQuery<any>({
    queryKey: ["user-profile"],
    queryFn: () => api("/api/user/profile").then(r => r.json()),
    onSuccess: (d) => { setUsername(d.username ?? ""); setBio(d.bio ?? ""); },
  });

  const { data: emailSettings } = useQuery<any>({
    queryKey: ["email-settings"],
    queryFn: () => api("/api/notifications/email-settings").then(r => r.json()),
    onSuccess: (d) => {
      if (d.email) setEmailAddr(d.email);
      if (d.smtpHost) setSmtpHost(d.smtpHost);
      if (d.smtpPort) setSmtpPort(String(d.smtpPort));
      if (d.smtpUser) setSmtpUser(d.smtpUser);
      if (d.events) setEmailEvents(d.events);
    },
  });

  const updateProfile = useMutation({
    mutationFn: (body: object) => api("/api/user/profile", { method: "PUT", body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["user-profile"] }); toast({ title: "Profile updated" }); },
  });

  const saveEmail = useMutation({
    mutationFn: (body: object) => api("/api/notifications/email-settings", { method: "PUT", body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: () => toast({ title: "Email settings saved" }),
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const testEmail = useMutation({
    mutationFn: () => api("/api/notifications/email-test", { method: "POST" }).then(r => r.json()),
    onSuccess: (d) => toast({ title: d.success ? "Test email sent!" : "Failed: " + d.error }),
  });

  const displayName = profile?.username ?? user?.firstName ?? "Trader";
  const initials = displayName.slice(0, 2).toUpperCase();

  const tabs = [
    { key: "profile", label: "Profile", icon: User },
    { key: "appearance", label: "Appearance", icon: Palette },
    { key: "notifications", label: "Email Alerts", icon: Bell },
  ] as const;

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h1 className="text-sm font-mono font-bold uppercase tracking-widest text-foreground">Settings</h1>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border pb-0">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono transition-colors border-b-2 -mb-px",
              tab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon size={11} />
            {label}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {tab === "profile" && (
        <Card className="bg-card border-card-border">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="w-12 h-12">
                <AvatarImage src={user?.profileImageUrl ?? undefined} />
                <AvatarFallback className="text-sm font-mono bg-primary/20 text-primary">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-xs font-mono font-semibold text-foreground">{user?.firstName} {user?.lastName}</p>
                <p className="text-[10px] font-mono text-muted-foreground">{user?.email}</p>
                <Badge variant="outline" className="text-[9px] font-mono mt-1 border-primary/40 text-primary">Authenticated</Badge>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label className="text-[10px] font-mono text-muted-foreground uppercase">Display Name</Label>
              <Input className="h-7 text-xs font-mono bg-background" placeholder="Trader name" value={username} onChange={e => setUsername(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-mono text-muted-foreground uppercase">Bio</Label>
              <Textarea className="text-xs font-mono bg-background h-16 resize-none" placeholder="Short bio..." value={bio} onChange={e => setBio(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-7 text-[10px] font-mono" onClick={() => updateProfile.mutate({ username, bio })} disabled={updateProfile.isPending}>
                Save Profile
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[10px] font-mono gap-1 text-red-400 border-red-500/40 hover:bg-red-500/10" onClick={logout}>
                <LogOut size={10} /> Logout
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Appearance tab */}
      {tab === "appearance" && (
        <Card className="bg-card border-card-border">
          <CardHeader className="py-2 px-4 border-b border-border">
            <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Palette size={11} /> Visual Style
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 grid grid-cols-2 gap-3">
            {STYLE_OPTIONS.map(({ value, label, desc, bg, accent }) => (
              <button
                key={value}
                onClick={() => setStyle(value)}
                className={cn(
                  "relative rounded border-2 p-3 text-left transition-all space-y-2",
                  style === value ? "border-primary" : "border-border hover:border-muted-foreground"
                )}
              >
                <div className={cn("h-14 rounded border border-white/10 flex items-end gap-1 p-2 overflow-hidden", bg)}>
                  <div className="flex-1 space-y-1">
                    <div className="h-1.5 rounded bg-white/60 w-full" />
                    <div className="h-1 rounded bg-white/30 w-3/4" />
                    <div className="h-1 rounded bg-white/20 w-1/2" />
                  </div>
                  <div className={cn("w-1.5 h-8 rounded-sm", accent, "opacity-90")} />
                </div>
                <div>
                  <p className="text-[10px] font-mono font-semibold text-foreground">{label}</p>
                  <p className="text-[9px] font-mono text-muted-foreground">{desc}</p>
                </div>
                {style === value && (
                  <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <Check size={10} className="text-white" />
                  </div>
                )}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Email Alerts tab */}
      {tab === "notifications" && (
        <div className="space-y-3">
          <Card className="bg-card border-card-border">
            <CardHeader className="py-2 px-4 border-b border-border">
              <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Email Destination</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="space-y-1">
                <Label className="text-[10px] font-mono text-muted-foreground uppercase">Send alerts to</Label>
                <Input className="h-7 text-xs font-mono bg-background" type="email" placeholder="you@example.com" value={emailAddr} onChange={e => setEmailAddr(e.target.value)} />
              </div>
              <Separator />
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">SMTP Settings (Gmail recommended)</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[9px] font-mono text-muted-foreground uppercase">Host</Label>
                  <Input className="h-7 text-xs font-mono bg-background" placeholder="smtp.gmail.com" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] font-mono text-muted-foreground uppercase">Port</Label>
                  <Input className="h-7 text-xs font-mono bg-background" placeholder="587" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] font-mono text-muted-foreground uppercase">Username</Label>
                  <Input className="h-7 text-xs font-mono bg-background" placeholder="you@gmail.com" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] font-mono text-muted-foreground uppercase">App Password</Label>
                  <Input className="h-7 text-xs font-mono bg-background" type="password" placeholder="Gmail app password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} />
                </div>
              </div>
              <p className="text-[9px] font-mono text-muted-foreground">For Gmail: enable 2FA → Google Account → Security → App passwords</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-card-border">
            <CardHeader className="py-2 px-4 border-b border-border">
              <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">What to receive</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {[
                { key: "killSwitch", label: "Kill Switch Activated", desc: "Bot stops due to kill switch" },
                { key: "sessionLimit", label: "Loss Limit Hit", desc: "Daily loss limit reached" },
                { key: "profitTarget", label: "Profit Target Reached", desc: "Daily profit goal hit" },
                { key: "newTrade", label: "New Trade Opened", desc: "Every trade placed by bot" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-mono font-semibold text-foreground">{label}</p>
                    <p className="text-[9px] font-mono text-muted-foreground">{desc}</p>
                  </div>
                  <Switch
                    checked={emailEvents[key as keyof typeof emailEvents]}
                    onCheckedChange={(v) => setEmailEvents(prev => ({ ...prev, [key]: v }))}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button className="flex-1 h-8 text-xs font-mono" onClick={() => saveEmail.mutate({ email: emailAddr, smtpHost, smtpPort: parseInt(smtpPort), smtpUser, smtpPass, events: emailEvents })} disabled={saveEmail.isPending}>
              Save Email Settings
            </Button>
            <Button variant="outline" className="h-8 text-xs font-mono" onClick={() => testEmail.mutate()} disabled={testEmail.isPending}>
              Send Test
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
