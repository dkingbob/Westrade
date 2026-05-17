import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, Eye, EyeOff, ArrowLeft, CheckCircle2, Mail } from "lucide-react";

const STORAGE_KEY = "westrade_remembered";

type View = "login" | "register" | "forgot" | "reset-code";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    const endpoint = view === "register" ? "/api/auth/register" : "/api/auth/login";
    const body = view === "register"
      ? { username: regUsername || email.split("@")[0], email, password }
      : { username: email, password };
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
        if (remember && view === "login") {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, password }));
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
        setLocation("/");
        window.location.reload();
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      setView("reset-code");
    } catch {
      toast({ title: "Failed to send", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail, code: resetCode, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error ?? "Invalid or expired code", variant: "destructive" });
      } else {
        toast({ title: "Password reset! Sign in with your new password." });
        setView("login");
        setPassword("");
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const features = [
    "AI-powered entries with Gemini analysis",
    "Real-time risk management & kill switch",
    "Brain Gym: weekly strategy post-mortem",
    "Live MT5 connection with paper trade mode",
  ];

  return (
    <div className="min-h-screen flex">

      {/* ── Left branding panel (desktop only) ── */}
      <div className="hidden lg:flex flex-col justify-between w-[460px] shrink-0 bg-[#070b12] p-12 relative overflow-hidden">
        <div className="absolute inset-0" style={{
          backgroundImage: `linear-gradient(rgba(59,130,246,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.06) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }} />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-blue-600/8 rounded-full blur-3xl pointer-events-none" />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
            <TrendingUp size={18} className="text-blue-400" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">Westrade</span>
        </div>

        {/* Copy */}
        <div className="relative space-y-8">
          <div>
            <h2 className="text-[30px] font-bold text-white leading-tight">
              Algorithmic trading,<br />
              <span className="text-blue-400">institutional grade.</span>
            </h2>
            <p className="text-sm text-slate-400 mt-3 leading-relaxed">
              Your automated trading desk — AI analysis, real-time risk controls, and full MT5 integration in one dashboard.
            </p>
          </div>
          <ul className="space-y-3">
            {features.map((f, i) => (
              <li key={i} className="flex items-center gap-3 text-sm text-slate-300">
                <span className="w-5 h-5 rounded-full bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-slate-700 font-mono">© {new Date().getFullYear()} Westrade. All rights reserved.</p>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-[380px] space-y-6">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
              <TrendingUp size={15} className="text-primary" />
            </div>
            <span className="text-lg font-bold text-foreground">Westrade</span>
          </div>

          {/* ── Reset code entry ── */}
          {view === "reset-code" ? (
            <div className="space-y-6">
              <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Mail size={22} className="text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Check your email</h1>
                <p className="text-sm text-muted-foreground mt-1.5">
                  We sent a 6-digit code to <span className="text-foreground font-medium">{forgotEmail}</span>. Enter it below along with your new password.
                </p>
              </div>
              <form onSubmit={handleReset} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="code" className="text-sm font-medium">Reset code</Label>
                  <Input
                    id="code"
                    value={resetCode}
                    onChange={e => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    required
                    maxLength={6}
                    className="h-10 font-mono tracking-widest text-center text-lg"
                    autoComplete="one-time-code"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password" className="text-sm font-medium">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                    className="h-10"
                    autoComplete="new-password"
                  />
                </div>
                <Button type="submit" className="w-full h-10 font-medium" disabled={loading || resetCode.length < 6}>
                  {loading ? "Resetting…" : "Reset password"}
                </Button>
              </form>
              <button onClick={() => setView("forgot")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft size={13} /> Didn't get it? Try again
              </button>
            </div>

          ) : view === "forgot" ? (
            /* ── Forgot password ── */
            <div className="space-y-6">
              <div>
                <button onClick={() => setView("login")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
                  <ArrowLeft size={13} /> Back to sign in
                </button>
                <h1 className="text-2xl font-bold text-foreground">Forgot password?</h1>
                <p className="text-sm text-muted-foreground mt-1.5">No worries. Enter your email and we'll send a reset code.</p>
              </div>
              <form onSubmit={handleForgot} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="forgot-email" className="text-sm font-medium">Email address</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="h-10"
                    autoComplete="email"
                  />
                </div>
                <Button type="submit" className="w-full h-10 font-medium" disabled={loading}>
                  {loading ? "Sending…" : "Send reset code"}
                </Button>
              </form>
            </div>

          ) : (
            /* ── Login / Register ── */
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  {view === "login" ? "Welcome back" : "Create account"}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {view === "login" ? "Sign in to your trading dashboard" : "Set up your Westrade account"}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className="h-10"
                  />
                </div>

                {view === "register" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-username" className="text-sm font-medium">
                      Username <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                    </Label>
                    <Input
                      id="reg-username"
                      value={regUsername}
                      onChange={e => setRegUsername(e.target.value)}
                      placeholder="your_username"
                      minLength={3}
                      autoComplete="username"
                      className="h-10"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                    {view === "login" && (
                      <button
                        type="button"
                        onClick={() => setView("forgot")}
                        className="text-xs text-primary hover:underline underline-offset-2"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder={view === "register" ? "At least 8 characters" : "••••••••"}
                      required
                      minLength={view === "register" ? 8 : 1}
                      autoComplete={view === "login" ? "current-password" : "new-password"}
                      className="h-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {view === "login" && (
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={e => setRemember(e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    <span className="text-sm text-muted-foreground">Remember me</span>
                  </label>
                )}

                <Button type="submit" className="w-full h-10 font-medium" disabled={loading}>
                  {loading ? "Please wait…" : view === "login" ? "Sign in" : "Create account"}
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-3 text-xs text-muted-foreground">
                    {view === "login" ? "New to Westrade?" : "Already have an account?"}
                  </span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full h-10 font-medium text-sm"
                onClick={() => setView(view === "login" ? "register" : "login")}
              >
                {view === "login" ? "Create an account" : "Sign in instead"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
