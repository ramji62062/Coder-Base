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
    <div className="glass-panel animate-slide-up rounded-[20px] overflow-hidden flex flex-col">
      
      {/* Header Tabs */}
      <div className="flex bg-ct-section border-b border-ct-border">
        <button 
          onClick={() => setActiveTab("analytics")}
          className={`flex-1 py-3.5 bg-transparent border-none border-b-2 text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === "analytics" ? "bg-white/10 border-white text-white" : "border-transparent text-gray-500 hover:text-gray-300"
          }`}
        >
          <BarChart2 size={16} /> Analytics
        </button>
        <button 
          onClick={() => setActiveTab("todos")}
          className={`flex-1 py-3.5 bg-transparent border-none border-b-2 text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === "todos" ? "bg-white/10 border-white text-white" : "border-transparent text-gray-500 hover:text-gray-300"
          }`}
        >
          <ListTodo size={16} /> To-Do List
        </button>
        <button 
          onClick={() => setActiveTab("timer")}
          className={`flex-1 py-3.5 bg-transparent border-none border-b-2 text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === "timer" ? "bg-white/10 border-white text-white" : "border-transparent text-gray-500 hover:text-gray-300"
          }`}
        >
          <Timer size={16} /> Focus Timer
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        
        {/* ANALYTICS TAB */}
        {activeTab === "analytics" && (
          <div className="animate-fade-in flex flex-col gap-5">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
              {[
                { label: "Todo Completion", value: `${todoCompletion}%`, icon: <Target size={16} /> },
                { label: "Active Days", value: activeDays, icon: <CalendarDays size={16} /> },
                { label: "Project Files", value: totalFiles, icon: <TrendingUp size={16} /> },
                { label: "Published Work", value: publishedCount, icon: <Award size={16} /> },
              ].map((stat) => (
                <div key={stat.label} className="bg-ct-card-alt border border-ct-border rounded-xl p-3.5">
                  <div className="flex items-center gap-2 text-white mb-2">
                    {stat.icon}
                    <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider">{stat.label}</span>
                  </div>
                  <div className="text-2xl font-black text-white">{stat.value}</div>
                </div>
              ))}
            </div>

            <div>
              <h3 className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-3">Workspace Activity</h3>
              <div className="flex items-end gap-2 h-[120px] border-b border-ct-subtle pb-2">
                {weekBars.map((bar) => (
                  <div key={bar.day} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="text-[10px] text-ct-dim opacity-0">{bar.count}</div>
                    <div className="group relative w-full max-w-[30px] rounded-t bg-gradient-to-t from-gray-700 to-white cursor-pointer transition-all hover:scale-105"
                         style={{ height: `${Math.max(8, (bar.count / maxWeekCount) * 100)}%` }}>
                      <div className="hidden group-hover:block absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] bg-ct-dark-black px-1.5 py-0.5 rounded z-10 whitespace-nowrap border border-gray-700 text-white">
                        {bar.count} workspace{bar.count !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="text-[10px] text-ct-dim">{bar.day}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-3">Top Languages (All Time)</h3>
              <div className="flex flex-col gap-2.5">
                {(topLanguages.length ? topLanguages : ([["javascript", 0]] as [string, number][])).map(([lang, count]) => {
                  const percent = Math.round((count / maxLanguageCount) * 100);
                  return (
                  <div key={lang} className="flex items-center gap-3">
                    <span className="text-xs text-gray-300 w-[90px] capitalize">{lang}</span>
                    <div className="flex-1 h-1.5 bg-[#222222] rounded overflow-hidden">
                      <div className="h-full bg-white rounded" style={{ width: `${percent}%` }} />
                    </div>
                    <span className="text-[11px] text-gray-400 w-[34px] text-right">{count}</span>
                  </div>
                )})}
              </div>
            </div>

            <div className="bg-ct-card-alt border border-ct-border rounded-xl p-3.5">
              <div className="text-[11px] text-gray-400 font-extrabold uppercase tracking-wider mb-1.5">Latest Work</div>
              <div className="text-sm color-gray-200 font-bold text-white">{latestProject}</div>
            </div>
          </div>
        )}

        {/* TO-DO LIST TAB */}
        {activeTab === "todos" && (
          <div className="animate-fade-in flex flex-col gap-4">
            <form onSubmit={addTodo} className="flex gap-2">
              <input 
                type="text" 
                value={newTodo} 
                onChange={e => setNewTodo(e.target.value)}
                placeholder="What do you need to code today?"
                className="flex-1 bg-ct-card-alt border border-ct-border rounded-lg text-white text-xs p-[10px_14px] outline-none focus:border-white transition-colors"
              />
              <button 
                type="submit"
                className="bg-white border-none rounded-lg px-3.5 text-black cursor-pointer flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <Plus size={18} />
              </button>
            </form>

            <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
              {todos.length === 0 ? (
                <div className="text-center py-5 text-ct-dim text-xs">All caught up! Add a new task above.</div>
              ) : (
                todos.map(todo => (
                  <div key={todo.id} className="flex items-start gap-3 bg-ct-card-alt border border-ct-border p-[12px_14px] rounded-lg">
                    <button onClick={() => toggleTodo(todo.id)} className="bg-transparent border-none cursor-pointer text-gray-400 p-0 mt-0.5 hover:text-white">
                      {todo.completed ? <CheckCircle2 size={18} className="text-white" /> : <Circle size={18} />}
                    </button>
                    <div className={`flex-1 text-xs leading-relaxed ${todo.completed ? "line-through text-ct-dimmer" : "text-gray-200"}`}>
                      {todo.text}
                    </div>
                    <button onClick={() => deleteTodo(todo.id)} className="bg-transparent border-none cursor-pointer text-ct-dimmer p-0 hover:text-red-400 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* FOCUS TIMER TAB */}
        {activeTab === "timer" && (
          <div className="animate-fade-in flex flex-col items-center gap-6 py-5">
            <div className={`relative w-[180px] h-[180px] rounded-full bg-ct-card-alt border-8 border-ct-border flex items-center justify-center transition-shadow ${
              timerRunning ? "shadow-glow-white" : ""
            }`}>
              <svg className="absolute -top-2 -left-2 w-[180px] h-[180px] -rotate-90 pointer-events-none">
                <circle cx="90" cy="90" r="82" fill="none" stroke="#ffffff" strokeWidth="8" strokeDasharray="515" strokeDashoffset={515 - (515 * (timeLeft / (DEFAULT_MINUTES * 60)))} className="transition-all duration-1000 ease-linear" />
              </svg>

              <div className={`text-4xl font-black font-mono ${timerRunning ? "text-white" : "text-gray-400"}`}>
                {mins}:{secs}
              </div>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={toggleTimer}
                className="w-12 h-12 rounded-full bg-white border-none text-black flex items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors"
              >
                {timerRunning ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
              </button>
              <button 
                onClick={resetTimer}
                className="w-12 h-12 rounded-full bg-ct-card-alt border border-ct-border text-gray-400 flex items-center justify-center cursor-pointer hover:border-gray-500 hover:text-white transition-colors"
              >
                <RotateCcw size={20} />
              </button>
            </div>
            
            <div className="text-xs text-ct-dim text-center">
              {timerRunning ? "Focus mode active. Minimize distractions." : "Ready for a 25-minute Pomodoro session?"}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
