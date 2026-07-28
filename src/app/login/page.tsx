"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, ChevronLeft, Code2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setError("Email and password are required.");
      setLoading(false);
      return;
    }

    const { error: err } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: cleanPassword });
    if (err) {
      setError("Wrong email or password. Please try again.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#080810", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Inter, sans-serif" }}>
      <div className="animate-pulse-glow" style={{ position: "fixed", top: "30%", left: "50%", transform: "translateX(-50%)", width: 400, height: 400, background: "radial-gradient(ellipse,rgba(124,58,237,0.15) 0%,transparent 70%)", pointerEvents: "none" }} />
      <div className="animate-float" style={{ position: "fixed", top: "20%", left: "30%", width: 200, height: 200, background: "radial-gradient(ellipse,rgba(96,165,250,0.1) 0%,transparent 70%)", pointerEvents: "none" }} />

      <div className="animate-scale-in" style={{ width: "100%", maxWidth: 440, position: "relative" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#555", textDecoration: "none", fontSize: 14, marginBottom: 32 }}>
          <ChevronLeft size={16}/> Back to home
        </Link>

        <div className="glass-panel" style={{ borderRadius: 24, padding: "36px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg,#7C3AED,#5b21b6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Code2 size={22} color="#fff"/>
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px" }}>Welcome back</h1>
              <p style={{ color: "#555", fontSize: 13 }}>Sign in to CodeTogether</p>
            </div>
          </div>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: "#666", fontWeight: 600, display: "block", marginBottom: 6 }}>Email Address</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com" required
                style={{ width: "100%", background: "#111", border: "1.5px solid #222", borderRadius: 10, padding: "11px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                onFocus={e => (e.target.style.borderColor = "#7C3AED")}
                onBlur={e => (e.target.style.borderColor = "#222")}
              />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: 12, color: "#666", fontWeight: 600 }}>Password</label>
                <span style={{ fontSize: 12, color: "#7C3AED", cursor: "pointer" }}>Forgot password?</span>
              </div>
              <div style={{ position: "relative" }}>
                <input value={password} onChange={e => setPassword(e.target.value)} type={showPw ? "text" : "password"} placeholder="••••••••" required
                  style={{ width: "100%", background: "#111", border: "1.5px solid #222", borderRadius: 10, padding: "11px 44px 11px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                  onFocus={e => (e.target.style.borderColor = "#7C3AED")}
                  onBlur={e => (e.target.style.borderColor = "#222")}
                />
                <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#555", cursor: "pointer" }}>
                  {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>

            {error && <div style={{ background: "#f4474714", border: "1px solid #f4474744", borderRadius: 8, padding: "10px 14px", color: "#f47", fontSize: 13 }}>{error}</div>}

            <button type="submit" disabled={loading}
              style={{ marginTop: 4, padding: 13, background: loading ? "#333" : "linear-gradient(135deg,#7C3AED,#5b21b6)", border: "none", borderRadius: 10, color: "#fff", fontSize: 15, fontWeight: 700, cursor: loading ? "default" : "pointer" }}>
              {loading ? "Signing in..." : "Sign In →"}
            </button>
          </form>

          <p style={{ textAlign: "center", color: "#555", fontSize: 13, marginTop: 20 }}>
            Don&apos;t have an account?{" "}
            <Link href="/signup" style={{ color: "#7C3AED", fontWeight: 700, textDecoration: "none" }}>Sign up free</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
