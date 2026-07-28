"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { GraduationCap, BookOpen, Briefcase, Code2, Eye, EyeOff, ChevronLeft } from "lucide-react";

const ROLES = [
  { id: "student", label: "Student", icon: <GraduationCap size={22}/>, color: "#4ade80", desc: "Learning & joining sessions" },
  { id: "tutor", label: "Tutor", icon: <BookOpen size={22}/>, color: "#60a5fa", desc: "Hosting classes & mentoring" },
  { id: "business", label: "Business", icon: <Briefcase size={22}/>, color: "#c084fc", desc: "Teams & pair programming" },
  { id: "freelancer", label: "Freelancer", icon: <Code2 size={22}/>, color: "#f87171", desc: "Building client projects & services" },
];

function normalizeRole(value?: string | null) {
  const raw = (value || "").trim().toLowerCase();
  if (raw === "teacher" || raw === "tutor") return "tutor";
  if (raw === "youtube" || raw === "creator" || raw === "freelancer") return "freelancer";
  if (raw === "business") return "business";
  return "student";
}

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const defaultRole = normalizeRole(params?.get("role"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(defaultRole);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanName) {
      setError("Full name is required.");
      setLoading(false);
      return;
    }

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email address.");
      setLoading(false);
      return;
    }

    if (cleanPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cleanName, email: cleanEmail, password: cleanPassword, role }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const msg = payload.error || "Could not create account.";
      setError(msg);
      setLoading(false);
      return;
    }

    const signInResult = await supabase.auth.signInWithPassword({ email: cleanEmail, password: cleanPassword });
    if (signInResult.error) {
      setError("Account created, but sign-in failed. Please try logging in manually.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  }

  const selectedRole = ROLES.find(r => r.id === role) || ROLES[0];

  return (
    <div style={{ minHeight: "100vh", background: "#080810", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "Inter, sans-serif" }}>
      {/* Glow */}
      <div className="animate-pulse-glow" style={{ position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)", width: 500, height: 500, background: `radial-gradient(ellipse, ${selectedRole.color}12 0%, transparent 70%)`, pointerEvents: "none", transition: "all 0.5s" }} />
      <div className="animate-float" style={{ position: "fixed", top: "30%", left: "20%", width: 250, height: 250, background: `radial-gradient(ellipse, ${selectedRole.color}0A 0%, transparent 70%)`, pointerEvents: "none" }} />

      <div className="animate-scale-in" style={{ width: "100%", maxWidth: 500, position: "relative" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#555", textDecoration: "none", fontSize: 14, marginBottom: 32 }}>
          <ChevronLeft size={16}/> Back to home
        </Link>

        <div className="glass-panel" style={{ borderRadius: 24, padding: "36px 32px" }}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px" }}>Create your account</h1>
            <p style={{ color: "#666", fontSize: 14, marginTop: 6 }}>Join CodeTogether — free forever for core features</p>
          </div>

          {/* Role selector */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 11, color: "#666", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 10 }}>I am a...</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {ROLES.map(r => (
                <button key={r.id} onClick={() => setRole(r.id)} type="button"
                  style={{ padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${role === r.id ? r.color : "#222"}`, background: role === r.id ? r.color + "18" : "#111", cursor: "pointer", textAlign: "left", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: r.color }}>{r.icon}</span>
                  <div>
                    <div style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{r.label}</div>
                    <div style={{ color: "#555", fontSize: 11 }}>{r.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: "#666", fontWeight: 600, display: "block", marginBottom: 6 }}>Full Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Ramji Kumar" required
                style={{ width: "100%", background: "#111", border: "1.5px solid #222", borderRadius: 10, padding: "11px 14px", color: "#fff", fontSize: 14, outline: "none", transition: "border 0.2s", boxSizing: "border-box" }}
                onFocus={e => (e.target.style.borderColor = selectedRole.color)}
                onBlur={e => (e.target.style.borderColor = "#222")}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#666", fontWeight: 600, display: "block", marginBottom: 6 }}>Email Address</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com" required
                style={{ width: "100%", background: "#111", border: "1.5px solid #222", borderRadius: 10, padding: "11px 14px", color: "#fff", fontSize: 14, outline: "none", transition: "border 0.2s", boxSizing: "border-box" }}
                onFocus={e => (e.target.style.borderColor = selectedRole.color)}
                onBlur={e => (e.target.style.borderColor = "#222")}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#666", fontWeight: 600, display: "block", marginBottom: 6 }}>Password</label>
              <div style={{ position: "relative" }}>
                <input value={password} onChange={e => setPassword(e.target.value)} type={showPw ? "text" : "password"} placeholder="Min 8 characters" required minLength={8}
                  style={{ width: "100%", background: "#111", border: "1.5px solid #222", borderRadius: 10, padding: "11px 44px 11px 14px", color: "#fff", fontSize: 14, outline: "none", transition: "border 0.2s", boxSizing: "border-box" }}
                  onFocus={e => (e.target.style.borderColor = selectedRole.color)}
                  onBlur={e => (e.target.style.borderColor = "#222")}
                />
                <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#555", cursor: "pointer" }}>
                  {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>

            {error && <div style={{ background: "#f4474714", border: "1px solid #f4474744", borderRadius: 8, padding: "10px 14px", color: "#f47", fontSize: 13 }}>{error}</div>}

            <button type="submit" disabled={loading}
              style={{ marginTop: 4, padding: "13px", background: loading ? "#333" : `linear-gradient(135deg,#7C3AED,#5b21b6)`, border: "none", borderRadius: 10, color: "#fff", fontSize: 15, fontWeight: 700, cursor: loading ? "default" : "pointer", transition: "all 0.2s" }}>
              {loading ? "Creating account..." : `Continue as ${selectedRole.label} →`}
            </button>
          </form>

          <p style={{ textAlign: "center", color: "#555", fontSize: 13, marginTop: 20 }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: selectedRole.color, fontWeight: 700, textDecoration: "none" }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return <Suspense><SignupForm /></Suspense>;
}
