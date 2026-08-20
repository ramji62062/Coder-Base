"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, ChevronLeft, Code2, Mail, ArrowLeft, CheckCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [mode, setMode] = useState<"login" | "forgot" | "sent">("login");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");

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

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    setForgotError("");
    setForgotLoading(true);

    const cleanEmail = forgotEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setForgotError("Please enter your email address.");
      setForgotLoading(false);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setForgotError("Please enter a valid email address.");
      setForgotLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        setForgotError(data.error || "Could not send reset email. Please try again.");
        setForgotLoading(false);
        return;
      }

      setMode("sent");
    } catch (err) {
      console.error("[Forgot Password] Network error:", err);
      setForgotError("Network error. Please check your connection and try again.");
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ct-dark flex items-center justify-center p-6 font-inter text-gray-200">
      <div className="fixed top-[30%] left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-[radial-gradient(ellipse,rgba(255,255,255,0.12)_0%,transparent_70%)] pointer-events-none" />
      <div className="fixed top-[20%] left-[30%] w-[200px] h-[200px] bg-[radial-gradient(ellipse,rgba(200,200,200,0.08)_0%,transparent_70%)] pointer-events-none" />

      <div className="w-full max-w-[440px] relative">
        <Link href="/" className="inline-flex items-center gap-1.5 text-gray-400 no-underline text-sm mb-8 hover:text-white transition-colors">
          <ChevronLeft size={16}/> Back to home
        </Link>

        <div className="glass-panel rounded-[24px] p-[36px_32px]">
          <div className="flex items-center gap-3 mb-7">
            <div className="w-[44px] h-[44px] rounded-xl bg-gradient-to-br from-white to-gray-300 flex items-center justify-center">
              <Code2 size={22} className="text-black"/>
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                {mode === "login" ? "Welcome back" : mode === "forgot" ? "Reset password" : "Check your email"}
              </h1>
              <p className="text-ct-dim text-xs">
                {mode === "login" ? "Sign in to CodeTogether" : mode === "forgot" ? "We'll send you a reset link" : "We sent a link to your inbox"}
              </p>
            </div>
          </div>

          {mode === "login" && (
            <>
              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <div>
                  <label className="text-xs text-gray-400 font-semibold block mb-1.5">Email Address</label>
                  <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com" required
                    className="w-full bg-[#111111] border border-ct-subtle rounded-xl p-[11px_14px] text-white text-sm outline-none focus:border-white transition-colors box-border"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs text-gray-400 font-semibold">Password</label>
                    <button type="button" onClick={() => { setMode("forgot"); setForgotEmail(email); }} className="text-xs text-gray-300 hover:text-white cursor-pointer transition-colors bg-transparent border-none p-0">
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input value={password} onChange={e => setPassword(e.target.value)} type={showPw ? "text" : "password"} placeholder="••••••••" required
                      className="w-full bg-[#111111] border border-ct-subtle rounded-xl p-[11px_44px_11px_14px] text-white text-sm outline-none focus:border-white transition-colors box-border"
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none text-gray-400 cursor-pointer hover:text-white">
                      {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>
                  </div>
                </div>

                {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-[10px_14px] text-red-400 text-xs">{error}</div>}

                <button type="submit" disabled={loading}
                  className="mt-1 rounded-xl border border-white bg-white p-3.5 text-sm font-extrabold text-black shadow-[0_0_18px_rgba(255,255,255,0.16)] transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? "Signing in..." : "Sign In →"}
                </button>
              </form>

              <p className="text-center text-ct-dim text-xs mt-5">
                Don&apos;t have an account?{" "}
                <Link href="/signup" className="text-white font-bold no-underline hover:underline">Sign up free</Link>
              </p>
            </>
          )}

          {mode === "forgot" && (
            <>
              <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
                <div>
                  <label className="text-xs text-gray-400 font-semibold block mb-1.5">Email Address</label>
                  <input value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} type="email" placeholder="you@example.com" required autoFocus
                    className="w-full bg-[#111111] border border-ct-subtle rounded-xl p-[11px_14px] text-white text-sm outline-none focus:border-white transition-colors box-border"
                  />
                </div>

                {forgotError && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-[10px_14px] text-red-400 text-xs">{forgotError}</div>}

                <button type="submit" disabled={forgotLoading}
                  className="mt-1 rounded-xl border border-white bg-white p-3.5 text-sm font-extrabold text-black shadow-[0_0_18px_rgba(255,255,255,0.16)] transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60">
                  {forgotLoading ? "Sending link..." : "Send Reset Link →"}
                </button>
              </form>

              <button onClick={() => setMode("login")} className="mt-5 w-full text-center text-xs text-gray-400 hover:text-white cursor-pointer transition-colors bg-transparent border-none flex items-center justify-center gap-1.5">
                <ArrowLeft size={14}/> Back to sign in
              </button>
            </>
          )}

          {mode === "sent" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
                <CheckCircle size={32} className="text-green-400" />
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-300 mb-1">We sent a password reset link to</p>
                <p className="text-sm text-white font-bold">{forgotEmail}</p>
              </div>
              <p className="text-xs text-gray-500 text-center max-w-[280px]">
                Click the link in the email to reset your password. The link expires in 1 hour.
              </p>
              <div className="flex flex-col gap-2 w-full mt-2">
                <button onClick={() => { setMode("login"); setEmail(forgotEmail); }}
                  className="rounded-xl border border-white bg-white p-3 text-sm font-extrabold text-black hover:bg-gray-200 transition-colors cursor-pointer">
                  Back to Sign In
                </button>
                <button onClick={() => { setMode("forgot"); setForgotError(""); }}
                  className="text-xs text-gray-400 hover:text-white cursor-pointer transition-colors bg-transparent border-none p-2">
                  Didn&apos;t receive it? Try again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
