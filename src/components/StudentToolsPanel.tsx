"use client";

import { useState, useEffect } from "react";
import { ListTodo, Timer, BarChart2, Plus, Trash2, CheckCircle2, Circle, Play, Pause, RotateCcw, Target, TrendingUp, Award, CalendarDays } from "lucide-react";

type Todo = {
  id: string;
  text: string;
  completed: boolean;
};

type RoomLike = {
  id: string;
  name: string | null;
  language: string;
  created_at: string;
  files_json?: any[];
};

type StudentToolsPanelProps = {
  rooms?: RoomLike[];
  libraryRooms?: any[];
  userId?: string;
};

const LANG_COLORS: Record<string, string> = {
  javascript: "#f1e05a",
  typescript: "#3178c6",
  python: "#3572A5",
  java: "#b07219",
  cpp: "#f34b7d",
  c: "#555555",
  go: "#00ADD8",
  rust: "#dea584",
  html: "#e34c26",
  css: "#563d7c",
  shell: "#89e051",
  php: "#4F5D95",
  ruby: "#701516",
};

export default function StudentToolsPanel({ rooms = [], libraryRooms = [], userId = "" }: StudentToolsPanelProps) {
  const [activeTab, setActiveTab] = useState<"analytics" | "todos" | "timer">("analytics");

  // ============================
  // TODO LIST STATE
  // ============================
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodo, setNewTodo] = useState("");
  const completedTodos = todos.filter(todo => todo.completed).length;
  const todoCompletion = todos.length ? Math.round((completedTodos / todos.length) * 100) : 0;
  const publishedCount = libraryRooms.filter(item => item.created_by === userId).length;
  const totalFiles = rooms.reduce((sum, room) => sum + (Array.isArray(room.files_json) ? room.files_json.filter(file => !file.isFolder).length : 1), 0);
  const activeDays = new Set(rooms.map(room => new Date(room.created_at).toLocaleDateString())).size;
  const latestProject = rooms[0]?.name?.startsWith("{") ? "Scheduled Workspace" : rooms[0]?.name || "No workspace yet";
  const languageCounts = rooms.reduce<Record<string, number>>((acc, room) => {
    const key = room.language || "javascript";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const topLanguages = Object.entries(languageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxLanguageCount = Math.max(1, ...topLanguages.map(([, count]) => count));
  const weekdayCounts = rooms.reduce<Record<string, number>>((acc, room) => {
    const day = new Date(room.created_at).toLocaleDateString(undefined, { weekday: "short" });
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {});
  const weekBars = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => ({
    day,
    count: weekdayCounts[day] || 0,
  }));
  const maxWeekCount = Math.max(1, ...weekBars.map(day => day.count));

  useEffect(() => {
    const saved = localStorage.getItem("codetogether_todos");
    if (saved) {
      try { setTodos(JSON.parse(saved)); } catch {}
    } else {
      setTodos([
        { id: "1", text: "Complete React components module", completed: true },
        { id: "2", text: "Review Pull Request #42", completed: false },
        { id: "3", text: "Practice Python algorithms", completed: false }
      ]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("codetogether_todos", JSON.stringify(todos));
  }, [todos]);

  function addTodo(e: React.FormEvent) {
    e.preventDefault();
    if (!newTodo.trim()) return;
    setTodos([...todos, { id: Date.now().toString(), text: newTodo.trim(), completed: false }]);
    setNewTodo("");
  }

  function toggleTodo(id: string) {
    setTodos(todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  }

  function deleteTodo(id: string) {
    setTodos(todos.filter(t => t.id !== id));
  }

  // ============================
  // STUDY TIMER STATE
  // ============================
  const DEFAULT_MINUTES = 25;
  const [timeLeft, setTimeLeft] = useState(DEFAULT_MINUTES * 60);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerRunning && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0) {
      setTimerRunning(false);
      // Play a sound when done
      try {
        const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
        audio.play();
      } catch {}
    }
    return () => clearInterval(interval);
  }, [timerRunning, timeLeft]);

  const toggleTimer = () => setTimerRunning(!timerRunning);
  const resetTimer = () => { setTimerRunning(false); setTimeLeft(DEFAULT_MINUTES * 60); };
  const mins = Math.floor(timeLeft / 60).toString().padStart(2, "0");
  const secs = (timeLeft % 60).toString().padStart(2, "0");

  return (
    <div className="glass-panel animate-slide-up" style={{ borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      
      {/* Header Tabs */}
      <div style={{ display: "flex", background: "#0a0a14", borderBottom: "1px solid #1a1a2e" }}>
        <button 
          onClick={() => setActiveTab("analytics")}
          style={{ flex: 1, padding: "14px 0", background: activeTab === "analytics" ? "rgba(124,58,237,0.1)" : "transparent", border: "none", borderBottom: activeTab === "analytics" ? "2px solid #7C3AED" : "2px solid transparent", color: activeTab === "analytics" ? "#fff" : "#666", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.2s" }}
        >
          <BarChart2 size={16} /> Analytics
        </button>
        <button 
          onClick={() => setActiveTab("todos")}
          style={{ flex: 1, padding: "14px 0", background: activeTab === "todos" ? "rgba(124,58,237,0.1)" : "transparent", border: "none", borderBottom: activeTab === "todos" ? "2px solid #7C3AED" : "2px solid transparent", color: activeTab === "todos" ? "#fff" : "#666", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.2s" }}
        >
          <ListTodo size={16} /> To-Do List
        </button>
        <button 
          onClick={() => setActiveTab("timer")}
          style={{ flex: 1, padding: "14px 0", background: activeTab === "timer" ? "rgba(124,58,237,0.1)" : "transparent", border: "none", borderBottom: activeTab === "timer" ? "2px solid #7C3AED" : "2px solid transparent", color: activeTab === "timer" ? "#fff" : "#666", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.2s" }}
        >
          <Timer size={16} /> Focus Timer
        </button>
      </div>

      {/* Tab Content */}
      <div style={{ padding: 24 }}>
        
        {/* ======================= */}
        {/* ANALYTICS TAB           */}
        {/* ======================= */}
        {activeTab === "analytics" && (
          <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
              {[
                { label: "Todo Completion", value: `${todoCompletion}%`, icon: <Target size={16} />, color: "#10b981" },
                { label: "Active Days", value: activeDays, icon: <CalendarDays size={16} />, color: "#60a5fa" },
                { label: "Project Files", value: totalFiles, icon: <TrendingUp size={16} />, color: "#f59e0b" },
                { label: "Published Work", value: publishedCount, icon: <Award size={16} />, color: "#ec4899" },
              ].map((stat) => (
                <div key={stat.label} style={{ background: "#11111f", border: "1px solid #1a1a2e", borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: stat.color, marginBottom: 8 }}>
                    {stat.icon}
                    <span style={{ fontSize: 10, color: "#777", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>{stat.label}</span>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>{stat.value}</div>
                </div>
              ))}
            </div>

            <div>
              <h3 style={{ fontSize: 14, color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Workspace Activity</h3>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120, borderBottom: "1px solid #333", paddingBottom: 8 }}>
                {weekBars.map((bar) => (
                  <div key={bar.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div style={{ fontSize: 10, color: "#666", opacity: 0 }}>{bar.count}</div>
                    <div className="hover-card-glow" style={{ width: "100%", maxWidth: 30, height: `${Math.max(8, (bar.count / maxWeekCount) * 100)}%`, background: "linear-gradient(180deg, #7C3AED, #4c1d95)", borderRadius: "4px 4px 0 0", position: "relative", cursor: "pointer" }}>
                      <div className="tooltip" style={{ position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)", fontSize: 10, background: "#111", padding: "2px 6px", borderRadius: 4, display: "none", zIndex: 10 }}>{bar.count} workspace{bar.count !== 1 ? "s" : ""}</div>
                    </div>
                    <div style={{ fontSize: 10, color: "#666" }}>{bar.day}</div>
                  </div>
                ))}
              </div>
              <style>{`.hover-card-glow:hover .tooltip { display: block !important; }`}</style>
            </div>

            <div>
              <h3 style={{ fontSize: 14, color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Top Languages (All Time)</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(topLanguages.length ? topLanguages : ([["javascript", 0]] as [string, number][])).map(([lang, count]) => {
                  const percent = Math.round((count / maxLanguageCount) * 100);
                  return (
                  <div key={lang} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 12, color: "#ccc", width: 90, textTransform: "capitalize" }}>{lang}</span>
                    <div style={{ flex: 1, height: 6, background: "#222", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${percent}%`, height: "100%", background: LANG_COLORS[lang] || "#7C3AED", borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 11, color: "#888", width: 34, textAlign: "right" }}>{count}</span>
                  </div>
                )})}
              </div>
            </div>

            <div style={{ background: "#11111f", border: "1px solid #1a1a2e", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 11, color: "#777", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Latest Work</div>
              <div style={{ fontSize: 14, color: "#e0e0e0", fontWeight: 700 }}>{latestProject}</div>
            </div>
          </div>
        )}

        {/* ======================= */}
        {/* TO-DO LIST TAB          */}
        {/* ======================= */}
        {activeTab === "todos" && (
          <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <form onSubmit={addTodo} style={{ display: "flex", gap: 8 }}>
              <input 
                type="text" 
                value={newTodo} 
                onChange={e => setNewTodo(e.target.value)}
                placeholder="What do you need to code today?"
                style={{ flex: 1, background: "#11111f", border: "1px solid #2a2a3f", borderRadius: 8, color: "#fff", fontSize: 13, padding: "10px 14px", outline: "none" }}
              />
              <button 
                type="submit"
                style={{ background: "linear-gradient(135deg, #7C3AED, #5b21b6)", border: "none", borderRadius: 8, padding: "0 14px", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <Plus size={18} />
              </button>
            </form>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto", paddingRight: 4 }}>
              {todos.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px 0", color: "#666", fontSize: 13 }}>All caught up! Add a new task above.</div>
              ) : (
                todos.map(todo => (
                  <div key={todo.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, background: "#11111f", border: "1px solid #1a1a2e", padding: "12px 14px", borderRadius: 8 }}>
                    <button onClick={() => toggleTodo(todo.id)} style={{ background: "none", border: "none", cursor: "pointer", color: todo.completed ? "#10b981" : "#555", padding: 0, marginTop: 2 }}>
                      {todo.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                    </button>
                    <div style={{ flex: 1, fontSize: 13, color: todo.completed ? "#666" : "#e0e0e0", textDecoration: todo.completed ? "line-through" : "none", lineHeight: 1.4 }}>
                      {todo.text}
                    </div>
                    <button onClick={() => deleteTodo(todo.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#444", padding: 0 }} onMouseOver={e => e.currentTarget.style.color = "#f47"} onMouseOut={e => e.currentTarget.style.color = "#444"}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ======================= */}
        {/* FOCUS TIMER TAB         */}
        {/* ======================= */}
        {activeTab === "timer" && (
          <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, padding: "20px 0" }}>
            <div style={{ position: "relative", width: 180, height: 180, borderRadius: "50%", background: "#11111f", border: "8px solid #1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: timerRunning ? "0 0 40px rgba(124,58,237,0.2)" : "none", transition: "box-shadow 0.3s" }}>
              
              {/* Circular Progress (Visual Hack) */}
              <svg style={{ position: "absolute", top: -8, left: -8, width: 180, height: 180, transform: "rotate(-90deg)", pointerEvents: "none" }}>
                <circle cx="90" cy="90" r="82" fill="none" stroke="#7C3AED" strokeWidth="8" strokeDasharray="515" strokeDashoffset={515 - (515 * (timeLeft / (DEFAULT_MINUTES * 60)))} style={{ transition: "stroke-dashoffset 1s linear" }} />
              </svg>

              <div style={{ fontSize: 42, fontWeight: 900, color: timerRunning ? "#fff" : "#aaa", fontFamily: "monospace" }}>
                {mins}:{secs}
              </div>
            </div>

            <div style={{ display: "flex", gap: 16 }}>
              <button 
                onClick={toggleTimer}
                style={{ width: 48, height: 48, borderRadius: "50%", background: timerRunning ? "#333" : "linear-gradient(135deg, #7C3AED, #5b21b6)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "background 0.2s" }}
              >
                {timerRunning ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: 3 }} />}
              </button>
              <button 
                onClick={resetTimer}
                style={{ width: 48, height: 48, borderRadius: "50%", background: "#1a1a2e", border: "1px solid #333", color: "#aaa", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.2s" }}
                onMouseOver={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "#555"; }}
                onMouseOut={e => { e.currentTarget.style.color = "#aaa"; e.currentTarget.style.borderColor = "#333"; }}
              >
                <RotateCcw size={20} />
              </button>
            </div>
            
            <div style={{ fontSize: 13, color: "#666", textAlign: "center" }}>
              {timerRunning ? "Focus mode active. Minimize distractions." : "Ready for a 25-minute Pomodoro session?"}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
