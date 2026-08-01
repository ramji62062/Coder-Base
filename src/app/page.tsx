"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  Code2, Users, Zap, Play, Monitor, BookOpen, Tv, Briefcase,
  GraduationCap, ChevronRight, Star, Globe, Layers, Terminal,
  GitBranch, Video, MessageSquare, ArrowRight, CheckCircle2, Menu, X
} from "lucide-react";

const FEATURES = [
  { icon: <Code2 size={22}/>, title: "Monaco Editor", desc: "Full VS Code editor with syntax highlighting, IntelliSense & multi-file tabs." },
  { icon: <Users size={22}/>, title: "Real-time Collaboration", desc: "Live cursor sync, presence indicators, and instant code sharing via Supabase." },
  { icon: <Video size={22}/>, title: "Video & Audio", desc: "Built-in WebRTC video calls and screen share, powered by this project." },
  { icon: <Terminal size={22}/>, title: "Interactive Terminal", desc: "Run code live in an xterm.js terminal. Python, JS, Java, C++ & more." },
  { icon: <GitBranch size={22}/>, title: "Multi-file Projects", desc: "Full VS Code-style file explorer with folders, rename, drag-drop." },
  { icon: <Zap size={22}/>, title: "AI Code Assistant", desc: "Claude-powered AI that explains, debugs, and optimizes your code in real time." },
];

const ACCOUNT_TYPES = [
  { id: "student", icon: <GraduationCap size={28}/>, label: "Student", color: "#4ade80", bg: "#4ade8015",
    desc: "Join live sessions, learn from peers & instructors.", perks: ["Join unlimited rooms","Real-time code sync","AI explanations","Download session notes"] },
  { id: "teacher", icon: <BookOpen size={28}/>, label: "Teacher", color: "#60a5fa", bg: "#60a5fa15",
    desc: "Host sessions, manage classrooms & publish content.", perks: ["Create 250-seat rooms","Session timer & lifecycle","Teacher notes system","Whiteboard & annotations"] },
  { id: "youtube", icon: <Tv size={28}/>, label: "YouTuber / Creator", color: "#f87171", bg: "#f8717115",
    desc: "Stream coding sessions and grow your audience.", perks: ["Sharable short codes","Live viewer mode","Record-ready layout","Audience join links"] },
  { id: "business", icon: <Briefcase size={28}/>, label: "Business / Team", color: "#c084fc", bg: "#c084fc15",
    desc: "Pair-program, review PRs, onboard engineers fast.", perks: ["Unlimited workspaces","Role-based access","Private rooms","Team analytics"] },
];

const HOW_IT_WORKS = [
  { step: "01", title: "Create your account", desc: "Sign up as Student, Teacher, Creator, or Business. Setup takes under 60 seconds." },
  { step: "02", title: "Open a workspace", desc: "Create a new room or join with a 6-letter code shared by your host." },
  { step: "03", title: "Code together", desc: "Edit in real time, run code, draw on the whiteboard, and video-call — all in one window." },
];

const TESTIMONIALS = [
  { name: "Priya S.", role: "CS Student", avatar: "P", quote: "CodeTogether replaced my screen-share setup completely. My study group lives in it now." },
  { name: "Arjun M.", role: "Coding Instructor", avatar: "A", quote: "The whiteboard + session timer combo is exactly what I needed for live classes. Game-changer." },
  { name: "Dev K.", role: "Tech YouTuber", avatar: "D", quote: "My viewers can follow along and even join my room. Engagement went through the roof." },
];

