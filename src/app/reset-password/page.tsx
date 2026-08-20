"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useEffect, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, ChevronLeft, Code2, CheckCircle, AlertCircle, Loader2, Mail } from "lucide-react";

function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"loading" | "ready" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [userEmail, setUserEmail] = useState("");

  async function fetchUserEmail() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setUserEmail(user.email);
      }
    } catch {
      // Ignore
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function handleRecovery() {
      try {
        const url = new URL(window.location.href);
        const hashParams = new URLSearchParams(url.hash.substring(1));
        const code = url.searchParams.get("code");
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const errorDesc = hashParams.get("error_description") || url.searchParams.get("error_description");

        console.log("[Reset Password] URL params:", {
          code: !!code,
          accessToken: !!accessToken,
          refreshToken: !!refreshToken,
          errorDesc,
          hash: url.hash ? "present" : "none",
          search: url.search ? "present" : "none",
        });

        // Error from Supabase redirect
        if (errorDesc) {
          if (!cancelled) {
            setMode("error");
            setErrorMsg(decodeURIComponent(errorDesc));
          }
          return;
        }

        // PKCE code exchange
        if (code) {
          console.log("[Reset Password] Exchanging PKCE code...");
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (!cancelled) {
            if (exchangeError) {
              console.error("[Reset Password] Code exchange failed:", exchangeError.message);
              setMode("error");
              setErrorMsg("This reset link is invalid or has expired. Please request a new one.");
            } else {
              console.log("[Reset Password] Code exchange succeeded");
              setMode("ready");
              fetchUserEmail();
            }
          }
          window.history.replaceState({}, "", window.location.pathname);
          return;
        }

        // Hash fragment tokens (implicit flow)
        if (accessToken && refreshToken) {
          console.log("[Reset Password] Setting session from hash tokens...");
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!cancelled) {
            if (sessionError) {
              console.error("[Reset Password] setSession failed:", sessionError.message);
              setMode("error");
              setErrorMsg("This reset link is invalid or has expired. Please request a new one.");
            } else {
              console.log("[Reset Password] Session set from hash tokens");
              setMode("ready");
              fetchUserEmail();
            }
          }
          window.history.replaceState({}, "", window.location.pathname);
          return;
        }

        // Check if there's already a valid session (auto-detected or existing)
        const { data: { session } } = await supabase.auth.getSession();
        if (session && !cancelled) {
          console.log("[Reset Password] Existing session found");
          setMode("ready");
          if (session.user?.email) {
            setUserEmail(session.user.email);
          }
          return;
        }

        console.log("[Reset Password] Waiting for Supabase auto-detection...");
      } catch (err) {
        console.error("[Reset Password] Error:", err);
        if (!cancelled) {
          setMode("error");
          setErrorMsg("Something went wrong verifying your link. Please try again.");
        }
      }
    }

    // Listen for PASSWORD_RECOVERY / SIGNED_IN event from Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: string, session: any) => {
        console.log("[Reset Password] Auth state change:", event);
        if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
          if (!cancelled) {
            setMode("ready");
            if (session?.user?.email) {
              setUserEmail(session.user.email);
            }
            window.history.replaceState({}, "", window.location.pathname);
          }
        }
      }
    );

    handleRecovery();

    // Safety timeout
    const timeout = setTimeout(() => {
      if (!cancelled) {
        setMode((prev) => {
          if (prev === "loading") {
            setErrorMsg("Could not verify your reset link. Please request a new one from the login page.");
            return "error";
          }
          return prev;
        });
      }
    }, 6000);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { error: err } = await supabase.auth.updateUser({ password });

      if (err) {
        console.error("[Reset Password] updateUser failed:", err.message);
        setError(err.message || "Failed to update password. The link may have expired. Please request a new one.");
        setLoading(false);
        return;
      }

      // Sign out after password update so user explicitly logs in with new password
      await supabase.auth.signOut();
      setMode("success");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ct-dark flex items-center justify-center p-6 font-inter text-gray-200">
      <div className="fixed top-[30%] left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-[radial-gradient(ellipse,rgba(255,255,255,0.12)_0%,transparent_70%)] pointer-events-none" />

      <div className="w-full max-w-[440px] relative">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-gray-400 no-underline text-sm mb-8 hover:text-white transition-colors">
          <ChevronLeft size={16}/> Back to login
        </Link>

        <div className="glass-panel rounded-[24px] p-[36px_32px]">
          <div className="flex items-center gap-3 mb-7">
            <div className="w-[44px] h-[44px] rounded-xl bg-gradient-to-br from-white to-gray-300 flex items-center justify-center">
              <Code2 size={22} className="text-black"/>
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                {mode === "loading" ? "Verifying link..." : mode === "ready" ? "Set new password" : mode === "success" ? "Password updated" : "Invalid link"}
              </h1>
              <p className="text-ct-dim text-xs">
                {mode === "loading" ? "Please wait" : mode === "ready" ? "Enter your new password below" : mode === "success" ? "You can now sign in with your new password" : errorMsg || "This reset link is invalid or expired"}
              </p>
            </div>
          </div>

          {mode === "loading" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={28} className="text-white animate-spin" />
              <p className="text-xs text-gray-500">Verifying your reset link...</p>
            </div>
          )}

          {mode === "error" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center">
                <AlertCircle size={32} className="text-red-400" />
              </div>
              <p className="text-sm text-gray-400 text-center max-w-[300px]">
                {errorMsg || "This password reset link is invalid or has expired. Please request a new one."}
              </p>
              <Link href="/login"
                className="rounded-xl border border-white bg-white p-3 text-sm font-extrabold text-black no-underline hover:bg-gray-200 transition-colors text-center w-full block">
                Back to Sign In
              </Link>
            </div>
          )}

          {mode === "ready" && (
            <>
              {userEmail && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-xs text-gray-300">
                  <Mail size={15} className="text-gray-400 shrink-0" />
                  <span className="text-gray-400">Account:</span>
                  <span className="font-semibold text-white truncate">{userEmail}</span>
                </div>
              )}

              <form onSubmit={handleReset} className="flex flex-col gap-4">
                <div>
                  <label className="text-xs text-gray-400 font-semibold block mb-1.5">New Password</label>
                  <div className="relative">
                    <input value={password} onChange={e => setPassword(e.target.value)} type={showPw ? "text" : "password"} placeholder="••••••••" required autoFocus minLength={6}
                      className="w-full bg-[#111111] border border-ct-subtle rounded-xl p-[11px_44px_11px_14px] text-white text-sm outline-none focus:border-white transition-colors box-border"
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none text-gray-400 cursor-pointer hover:text-white">
                      {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-semibold block mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <input value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} type={showConfirmPw ? "text" : "password"} placeholder="••••••••" required minLength={6}
                      className="w-full bg-[#111111] border border-ct-subtle rounded-xl p-[11px_44px_11px_14px] text-white text-sm outline-none focus:border-white transition-colors box-border"
                    />
                    <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)} className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none text-gray-400 cursor-pointer hover:text-white">
                      {showConfirmPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>
                  </div>
                </div>

                {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-[10px_14px] text-red-400 text-xs">{error}</div>}

                <button type="submit" disabled={loading}
                  className="mt-1 rounded-xl border border-white bg-white p-3.5 text-sm font-extrabold text-black shadow-[0_0_18px_rgba(255,255,255,0.16)] transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? "Updating..." : "Update Password →"}
                </button>
              </form>
            </>
          )}

          {mode === "success" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
                <CheckCircle size={32} className="text-green-400" />
              </div>
              <p className="text-sm text-gray-400 text-center">
                Your password has been updated successfully.
              </p>
              <button onClick={() => router.push("/login")}
                className="rounded-xl border border-white bg-white p-3.5 text-sm font-extrabold text-black shadow-[0_0_18px_rgba(255,255,255,0.16)] transition-colors hover:bg-gray-200 cursor-pointer w-full">
                Sign In →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-ct-dark flex items-center justify-center">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-white animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
