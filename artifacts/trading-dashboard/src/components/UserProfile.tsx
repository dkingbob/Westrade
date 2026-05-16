import { useAuth } from "@workspace/replit-auth-web";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User, Settings2 } from "lucide-react";

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
  const { user, isLoading, isAuthenticated, login } = useAuth();

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["user-profile"],
    queryFn: () => api("/api/user/profile").then(r => r.json()),
    enabled: isAuthenticated,
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
      <Link href="/settings">
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
      </Link>
    </div>
  );
}
