import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  TrendingUp,
  Brain,
  Shield,
  Activity,
  Zap,
  BarChart2,
  Bell,
  Check,
  ArrowRight,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Inject keyframe animation styles once ───────────────────────────────────
const GLOBAL_STYLES = `
@keyframes gradientMove {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(32px); }
  to   { opacity: 1; transform: translateY(0); }
}
.fade-in-up {
  opacity: 0;
  transform: translateY(32px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.fade-in-up.visible {
  opacity: 1;
  transform: translateY(0);
}
`;

function StyleInjector() {
  return <style dangerouslySetInnerHTML={{ __html: GLOBAL_STYLES }} />;
}

// ─── Hook: add .visible class via IntersectionObserver ───────────────────────
function useFadeInUp() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("visible");
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

// ─── Feature card with hover glow ────────────────────────────────────────────
interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: hovered
          ? "1px solid rgba(99,102,241,0.7)"
          : "1px solid rgba(255,255,255,0.08)",
        borderRadius: "16px",
        padding: "28px",
        cursor: "default",
        transform: hovered ? "translateY(-4px)" : "translateY(0)",
        boxShadow: hovered
          ? "0 0 28px rgba(99,102,241,0.25), 0 8px 32px rgba(0,0,0,0.4)"
          : "0 2px 12px rgba(0,0,0,0.2)",
        transition: "all 0.3s ease",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 48,
          height: 48,
          borderRadius: 12,
          background: "rgba(99,102,241,0.15)",
          marginBottom: 16,
        }}
      >
        {icon}
      </div>
      <h3 style={{ color: "#f1f5f9", fontWeight: 600, fontSize: "1.05rem", marginBottom: 8 }}>
        {title}
      </h3>
      <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.6 }}>{description}</p>
    </div>
  );
}

// ─── Pricing card ─────────────────────────────────────────────────────────────
interface PricingCardProps {
  name: string;
  price: string;
  period?: string;
  tagline: string;
  features: string[];
  cta: string;
  highlight?: boolean;
}

function PricingCard({
  name,
  price,
  period,
  tagline,
  features,
  cta,
  highlight = false,
}: PricingCardProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: highlight
          ? "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)"
          : "rgba(255,255,255,0.03)",
        border: highlight
          ? "1px solid rgba(99,102,241,0.6)"
          : hovered
          ? "1px solid rgba(99,102,241,0.5)"
          : "1px solid rgba(255,255,255,0.08)",
        borderRadius: 20,
        padding: "36px 28px",
        transform: hovered ? "translateY(-6px)" : "translateY(0)",
        boxShadow: hovered
          ? "0 0 32px rgba(99,102,241,0.2), 0 12px 40px rgba(0,0,0,0.4)"
          : highlight
          ? "0 0 24px rgba(99,102,241,0.15)"
          : "0 2px 12px rgba(0,0,0,0.2)",
        transition: "all 0.3s ease",
        flex: 1,
        minWidth: 0,
      }}
    >
      {highlight && (
        <div
          style={{
            position: "absolute",
            top: -14,
            left: "50%",
            transform: "translateX(-50%)",
            background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
            color: "#fff",
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "4px 14px",
            borderRadius: 999,
          }}
        >
          Most Popular
        </div>
      )}
      <div style={{ marginBottom: 8, color: "#94a3b8", fontSize: "0.85rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {name}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
        <span style={{ fontSize: "2.5rem", fontWeight: 800, color: "#f1f5f9" }}>{price}</span>
        {period && <span style={{ color: "#64748b", fontSize: "0.9rem" }}>{period}</span>}
      </div>
      <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: 24 }}>{tagline}</p>
      <hr style={{ borderColor: "rgba(255,255,255,0.07)", marginBottom: 24 }} />
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px 0", display: "flex", flexDirection: "column", gap: 12 }}>
        {features.map((f) => (
          <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 10, color: "#cbd5e1", fontSize: "0.875rem" }}>
            <Check size={15} style={{ color: "#6366f1", flexShrink: 0, marginTop: 2 }} />
            {f}
          </li>
        ))}
      </ul>
      <Link href="/login?mode=register">
        <Button
          className="w-full"
          variant={highlight ? "default" : "outline"}
          style={
            highlight
              ? { background: "linear-gradient(90deg,#6366f1,#8b5cf6)", border: "none", color: "#fff", fontWeight: 600 }
              : { borderColor: "rgba(99,102,241,0.5)", color: "#a5b4fc" }
          }
        >
          {cta}
        </Button>
      </Link>
    </div>
  );
}

