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
    <div className="min-h-screen bg-ct-dark flex items-center justify-center p-6 font-inter text-gray-200">
      <div className="animate-pulse-glow fixed top-[30%] left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-[radial-gradient(ellipse,rgba(255,255,255,0.12)_0%,transparent_70%)] pointer-events-none" />
      <div className="animate-float fixed top-[20%] left-[30%] w-[200px] h-[200px] bg-[radial-gradient(ellipse,rgba(200,200,200,0.08)_0%,transparent_70%)] pointer-events-none" />

      <div className="animate-scale-in w-full max-w-[440px] relative">
        <Link href="/" className="inline-flex items-center gap-1.5 text-gray-400 no-underline text-sm mb-8 hover:text-white transition-colors">
          <ChevronLeft size={16}/> Back to home
        </Link>

        <div className="glass-panel rounded-[24px] p-[36px_32px]">
          <div className="flex items-center gap-3 mb-7">
            <div className="w-[44px] h-[44px] rounded-xl bg-gradient-to-br from-white to-gray-300 flex items-center justify-center">
              <Code2 size={22} className="text-black"/>
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">Welcome back</h1>
              <p className="text-ct-dim text-xs">Sign in to CodeTogether</p>
            </div>
          </div>

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
                <span className="text-xs text-gray-300 hover:text-white cursor-pointer transition-colors">Forgot password?</span>
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
              className="mt-1 p-3.5 bg-gradient-to-br from-white to-gray-300 border-none rounded-xl text-black text-sm font-extrabold cursor-pointer hover:bg-gray-200 transition-colors disabled:opacity-50">
              {loading ? "Signing in..." : "Sign In →"}
            </button>
          </form>

          <p className="text-center text-ct-dim text-xs mt-5">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-white font-bold no-underline hover:underline">Sign up free</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
