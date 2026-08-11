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
      .on("broadcast", { event: "timer-sync" }, ({ payload }: any) => {
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

  // Run timer countdown locally
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

  // Periodic broadcast by teacher
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
  const ringColor = isExpired ? "#ff4444" : isWarning ? "#ffd93d" : "#ffffff";

  return (
    <div className="p-[18px] flex flex-col gap-[18px] text-gray-200 h-full overflow-y-auto bg-ct-dark-black font-inter">
      <div className="text-[11px] font-bold text-white uppercase tracking-[0.12em] flex items-center gap-[6px]">
        <Clock size={13}/> Session Lifecycle
      </div>

      {/* Circular timer */}
      <div className="flex justify-center">
        <div className="relative w-[136px] h-[136px]">
          <svg width="136" height="136" className="-rotate-90">
            <circle cx="68" cy="68" r={ringR} fill="none" stroke="#222222" strokeWidth="7"/>
            <circle cx="68" cy="68" r={ringR} fill="none" stroke={ringColor} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={ringC} strokeDashoffset={ringOffset} className="transition-all duration-1000 ease-linear"/>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`font-mono font-black ${isExpired ? 'text-[18px] text-red-500' : isWarning ? 'text-[22px] text-amber-300' : 'text-[22px] text-white'} ${isWarning && state === "running" ? "animate-pulse" : ""}`}>
              {isExpired ? "DONE" : fmt(remaining)}
            </div>
            <div className="text-[10px] text-gray-400 mt-[3px]">
              {state === "running" ? "remaining" : state === "paused" ? "paused" : state === "ended" ? "ended" : "ready"}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        {[{ label: "Elapsed", value: fmt(elapsed) }, { label: "Duration", value: `${limit}m` }].map(s => (
          <div key={s.label} className="bg-[#111111] rounded-[10px] p-[10px_12px] border border-[#222222]">
            <div className="text-[10px] text-gray-400">{s.label}</div>
            <div className="text-[16px] font-extrabold text-white font-mono mt-[2px]">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      {isTeacher && !isScheduled && (
        <div className="flex gap-2">
          {state === "idle" || state === "paused" ? (
            <button onClick={() => updateState("running")} className="flex-1 p-[10px] border-none rounded-[10px] bg-white text-black cursor-pointer font-bold text-[13px] flex items-center justify-center gap-[6px] hover:bg-gray-200 transition-colors">
              <Play size={14}/> {state === "paused" ? "Resume" : "Start"}
            </button>
          ) : state === "running" ? (
            <button onClick={() => updateState("paused")} className="flex-1 p-[10px] border border-amber-400/30 rounded-[10px] bg-amber-400/10 text-amber-300 cursor-pointer font-bold text-[13px] flex items-center justify-center gap-[6px] hover:bg-amber-400/20 transition-colors">
              <Pause size={14}/> Pause
            </button>
          ) : null}
          <button onClick={handleReset} className="p-[10px_13px] border border-[#2a2a2a] rounded-[10px] bg-transparent text-gray-400 cursor-pointer hover:border-gray-500 hover:text-white transition-colors">
            <RotateCcw size={14}/>
          </button>
          {state !== "idle" && state !== "ended" && (
            <button onClick={() => setShowEndConfirm(true)} className="p-[10px_13px] border border-red-500/30 rounded-[10px] bg-transparent text-red-400 cursor-pointer hover:border-red-500 hover:text-red-300 transition-colors">
              <Square size={14}/>
            </button>
          )}
        </div>
      )}

      {/* Duration presets */}
      {isTeacher && state === "idle" && !isScheduled && (
        <div>
          <div className="text-[10px] text-gray-400 mb-2 uppercase tracking-wider">Session Duration</div>
          <div className="grid grid-cols-3 gap-[5px]">
            {PRESETS.map(p => (
              <button key={p} onClick={() => handleSetLimit(p)}
                className={`p-[6px] rounded-[8px] cursor-pointer text-[12px] font-bold transition-all ${
                  limit === p ? "border border-white bg-white/15 text-gray-200" : "border border-[#222222] bg-transparent text-gray-400 hover:border-gray-500"
                }`}>
                {p}m
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-[6px]">
            <input value={customLimit} onChange={e => setCustomLimit(e.target.value)} type="number" min="1" max="480" placeholder="Custom min"
              className="flex-1 p-[7px_10px] bg-[#111111] border border-[#222222] rounded-[8px] text-gray-200 text-[12px] outline-none focus:border-gray-500"/>
            <button onClick={() => { const v = parseInt(customLimit); if (v > 0) handleSetLimit(v); }}
              className="p-[7px_12px] bg-white border-none rounded-[8px] text-black cursor-pointer text-[12px] font-bold hover:bg-gray-200 transition-colors">Set</button>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-[11px] text-gray-400 mb-[5px]">
          <span>Progress</span><span>{Math.round(pct)}%</span>
        </div>
        <div className="h-[6px] bg-[#222222] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${pct}%`, backgroundColor: ringColor }}/>
        </div>
      </div>

      {/* Warnings */}
      {isWarning && state === "running" && (
        <div className="bg-amber-400/10 border border-amber-400/20 rounded-[10px] p-[10px_14px] flex gap-[10px] items-center">
          <AlertTriangle size={15} className="text-amber-300"/>
          <div>
            <div className="text-[12px] font-bold text-amber-300">Session ending soon</div>
            <div className="text-[11px] text-amber-300/80 mt-[2px]">Less than 5 minutes remaining</div>
          </div>
        </div>
      )}

      {state === "ended" && (
        <div className="bg-white/5 border border-white/20 rounded-[12px] p-[14px] text-center">
          <div className="text-[14px] font-extrabold text-gray-200 mb-[6px]">Session Ended</div>
          <div className="text-[12px] text-white mb-[4px]">Duration: {fmt(elapsed)}</div>
          {workSaved && (
            <div className="flex items-center justify-center gap-[6px] text-[12px] text-green-400 mb-[10px]">
              <Save size={12}/> Work saved automatically
            </div>
          )}
          {isTeacher && (
            <button onClick={handleReset}
              className="p-[7px_20px] bg-white border-none rounded-[8px] text-black cursor-pointer text-[12px] font-bold hover:bg-gray-200 transition-colors">
              New Session
            </button>
          )}
        </div>
      )}

      {/* End confirmation modal */}
      {showEndConfirm && (
        <div className="fixed inset-0 bg-ct-dark-black/80 flex items-center justify-center z-[9999]">
          <div className="bg-ct-card border border-[#2a2a2a] rounded-[20px] p-[28px] max-w-[320px] text-center shadow-[0_24px_64px_rgba(0,0,0,0.8)]">
            <AlertTriangle size={32} className="text-amber-300 mx-auto mb-[14px]"/>
            <div className="font-extrabold text-[16px] mb-2 text-white">End Session?</div>
            <div className="text-[13px] text-gray-400 mb-[6px]">This will end the session for all participants.</div>
            <div className="text-[12px] text-green-500 mb-[20px] flex items-center justify-center gap-[5px]">
              <Save size={12}/> Work will be saved automatically
            </div>
            <div className="flex gap-[10px]">
              <button onClick={() => setShowEndConfirm(false)} className="flex-1 p-[9px] border border-[#222222] rounded-[10px] bg-transparent text-gray-300 cursor-pointer font-semibold hover:border-gray-500 transition-colors">Cancel</button>
              <button onClick={handleEnd} className="flex-1 p-[9px] border-none rounded-[10px] bg-red-600 text-white cursor-pointer font-extrabold hover:bg-red-700 transition-colors">End & Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
