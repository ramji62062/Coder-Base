"use client";

import { useState, useEffect, type CSSProperties, type ReactNode } from "react";
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
  { id: "student", icon: <GraduationCap size={28}/>, label: "Student", color: "text-white", borderColor: "border-white/20", bgClass: "bg-white/5",
    desc: "Join live sessions, learn from peers & instructors.", perks: ["Join unlimited rooms","Real-time code sync","AI explanations","Download session notes"] },
  { id: "teacher", icon: <BookOpen size={28}/>, label: "Teacher", color: "text-gray-300", borderColor: "border-gray-300/20", bgClass: "bg-gray-300/5",
    desc: "Host sessions, manage classrooms & publish content.", perks: ["Create 250-seat rooms","Session timer & lifecycle","Teacher notes system","Whiteboard & annotations"] },
  { id: "youtube", icon: <Tv size={28}/>, label: "YouTuber / Creator", color: "text-gray-400", borderColor: "border-gray-400/20", bgClass: "bg-gray-400/5",
    desc: "Stream coding sessions and grow your audience.", perks: ["Sharable short codes","Live viewer mode","Record-ready layout","Audience join links"] },
  { id: "business", icon: <Briefcase size={28}/>, label: "Business / Team", color: "text-gray-500", borderColor: "border-gray-500/20", bgClass: "bg-gray-500/5",
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

type DragPoint = { x: number; y: number };

function LandingDanceCard({
  children,
  className = "",
  delay = 0,
  amplitude = 1,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  amplitude?: number;
  onClick?: () => void;
}) {
  const [drag, setDrag] = useState<DragPoint>({ x: 0, y: 0 });
  const [start, setStart] = useState<DragPoint | null>(null);
  const [moved, setMoved] = useState(false);

  return (
    <div
      className={`landing-dance-card ${className}`}
      style={{
        "--dance-delay": `${delay}s`,
        "--dance-amplitude": amplitude,
        transform: `translate3d(${drag.x}px, ${drag.y}px, 0)`,
      } as CSSProperties}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("button, input")) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setMoved(false);
        setStart({ x: event.clientX - drag.x, y: event.clientY - drag.y });
      }}
      onPointerMove={(event) => {
        if (!start) return;
        const nextX = Math.max(-34, Math.min(34, event.clientX - start.x));
        const nextY = Math.max(-24, Math.min(24, event.clientY - start.y));
        if (Math.abs(nextX - drag.x) > 2 || Math.abs(nextY - drag.y) > 2) setMoved(true);
        setDrag({ x: nextX, y: nextY });
      }}
      onPointerUp={() => setStart(null)}
      onPointerCancel={() => setStart(null)}
      onClick={() => {
        if (!moved) onClick?.();
      }}
    >
      {children}
    </div>
  );
}

