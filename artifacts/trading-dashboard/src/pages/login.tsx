import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { TrendingUp, Eye, EyeOff, ArrowLeft, Check, X } from "lucide-react";

type Screen = "login" | "register" | "enter-code" | "forgot";
type LoginTab = "password" | "email-code";
type CodeMode = "login" | "reset";

const api = (path: string, body: object) =>
  fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json().then((d) => ({ ok: r.ok, data: d })));

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Read query params on mount
  const [screen, setScreen] = useState<Screen>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") === "register") return "register";
    }
    return "login";
  });

  const [loginTab, setLoginTab] = useState<LoginTab>("password");
  const [codeMode, setCodeMode] = useState<CodeMode>("login");

  // Shared fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Login - password tab
  const [loginIdentifier, setLoginIdentifier] = useState("");

  // Email code tab
  const [codeSent, setCodeSent] = useState(false);

  // Register
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regShowPassword, setRegShowPassword] = useState(false);
  const [regPasswordTouched, setRegPasswordTouched] = useState(false);

  // Forgot password
  const [forgotEmail, setForgotEmail] = useState("");

  // Enter code
  const [pendingEmail, setPendingEmail] = useState("");
  const [codeDigits, setCodeDigits] = useState<string[]>(["", "", "", "", ""]);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Password requirements for register
  const reqs = [
    { label: "At least 8 characters", met: regPassword.length >= 8 },
    { label: "At least 1 capital letter", met: /[A-Z]/.test(regPassword) },
    { label: "At least 1 number", met: /[0-9]/.test(regPassword) },
    { label: "At least 1 special character", met: /[^A-Za-z0-9]/.test(regPassword) },
  ];
  const metCount = reqs.filter((r) => r.met).length;
  const strength = metCount <= 1 ? "weak" : metCount <= 3 ? "medium" : "strong";
  const strengthLabel = strength === "weak" ? "Weak" : strength === "medium" ? "Medium" : "Strong";
  const strengthColor =
    strength === "weak"
      ? "bg-red-500"
      : strength === "medium"
      ? "bg-amber-400"
      : "bg-green-500";

  // Focus first code input when entering code screen
  useEffect(() => {
    if (screen === "enter-code") {
      setTimeout(() => codeRefs.current[0]?.focus(), 100);
    }
  }, [screen]);

  // --- Handlers ---

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { ok, data } = await api("/api/auth/login", {
        username: loginIdentifier,
        password,
      });
      if (!ok) {
        toast({ title: "Error", description: data.error ?? "Invalid credentials", variant: "destructive" });
      } else {
        window.location.href = "/";
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSendEmailCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { ok, data } = await api("/api/auth/send-code", { email });
      if (!ok) {
        toast({ title: "Error", description: data.error ?? "Failed to send code", variant: "destructive" });
      } else {
        setCodeSent(true);
        setPendingEmail(email);
        setCodeMode("login");
        setCodeDigits(["", "", "", "", ""]);
        setScreen("enter-code");
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (metCount < 4) {
      toast({ title: "Error", description: "Password does not meet all requirements", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { ok, data } = await api("/api/auth/register", {
        username: regUsername,
        email: regEmail,
        password: regPassword,
      });
      if (!ok) {
        toast({ title: "Error", description: data.error ?? "Registration failed", variant: "destructive" });
      } else {
        toast({ title: "Account created!", description: "Please sign in." });
        setScreen("login");
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { ok, data } = await api("/api/auth/forgot-password", { email: forgotEmail });
      if (!ok) {
        toast({ title: "Error", description: data.error ?? "Failed to send reset code", variant: "destructive" });
      } else {
        setPendingEmail(forgotEmail);
        setCodeMode("reset");
        setCodeDigits(["", "", "", "", ""]);
        setScreen("enter-code");
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    const code = codeDigits.join("");
    if (code.length < 5) {
      toast({ title: "Error", description: "Please enter all 5 digits", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { ok, data } = await api("/api/auth/verify-code", {
        email: pendingEmail,
        code,
        mode: codeMode,
      });
      if (!ok) {
        toast({ title: "Error", description: data.error ?? "Invalid code", variant: "destructive" });
      } else {
        window.location.href = "/";
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    const endpoint = codeMode === "login" ? "/api/auth/send-code" : "/api/auth/forgot-password";
    const body = codeMode === "login" ? { email: pendingEmail } : { email: pendingEmail };
    try {
      const { ok, data } = await api(endpoint, body);
      if (!ok) {
        toast({ title: "Error", description: data.error ?? "Failed to resend", variant: "destructive" });
      } else {
        toast({ title: "Code resent!", description: "Check your inbox." });
        setCodeDigits(["", "", "", "", ""]);
        setTimeout(() => codeRefs.current[0]?.focus(), 100);
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    }
  }

  // OTP input handlers
  function handleCodeInput(index: number, value: string) {
    // Handle paste
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").slice(0, 5).split("");
      const newDigits = [...codeDigits];
      digits.forEach((d, i) => {
        if (index + i < 5) newDigits[index + i] = d;
      });
      setCodeDigits(newDigits);
      const nextFocus = Math.min(index + digits.length, 4);
      codeRefs.current[nextFocus]?.focus();
      return;
    }
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...codeDigits];
    newDigits[index] = digit;
    setCodeDigits(newDigits);
    if (digit && index < 4) {
      codeRefs.current[index + 1]?.focus();
    }
  }

  function handleCodeKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (codeDigits[index]) {
        const newDigits = [...codeDigits];
        newDigits[index] = "";
        setCodeDigits(newDigits);
      } else if (index > 0) {
        codeRefs.current[index - 1]?.focus();
      }
    }
  }

  // --- Render ---

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-card border border-border rounded-2xl shadow-xl p-6 sm:p-8 space-y-6">
          {/* Logo */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-primary">
              <TrendingUp size={30} />
              <span className="text-2xl font-bold tracking-widest text-foreground">WESTRADE</span>
            </div>
          </div>

          {/* LOGIN SCREEN */}
          {screen === "login" && (
            <div className="space-y-5">
              <h2 className="text-center text-lg font-semibold text-foreground">Sign in to your account</h2>

              {/* Tabs */}
              <div className="flex rounded-lg bg-muted p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setLoginTab("password")}
                  className={cn(
                    "flex-1 rounded-md py-1.5 text-sm font-medium transition-colors",
                    loginTab === "password"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Password
                </button>
                <button
                  type="button"
                  onClick={() => setLoginTab("email-code")}
                  className={cn(
                    "flex-1 rounded-md py-1.5 text-sm font-medium transition-colors",
                    loginTab === "email-code"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Email Code
                </button>
              </div>

              {loginTab === "password" ? (
                <form onSubmit={handlePasswordLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="login-identifier">Username or Email</Label>
                    <Input
                      id="login-identifier"
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      placeholder="username or you@example.com"
                      required
                      autoComplete="username"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-password">Password</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        autoComplete="current-password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setScreen("forgot")}
                        className="text-xs text-primary hover:underline underline-offset-4"
                      >
                        Forgot password?
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Signing in…" : "Sign In"}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleSendEmailCode} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email-code-email">Email</Label>
                    <Input
                      id="email-code-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                    />
                  </div>
                  {codeSent && (
                    <p className="text-sm text-green-500 flex items-center gap-1.5">
                      <Check size={14} /> Code sent! Check your inbox.
                    </p>
                  )}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Sending…" : "Send Code"}
                  </Button>
                </form>
              )}

              <p className="text-center text-sm text-muted-foreground">
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => setScreen("register")}
                  className="text-primary underline underline-offset-4 hover:no-underline"
                >
                  Sign up
                </button>
              </p>
            </div>
          )}

          {/* REGISTER SCREEN */}
          {screen === "register" && (
            <div className="space-y-5">
              <h2 className="text-center text-lg font-semibold text-foreground">Create an account</h2>
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-username">Username</Label>
                  <Input
                    id="reg-username"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="your_username"
                    required
                    minLength={3}
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="reg-password"
                      type={regShowPassword ? "text" : "password"}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      onBlur={() => setRegPasswordTouched(true)}
                      placeholder="At least 8 characters"
                      required
                      className="pr-10"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setRegShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {regShowPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {/* Live password requirements */}
                  {regPasswordTouched && (
                    <div className="mt-2 space-y-1">
                      {reqs.map((req) => {
                        const isDirtyAndUnmet = regPasswordTouched && !req.met;
                        return (
                          <div key={req.label} className="flex items-center gap-2 text-xs">
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full flex-shrink-0",
                                req.met
                                  ? "bg-green-500"
                                  : isDirtyAndUnmet
                                  ? "bg-red-500"
                                  : "bg-muted-foreground"
                              )}
                            />
                            <span
                              className={cn(
                                req.met
                                  ? "text-green-500"
                                  : isDirtyAndUnmet
                                  ? "text-red-500"
                                  : "text-muted-foreground"
                              )}
                            >
                              {req.label}
                            </span>
                          </div>
                        );
                      })}

                      {/* Password strength bar */}
                      <div className="mt-3 space-y-1">
                        <div className="flex gap-1">
                          {[0, 1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className={cn(
                                "h-1.5 flex-1 rounded-full transition-colors",
                                i < metCount ? strengthColor : "bg-muted"
                              )}
                            />
                          ))}
                        </div>
                        {regPassword.length > 0 && (
                          <p
                            className={cn(
                              "text-xs font-medium",
                              strength === "weak"
                                ? "text-red-500"
                                : strength === "medium"
                                ? "text-amber-400"
                                : "text-green-500"
                            )}
                          >
                            {strengthLabel}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creating account…" : "Create Account"}
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => setScreen("login")}
                  className="text-primary underline underline-offset-4 hover:no-underline"
                >
                  Sign in
                </button>
              </p>
            </div>
          )}

          {/* FORGOT PASSWORD SCREEN */}
          {screen === "forgot" && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setScreen("login")}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Back to login"
                >
                  <ArrowLeft size={18} />
                </button>
                <h2 className="text-lg font-semibold text-foreground">Reset password</h2>
              </div>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="forgot-email">Email</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                </div>
                <p className="text-xs text-muted-foreground">We'll send a 5-digit code to your email.</p>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sending…" : "Send Reset Code"}
                </Button>
              </form>
            </div>
          )}

          {/* ENTER CODE SCREEN */}
          {screen === "enter-code" && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setScreen("login")}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Back to login"
                >
                  <ArrowLeft size={18} />
                </button>
                <h2 className="text-lg font-semibold text-foreground">
                  {codeMode === "login" ? "Check your email" : "Reset your password"}
                </h2>
              </div>

              {pendingEmail && (
                <p className="text-sm text-muted-foreground text-center">
                  We sent a code to{" "}
                  <span className="text-foreground font-medium">{maskEmail(pendingEmail)}</span>
                </p>
              )}

              <form onSubmit={handleVerifyCode} className="space-y-5">
                {/* 5-digit OTP inputs */}
                <div className="flex justify-center gap-2 sm:gap-3">
                  {codeDigits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { codeRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={5}
                      value={digit}
                      onChange={(e) => handleCodeInput(i, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(i, e)}
                      onPaste={(e) => {
                        e.preventDefault();
                        const pasted = e.clipboardData.getData("text");
                        handleCodeInput(i, pasted);
                      }}
                      className={cn(
                        "w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-bold rounded-lg border",
                        "bg-background text-foreground border-border",
                        "focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary",
                        "transition-colors"
                      )}
                      style={{ width: "2.75rem", height: "3.25rem" }}
                    />
                  ))}
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Verifying…" : "Verify Code"}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground">
                Didn't receive it?{" "}
                <button
                  type="button"
                  onClick={handleResendCode}
                  className="text-primary underline underline-offset-4 hover:no-underline"
                >
                  Resend code
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