export default function Home() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [authUser, setAuthUser] = useState<any>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll);
    supabase.auth.getSession().then(({ data }) => setAuthUser(data.session?.user ?? null));
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function handleJoin() {
    const code = roomCode.trim().toUpperCase();
    if (!code) { setJoinError("Enter a room code"); return; }
    setJoining(true); setJoinError("");
    const { data } = await supabase.from("rooms").select("id, is_active").eq("room_code", code).maybeSingle();
    if (data?.is_active === false) { setJoinError("This session has ended. Ask the owner to create a new room."); setJoining(false); }
    else if (data) router.push(`/room/${data.id}`);
    else { setJoinError("Room not found. Check the code."); setJoining(false); }
  }

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080810", color: "#e0e0e0", fontFamily: "Inter, sans-serif", overflowX: "hidden" }}>

      {/* ── NAVBAR ── */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000,
        background: scrolled ? "rgba(8,8,16,0.85)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.05)" : "1px solid transparent",
        transition: "all 0.3s", padding: "0 24px",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ fontSize: 22, fontWeight: 900, color: "#7C3AED", textDecoration: "none", letterSpacing: "-0.5px" }}>
            Code<span style={{ color: "#c4b5fd" }}>Together</span>
          </Link>
          {/* Desktop nav */}
          <nav style={{ display: "flex", gap: 28, alignItems: "center" }} className="desk-nav">
            {["features","how-it-works","account-types","testimonials"].map((id) => (
              <button key={id} onClick={() => scrollTo(id)} style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: 14, textTransform: "capitalize" }}>
                {id.replace(/-/g, " ")}
              </button>
            ))}
          </nav>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {authUser ? (
              <Link href="/dashboard" style={{ padding: "8px 18px", background: "#7C3AED", borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
                Dashboard →
              </Link>
            ) : (
              <>
                <Link href="/login" style={{ padding: "8px 16px", border: "1px solid #333", borderRadius: 8, color: "#ccc", fontSize: 14, textDecoration: "none" }}>Login</Link>
                <Link href="/signup" style={{ padding: "8px 18px", background: "#7C3AED", borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>Get Started</Link>
              </>
            )}
            <button onClick={() => setMenuOpen(!menuOpen)} className="mob-menu-btn" style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", display: "none" }}>
              {menuOpen ? <X size={22}/> : <Menu size={22}/>}
            </button>
          </div>
        </div>
        {/* Mobile menu */}
        {menuOpen && (
          <div style={{ background: "#0d0d1a", borderTop: "1px solid #222", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
            {["features","how-it-works","account-types","testimonials"].map(id => (
              <button key={id} onClick={() => scrollTo(id)} style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", textAlign: "left", fontSize: 15, textTransform: "capitalize" }}>
                {id.replace(/-/g, " ")}
              </button>
            ))}
            <Link href="/login" style={{ color: "#ccc", textDecoration: "none" }}>Login</Link>
            <Link href="/signup" style={{ color: "#c4b5fd", fontWeight: 700, textDecoration: "none" }}>Get Started →</Link>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "100px 24px 80px", position: "relative", overflow: "hidden" }}>
        {/* Glow bg */}
        <div className="animate-pulse-glow" style={{ position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)", width: 600, height: 600, background: "radial-gradient(ellipse, rgba(124,58,237,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div className="animate-float" style={{ position: "absolute", top: "30%", left: "20%", width: 300, height: 300, background: "radial-gradient(ellipse, rgba(96,165,250,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div className="animate-slide-up" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#7C3AED15", border: "1px solid #7C3AED44", borderRadius: 999, padding: "6px 16px", fontSize: 12, color: "#c4b5fd", marginBottom: 28, fontWeight: 600 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7C3AED", display: "inline-block" }} />
          Code together Live — Whiteboard · AI Assistant · Session Timer
        </div>

        <h1 className="animate-slide-up delay-100" style={{ fontSize: "clamp(36px, 7vw, 72px)", fontWeight: 900, lineHeight: 1.08, letterSpacing: "-2px", maxWidth: 820, marginBottom: 24 }}>
           Real-Time Code Collaboration<br/>
          <span style={{ background: "linear-gradient(135deg,#7C3AED,#60a5fa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Code together instantly.
          </span>
        </h1>

        <p className="animate-slide-up delay-200" style={{ fontSize: "clamp(15px, 2vw, 19px)", color: "#888", maxWidth: 600, lineHeight: 1.7, marginBottom: 44 }}>
          Real-time code editor, video calls, interactive terminal, whiteboard, and AI assistant — all in one browser tab. No setup. No installs.
        </p>

        <div className="animate-slide-up delay-300" style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", marginBottom: 40 }}>
          <Link href="/signup" style={{ padding: "14px 32px", background: "linear-gradient(135deg,#7C3AED,#5b21b6)", borderRadius: 12, color: "#fff", fontSize: 16, fontWeight: 700, textDecoration: "none", boxShadow: "0 0 40px rgba(124,58,237,0.35)", display: "inline-flex", alignItems: "center", gap: 8 }}>
            Start for Free 
            <ArrowRight size={18}/>
          </Link>
          <button onClick={() => scrollTo("how-it-works")} style={{ padding: "14px 28px", background: "transparent", border: "1px solid #333", borderRadius: 12, color: "#ccc", fontSize: 16, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Play size={16}/> See how it works
          </button>
        </div>

        {/* Room join */}
        <div className="glass-panel animate-scale-in delay-400 hover-card-glow" style={{ borderRadius: 16, padding: 20, maxWidth: 480, width: "100%" }}>
          <p style={{ fontSize: 13, color: "#555", marginBottom: 12 }}>Have a room code? Join instantly:</p>
          <div style={{ display: "flex", gap: 10 }}>
            <input value={roomCode} onChange={e => { setRoomCode(e.target.value.toUpperCase()); setJoinError(""); }}
              onKeyDown={e => e.key === "Enter" && handleJoin()}
              placeholder="Enter code e.g. XK9P2M"
              style={{ flex: 1, background: "#1a1a2e", border: "1px solid #333", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 14, outline: "none", letterSpacing: 2, fontWeight: 700, textTransform: "uppercase" }}
            />
            <button onClick={handleJoin} disabled={joining}
              style={{ padding: "10px 20px", background: "#7C3AED", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
              {joining ? "..." : "Join →"}
            </button>
          </div>
          {joinError && <p style={{ color: "#f47", fontSize: 12, marginTop: 8 }}>{joinError}</p>}
        </div>

        {/* Trust bar */}
        <div style={{ marginTop: 64, display: "flex", gap: 40, flexWrap: "wrap", justifyContent: "center", opacity: 0.5 }}>
          {["🖥 Interactive Terminal"," Realtime"," 🎥 Built-in Video Calls"," 🤖 AI Coding Assistant","xterm.js"].map(t => (
            <span key={t} style={{ fontSize: 12, color: "#888" }}>{t}</span>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: "100px 24px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <h2 className="animate-slide-up" style={{ fontSize: "clamp(28px,5vw,48px)", fontWeight: 900, letterSpacing: "-1px" }}>Everything you need to code together</h2>
          <p className="animate-slide-up delay-100" style={{ color: "#666", marginTop: 14, fontSize: 17 }}>No tabs switching. No plugins. Everything ships in one room.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 20 }}>
          {FEATURES.map((f, i) => (
            <div key={i} className="animate-slide-up hover-card-glow" style={{ animationDelay: `${200 + i * 50}ms`, background: "#0d0d1a", border: "1px solid #1a1a2e", borderRadius: 16, padding: 28 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "#7C3AED18", display: "flex", alignItems: "center", justifyContent: "center", color: "#c4b5fd", marginBottom: 16 }}>{f.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: "#666", lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={{ padding: "100px 24px", background: "#0a0a14" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <h2 className="animate-slide-up" style={{ fontSize: "clamp(28px,5vw,48px)", fontWeight: 900, letterSpacing: "-1px", marginBottom: 14 }}>Up and running in 3 steps</h2>
          <p className="animate-slide-up delay-100" style={{ color: "#666", fontSize: 17, marginBottom: 64 }}>Seriously — under a minute from signup to coding together.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 32 }}>
            {HOW_IT_WORKS.map((s, i) => (
              <div key={i} className="animate-slide-up hover-card-glow" style={{ animationDelay: `${200 + i * 100}ms`, textAlign: "left", position: "relative", background: "#10101d", padding: "24px", borderRadius: 16, border: "1px solid #1a1a2e" }}>
                <div style={{ fontSize: 48, fontWeight: 900, color: "#7C3AED20", lineHeight: 1, marginBottom: 12 }}>{s.step}</div>
                <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>{s.title}</h3>
                <p style={{ color: "#666", fontSize: 14, lineHeight: 1.8 }}>{s.desc}</p>
                {i < 2 && <div style={{ position: "absolute", top: 28, right: -20, color: "#333", fontSize: 24 }}>→</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ACCOUNT TYPES ── */}
      <section id="account-types" style={{ padding: "100px 24px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <h2 className="animate-slide-up" style={{ fontSize: "clamp(28px,5vw,48px)", fontWeight: 900, letterSpacing: "-1px" }}>Built for every kind of coder</h2>
          <p className="animate-slide-up delay-100" style={{ color: "#666", marginTop: 14, fontSize: 17 }}>Pick your account type — your dashboard and features adapt to you.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 20 }}>
          {ACCOUNT_TYPES.map((a, i) => (
            <Link key={a.id} href={`/signup?role=${a.id}`} style={{ textDecoration: "none", display: "block" }}>
              <div className="animate-slide-up hover-card-glow" style={{ animationDelay: `${200 + i * 50}ms`, background: a.bg, border: `1px solid ${a.color}30`, borderRadius: 20, padding: 28, height: "100%" }}>
                <div className="animate-float" style={{ color: a.color, marginBottom: 14 }}>{a.icon}</div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 8 }}>{a.label}</h3>
                <p style={{ fontSize: 14, color: "#888", lineHeight: 1.7, marginBottom: 20 }}>{a.desc}</p>
                <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {a.perks.map(p => (
                    <li key={p} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#ccc" }}>
                      <CheckCircle2 size={14} color={a.color}/> {p}
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 6, color: a.color, fontSize: 14, fontWeight: 700 }}>
                  Get started <ChevronRight size={16}/>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section id="testimonials" style={{ padding: "100px 24px", background: "#0a0a14" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <h2 className="animate-slide-up" style={{ fontSize: "clamp(28px,5vw,48px)", fontWeight: 900, letterSpacing: "-1px", textAlign: "center", marginBottom: 64 }}>Loved by coders worldwide</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 24 }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="animate-slide-up hover-card-glow" style={{ animationDelay: `${100 + i * 100}ms`, background: "#0d0d1a", border: "1px solid #1a1a2e", borderRadius: 16, padding: 28 }}>
                <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
                  {[...Array(5)].map((_, j) => <Star key={j} size={14} fill="#ffd93d" color="#ffd93d"/>)}
                </div>
                <p style={{ color: "#ccc", fontSize: 15, lineHeight: 1.8, marginBottom: 20 }}>&quot;{t.quote}&quot;</p>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#7C3AED,#60a5fa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "#fff" }}>{t.avatar}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                    <div style={{ color: "#555", fontSize: 12 }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: "100px 24px", textAlign: "center" }}>
        <div className="animate-scale-in" style={{ maxWidth: 680, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(28px,5vw,52px)", fontWeight: 900, letterSpacing: "-1.5px", marginBottom: 20 }}>Ready to code together?</h2>
          <p style={{ color: "#666", fontSize: 17, marginBottom: 40 }}>Join thousands of students, teachers, and teams already using CodeTogether.</p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/signup" style={{ padding: "16px 36px", background: "linear-gradient(135deg,#7C3AED,#5b21b6)", borderRadius: 14, color: "#fff", fontSize: 17, fontWeight: 800, textDecoration: "none", boxShadow: "0 0 50px rgba(124,58,237,0.4)" }}>
              Create Free Account
            </Link>
            <Link href="/login" style={{ padding: "16px 28px", background: "transparent", border: "1px solid #333", borderRadius: 14, color: "#ccc", fontSize: 17, textDecoration: "none" }}>
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: "1px solid #111", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#7C3AED" }}>Code<span style={{ color: "#c4b5fd" }}>Together</span></div>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "center" }}>
            {["Features","How it Works","Account Types","Login","Sign Up"].map(l => (
              <span key={l} style={{ color: "#555", fontSize: 14, cursor: "pointer" }}>{l}</span>
            ))}
          </div>
          <p style={{ color: "#333", fontSize: 13 }}>© 2026 CodeTogether. Built with Next.js · Supabase · WebRTC </p>
        </div>
      </footer>

    </div>
  );
}
