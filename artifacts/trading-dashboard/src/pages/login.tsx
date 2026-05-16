import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp } from "lucide-react";

const STORAGE_KEY = "westrade_remembered";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const { email: e, password: p } = JSON.parse(saved);
        setEmail(e ?? "");
        setPassword(p ?? "");
        setRemember(true);
      } catch { /* ignore */ }
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const body: Record<string, string> = mode === "login"
      ? { username: email, password }
      : { username: regUsername || email.split("@")[0], email, password };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({ title: "Error", description: data.error ?? "Something went wrong", variant: "destructive" });
      } else {
        if (remember) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, password }));
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
        setLocation("/");
        window.location.reload();
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-primary">
            <TrendingUp size={28} />
            <span className="text-2xl font-bold tracking-tight">Westrade</span>
          </div>
          <p className="text-muted-foreground text-sm">
            {mode === "login" ? "Sign in to your account" : "Create a new account"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          {mode === "register" && (
            <div className="space-y-2">
              <Label htmlFor="regUsername">Username</Label>
              <Input
                id="regUsername"
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
                placeholder="your_username"
                minLength={3}
                autoComplete="username"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
              required
              minLength={mode === "register" ? 8 : 1}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          {mode === "login" && (
            <div className="flex items-center gap-2">
              <input
                id="remember"
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
              />
              <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer select-none">
                Remember me
              </label>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="text-primary underline underline-offset-4 hover:no-underline"
          >
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
