"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getInitials } from "@/lib/utils";

type NavUser = {
  id: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
};

export default function Navbar() {
  const router = useRouter();
  const [user, setUser] = useState<NavUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;
      if (!session?.user) {
        setUser(null);
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("users")
        .select("id, name, avatar_url, email")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!mounted) return;
      setUser({
        id: session.user.id,
        email: session.user.email ?? null,
        name: profile?.name ?? null,
        avatar_url: profile?.avatar_url ?? null,
      });
      setLoading(false);
    }

    loadSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      loadSession();
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const displayName = useMemo(() => user?.name || user?.email || "User", [user]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
      <Link href="/" className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">
        CodeTogether
      </Link>

      {loading ? (
        <div className="h-9 w-28 animate-pulse rounded-lg bg-[#171717]" />
      ) : user ? (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2a2a2a] text-xs font-bold text-[#c4b5fd]">
            {getInitials(displayName)}
          </div>
          <Link
            href="/dashboard"
            className="rounded-lg border border-white/60 px-3 py-2 text-sm text-white transition hover:border-white hover:bg-white/10"
          >
            Dashboard
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-gray-200"
          >
            Logout
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-lg border border-transparent px-4 py-2 text-sm text-gray-200 transition-all duration-200 hover:border-white hover:text-white"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:bg-gray-200"
          >
            Sign Up
          </Link>
        </div>
      )}
    </header>
  );
}
