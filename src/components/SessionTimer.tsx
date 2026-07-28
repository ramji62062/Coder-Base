"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Clock, Play, Pause, Square, RotateCcw, AlertTriangle, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface SessionTimerProps {
  onSessionEnd?: () => void;
  onSaveWork?: () => void;
  isTeacher?: boolean;
  roomId: string;
  currentUserId: string;
  isScheduled?: boolean;
  startAt?: string | null;
  endAt?: string | null;
}

type TimerState = "idle" | "running" | "paused" | "ended";
const PRESETS = [15, 30, 45, 60, 90, 120];

export default function SessionTimer({ onSessionEnd, onSaveWork, isTeacher = false, roomId, currentUserId, isScheduled = false, startAt = null, endAt = null }: SessionTimerProps) {
  const [state, setState] = useState<TimerState>(() => {
    if (isScheduled && startAt && endAt) {
      const now = Date.now();
      const endMs = new Date(endAt).getTime();
      if (now >= endMs) return "ended";
      const startMs = new Date(startAt).getTime();
      if (now >= startMs) return "running";
    }
    return "idle";
  });
  const [limit, setLimit] = useState(() => {
    if (isScheduled && startAt && endAt) {
      const startMs = new Date(startAt).getTime();
      const endMs = new Date(endAt).getTime();
      return Math.max(1, Math.round((endMs - startMs) / 60000));
    }
    return 60;
  });
  const [elapsed, setElapsed] = useState(() => {
    if (isScheduled && startAt && endAt) {
      const now = Date.now();
      const startMs = new Date(startAt).getTime();
      const endMs = new Date(endAt).getTime();
      if (now >= endMs) return Math.max(1, Math.round((endMs - startMs) / 1000));
      if (now >= startMs) return Math.max(0, Math.round((now - startMs) / 1000));
    }
    return 0;
  });
  const [customLimit, setCustomLimit] = useState("60");
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [workSaved, setWorkSaved] = useState(false);

  const remaining = limit * 60 - elapsed;
  const pct = Math.min(100, (elapsed / (limit * 60)) * 100);
  const isWarning = remaining <= 300 && remaining > 0;
  const isExpired = remaining <= 0;

  // Refs to read current state in intervals without re-creating subscriptions
  const stateRef = useRef(state);
  const elapsedRef = useRef(elapsed);
  const limitRef = useRef(limit);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);
  useEffect(() => { limitRef.current = limit; }, [limit]);

  // Realtime channel setup
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!roomId) return;

    const channel = supabase.channel(`timer:${roomId}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "timer-sync" }, ({ payload }) => {
        if (payload.senderId !== currentUserId) {
          setState(payload.state);
          setElapsed(payload.elapsed);
          setLimit(payload.limit);
        }
      })
      .on("broadcast", { event: "timer-request" }, () => {
        if (isTeacher) {
          channel.send({
            type: "broadcast",
            event: "timer-sync",
            payload: { state: stateRef.current, elapsed: elapsedRef.current, limit: limitRef.current, senderId: currentUserId }
          });
        }
      })
      .subscribe();

    // Students request initial sync
    if (!isTeacher) {
      // Delay slightly to ensure subscription is active
      setTimeout(() => {
        channel.send({
          type: "broadcast",
          event: "timer-request",
          payload: {}
        });
      }, 500);
    }

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId, isTeacher, currentUserId]);

  // Broadcast function
  const broadcastSync = useCallback((newState: TimerState, newElapsed: number, newLimit: number) => {
    if (isTeacher && channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "timer-sync",
        payload: { state: newState, elapsed: newElapsed, limit: newLimit, senderId: currentUserId }
      });
    }
  }, [isTeacher, currentUserId]);

  // Run timer countdown locally (runs on both sides, synced periodically by broadcast to handle drift)
  useEffect(() => {
    if (state !== "running") return;
    const interval = setInterval(() => {
      setElapsed(e => {
        const next = e + 1;
        if (next >= limit * 60) {
          setState("ended");
          clearInterval(interval);
          if (isTeacher) broadcastSync("ended", next, limit);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state, limit, isTeacher, broadcastSync]);

  // Periodic broadcast by teacher to keep students in sync (every 5 seconds)
  useEffect(() => {
    if (!isTeacher || state !== "running") return;
    const interval = setInterval(() => {
      broadcastSync(state, elapsed, limit);
    }, 5000);
    return () => clearInterval(interval);
  }, [isTeacher, state, elapsed, limit, broadcastSync]);

  useEffect(() => {
    if (state === "ended") {
      onSaveWork?.();
      setWorkSaved(true);
      onSessionEnd?.();
    }
  }, [state]);

  function fmt(secs: number) {
    const abs = Math.abs(secs);
    const h = Math.floor(abs / 3600), m = Math.floor((abs % 3600) / 60), s = abs % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  // Teacher actions
  function updateState(newState: TimerState) {
    if (!isTeacher) return;
    setState(newState);
    broadcastSync(newState, elapsed, limit);
  }

  function handleReset() {
    if (!isTeacher) return;
    setState("idle");
    setElapsed(0);
    setWorkSaved(false);
    broadcastSync("idle", 0, limit);
  }

  function handleEnd() {
    if (!isTeacher) return;
    setState("ended");
    setShowEndConfirm(false);
    broadcastSync("ended", elapsed, limit);
  }

  function handleSetLimit(newLimitMinutes: number) {
    if (!isTeacher) return;
    setLimit(newLimitMinutes);
    setCustomLimit(String(newLimitMinutes));
    broadcastSync(state, elapsed, newLimitMinutes);
  }

  const ringR = 52, ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC * (1 - pct / 100);
  const ringColor = isExpired ? "#f44747" : isWarning ? "#ffd93d" : "#7C3AED";

  return (
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 18, color: "#e0e0e0", height: "100%", overflowY: "auto", background: "#0d0d0d", fontFamily: "Inter, sans-serif" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", letterSpacing: "0.12em", display: "flex", alignItems: "center", gap: 6 }}>
        <Clock size={13}/> Session Lifecycle
      </div>

      {/* Circular timer */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative", width: 136, height: 136 }}>
          <svg width="136" height="136" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="68" cy="68" r={ringR} fill="none" stroke="#1a1a2e" strokeWidth="7"/>
            <circle cx="68" cy="68" r={ringR} fill="none" stroke={ringColor} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={ringC} strokeDashoffset={ringOffset} style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s" }}/>
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: isExpired ? 18 : 22, fontWeight: 900, fontFamily: "monospace", color: isExpired ? "#f44747" : isWarning ? "#ffd93d" : "#fff", animation: isWarning && state === "running" ? "pulse 1.5s ease-in-out infinite" : "none" }}>
              {isExpired ? "DONE" : fmt(remaining)}
            </div>
            <div style={{ fontSize: 10, color: "#555", marginTop: 3 }}>
              {state === "running" ? "remaining" : state === "paused" ? "paused" : state === "ended" ? "ended" : "ready"}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[{ label: "Elapsed", value: fmt(elapsed) }, { label: "Duration", value: `${limit}m` }].map(s => (
          <div key={s.label} style={{ background: "#111", borderRadius: 10, padding: "10px 12px", border: "1px solid #1a1a2e" }}>
            <div style={{ fontSize: 10, color: "#555" }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", fontFamily: "monospace", marginTop: 2 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      {isTeacher && !isScheduled && (
        <div style={{ display: "flex", gap: 8 }}>
          {state === "idle" || state === "paused" ? (
            <button onClick={() => updateState("running")} style={{ flex: 1, padding: "10px", border: "none", borderRadius: 10, background: "#7C3AED", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Play size={14}/> {state === "paused" ? "Resume" : "Start"}
            </button>
          ) : state === "running" ? (
            <button onClick={() => updateState("paused")} style={{ flex: 1, padding: "10px", border: "1px solid #ffd93d44", borderRadius: 10, background: "#ffd93d18", color: "#ffd93d", cursor: "pointer", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Pause size={14}/> Pause
            </button>
          ) : null}
          <button onClick={handleReset} style={{ padding: "10px 13px", border: "1px solid #2a2a2a", borderRadius: 10, background: "transparent", color: "#666", cursor: "pointer" }}>
            <RotateCcw size={14}/>
          </button>
          {state !== "idle" && state !== "ended" && (
            <button onClick={() => setShowEndConfirm(true)} style={{ padding: "10px 13px", border: "1px solid #f4474744", borderRadius: 10, background: "transparent", color: "#f47", cursor: "pointer" }}>
              <Square size={14}/>
            </button>
          )}
        </div>
      )}

      {/* Duration presets */}
      {isTeacher && state === "idle" && !isScheduled && (
        <div>
          <div style={{ fontSize: 10, color: "#555", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Session Duration</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5 }}>
            {PRESETS.map(p => (
              <button key={p} onClick={() => handleSetLimit(p)}
                style={{ padding: "6px", border: limit === p ? "1px solid #7C3AED" : "1px solid #222", borderRadius: 8, background: limit === p ? "#7C3AED22" : "transparent", color: limit === p ? "#c4b5fd" : "#555", cursor: "pointer", fontSize: 12, fontWeight: 700, transition: "all 0.15s" }}>
                {p}m
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
            <input value={customLimit} onChange={e => setCustomLimit(e.target.value)} type="number" min="1" max="480" placeholder="Custom min"
              style={{ flex: 1, padding: "7px 10px", background: "#111", border: "1px solid #222", borderRadius: 8, color: "#ccc", fontSize: 12, outline: "none" }}/>
            <button onClick={() => { const v = parseInt(customLimit); if (v > 0) handleSetLimit(v); }}
              style={{ padding: "7px 12px", background: "#7C3AED", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Set</button>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#555", marginBottom: 5 }}>
          <span>Progress</span><span>{Math.round(pct)}%</span>
        </div>
        <div style={{ height: 6, background: "#1a1a2e", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${ringColor},${ringColor}cc)`, borderRadius: 999, transition: "width 1s linear, background 0.5s" }}/>
        </div>
      </div>

      {/* Warnings */}
      {isWarning && state === "running" && (
        <div style={{ background: "#ffd93d11", border: "1px solid #ffd93d33", borderRadius: 10, padding: "10px 14px", display: "flex", gap: 10, alignItems: "center" }}>
          <AlertTriangle size={15} color="#ffd93d"/>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#ffd93d" }}>Session ending soon</div>
            <div style={{ fontSize: 11, color: "#ffd93dcc", marginTop: 2 }}>Less than 5 minutes remaining</div>
          </div>
        </div>
      )}

      {state === "ended" && (
        <div style={{ background: "#7C3AED11", border: "1px solid #7C3AED44", borderRadius: 12, padding: "14px", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#c4b5fd", marginBottom: 6 }}>Session Ended</div>
          <div style={{ fontSize: 12, color: "#7C3AED", marginBottom: 4 }}>Duration: {fmt(elapsed)}</div>
          {workSaved && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, color: "#6bcb77", marginBottom: 10 }}>
              <Save size={12}/> Work saved automatically
            </div>
          )}
          {isTeacher && (
            <button onClick={handleReset}
              style={{ padding: "7px 20px", background: "#7C3AED", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
              New Session
            </button>
          )}
        </div>
      )}

      {/* End confirmation */}
      {showEndConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "#000c", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: "#0d0d1a", border: "1px solid #2a2a2a", borderRadius: 20, padding: 28, maxWidth: 320, textAlign: "center", boxShadow: "0 24px 64px rgba(0,0,0,0.8)" }}>
            <AlertTriangle size={32} color="#ffd93d" style={{ margin: "0 auto 14px" }}/>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>End Session?</div>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>This will end the session for all participants.</div>
            <div style={{ fontSize: 12, color: "#22c55e", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              <Save size={12}/> Work will be saved automatically
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowEndConfirm(false)} style={{ flex: 1, padding: "9px", border: "1px solid #222", borderRadius: 10, background: "transparent", color: "#ccc", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
              <button onClick={handleEnd} style={{ flex: 1, padding: "9px", border: "none", borderRadius: 10, background: "#f44747", color: "#fff", cursor: "pointer", fontWeight: 800 }}>End & Save</button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }`}</style>
    </div>
  );
}
