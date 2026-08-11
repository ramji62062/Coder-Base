"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { GraduationCap, BookOpen, Briefcase, Code2, Eye, EyeOff, ChevronLeft } from "lucide-react";

const ROLES = [
  { id: "student", label: "Student", icon: <GraduationCap size={22}/>, desc: "Learning & joining sessions" },
  { id: "tutor", label: "Tutor", icon: <BookOpen size={22}/>, desc: "Hosting classes & mentoring" },
  { id: "business", label: "Business", icon: <Briefcase size={22}/>, desc: "Teams & pair programming" },
  { id: "freelancer", label: "Freelancer", icon: <Code2 size={22}/>, desc: "Building client projects & services" },
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
    <div className="min-h-screen bg-ct-dark flex items-center justify-center p-6 font-inter text-gray-200">
      {/* Glow */}
      <div className="animate-pulse-glow fixed top-[20%] left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-[radial-gradient(ellipse,rgba(255,255,255,0.12)_0%,transparent_70%)] pointer-events-none" />
      <div className="animate-float fixed top-[30%] left-[20%] w-[250px] h-[250px] bg-[radial-gradient(ellipse,rgba(200,200,200,0.08)_0%,transparent_70%)] pointer-events-none" />

      <div className="animate-scale-in w-full max-w-[500px] relative">
        <Link href="/" className="inline-flex items-center gap-1.5 text-gray-400 no-underline text-sm mb-8 hover:text-white transition-colors">
          <ChevronLeft size={16}/> Back to home
        </Link>

        <div className="glass-panel rounded-[24px] p-[36px_32px]">
          <div className="mb-7">
            <h1 className="text-3xl font-black text-white tracking-tight">Create your account</h1>
            <p className="text-ct-dim text-sm mt-1.5">Join CodeTogether — free forever for core features</p>
          </div>

          {/* Role selector */}
          <div className="mb-6">
            <label className="text-[11px] text-gray-400 font-bold uppercase tracking-wider block mb-2.5">I am a...</label>
            <div className="grid grid-cols-2 gap-2.5">
              {ROLES.map(r => (
                <button key={r.id} onClick={() => setRole(r.id)} type="button"
                  className={`p-[12px_14px] rounded-xl border text-left transition-colors cursor-pointer flex items-center gap-2.5 ${
                    role === r.id ? "border-white bg-white/10" : "border-ct-subtle bg-[#111111] hover:border-gray-500"
                  }`}>
                  <span className="text-white">{r.icon}</span>
                  <div>
                    <div className="text-white text-xs font-bold">{r.label}</div>
                    <div className="text-ct-dimmer text-[11px]">{r.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSignup} className="flex flex-col gap-3.5">
            <div>
              <label className="text-xs text-gray-400 font-semibold block mb-1.5">Full Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Ramji Kumar" required
                className="w-full bg-[#111111] border border-ct-subtle rounded-xl p-[11px_14px] text-white text-sm outline-none focus:border-white transition-colors box-border"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-semibold block mb-1.5">Email Address</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com" required
                className="w-full bg-[#111111] border border-ct-subtle rounded-xl p-[11px_14px] text-white text-sm outline-none focus:border-white transition-colors box-border"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-semibold block mb-1.5">Password</label>
              <div className="relative">
                <input value={password} onChange={e => setPassword(e.target.value)} type={showPw ? "text" : "password"} placeholder="Min 8 characters" required minLength={8}
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
              {loading ? "Creating account..." : `Continue as ${selectedRole.label} →`}
            </button>
          </form>

          <p className="text-center text-ct-dim text-xs mt-5">
            Already have an account?{" "}
            <Link href="/login" className="text-white font-bold no-underline hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return <Suspense><SignupForm /></Suspense>;
}
