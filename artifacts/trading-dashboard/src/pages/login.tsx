import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, Eye, EyeOff, ArrowLeft, Mail } from "lucide-react";

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
      : { username: email, password, rememberMe: remember };
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

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden"
      style={{ background: "#070b12" }}
    >
      {/* Background grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(59,130,246,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.05) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />
      {/* Glow blobs */}
      <div className="absolute top-[-120px] left-[-80px] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)", filter: "blur(40px)" }} />
      <div className="absolute bottom-[-100px] right-[-60px] w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(168,85,247,0.14) 0%, transparent 70%)", filter: "blur(40px)" }} />

      {/* Logo */}
      <div className="relative flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)", boxShadow: "0 8px 28px -6px #6366f1aa" }}>
          <TrendingUp size={20} className="text-white" />
        </div>
        <span className="text-xl font-bold text-white tracking-tight">Westrade</span>
      </div>

      {/* Card */}
      <div
        className="relative w-full max-w-[420px] rounded-2xl p-8 space-y-6"
        style={{
          background: "rgba(15, 17, 28, 0.85)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(24px)",
          boxShadow: "0 32px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
        }}
      >
        {/* ── Reset code entry ── */}
        {view === "reset-code" && (
          <div className="space-y-5">
            <div className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}>
              <Mail size={22} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Check your email</h1>
              <p className="text-sm mt-1.5" style={{ color: "#8a8fa3" }}>
                We sent a 6-digit code to <span className="text-white font-medium">{forgotEmail}</span>. Enter it below with your new password.
              </p>
            </div>
            <form onSubmit={handleReset} className="space-y-4">
              <Field label="Reset code">
                <Input
                  value={resetCode}
                  onChange={e => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  required maxLength={6}
                  className="h-11 font-mono tracking-widest text-center text-xl bg-transparent border-white/10 text-white placeholder:text-white/20"
                  autoComplete="one-time-code"
                />
              </Field>
              <Field label="New password">
                <Input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required minLength={8}
                  className="h-11 bg-transparent border-white/10 text-white placeholder:text-white/20"
                  autoComplete="new-password"
                />
              </Field>
              <PrimaryBtn loading={loading} disabled={resetCode.length < 6}>Reset password</PrimaryBtn>
            </form>
            <button onClick={() => setView("forgot")} className="flex items-center gap-1.5 text-sm transition-colors" style={{ color: "#8a8fa3" }}>
              <ArrowLeft size={13} /> Didn't receive it? Try again
            </button>
          </div>
        )}

        {/* ── Forgot password ── */}
        {view === "forgot" && (
          <div className="space-y-5">
            <div>
              <button onClick={() => setView("login")} className="flex items-center gap-1.5 text-sm mb-5 transition-colors hover:text-white" style={{ color: "#8a8fa3" }}>
                <ArrowLeft size={13} /> Back to sign in
              </button>
              <h1 className="text-2xl font-bold text-white">Forgot password?</h1>
              <p className="text-sm mt-1.5" style={{ color: "#8a8fa3" }}>No worries — we'll send a reset code to your email.</p>
            </div>
            <form onSubmit={handleForgot} className="space-y-4">
              <Field label="Email address">
                <Input
                  type="email"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="h-11 bg-transparent border-white/10 text-white placeholder:text-white/20"
                  autoComplete="email"
                />
              </Field>
              <PrimaryBtn loading={loading}>Send reset code</PrimaryBtn>
            </form>
          </div>
        )}

        {/* ── Login / Register ── */}
        {(view === "login" || view === "register") && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white">
                {view === "login" ? "Welcome back" : "Create account"}
              </h1>
              <p className="text-sm mt-1" style={{ color: "#8a8fa3" }}>
                {view === "login" ? "Sign in to your trading dashboard" : "Set up your Westrade account"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Email">
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  className="h-11 bg-transparent border-white/10 text-white placeholder:text-white/20 focus-visible:border-indigo-500/60 focus-visible:ring-indigo-500/20"
                />
              </Field>

              {view === "register" && (
                <Field label={<>Username <span style={{ color: "#8a8fa3", fontSize: "12px", fontWeight: 400 }}>(optional)</span></>}>
                  <Input
                    value={regUsername}
                    onChange={e => setRegUsername(e.target.value)}
                    placeholder="your_username"
                    minLength={3}
                    autoComplete="username"
                    className="h-11 bg-transparent border-white/10 text-white placeholder:text-white/20 focus-visible:border-indigo-500/60 focus-visible:ring-indigo-500/20"
                  />
                </Field>
              )}

              <Field label={
                <div className="flex items-center justify-between w-full">
                  <span>Password</span>
                  {view === "login" && (
                    <button type="button" onClick={() => setView("forgot")}
                      className="text-xs font-medium transition-colors hover:text-indigo-300"
                      style={{ color: "#818cf8" }}>
                      Forgot password?
                    </button>
                  )}
                </div>
              }>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={view === "register" ? "At least 8 characters" : "••••••••"}
                    required
                    minLength={view === "register" ? 8 : 1}
                    autoComplete={view === "login" ? "current-password" : "new-password"}
                    className="h-11 pr-10 bg-transparent border-white/10 text-white placeholder:text-white/20 focus-visible:border-indigo-500/60 focus-visible:ring-indigo-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors hover:text-white"
                    style={{ color: "#8a8fa3" }}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </Field>

              {view === "login" && (
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={e => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded border-white/20"
                    style={{ accentColor: "#6366f1" }}
                  />
                  <span className="text-sm" style={{ color: "#8a8fa3" }}>Remember me</span>
                </label>
              )}

              <PrimaryBtn loading={loading}>
                {view === "login" ? "Sign in" : "Create account"}
              </PrimaryBtn>
            </form>

            {/* Divider */}
            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
              <span className="text-xs" style={{ color: "#8a8fa3" }}>
                {view === "login" ? "New to Westrade?" : "Already have an account?"}
              </span>
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
            </div>

            <button
              type="button"
              onClick={() => setView(view === "login" ? "register" : "login")}
              className="w-full h-11 rounded-xl text-sm font-medium transition-all hover:text-white"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#8a8fa3",
              }}
            >
              {view === "login" ? "Create an account" : "Sign in instead"}
            </button>
          </div>
        )}
      </div>

      {/* Feature pills */}
      {(view === "login" || view === "register") && (
        <div className="relative flex flex-wrap justify-center gap-2 mt-6 max-w-[420px]">
          {["AI-powered entries", "Kill switch protection", "Paper trade mode", "Live MT5 connection"].map(f => (
            <span key={f} className="text-xs px-3 py-1.5 rounded-full"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "#8a8fa3" }}>
              {f}
            </span>
          ))}
        </div>
      )}

      <p className="relative mt-6 text-xs" style={{ color: "#4a4f60" }}>© {new Date().getFullYear()} Westrade. All rights reserved.</p>
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-white/80">{label}</label>
      {children}
    </div>
  );
}

function PrimaryBtn({ children, loading, disabled }: { children: React.ReactNode; loading?: boolean; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="w-full h-11 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
      style={{
        background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
        boxShadow: loading || disabled ? "none" : "0 8px 24px -8px #6366f1bb",
      }}
    >
      {loading ? "Please wait…" : children}
    </button>
  );
}