function ParticleLogo() {
  const words = ["Code", "Together"];

  return (
    <h1 className="particle-logo" aria-label="CodeTogether">
      {words.map((word, wordIndex) => (
        <span
          key={word}
          className={`logo-word logo-word-${word.toLowerCase()}`}
          style={{
            "--word-index": wordIndex,
            "--break-x": wordIndex === 0 ? "-0.48em" : "0.48em",
          } as CSSProperties}
        >
          {word.split("").map((letter, letterIndex) => (
            <span
              key={`${word}-${letter}-${letterIndex}`}
              className="logo-letter"
              style={{
                "--letter-index": letterIndex,
                "--letter-delay": `${wordIndex * 180 + letterIndex * 48}ms`,
                "--letter-x": `${(letterIndex - (word.length - 1) / 2) * 0.16}em`,
                "--letter-y": `${((letterIndex % 3) - 1) * 0.2}em`,
              } as CSSProperties}
            >
              {letter}
            </span>
          ))}
        </span>
      ))}
    </h1>
  );
}

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
    supabase.auth.getSession().then((result: any) => setAuthUser(result?.data?.session?.user ?? null));
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
    <div className="min-h-screen bg-ct-dark text-gray-200 font-inter overflow-x-hidden">

      {/* ── NAVBAR ── */}
      <header className={`fixed top-0 left-0 right-0 z-[1000] transition-all duration-300 px-6 ${scrolled ? 'bg-ct-dark-black/85 backdrop-blur-[20px] border-b border-white/5' : 'bg-transparent border-b border-transparent'}`}>
        <div className="max-w-[1200px] mx-auto h-16 flex items-center justify-between">
          <Link href="/" className="text-[22px] font-black text-white no-underline tracking-tight">
            Code<span className="text-gray-400">Together</span>
          </Link>
          {/* Desktop nav */}
          <nav className="hidden sm:flex gap-7 items-center desk-nav">
            {["features","how-it-works","account-types","testimonials"].map((id) => (
              <button key={id} onClick={() => scrollTo(id)} className="bg-transparent border-none text-gray-400 cursor-pointer text-sm capitalize hover:text-white transition-colors">
                {id.replace(/-/g, " ")}
              </button>
            ))}
          </nav>
          <div className="flex gap-2.5 items-center">
            {authUser ? (
              <Link href="/dashboard" className="px-[18px] py-2 bg-white rounded-lg text-black text-sm font-bold no-underline">
                Dashboard →
              </Link>
            ) : (
              <>
                <Link href="/login" className="px-4 py-2 border border-ct-subtle rounded-lg text-gray-300 text-sm no-underline hover:border-gray-500 transition-colors">Login</Link>
                <Link href="/signup" className="px-[18px] py-2 bg-white rounded-lg text-black text-sm font-bold no-underline hover:bg-gray-200 transition-colors">Get Started</Link>
              </>
            )}
            <button onClick={() => setMenuOpen(!menuOpen)} className="sm:hidden bg-transparent border-none text-gray-300 cursor-pointer mob-menu-btn">
              {menuOpen ? <X size={22}/> : <Menu size={22}/>}
            </button>
          </div>
        </div>
        {/* Mobile menu */}
        {menuOpen && (
          <div className="bg-ct-card border-t border-ct-subtle p-4 px-6 flex flex-col gap-4">
            {["features","how-it-works","account-types","testimonials"].map(id => (
              <button key={id} onClick={() => scrollTo(id)} className="bg-transparent border-none text-gray-300 cursor-pointer text-left text-[15px] capitalize">
                {id.replace(/-/g, " ")}
              </button>
            ))}
            <Link href="/login" className="text-gray-300 no-underline">Login</Link>
            <Link href="/signup" className="text-gray-400 font-bold no-underline">Get Started →</Link>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="min-h-screen flex flex-col items-center justify-center text-center px-6 pt-[100px] pb-20 relative overflow-hidden">
        {/* Glow bg */}
        <div className="animate-pulse-glow absolute top-[20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[radial-gradient(ellipse,rgba(255,255,255,0.18)_0%,transparent_70%)] pointer-events-none" />
        <div className="animate-float absolute top-[30%] left-[20%] w-[300px] h-[300px] bg-[radial-gradient(ellipse,rgba(200,200,200,0.08)_0%,transparent_70%)] pointer-events-none" />

        <ParticleLogo />

        <p className="animate-slide-up [animation-delay:200ms] opacity-0 text-[clamp(15px,2vw,19px)] text-ct-muted max-w-[560px] leading-[1.7] mb-11">
          A live coding room with editor, calls, terminal, whiteboard, and AI.
        </p>

        <div className="animate-slide-up [animation-delay:300ms] opacity-0 flex gap-3.5 flex-wrap justify-center mb-10">
          <Link href="/signup" className="px-8 py-3.5 bg-gradient-to-br from-white to-gray-300 rounded-xl text-black text-base font-bold no-underline shadow-glow-white inline-flex items-center gap-2 hover:scale-105 transition-transform">
            Start for Free 
            <ArrowRight size={18}/>
          </Link>
          <button onClick={() => scrollTo("how-it-works")} className="px-7 py-3.5 bg-transparent border border-ct-subtle rounded-xl text-gray-300 text-base cursor-pointer inline-flex items-center gap-2 hover:border-gray-500 transition-colors">
            <Play size={16}/> See how it works
          </button>
        </div>

        {/* Room join */}
        <LandingDanceCard className="animate-scale-in [animation-delay:400ms] opacity-0 rounded-2xl p-5 max-w-[480px] w-full" delay={0.15} amplitude={1.2}>
          <p className="text-[13px] text-ct-dimmer mb-3">Have a room code? Join instantly:</p>
          <div className="flex gap-2.5">
            <input value={roomCode} onChange={e => { setRoomCode(e.target.value.toUpperCase()); setJoinError(""); }}
              onKeyDown={e => e.key === "Enter" && handleJoin()}
              placeholder="Enter code e.g. XK9P2M"
              className="flex-1 bg-ct-input border border-ct-subtle rounded-[10px] px-3.5 py-2.5 text-white text-sm outline-none tracking-[2px] font-bold uppercase placeholder:text-gray-600"
            />
            <button onClick={handleJoin} disabled={joining}
              className="px-5 py-2.5 bg-white border-none rounded-[10px] text-black text-sm font-bold cursor-pointer whitespace-nowrap hover:bg-gray-200 transition-colors disabled:opacity-50">
              {joining ? "..." : "Join →"}
            </button>
          </div>
          {joinError && <p className="text-red-400 text-xs mt-2">{joinError}</p>}
        </LandingDanceCard>

      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="py-[100px] px-6 max-w-[1200px] mx-auto bg-black">
        <div className="text-center mb-16">
          <h2 className="animate-slide-up text-[clamp(28px,5vw,48px)] font-black tracking-[-1px]">Everything you need to code together</h2>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-5">
          {FEATURES.map((f, i) => (
            <LandingDanceCard
              key={i}
              className="animate-slide-up rounded-2xl p-7 min-h-[200px]"
              delay={i * 0.08}
              amplitude={1.15}
            >
              <div className="w-12 h-12 rounded-xl bg-white/[0.09] flex items-center justify-center text-gray-400 mb-4">{f.icon}</div>
              <h3 className="text-[17px] font-bold mb-2">{f.title}</h3>
              <p className="text-sm text-ct-dim leading-[1.7]">{f.desc}</p>
            </LandingDanceCard>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="py-[100px] px-6 bg-black">
        <div className="max-w-[900px] mx-auto text-center">
          <h2 className="animate-slide-up text-[clamp(28px,5vw,48px)] font-black tracking-[-1px] mb-16">Up and running in 3 steps</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-8">
            {HOW_IT_WORKS.map((s, i) => (
              <LandingDanceCard
                key={i}
                className="animate-slide-up text-left relative p-6 rounded-2xl min-h-[230px]"
                delay={0.15 + i * 0.12}
                amplitude={1.2}
              >
                <div className="text-5xl font-black text-white/[0.13] leading-none mb-3">{s.step}</div>
                <h3 className="text-xl font-bold mb-2.5">{s.title}</h3>
                <p className="text-ct-dim text-sm leading-[1.8]">{s.desc}</p>
                {i < 2 && <div className="absolute top-7 -right-5 text-ct-subtle text-2xl">→</div>}
              </LandingDanceCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── ACCOUNT TYPES ── */}
      <section id="account-types" className="py-[100px] px-6 max-w-[1200px] mx-auto">
        <div className="text-center mb-16">
          <h2 className="animate-slide-up text-[clamp(28px,5vw,48px)] font-black tracking-[-1px]">Built for every kind of coder</h2>
          <p className="animate-slide-up [animation-delay:100ms] opacity-0 text-ct-dim mt-3.5 text-[17px]">Pick your account type — your dashboard and features adapt to you.</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
          {ACCOUNT_TYPES.map((a, i) => (
            <LandingDanceCard
              key={a.id}
              className="animate-slide-up rounded-[20px] p-7 h-full"
              delay={0.2 + i * 0.08}
              amplitude={1.1}
              onClick={() => router.push(`/signup?role=${a.id}`)}
            >
                <div className={`animate-float ${a.color} mb-3.5`}>{a.icon}</div>
                <h3 className="text-xl font-extrabold text-white mb-2">{a.label}</h3>
                <p className="text-sm text-ct-muted leading-[1.7] mb-5">{a.desc}</p>
                <ul className="list-none p-0 flex flex-col gap-2">
                  {a.perks.map(p => (
                    <li key={p} className="flex items-center gap-2 text-[13px] text-gray-300">
                      <CheckCircle2 size={14} className={a.color}/> {p}
                    </li>
                  ))}
                </ul>
                <div className={`mt-6 flex items-center gap-1.5 ${a.color} text-sm font-bold`}>
                  Get started <ChevronRight size={16}/>
                </div>
            </LandingDanceCard>
          ))}
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section id="testimonials" className="py-[100px] px-6 bg-black">
        <div className="max-w-[1000px] mx-auto">
          <h2 className="animate-slide-up text-[clamp(28px,5vw,48px)] font-black tracking-[-1px] text-center mb-16">Loved by coders worldwide</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6">
            {TESTIMONIALS.map((t, i) => (
              <LandingDanceCard
                key={i}
                className="animate-slide-up rounded-2xl p-7 min-h-[250px]"
                delay={0.1 + i * 0.12}
                amplitude={1.05}
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => <Star key={j} size={14} fill="#ffffff" color="#ffffff"/>)}
                </div>
                <p className="text-gray-300 text-[15px] leading-[1.8] mb-5">&quot;{t.quote}&quot;</p>
                <div className="flex items-center gap-3">
                  <div className="w-[38px] h-[38px] rounded-full bg-gradient-to-br from-white to-gray-400 flex items-center justify-center text-[15px] font-extrabold text-black">{t.avatar}</div>
                  <div>
                    <div className="font-bold text-sm">{t.name}</div>
                    <div className="text-ct-dimmer text-xs">{t.role}</div>
                  </div>
                </div>
              </LandingDanceCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-[100px] px-6 text-center">
        <div className="animate-scale-in max-w-[680px] mx-auto">
          <h2 className="text-[clamp(28px,5vw,52px)] font-black tracking-[-1.5px] mb-5">Ready to code together?</h2>
          <p className="text-ct-dim text-[17px] mb-10">Join thousands of students, teachers, and teams already using CodeTogether.</p>
          <div className="flex gap-3.5 justify-center flex-wrap">
            <Link href="/signup" className="px-9 py-4 bg-gradient-to-br from-white to-gray-300 rounded-[14px] text-black text-[17px] font-extrabold no-underline shadow-glow-white-lg hover:scale-105 transition-transform">
              Create Free Account
            </Link>
            <Link href="/login" className="px-7 py-4 bg-transparent border border-ct-subtle rounded-[14px] text-gray-300 text-[17px] no-underline hover:border-gray-500 transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-gray-900 py-10 px-6 text-center">
        <div className="max-w-[1200px] mx-auto flex flex-col items-center gap-5">
          <div className="text-[22px] font-black text-white">Code<span className="text-gray-400">Together</span></div>
          <div className="flex gap-7 flex-wrap justify-center">
            {["Features","How it Works","Account Types","Login","Sign Up"].map(l => (
              <span key={l} className="text-ct-dimmer text-sm cursor-pointer hover:text-white transition-colors">{l}</span>
            ))}
          </div>
          <p className="text-ct-subtle text-[13px]">© 2026 CodeTogether. Built with Next.js · Supabase · WebRTC </p>
        </div>
      </footer>

    </div>
  );
}