// ─── Main Landing Page ────────────────────────────────────────────────────────
export default function LandingPage() {
  const featuresRef = useFadeInUp();
  const howItWorksRef = useFadeInUp();
  const pricingRef = useFadeInUp();

  return (
    <div style={{ background: "#0a0a0f", minHeight: "100vh", color: "#f1f5f9", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <StyleInjector />

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          background: "rgba(10,10,15,0.8)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 24px",
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Logo */}
          <Link href="/">
            <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", textDecoration: "none" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <TrendingUp size={18} color="#fff" />
              </div>
              <span style={{ fontWeight: 800, fontSize: "1.1rem", letterSpacing: "-0.02em", color: "#f1f5f9" }}>
                WESTRADE
              </span>
            </div>
          </Link>

          {/* Nav links */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/login">
              <span
                style={{
                  color: "#94a3b8",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  padding: "8px 16px",
                  borderRadius: 8,
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#f1f5f9")}
                onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "#94a3b8")}
              >
                Sign In
              </span>
            </Link>
            <Link href="/login?mode=register">
              <Button
                size="sm"
                style={{
                  background: "linear-gradient(90deg,#6366f1,#8b5cf6)",
                  border: "none",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  borderRadius: 8,
                  padding: "8px 20px",
                }}
              >
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "120px 24px 80px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Animated gradient background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 20% 50%, rgba(99,102,241,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.12) 0%, transparent 55%), radial-gradient(ellipse at 50% 80%, rgba(16,185,129,0.06) 0%, transparent 50%)",
            backgroundSize: "200% 200%",
            animation: "gradientMove 12s ease infinite",
            pointerEvents: "none",
          }}
        />
        {/* Noise texture overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E\")",
            pointerEvents: "none",
            opacity: 0.4,
          }}
        />

        <div style={{ position: "relative", maxWidth: 800 }}>
          {/* Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(99,102,241,0.12)",
              border: "1px solid rgba(99,102,241,0.3)",
              borderRadius: 999,
              padding: "6px 16px",
              fontSize: "0.8rem",
              color: "#a5b4fc",
              fontWeight: 500,
              marginBottom: 28,
              letterSpacing: "0.02em",
            }}
          >
            <Star size={13} fill="#a5b4fc" />
            Powered by Gemini AI
          </div>

          {/* Heading */}
          <h1
            style={{
              fontSize: "clamp(2.6rem, 7vw, 5rem)",
              fontWeight: 900,
              lineHeight: 1.08,
              letterSpacing: "-0.04em",
              marginBottom: 24,
              background: "linear-gradient(135deg, #f1f5f9 0%, #a5b4fc 50%, #8b5cf6 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Trade Smarter.
            <br />
            Not Harder.
          </h1>

          {/* Subheading */}
          <p
            style={{
              fontSize: "clamp(1rem, 2vw, 1.2rem)",
              color: "#94a3b8",
              lineHeight: 1.7,
              maxWidth: 620,
              margin: "0 auto 40px",
            }}
          >
            AI-powered algorithmic trading platform. Connect your MT5 account, deploy strategies,
            and let Gemini AI validate every trade in real-time.
          </p>

          {/* CTA buttons */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", marginBottom: 24 }}>
            <Link href="/login?mode=register">
              <Button
                size="lg"
                style={{
                  background: "linear-gradient(90deg,#6366f1,#8b5cf6)",
                  border: "none",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "1rem",
                  borderRadius: 12,
                  padding: "14px 32px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  boxShadow: "0 4px 24px rgba(99,102,241,0.4)",
                }}
              >
                Start for Free <ArrowRight size={18} />
              </Button>
            </Link>
            <Link href="/login">
              <Button
                size="lg"
                variant="outline"
                style={{
                  borderColor: "rgba(255,255,255,0.15)",
                  color: "#e2e8f0",
                  fontWeight: 600,
                  fontSize: "1rem",
                  borderRadius: 12,
                  padding: "14px 32px",
                  background: "rgba(255,255,255,0.04)",
                }}
              >
                Sign In
              </Button>
            </Link>
          </div>

          {/* Google sign-in */}
          <div style={{ marginBottom: 48 }}>
            <a href="/api/auth/google" style={{ textDecoration: "none" }}>
              <button
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 10,
                  padding: "11px 24px",
                  color: "#e2e8f0",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.2s, border-color 0.2s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.22)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.12)";
                }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                  <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
            </a>
          </div>

          {/* Stat pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
            {["99.9% Uptime", "< 2s Execution", "Gemini AI Powered"].map((stat) => (
              <div
                key={stat}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 999,
                  padding: "6px 16px",
                  fontSize: "0.82rem",
                  color: "#94a3b8",
                  fontWeight: 500,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#10b981",
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                {stat}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section style={{ padding: "100px 24px", maxWidth: 1200, margin: "0 auto" }}>
        <div ref={featuresRef} className="fade-in-up">
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <h2
              style={{
                fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                color: "#f1f5f9",
                marginBottom: 14,
              }}
            >
              Everything you need to trade smarter
            </h2>
            <p style={{ color: "#64748b", fontSize: "1.05rem", maxWidth: 520, margin: "0 auto" }}>
              A complete trading intelligence platform built for serious traders.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 20,
            }}
          >
            <FeatureCard
              icon={<Brain size={22} color="#a5b4fc" />}
              title="Gemini AI Validation"
              description="Every trade signal reviewed by Google's Gemini AI before execution — smarter entries, fewer mistakes."
            />
            <FeatureCard
              icon={<Shield size={22} color="#a5b4fc" />}
              title="Risk Engine"
              description="Kill switches, daily loss limits, session targets — full capital protection built into every trade."
            />
            <FeatureCard
              icon={<Activity size={22} color="#a5b4fc" />}
              title="Live Dashboard"
              description="Real-time positions, P&L, equity curve, and portfolio analytics in a single unified view."
            />
            <FeatureCard
              icon={<Zap size={22} color="#a5b4fc" />}
              title="MT5 Integration"
              description="Direct connection to MetaTrader 5 for live forex execution with sub-2-second latency."
            />
            <FeatureCard
              icon={<BarChart2 size={22} color="#a5b4fc" />}
              title="Deep Analytics"
              description="Sharpe ratio, drawdown analysis, strategy breakdowns and comprehensive backtesting reports."
            />
            <FeatureCard
              icon={<Bell size={22} color="#a5b4fc" />}
              title="Email Alerts"
              description="Instant notifications for kill switch triggers, profit targets reached, and new trade signals."
            />
          </div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────────────────── */}
      <section
        style={{
          padding: "100px 24px",
          background: "rgba(255,255,255,0.015)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div ref={howItWorksRef} className="fade-in-up" style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <h2
              style={{
                fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                color: "#f1f5f9",
                marginBottom: 14,
              }}
            >
              Up and running in minutes
            </h2>
            <p style={{ color: "#64748b", fontSize: "1.05rem" }}>Three simple steps to automated trading.</p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 32,
            }}
          >
            {[
              {
                step: "01",
                title: "Connect MT5",
                desc: "Link your MetaTrader 5 account using your broker credentials. We handle the rest securely.",
                icon: <Zap size={28} color="#6366f1" />,
              },
              {
                step: "02",
                title: "Configure Strategies",
                desc: "Pick from pre-built strategies or define your own rules, risk limits and session windows.",
                icon: <BarChart2 size={28} color="#6366f1" />,
              },
              {
                step: "03",
                title: "Let AI Trade",
                desc: "Gemini AI validates signals, the risk engine guards your capital, and trades execute automatically.",
                icon: <Brain size={28} color="#6366f1" />,
              },
            ].map(({ step, title, desc, icon }, i) => (
              <div key={step} style={{ textAlign: "center", padding: "0 16px" }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: "rgba(99,102,241,0.1)",
                    border: "1px solid rgba(99,102,241,0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 20px",
                  }}
                >
                  {icon}
                </div>
                <div
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    color: "#6366f1",
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  Step {step}
                </div>
                <h3 style={{ color: "#f1f5f9", fontWeight: 700, fontSize: "1.1rem", marginBottom: 10 }}>
                  {title}
                </h3>
                <p style={{ color: "#64748b", fontSize: "0.9rem", lineHeight: 1.65 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────────── */}
      <section style={{ padding: "100px 24px", maxWidth: 1200, margin: "0 auto" }}>
        <div ref={pricingRef} className="fade-in-up">
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <h2
              style={{
                fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                color: "#f1f5f9",
                marginBottom: 14,
              }}
            >
              Simple, transparent pricing
            </h2>
            <p style={{ color: "#64748b", fontSize: "1.05rem" }}>
              Start free. Upgrade when you're ready to go live.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 24,
              alignItems: "stretch",
              justifyContent: "center",
            }}
          >
            <PricingCard
              name="Starter"
              price="Free"
              tagline="Perfect for getting started"
              features={[
                "Dashboard access",
                "1 strategy",
                "Paper trading mode",
                "Basic analytics",
              ]}
              cta="Get Started Free"
            />
            <PricingCard
              name="Pro"
              price="$29"
              period="/mo"
              tagline="For active traders"
              features={[
                "Everything in Starter",
                "5 strategies",
                "Live MT5 trading",
                "Gemini AI validation",
                "Email alerts",
                "Priority support",
              ]}
              cta="Start Pro Trial"
              highlight
            />
            <PricingCard
              name="Elite"
              price="$99"
              period="/mo"
              tagline="For professional traders"
              features={[
                "Everything in Pro",
                "Unlimited strategies",
                "Multi-account support",
                "Advanced backtesting",
                "API access",
                "Dedicated support",
              ]}
              cta="Go Elite"
            />
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "32px 24px",
          textAlign: "center",
          color: "#475569",
          fontSize: "0.875rem",
        }}
      >
        © 2026 Westrade. All rights reserved.
      </footer>
    </div>
  );
}
