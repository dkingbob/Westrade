import { useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { LogOut, User, Settings2 } from "lucide-react";

interface UserProfile {
  userId: string;
  username: string | null;
  bio: string | null;
  bannerUrl: string | null;
  timezone: string;
  theme: string;
}

function api(path: string, opts?: RequestInit) {
  return fetch(path, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
}

export function UserProfileWidget({ collapsed }: { collapsed: boolean }) {
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["user-profile"],
    queryFn: () => api("/api/user/profile").then(r => r.json()),
    enabled: isAuthenticated,
  });

  const updateProfile = useMutation({
    mutationFn: (body: object) => api("/api/user/profile", { method: "PUT", body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["user-profile"] }); toast({ title: "Profile updated" }); setOpen(false); },
  });

  if (isLoading) return null;

  if (!isAuthenticated) {
    return (
      <div className="px-3 py-2 border-t border-sidebar-border">
        {collapsed ? (
          <button onClick={login} className="flex items-center justify-center w-full text-muted-foreground hover:text-foreground transition-colors" title="Log in">
            <User size={13} />
          </button>
        ) : (
          <button
            onClick={login}
            className="w-full flex items-center gap-2 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            <User size={12} />
            <span>Log in</span>
          </button>
        )}
      </div>
    );
  }

  const displayName = profile?.username ?? user?.firstName ?? user?.email?.split("@")[0] ?? "Trader";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="border-t border-sidebar-border">
      <Dialog open={open} onOpenChange={(v) => {
        setOpen(v);
        if (v) { setUsername(profile?.username ?? ""); setBio(profile?.bio ?? ""); }
      }}>
        <DialogTrigger asChild>
          <button className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-sidebar-accent transition-colors group ${collapsed ? "justify-center" : ""}`}>
            <Avatar className="w-5 h-5 shrink-0">
              <AvatarImage src={user?.profileImageUrl ?? undefined} />
              <AvatarFallback className="text-[8px] font-mono bg-primary/20 text-primary">{initials}</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 text-left min-w-0">
                <p className="text-[10px] font-mono font-semibold text-foreground truncate">{displayName}</p>
                <p className="text-[9px] font-mono text-muted-foreground truncate">{user?.email ?? ""}</p>
              </div>
            )}
            {!collapsed && <Settings2 size={10} className="text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />}
          </button>
        </DialogTrigger>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xs font-mono flex items-center gap-2">
              <User size={12} className="text-primary" /> Profile Settings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
