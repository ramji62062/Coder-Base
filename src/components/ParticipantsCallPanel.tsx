"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, PhoneCall, AlertCircle, ChevronDown,
  ChevronUp, Maximize2, Minimize2, ScreenShare, Search, MoreHorizontal, Crown,
  VolumeX, Trash2, UserPlus, Users, Wifi, WifiOff
} from "lucide-react";

type PresenceMember = { userId: string; name: string; avatar?: string | null };

type ParticipantsCallPanelProps = {
  members: PresenceMember[];
  currentUserId: string;
  currentUserName: string;
  roomId: string;
  micOn: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  isFullscreen: boolean;
  onFullscreenChange: (val: boolean) => void;
  onMicToggle: (val?: boolean) => void;
  onCameraToggle: (val?: boolean) => void;
  onScreenToggle: (val?: boolean) => void;
  isHost?: boolean;
  hostUserId?: string;
  onAddToast?: (msg: string, type?: "info" | "error" | "success") => void;
  isCallJoined: boolean;
  onCallJoinedChange: (val: boolean) => void;
};

type ConnState = "idle" | "joining" | "joined" | "error";

type ParticipantCallState = {
  socketId: string;
  userId: string;
  name: string;
  micOn: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  stream?: MediaStream;
  isSpeaking?: boolean;
  connectionState?: string;
};

type SignalPayload =
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; candidate: RTCIceCandidateInit };

const peerConfig: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
};
const videoConstraints: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 24, max: 30 },
};

function plainSessionDescription(description: RTCSessionDescriptionInit | null) {
  if (!description) return null;
  return {
    type: description.type,
    sdp: description.sdp || "",
  };
}

function plainIceCandidate(candidate: RTCIceCandidateInit | RTCIceCandidate | null) {
  if (!candidate) return null;
  return {
    candidate: candidate.candidate || "",
    sdpMid: candidate.sdpMid ?? null,
    sdpMLineIndex: candidate.sdpMLineIndex ?? null,
    usernameFragment: candidate.usernameFragment ?? undefined,
  };
}

// ── Utility: generate consistent avatar color ──
function getAvatarColor(name: string): string {
  const colors = [
    "linear-gradient(135deg,#667eea,#764ba2)",
    "linear-gradient(135deg,#f093fb,#f5576c)",
    "linear-gradient(135deg,#4facfe,#00f2fe)",
    "linear-gradient(135deg,#43e97b,#38f9d7)",
    "linear-gradient(135deg,#fa709a,#fee140)",
    "linear-gradient(135deg,#a18cd1,#fbc2eb)",
    "linear-gradient(135deg,#fccb90,#d57eeb)",
    "linear-gradient(135deg,#e0c3fc,#8ec5fc)",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

// ── CSS Keyframes injector ──
const STYLE_ID = "participants-call-panel-styles";
function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes pcp-pulse { 0%,80%,100%{opacity:.3;transform:scale(.8)} 40%{opacity:1;transform:scale(1)} }
    @keyframes pcp-ring { 0%{box-shadow:0 0 0 0 rgba(34,197,94,0.5)} 70%{box-shadow:0 0 0 6px rgba(34,197,94,0)} 100%{box-shadow:0 0 0 0 rgba(34,197,94,0)} }
    @keyframes pcp-fadeIn { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
    @keyframes pcp-slideUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    .pcp-video-tile { transition: transform 0.2s, box-shadow 0.2s; }
    .pcp-video-tile:hover { transform: scale(1.02); box-shadow: 0 4px 20px rgba(0,0,0,0.4); z-index: 2; }
    .pcp-ctrl-btn { transition: background 0.15s, transform 0.1s; }
    .pcp-ctrl-btn:hover { background: rgba(255,255,255,0.12) !important; transform: scale(1.08); }
    .pcp-ctrl-btn:active { transform: scale(0.95); }
    .pcp-member-row { transition: background 0.15s; }
    .pcp-member-row:hover { background: rgba(255,255,255,0.06) !important; }
    .pcp-dropdown-item { transition: background 0.1s; }
    .pcp-dropdown-item:hover { background: #094771 !important; }
  `;
  document.head.appendChild(style);
}

export default function ParticipantsCallPanel({
  members, currentUserId, currentUserName, roomId,
  micOn, cameraOn, screenOn, isFullscreen, onFullscreenChange,
  onMicToggle, onCameraToggle, onScreenToggle,
  isHost = false, hostUserId = "", onAddToast,
  isCallJoined,
  onCallJoinedChange,
}: ParticipantsCallPanelProps) {
  const [connState, setConnState] = useState<ConnState>("idle");
  const [error, setError] = useState("");
  const [callExpanded, setCallExpanded] = useState(true);
  const [participantsExpanded, setParticipantsExpanded] = useState(true);
  const [callParticipants, setCallParticipants] = useState<Record<string, ParticipantCallState>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [localStreamVersion, setLocalStreamVersion] = useState(0);
  const [speakingUsers, setSpeakingUsers] = useState<Record<string, boolean>>({});
  const [pinnedTile, setPinnedTile] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const peerInfoRef = useRef<Record<string, ParticipantCallState>>({});
  const makingOfferRef = useRef<Record<string, boolean>>({});
  const ignoredOfferRef = useRef<Record<string, boolean>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const mediaRequestRef = useRef<Promise<MediaStream> | null>(null);
  const mountedRef = useRef(true);
  const joinedRef = useRef(false);
  const joiningRef = useRef(false);
  const localStateRef = useRef({ micOn, cameraOn, screenOn });
  const audioAnalysersRef = useRef<Record<string, { analyser: AnalyserNode; ctx: AudioContext }>>({});
  const localAudioAnalyserRef = useRef<{ analyser: AnalyserNode; ctx: AudioContext } | null>(null);
  const speakingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const joined = connState === "joined" || connState === "joining";
  const activeRemoteCallUsers = Object.values(callParticipants);
  const totalInCall = joined ? activeRemoteCallUsers.length + 1 : activeRemoteCallUsers.length;

  // Inject CSS keyframes
  useEffect(() => { ensureStyles(); }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupCall();
      if (speakingIntervalRef.current) clearInterval(speakingIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    onCallJoinedChange(joined);
    joinedRef.current = joined;
  }, [joined, onCallJoinedChange]);

  useEffect(() => {
    localStateRef.current = { micOn, cameraOn, screenOn };
    if (joined) emitLocalState();
  }, [micOn, cameraOn, screenOn, joined]);

  // ── Speaking detection ──
  const setupSpeakingDetection = useCallback(() => {
    if (speakingIntervalRef.current) clearInterval(speakingIntervalRef.current);

    speakingIntervalRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      const updates: Record<string, boolean> = {};

      // Check local audio
      if (localAudioAnalyserRef.current) {
        const { analyser } = localAudioAnalyserRef.current;
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += Math.abs(data[i] - 128);
        updates["local"] = sum / data.length > 3;
      }

      // Check remote audio
      Object.entries(audioAnalysersRef.current).forEach(([id, { analyser }]) => {
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += Math.abs(data[i] - 128);
        updates[id] = sum / data.length > 3;
      });

      setSpeakingUsers((prev) => {
        const same = Object.keys(updates).every((k) => prev[k] === updates[k]);
        return same ? prev : { ...prev, ...updates };
      });
    }, 150);
  }, []);

  const setupLocalAudioAnalyser = useCallback(() => {
    if (!audioTrackRef.current || audioTrackRef.current.readyState !== "live") return;
    try {
      if (localAudioAnalyserRef.current) {
        localAudioAnalyserRef.current.ctx.close().catch(() => {});
      }
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(new MediaStream([audioTrackRef.current]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      localAudioAnalyserRef.current = { analyser, ctx };
    } catch { /* AudioContext may not be available */ }
  }, []);

  const setupRemoteAudioAnalyser = useCallback((peerId: string, stream: MediaStream) => {
    try {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return;
      if (audioAnalysersRef.current[peerId]) {
        audioAnalysersRef.current[peerId].ctx.close().catch(() => {});
      }
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(new MediaStream(audioTracks));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioAnalysersRef.current[peerId] = { analyser, ctx };
    } catch { /* ignore */ }
  }, []);

  const cleanupCall = useCallback(() => {
    Object.values(peerConnectionsRef.current).forEach((pc) => { try { pc.close(); } catch {} });
    peerConnectionsRef.current = {};
    peerInfoRef.current = {};
    makingOfferRef.current = {};
    ignoredOfferRef.current = {};
    try { socketRef.current?.emit("call:leave"); } catch {}
    try { socketRef.current?.disconnect(); } catch {}
    socketRef.current = null;
    try { localStreamRef.current?.getTracks().forEach((track) => track.stop()); } catch {}
    try { screenTrackRef.current?.stop(); } catch {}
    localStreamRef.current = null;
    audioTrackRef.current = null;
    cameraTrackRef.current = null;
    screenTrackRef.current = null;
    mediaRequestRef.current = null;
    joiningRef.current = false;

    // Clean up audio analysers
    if (localAudioAnalyserRef.current) {
      try { localAudioAnalyserRef.current.ctx.close(); } catch {}
      localAudioAnalyserRef.current = null;
    }
    Object.values(audioAnalysersRef.current).forEach(({ ctx }) => {
      try { ctx.close(); } catch {};
    });
    audioAnalysersRef.current = {};
    if (speakingIntervalRef.current) clearInterval(speakingIntervalRef.current);
    speakingIntervalRef.current = null;
    setSpeakingUsers({});
  }, []);

  const emitLocalState = useCallback(() => {
    try { socketRef.current?.emit("call:state", localStateRef.current); } catch {}
  }, []);

  // ── Fixed transceiver matching: use index-based approach since we always add audio first, video second ──
  const replaceTrackForAllPeers = useCallback((kind: "audio" | "video", track: MediaStreamTrack | null) => {
    Object.values(peerConnectionsRef.current).forEach((pc) => {
      try {
        const transceivers = pc.getTransceivers();
        // We add audio transceiver first (index 0), video transceiver second (index 1)
        const targetIndex = kind === "audio" ? 0 : 1;
        const transceiver = transceivers[targetIndex];
        if (transceiver?.sender) {
          transceiver.sender.replaceTrack(track).catch(() => undefined);
        }
      } catch {}
    });
  }, []);

  const setRemotePeer = useCallback((peer: ParticipantCallState) => {
    peerInfoRef.current[peer.socketId] = { ...peerInfoRef.current[peer.socketId], ...peer };
    setCallParticipants((prev) => ({ ...prev, [peer.socketId]: { ...prev[peer.socketId], ...peer } }));
  }, []);

  const sendSignal = useCallback((to: string, signal: SignalPayload) => {
    try { socketRef.current?.emit("call:signal", { to, signal }); } catch {}
  }, []);

  const sendOffer = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    try {
      makingOfferRef.current[peerId] = true;
      const offer = await pc.createOffer();
      if (pc.signalingState === "closed") return;
      await pc.setLocalDescription(offer);
      const sdp = plainSessionDescription(pc.localDescription || offer);
      if (sdp) sendSignal(peerId, { type: "offer", sdp });
    } catch {
      // Offer creation failed — peer may have disconnected
    } finally {
      makingOfferRef.current[peerId] = false;
    }
  }, [sendSignal]);

  const getLocalMedia = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (mediaRequestRef.current) return mediaRequestRef.current;

    mediaRequestRef.current = (async () => {
      const stream = new MediaStream();
      try {
        const audio = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        audio.getTracks().forEach((track) => {
          track.enabled = localStateRef.current.micOn;
          audioTrackRef.current = track;
          stream.addTrack(track);
        });
      } catch {
        onAddToast?.("Microphone is blocked. You can still join and turn it on later.", "error");
      }

      try {
        const video = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints });
        video.getTracks().forEach((track) => {
          track.enabled = localStateRef.current.cameraOn;
          cameraTrackRef.current = track;
          stream.addTrack(track);
        });
      } catch {
        onAddToast?.("Camera is blocked. You can still use mic and screen share.", "info");
      }

      localStreamRef.current = stream;
      setLocalStreamVersion((version) => version + 1);

      // Set up local audio analyser for speaking detection
      if (audioTrackRef.current) {
        setupLocalAudioAnalyser();
        setupSpeakingDetection();
      }

      return stream;
    })();

    try {
      return await mediaRequestRef.current;
    } finally {
      mediaRequestRef.current = null;
    }
  }, [onAddToast, setupLocalAudioAnalyser, setupSpeakingDetection]);

  const ensureAudioTrack = useCallback(async () => {
    if (audioTrackRef.current && audioTrackRef.current.readyState === "live") return audioTrackRef.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const [track] = media.getAudioTracks();
      if (!track) throw new Error("No microphone track available");
      track.enabled = localStateRef.current.micOn;
      audioTrackRef.current = track;
      if (!localStreamRef.current) localStreamRef.current = new MediaStream();
      // Remove old dead audio tracks
      localStreamRef.current.getAudioTracks().forEach((t) => {
        if (t.readyState !== "live") localStreamRef.current!.removeTrack(t);
      });
      localStreamRef.current.addTrack(track);
      replaceTrackForAllPeers("audio", track);
      setupLocalAudioAnalyser();
      setLocalStreamVersion((version) => version + 1);
      return track;
    } catch (err) {
      throw err;
    }
  }, [replaceTrackForAllPeers, setupLocalAudioAnalyser]);

  const ensureCameraTrack = useCallback(async () => {
    if (cameraTrackRef.current && cameraTrackRef.current.readyState === "live") return cameraTrackRef.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints });
      const [track] = media.getVideoTracks();
      if (!track) throw new Error("No camera track available");
      track.enabled = localStateRef.current.cameraOn;
      cameraTrackRef.current = track;
      if (!localStreamRef.current) localStreamRef.current = new MediaStream();
      // Remove old dead video tracks (but not screen share tracks)
      localStreamRef.current.getVideoTracks().forEach((t) => {
        if (t.readyState !== "live" && t !== screenTrackRef.current) {
          localStreamRef.current!.removeTrack(t);
        }
      });
      localStreamRef.current.addTrack(track);
      if (!screenTrackRef.current) replaceTrackForAllPeers("video", track);
      setLocalStreamVersion((version) => version + 1);
      return track;
    } catch (err) {
      throw err;
    }
  }, [replaceTrackForAllPeers]);

  const createPeerConnection = useCallback(async (peer: ParticipantCallState, initiator: boolean) => {
    const existing = peerConnectionsRef.current[peer.socketId];
    if (existing && existing.connectionState !== "closed" && existing.connectionState !== "failed") return existing;

    // Clean up any existing broken connection
    if (existing) {
      try { existing.close(); } catch {}
      delete peerConnectionsRef.current[peer.socketId];
    }

    const pc = new RTCPeerConnection(peerConfig);
    peerConnectionsRef.current[peer.socketId] = pc;

    await getLocalMedia();

    // Always add transceivers in order: audio (index 0), video (index 1)
    const audioTransceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
    const videoTransceiver = pc.addTransceiver("video", { direction: "sendrecv" });

    try {
      await audioTransceiver.sender.replaceTrack(audioTrackRef.current);
    } catch { /* no audio track available */ }

    try {
      await videoTransceiver.sender.replaceTrack(screenTrackRef.current || cameraTrackRef.current);
    } catch { /* no video track available */ }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidate = plainIceCandidate(event.candidate);
        if (candidate) sendSignal(peer.socketId, { type: "ice", candidate });
      }
    };

    pc.onnegotiationneeded = () => {
      if (initiator && pc.signalingState === "stable") {
        sendOffer(peer.socketId, pc).catch(() => undefined);
      }
    };

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      setCallParticipants((prev) => {
        const current = prev[peer.socketId] || peer;
        // Always create a fresh stream to ensure React detects the change
        const existingStream = current.stream;
        let stream: MediaStream;
        if (existingStream) {
          stream = existingStream;
          if (!stream.getTracks().includes(event.track)) {
            stream.addTrack(event.track);
          }
        } else {
          stream = remoteStream;
        }
        return { ...prev, [peer.socketId]: { ...current, stream } };
      });

      // Set up remote audio analyser
      if (event.track.kind === "audio") {
        const stream = event.streams[0] || new MediaStream([event.track]);
        setupRemoteAudioAnalyser(peer.socketId, stream);
        if (!speakingIntervalRef.current) setupSpeakingDetection();
      }

      // Force video tile update by incrementing version
      setLocalStreamVersion((v) => v + 1);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;

      // Update peer connection state for UI
      setCallParticipants((prev) => {
        if (!prev[peer.socketId]) return prev;
        return { ...prev, [peer.socketId]: { ...prev[peer.socketId], connectionState: state } };
      });

      if (state === "failed") {
        // Attempt ICE restart before giving up
        if (initiator && pc.signalingState === "stable") {
          pc.createOffer({ iceRestart: true })
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => {
              const sdp = plainSessionDescription(pc.localDescription);
              if (sdp) sendSignal(peer.socketId, { type: "offer", sdp });
            })
            .catch(() => {
              try { pc.close(); } catch {}
              delete peerConnectionsRef.current[peer.socketId];
            });
        }
      } else if (state === "closed") {
        delete peerConnectionsRef.current[peer.socketId];
      }
      if (state === "connected") setError("");
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed" && initiator) {
        pc.createOffer({ iceRestart: true })
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            const sdp = plainSessionDescription(pc.localDescription);
            if (sdp) sendSignal(peer.socketId, { type: "offer", sdp });
          })
          .catch(() => undefined);
      }
    };

    if (initiator) {
      await sendOffer(peer.socketId, pc);
    }

    return pc;
  }, [getLocalMedia, sendOffer, sendSignal, setupRemoteAudioAnalyser, setupSpeakingDetection]);

  const handleSignal = useCallback(async ({ from, signal }: { from: string; signal: SignalPayload }) => {
    const peer = peerInfoRef.current[from] || {
      socketId: from,
      userId: from,
      name: "Guest",
      micOn: false,
      cameraOn: false,
      screenOn: false,
    };

    let pc: RTCPeerConnection;
    try {
      pc = await createPeerConnection(peer, false);
    } catch {
      return; // Can't create connection
    }

    try {
      if (signal.type === "offer") {
        const offerCollision = makingOfferRef.current[from] || pc.signalingState !== "stable";
        const polite = !socketRef.current?.id || socketRef.current.id > from;
        ignoredOfferRef.current[from] = !polite && offerCollision;
        if (ignoredOfferRef.current[from]) return;
        if (offerCollision) {
          await pc.setLocalDescription({ type: "rollback" });
        }
        await pc.setRemoteDescription(signal.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        const sdp = plainSessionDescription(pc.localDescription || answer);
        if (sdp) sendSignal(from, { type: "answer", sdp });
      } else if (signal.type === "answer") {
        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(signal.sdp);
        }
      } else if (signal.type === "ice") {
        try {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(signal.candidate);
          }
        } catch (err) {
          if (!ignoredOfferRef.current[from]) {
            // Silently ignore ICE candidate errors — they're common during renegotiation
          }
        }
      }
    } catch {
      // Signal handling failed — the peer connection may have been closed during handling
    }
  }, [createPeerConnection, sendSignal]);

  const startMeeting = useCallback(async () => {
    // Guard against double-join
    if (joiningRef.current || joinedRef.current) return;
    joiningRef.current = true;

    if (!navigator.mediaDevices || !window.RTCPeerConnection) {
      setError("This browser does not support WebRTC meetings.");
      setConnState("error");
      joiningRef.current = false;
      return;
    }

    setConnState("joining");
    setError("");

    try {
      await getLocalMedia();
      const socket = io({ path: "/api/socket", transports: ["websocket", "polling"], reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 1000 });
      socketRef.current = socket;

      socket.on("connect", () => {
        socket.emit("call:join", {
          roomId,
          userId: currentUserId,
          name: currentUserName || "User",
          ...localStateRef.current,
        });
      });

      socket.on("call:peers", async (peers: ParticipantCallState[]) => {
        if (!mountedRef.current) return;
        peers.forEach(setRemotePeer);
        setConnState("joined");
        joiningRef.current = false;
        emitLocalState();
      });

      socket.on("call:peer-joined", async (peer: ParticipantCallState) => {
        if (!mountedRef.current) return;
        setRemotePeer(peer);
        setConnState("joined");
        joiningRef.current = false;
        try {
          await createPeerConnection(peer, true);
        } catch {
          // Peer connection failed, will retry on signal
        }
        emitLocalState();
      });

      socket.on("call:signal", (payload) => {
        handleSignal(payload).catch(() => {
          // Signal handling error — non-fatal
        });
      });

      socket.on("call:peer-state", (peer: ParticipantCallState) => setRemotePeer(peer));

      socket.on("call:peer-left", ({ socketId }: { socketId: string }) => {
        try { peerConnectionsRef.current[socketId]?.close(); } catch {}
        delete peerConnectionsRef.current[socketId];
        delete peerInfoRef.current[socketId];
        delete makingOfferRef.current[socketId];
        delete ignoredOfferRef.current[socketId];
        // Clean up audio analyser
        if (audioAnalysersRef.current[socketId]) {
          try { audioAnalysersRef.current[socketId].ctx.close(); } catch {}
          delete audioAnalysersRef.current[socketId];
        }
        setCallParticipants((prev) => {
          const next = { ...prev };
          delete next[socketId];
          return next;
        });
      });

      socket.on("call:host-action", ({ action }: { action: string }) => {
        if (action === "mute-audio") setMicEnabled(false);
        if (action === "mute-video") setCameraEnabled(false);
        if (action === "kick") leaveCall();
      });

      socket.on("call:error", ({ error: callError }: { error?: string }) => {
        if (!mountedRef.current) return;
        setError(callError || "Could not join the meeting.");
        setConnState("error");
        joiningRef.current = false;
      });

      socket.on("connect_error", (err) => {
        if (!joinedRef.current) {
          setError("Meeting server connection failed. Make sure the app is running with npm run dev.");
          setConnState("error");
          joiningRef.current = false;
        }
      });

      socket.on("disconnect", (reason) => {
        if (reason === "io server disconnect") {
          // Server disconnected us — try to reconnect
          socket.connect();
        }
        // For other reasons, socket.io will auto-reconnect
      });

      socket.on("reconnect", () => {
        // Re-join the call room after reconnection
        socket.emit("call:join", {
          roomId,
          userId: currentUserId,
          name: currentUserName || "User",
          ...localStateRef.current,
        });
      });

    } catch {
      setError("Failed to start the local WebRTC meeting.");
      setConnState("error");
      joiningRef.current = false;
    }
  }, [roomId, currentUserId, currentUserName, getLocalMedia, setRemotePeer, createPeerConnection, handleSignal, emitLocalState]);

  const leaveCall = useCallback(() => {
    cleanupCall();
    setConnState("idle");
    setCallParticipants({});
    setPinnedTile(null);
    onFullscreenChange(false);
    if (screenOn) onScreenToggle(false);
  }, [cleanupCall, onFullscreenChange, onScreenToggle, screenOn]);

  const setMicEnabled = useCallback(async (enabled: boolean) => {
    if (enabled) {
      try {
        await ensureAudioTrack();
      } catch {
        onMicToggle(false);
        onAddToast?.("Microphone permission blocked. Allow mic access in the browser address bar.", "error");
        return;
      }
    }
    if (audioTrackRef.current) audioTrackRef.current.enabled = enabled;
    localStateRef.current.micOn = enabled;
    onMicToggle(enabled);
    emitLocalState();
  }, [emitLocalState, ensureAudioTrack, onAddToast, onMicToggle]);

  const setCameraEnabled = useCallback(async (enabled: boolean) => {
    if (enabled) {
      try {
        await ensureCameraTrack();
      } catch {
        onCameraToggle(false);
        onAddToast?.("Camera permission blocked. Allow camera access in the browser address bar.", "error");
        return;
      }
    }
    if (cameraTrackRef.current) cameraTrackRef.current.enabled = enabled;
    localStateRef.current.cameraOn = enabled;
    onCameraToggle(enabled);
    emitLocalState();
  }, [emitLocalState, ensureCameraTrack, onAddToast, onCameraToggle]);

  const stopScreenShare = useCallback(() => {
    try { screenTrackRef.current?.stop(); } catch {}
    if (screenTrackRef.current && localStreamRef.current) {
      try { localStreamRef.current.removeTrack(screenTrackRef.current); } catch {}
    }
    screenTrackRef.current = null;
    // When stopping screen share, restore camera track (may be null — that's OK)
    const cameraTrack = cameraTrackRef.current?.readyState === "live" ? cameraTrackRef.current : null;
    replaceTrackForAllPeers("video", cameraTrack);
    localStateRef.current.screenOn = false;
    onScreenToggle(false);
    onFullscreenChange(false);
    emitLocalState();
    setLocalStreamVersion((version) => version + 1);
  }, [emitLocalState, onFullscreenChange, onScreenToggle, replaceTrackForAllPeers]);

  const startScreenShare = useCallback(async () => {
    if (!joinedRef.current) {
      await startMeeting();
      // Wait briefly for the socket connection and call:peers event
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 24, max: 30 } },
        audio: false,
      });
      const [screenTrack] = displayStream.getVideoTracks();
      if (!screenTrack) return;
      screenTrackRef.current = screenTrack;
      screenTrack.onended = stopScreenShare;
      if (localStreamRef.current && !localStreamRef.current.getTracks().includes(screenTrack)) {
        localStreamRef.current.addTrack(screenTrack);
      }
      replaceTrackForAllPeers("video", screenTrack);
      localStateRef.current.screenOn = true;
      onScreenToggle(true);
      onFullscreenChange(true);
      emitLocalState();
      setLocalStreamVersion((version) => version + 1);
    } catch {
      onScreenToggle(false);
      onAddToast?.("Screen sharing was cancelled or blocked.", "error");
    }
  }, [emitLocalState, onFullscreenChange, onScreenToggle, replaceTrackForAllPeers, startMeeting, stopScreenShare, onAddToast]);

  // ── Sync external state changes to tracks ──
  useEffect(() => {
    if (!joined) return;
    if (micOn) ensureAudioTrack().catch(() => onMicToggle(false));
    if (audioTrackRef.current) audioTrackRef.current.enabled = micOn;
    localStateRef.current.micOn = micOn;
    emitLocalState();
  }, [micOn, joined, emitLocalState, ensureAudioTrack, onMicToggle]);

  useEffect(() => {
    if (!joined) return;
    if (cameraOn) ensureCameraTrack().catch(() => onCameraToggle(false));
    if (cameraTrackRef.current) cameraTrackRef.current.enabled = cameraOn;
    localStateRef.current.cameraOn = cameraOn;
    emitLocalState();
  }, [cameraOn, joined, emitLocalState, ensureCameraTrack, onCameraToggle]);

  useEffect(() => {
    if (!joined || screenOn === Boolean(screenTrackRef.current)) return;
    if (screenOn) startScreenShare().catch(() => onScreenToggle(false));
    else stopScreenShare();
  }, [screenOn, joined, startScreenShare, stopScreenShare, onScreenToggle]);

  // ── Button handlers ──
  const handleMicBtn = () => { void setMicEnabled(!micOn); };
  const handleCameraBtn = () => { void setCameraEnabled(!cameraOn); };
  const handleScreenBtn = () => {
    if (screenTrackRef.current) stopScreenShare();
    else startScreenShare().catch(() => {
      onScreenToggle(false);
    });
  };

  const handleMuteRemoteAudio = (participantId: string) => {
    socketRef.current?.emit("call:host-action", { to: participantId, action: "mute-audio" });
    onAddToast?.("Asked participant to mute audio", "info");
  };

  const handleMuteRemoteVideo = (participantId: string) => {
    socketRef.current?.emit("call:host-action", { to: participantId, action: "mute-video" });
    onAddToast?.("Asked participant to stop video", "info");
  };

  const handleKickParticipant = (participantId: string) => {
    socketRef.current?.emit("call:host-action", { to: participantId, action: "kick" });
    onAddToast?.("Removed participant from meeting", "error");
  };

  const handleMuteAll = () => {
    activeRemoteCallUsers.forEach((peer) => handleMuteRemoteAudio(peer.socketId));
    onAddToast?.("Asked everyone to mute", "info");
  };

  const handleInvite = () => {
    const inviteLink = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(inviteLink);
    onAddToast?.("Invite link copied to clipboard!", "success");
  };

  // ── Participant categorization ──
  const membersInCall = members.filter((member) => {
    if (member.userId === currentUserId) return joined;
    return activeRemoteCallUsers.some((peer) => peer.userId === member.userId || peer.name.toLowerCase() === member.name.toLowerCase());
  });

  const membersNotInCall = members.filter((member) => {
    if (member.userId === currentUserId) return !joined;
    return !activeRemoteCallUsers.some((peer) => peer.userId === member.userId || peer.name.toLowerCase() === member.name.toLowerCase());
  });

  const filteredMembersInCall = membersInCall.filter((m) => m.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredMembersNotInCall = membersNotInCall.filter((m) => m.name.toLowerCase().includes(searchQuery.toLowerCase()));

  // ── Tiles for video grid ──
  const tiles = useMemo(() => {
    const localPreviewStream = screenTrackRef.current
      ? new MediaStream([...Array.from(localStreamRef.current?.getAudioTracks() || []), screenTrackRef.current])
      : localStreamRef.current || undefined;
    const localTile: ParticipantCallState | null = joined ? {
      socketId: "local",
      userId: currentUserId,
      name: `${currentUserName || "You"} (Me)`,
      micOn,
      cameraOn,
      screenOn,
      stream: localPreviewStream,
      isSpeaking: speakingUsers["local"],
    } : null;

    const remoteTiles = activeRemoteCallUsers.map((p) => ({
      ...p,
      isSpeaking: speakingUsers[p.socketId],
    }));

    const all = localTile ? [localTile, ...remoteTiles] : remoteTiles;

    // If a tile is pinned, put it first
    if (pinnedTile) {
      const pinIdx = all.findIndex((t) => t.socketId === pinnedTile);
      if (pinIdx > 0) {
        const [pinned] = all.splice(pinIdx, 1);
        all.unshift(pinned);
      }
    }

    return all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, currentUserId, currentUserName, micOn, cameraOn, screenOn, activeRemoteCallUsers, localStreamVersion, speakingUsers, pinnedTile]);

  // ── Grid layout calculation ──
  const gridStyle = useMemo(() => {
    const count = tiles.length;
    if (count === 0) return { gridTemplateColumns: "1fr" };
    if (count === 1) return { gridTemplateColumns: "1fr" };
    if (count === 2) return { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" };
    if (count <= 4) return { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" };
    if (count <= 9) return { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" };
    return { gridTemplateColumns: "repeat(4, minmax(0, 1fr))" };
  }, [tiles.length]);

  // ── Pinned view: if pinned, show 1 large + strip of small ──
  const hasPinned = pinnedTile && tiles.length > 1 && tiles[0]?.socketId === pinnedTile;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "#151515" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #222", background: "#1c1c1c" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#888", letterSpacing: "0.08em" }}>
            Participants &amp; Call
          </div>
          {totalInCall > 0 && (
            <div style={{
              display: "flex", alignItems: "center", gap: 4,
              background: "rgba(34,197,94,0.12)", color: "#22c55e",
              padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600,
            }}>
              <Users size={10} /> {totalInCall}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "8px 10px", borderBottom: "1px solid #222", background: "#181818" }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Search size={13} color="#666" style={{ position: "absolute", left: 8, zIndex: 1 }} />
          <input
            type="text"
            placeholder="Search participants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "100%", background: "#222", border: "1px solid #333", borderRadius: 6, padding: "6px 8px 6px 28px", color: "#fff", fontSize: 12, outline: "none", transition: "border-color 0.15s" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "#555"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "#333"; }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {/* ── Video Call Section ── */}
        <div>
          <SectionHeader title="Video Call" badge={joined ? `${totalInCall} in call` : "Ready"} expanded={callExpanded} onClick={() => setCallExpanded((p) => !p)} />
          {callExpanded && (
            <div style={{ padding: "8px 8px 6px" }}>
              {/* Idle state */}
              {connState === "idle" && (
                <div style={{ textAlign: "center", padding: "18px 0", animation: "pcp-fadeIn 0.3s" }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg, #22c55e, #15803d)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                    <PhoneCall size={22} color="#fff" />
                  </div>
                  <div style={{ fontSize: 13, color: "#ddd", fontWeight: 600, marginBottom: 4 }}>Start a Meeting</div>
                  <div style={{ fontSize: 11, color: "#777", marginBottom: 14, lineHeight: 1.4 }}>Free unlimited browser meetings with screen share</div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                    <button onClick={startMeeting} style={primaryBtn("#22c55e")}>
                      <PhoneCall size={13} /> Join Call
                    </button>
                    <button onClick={handleScreenBtn} style={primaryBtn("#7C3AED")}>
                      <ScreenShare size={13} /> Share Screen
                    </button>
                  </div>
                </div>
              )}

              {/* Joining state with animation */}
              {connState === "joining" && (
                <div style={{ textAlign: "center", padding: "24px 0", animation: "pcp-fadeIn 0.3s" }}>
                  <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }}>
                    {[0, 1, 2].map((i) => (
                      <div key={i} style={{
                        width: 8, height: 8, borderRadius: "50%", background: "#22c55e",
                        animation: `pcp-pulse 1.4s ease-in-out ${i * 0.16}s infinite`,
                      }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: "#aaa", fontWeight: 500 }}>Joining meeting...</div>
                  <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>Setting up audio & video</div>
                </div>
              )}

              {/* Error state */}
              {connState === "error" && (
                <div style={{ textAlign: "center", padding: "14px 8px", animation: "pcp-fadeIn 0.3s" }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(248,113,113,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px" }}>
                    <AlertCircle size={20} color="#f87171" />
                  </div>
                  <div style={{ fontSize: 12, color: "#f87171", marginTop: 4, lineHeight: 1.5, maxWidth: 240, margin: "4px auto 0", fontWeight: 500 }}>
                    {error || "Call failed"}
                  </div>
                  <button onClick={startMeeting} style={{ marginTop: 12, padding: "6px 18px", background: "#333", color: "#ccc", border: "1px solid #444", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 500, transition: "background 0.15s" }}>
                    Retry Call
                  </button>
                </div>
              )}

              {/* Video grid */}
              <div style={{
                display: joined ? "block" : "none",
                width: "100%",
                height: isFullscreen ? "100vh" : 320,
                borderRadius: isFullscreen ? 0 : 10,
                overflow: "hidden",
                border: isFullscreen ? "none" : "1px solid #2a2a2a",
                background: "#0a0a0a",
                position: isFullscreen ? "fixed" : "relative",
                inset: isFullscreen ? 0 : undefined,
                zIndex: isFullscreen ? 99999 : 1,
                animation: joined ? "pcp-fadeIn 0.3s" : undefined,
              }}>
                {/* Participant count overlay */}
                {isFullscreen && (
                  <div style={{
                    position: "absolute", top: 16, left: 16, zIndex: 100001,
                    display: "flex", alignItems: "center", gap: 6,
                    background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)",
                    borderRadius: 8, padding: "5px 12px", color: "#fff", fontSize: 12,
                  }}>
                    <Users size={14} /> {totalInCall} participant{totalInCall !== 1 ? "s" : ""}
                  </div>
                )}

                {/* Pinned view */}
                {hasPinned ? (
                  <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 4, padding: 4, boxSizing: "border-box" }}>
                    <div style={{ flex: 1, minHeight: 0 }}>
                      <VideoTile
                        peer={tiles[0]}
                        muted={tiles[0].socketId === "local"}
                        isPinned
                        onPin={() => setPinnedTile(null)}
                        isFullscreen={isFullscreen}
                      />
                    </div>
                    {tiles.length > 1 && (
                      <div style={{ display: "flex", gap: 4, height: isFullscreen ? 120 : 80, flexShrink: 0 }}>
                        {tiles.slice(1).map((tile) => (
                          <VideoTile
                            key={tile.socketId}
                            peer={tile}
                            muted={tile.socketId === "local"}
                            onPin={() => setPinnedTile(tile.socketId)}
                            isFullscreen={isFullscreen}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ height: "100%", display: "grid", ...gridStyle, gap: 4, padding: 4, boxSizing: "border-box" }}>
                    {tiles.map((tile) => (
                      <VideoTile
                        key={tile.socketId}
                        peer={tile}
                        muted={tile.socketId === "local"}
                        onPin={() => setPinnedTile(tile.socketId === pinnedTile ? null : tile.socketId)}
                        isFullscreen={isFullscreen}
                      />
                    ))}
                    {tiles.length === 0 && <div style={{ color: "#555", fontSize: 12, display: "grid", placeItems: "center" }}>Waiting for participants...</div>}
                  </div>
                )}

                {/* ── Call Controls Bar (Google Meet style) ── */}
                <div style={{
                  position: "absolute", bottom: isFullscreen ? 24 : 10, left: "50%", transform: "translateX(-50%)",
                  zIndex: 100000, background: "rgba(32, 33, 36, 0.94)", border: "1px solid rgba(255, 255, 255, 0.08)",
                  padding: isFullscreen ? "8px 20px" : "6px 12px", borderRadius: 24,
                  display: "flex", gap: isFullscreen ? 8 : 6, alignItems: "center",
                  boxShadow: "0 8px 28px rgba(0,0,0,0.6)", backdropFilter: "blur(12px)",
                  width: "auto", justifyContent: "center", boxSizing: "border-box",
                  animation: "pcp-slideUp 0.3s",
                }}>
                  <ControlButton
                    onClick={handleMicBtn}
                    active={micOn}
                    danger={!micOn}
                    label={micOn ? "Mute" : "Unmute"}
                    showLabel={isFullscreen}
                    icon={micOn ? <Mic size={isFullscreen ? 20 : 16} /> : <MicOff size={isFullscreen ? 20 : 16} />}
                  />
                  <ControlButton
                    onClick={handleCameraBtn}
                    active={cameraOn}
                    danger={!cameraOn}
                    label={cameraOn ? "Stop Video" : "Start Video"}
                    showLabel={isFullscreen}
                    icon={cameraOn ? <Video size={isFullscreen ? 20 : 16} /> : <VideoOff size={isFullscreen ? 20 : 16} />}
                  />
                  <ControlButton
                    onClick={handleScreenBtn}
                    active={screenOn}
                    accent
                    label={screenOn ? "Stop Share" : "Present"}
                    showLabel={isFullscreen}
                    icon={<ScreenShare size={isFullscreen ? 20 : 16} />}
                  />

                  <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.12)", margin: "0 2px" }} />

                  <ControlButton
                    onClick={() => onFullscreenChange(!isFullscreen)}
                    active={false}
                    label={isFullscreen ? "Minimize" : "Fullscreen"}
                    showLabel={isFullscreen}
                    icon={isFullscreen ? <Minimize2 size={isFullscreen ? 20 : 16} /> : <Maximize2 size={isFullscreen ? 20 : 16} />}
                  />

                  <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.12)", margin: "0 2px" }} />

                  <button
                    onClick={leaveCall}
                    className="pcp-ctrl-btn"
                    title="Leave call"
                    style={{
                      background: "#ea4335", color: "#fff", border: "none", cursor: "pointer",
                      padding: isFullscreen ? "8px 20px" : "6px 14px", borderRadius: 18,
                      fontSize: isFullscreen ? 13 : 11, fontWeight: 600,
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <PhoneOff size={isFullscreen ? 16 : 13} />
                    {isFullscreen && "Leave"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── In Meeting Section ── */}
        <div>
          <SectionHeader title={`In Meeting (${filteredMembersInCall.length})`} expanded={participantsExpanded} onClick={() => setParticipantsExpanded((p) => !p)} />
          {participantsExpanded && (
            <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
              {filteredMembersInCall.map((member) => {
                const isSelf = member.userId === currentUserId;
                const peer = activeRemoteCallUsers.find((p) => p.userId === member.userId || p.name.toLowerCase() === member.name.toLowerCase());
                return (
                  <MemberRow
                    key={member.userId}
                    name={member.name}
                    isSelf={isSelf}
                    micOn={isSelf ? micOn : Boolean(peer?.micOn)}
                    cameraOn={isSelf ? cameraOn : Boolean(peer?.cameraOn)}
                    screenSharing={isSelf ? screenOn : Boolean(peer?.screenOn)}
                    inCall
                    isSpeaking={isSelf ? speakingUsers["local"] : (peer ? speakingUsers[peer.socketId] : false)}
                    connectionState={peer?.connectionState}
                    isHostParticipant={member.userId === hostUserId}
                    isCurrentUserHost={isHost}
                    participantId={peer?.socketId}
                    onMuteAudio={handleMuteRemoteAudio}
                    onMuteVideo={handleMuteRemoteVideo}
                    onKick={handleKickParticipant}
                  />
                );
              })}
              {filteredMembersInCall.length === 0 && (
                <div style={{ fontSize: 11, color: "#555", textAlign: "center", padding: "12px 0" }}>
                  {searchQuery ? "No matching participants" : "No participants in call yet"}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Not in Call Section ── */}
        {filteredMembersNotInCall.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 12px", background: "#1c1c1c", borderBottom: "1px solid #222", userSelect: "none" }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#666", letterSpacing: "0.05em" }}>
                Not in Call ({filteredMembersNotInCall.length})
              </span>
            </div>
            <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
              {filteredMembersNotInCall.map((member) => (
                <MemberRow key={member.userId} name={member.name} isSelf={member.userId === currentUserId} inCall={false} isHostParticipant={member.userId === hostUserId} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom Action Bar ── */}
      <div style={{ padding: "10px 10px", borderTop: "1px solid #2a2a2a", background: "#1a1a1a", display: "flex", gap: 6 }}>
        <button onClick={handleInvite} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 12px", background: "#2a2a2a", color: "#ddd", border: "1px solid #333", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, transition: "background 0.15s" }}>
          <UserPlus size={13} /> Invite
        </button>
        {isHost && joined && (
          <button onClick={handleMuteAll} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 12px", background: "rgba(220,38,38,0.15)", color: "#f87171", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, transition: "background 0.15s" }}>
            <VolumeX size={13} /> Mute All
          </button>
        )}
      </div>
    </div>
  );
}

// ── Video Tile Component ──
function VideoTile({ peer, muted, isPinned, onPin, isFullscreen }: {
  peer: ParticipantCallState;
  muted?: boolean;
  isPinned?: boolean;
  onPin?: () => void;
  isFullscreen?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [trackVersion, setTrackVersion] = useState(0);

  // Update video srcObject when stream or tracks change
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !peer.stream) return;
    video.srcObject = peer.stream;

    // Listen for track changes on the stream
    const handleTrackChange = () => setTrackVersion((v) => v + 1);
    peer.stream.addEventListener("addtrack", handleTrackChange);
    peer.stream.addEventListener("removetrack", handleTrackChange);

    return () => {
      peer.stream?.removeEventListener("addtrack", handleTrackChange);
      peer.stream?.removeEventListener("removetrack", handleTrackChange);
    };
  }, [peer.stream, trackVersion]);

  // Always play remote peer audio via a dedicated audio element to guarantee sound even when video is off
  useEffect(() => {
    if (muted) return;
    const audio = audioRef.current;
    if (!audio || !peer.stream) return;
    audio.srcObject = peer.stream;
    audio.play().catch(() => {});
  }, [peer.stream, muted]);

  const hasVideo = peer.stream && (peer.cameraOn || peer.screenOn);
  const initials = peer.name.replace(/\s*\(Me\)$/, "").slice(0, 2).toUpperCase();

  return (
    <div
      className="pcp-video-tile"
      onClick={onPin}
      style={{
        position: "relative", minHeight: 0, overflow: "hidden", borderRadius: 8,
        background: "#1a1a1a", cursor: "pointer", flex: isPinned ? undefined : "1 1 0%",
        height: "100%", width: "100%",
        border: peer.isSpeaking ? "2px solid #22c55e" : isPinned ? "2px solid #4285f4" : "1px solid #2a2a2a",
        animation: peer.isSpeaking ? "pcp-ring 1.5s infinite" : undefined,
      }}
    >
      {/* Hidden audio element for remote stream to guarantee audio plays even when video is off */}
      {!muted && peer.stream && (
        <audio ref={audioRef} autoPlay playsInline style={{ display: "none" }} />
      )}

      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={true} // Video element is always muted; audio is played via the dedicated <audio> element
          style={{ width: "100%", height: "100%", objectFit: peer.screenOn ? "contain" : "cover", background: "#000" }}
        />
      ) : (
        <div style={{
          height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: getAvatarColor(peer.name), gap: 6,
        }}>
          <div style={{
            width: isFullscreen ? 64 : 36, height: isFullscreen ? 64 : 36, borderRadius: "50%",
            background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: isFullscreen ? 24 : 14, fontWeight: 700, color: "#fff",
            border: peer.isSpeaking ? "2px solid #22c55e" : "2px solid rgba(255,255,255,0.3)",
          }}>
            {initials}
          </div>
        </div>
      )}

      {/* Muted mic indicator overlay */}
      {!peer.micOn && (
        <div style={{
          position: "absolute", top: 6, right: 6,
          background: "rgba(239,68,68,0.85)", borderRadius: "50%",
          width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <MicOff size={12} color="#fff" />
        </div>
      )}

      {/* Connection state indicator */}
      {peer.connectionState && peer.connectionState !== "connected" && peer.socketId !== "local" && (
        <div style={{
          position: "absolute", top: 6, left: 6,
          display: "flex", alignItems: "center", gap: 4,
          background: "rgba(0,0,0,0.7)", borderRadius: 4, padding: "2px 6px",
          fontSize: 9, color: peer.connectionState === "connecting" || peer.connectionState === "new" ? "#fbbf24" : "#f87171",
        }}>
          {peer.connectionState === "connecting" || peer.connectionState === "new" ? (
            <Wifi size={9} />
          ) : (
            <WifiOff size={9} />
          )}
          {peer.connectionState}
        </div>
      )}

      {/* Bottom info bar */}
      <div style={{ position: "absolute", left: 6, bottom: 6, right: 6, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <span style={{
          minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          background: "rgba(0,0,0,0.6)", color: "#fff", borderRadius: 4, padding: "3px 8px",
          fontSize: 11, backdropFilter: "blur(4px)", fontWeight: 500,
        }}>
          {peer.name}
        </span>
        <span style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.6)", borderRadius: 4, padding: "3px 6px", backdropFilter: "blur(4px)" }}>
          {peer.micOn ? <Mic size={12} color="#22c55e" /> : <MicOff size={12} color="#ef4444" />}
          {peer.screenOn ? <ScreenShare size={12} color="#c084fc" /> : peer.cameraOn ? <Video size={12} color="#22c55e" /> : <VideoOff size={12} color="#ef4444" />}
        </span>
      </div>
    </div>
  );
}

// ── Section Header ──
function SectionHeader({ title, badge, expanded, onClick }: { title: string; badge?: string; expanded: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", cursor: "pointer", background: "#1c1c1c", borderBottom: "1px solid #222", userSelect: "none", transition: "background 0.15s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#aaa", letterSpacing: "0.05em" }}>{title}</span>
        {badge && <span style={{ fontSize: 9, background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 10, padding: "1px 6px", fontWeight: 600 }}>{badge}</span>}
      </div>
      {expanded ? <ChevronUp size={13} color="#666" /> : <ChevronDown size={13} color="#666" />}
    </div>
  );
}

// ── Control Button (Google Meet style) ──
function ControlButton({ onClick, active, danger, accent, label, showLabel, icon }: {
  onClick: () => void;
  active: boolean;
  danger?: boolean;
  accent?: boolean;
  label: string;
  showLabel: boolean;
  icon: ReactNode;
}) {
  let bgColor = "transparent";
  let fgColor = "#e8eaed";

  if (danger) {
    bgColor = "rgba(234,67,53,0.2)";
    fgColor = "#ea4335";
  } else if (accent && active) {
    bgColor = "rgba(138,43,226,0.2)";
    fgColor = "#c084fc";
  } else if (accent) {
    bgColor = "transparent";
    fgColor = "#e8eaed";
  } else if (active) {
    bgColor = "rgba(255,255,255,0.08)";
    fgColor = "#e8eaed";
  }

  return (
    <button
      onClick={onClick}
      className="pcp-ctrl-btn"
      title={label}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: bgColor, border: "none", color: fgColor, cursor: "pointer",
        padding: showLabel ? "6px 12px" : "6px 10px", borderRadius: 12,
        minWidth: showLabel ? 56 : 36,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 22 }}>{icon}</div>
      {showLabel && <span style={{ fontSize: 9, marginTop: 3, fontWeight: 500, whiteSpace: "nowrap", opacity: 0.85 }}>{label}</span>}
    </button>
  );
}

// ── Member Row (Google Meet style) ──
function MemberRow({
  name, isSelf, micOn, cameraOn, screenSharing, inCall,
  isSpeaking, connectionState,
  isHostParticipant, isCurrentUserHost, onMuteAudio, onMuteVideo, onKick,
  participantId
}: {
  name: string;
  isSelf?: boolean;
  micOn?: boolean;
  cameraOn?: boolean;
  screenSharing?: boolean;
  inCall?: boolean;
  isSpeaking?: boolean;
  connectionState?: string;
  isHostParticipant?: boolean;
  isCurrentUserHost?: boolean;
  onMuteAudio?: (id: string) => void;
  onMuteVideo?: (id: string) => void;
  onKick?: (id: string) => void;
  participantId?: string;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const initials = name.slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!showDropdown) return;
    const handleOutsideClick = () => setShowDropdown(false);
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, [showDropdown]);

  return (
    <div
      className="pcp-member-row"
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8,
        background: isSelf ? "rgba(124,58,237,0.06)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${isSpeaking ? "rgba(34,197,94,0.4)" : isSelf ? "rgba(124,58,237,0.15)" : "#242424"}`,
        position: "relative", animation: "pcp-slideUp 0.2s",
        transition: "border-color 0.3s",
      }}
    >
      {/* Avatar */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: isHostParticipant ? "linear-gradient(135deg,#f59e0b,#d97706)" : getAvatarColor(name),
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, color: "#fff",
          border: isSpeaking ? "2px solid #22c55e" : "2px solid transparent",
          transition: "border-color 0.3s",
        }}>
          {initials}
        </div>
        {/* Online indicator */}
        {inCall && (
          <div style={{
            position: "absolute", bottom: -1, right: -1,
            width: 10, height: 10, borderRadius: "50%",
            background: connectionState === "connected" || isSelf ? "#22c55e" : connectionState === "connecting" ? "#fbbf24" : "#22c55e",
            border: "2px solid #151515",
          }} />
        )}
      </div>

      {/* Name & Status */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#e5e5e5", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
          {name}
          {isHostParticipant && <span title="Host" style={{ display: "flex", alignItems: "center" }}><Crown size={11} color="#f59e0b" style={{ flexShrink: 0 }} /></span>}
          {isSelf && <span style={{ fontSize: 9, opacity: 0.5, background: "rgba(255,255,255,0.08)", borderRadius: 4, padding: "0px 4px" }}>You</span>}
        </div>
        <div style={{ fontSize: 10, color: isSelf ? "#a78bfa" : inCall ? "#22c55e" : "#555", display: "flex", alignItems: "center", gap: 4 }}>
          {isSelf ? "You" : inCall ? "In call" : "In room"}
          {isHostParticipant && " · Host"}
          {isSpeaking && <span style={{ fontSize: 9, color: "#22c55e", fontWeight: 500 }}>· Speaking</span>}
        </div>
      </div>

      {/* Media Indicators & Controls */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
        {inCall && (
          <>
            {screenSharing && (
              <span title="Screen Sharing" style={{ background: "rgba(192,132,252,0.12)", color: "#c084fc", borderRadius: 4, padding: "2px 5px", fontSize: 9, fontWeight: 600, display: "flex", alignItems: "center", gap: 2 }}>
                <ScreenShare size={9} /> Share
              </span>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 4, background: micOn ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)" }} title={micOn ? "Mic Active" : "Muted"}>
              {micOn ? <Mic size={12} color="#22c55e" /> : <MicOff size={12} color="#ef4444" />}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 4, background: cameraOn ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)" }} title={cameraOn ? "Video Active" : "Video Off"}>
              {cameraOn ? <Video size={12} color="#22c55e" /> : <VideoOff size={12} color="#ef4444" />}
            </div>

            {isCurrentUserHost && !isSelf && participantId && (
              <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setShowDropdown(!showDropdown)} style={{ background: "transparent", border: "none", color: "#666", cursor: "pointer", padding: 4, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.15s" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#aaa"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#666"; }}
                >
                  <MoreHorizontal size={14} />
                </button>
                {showDropdown && (
                  <div style={{
                    position: "absolute", right: 0, top: "100%", marginTop: 4,
                    background: "#2d2d30", border: "1px solid #3e3e42",
                    borderRadius: 8, boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
                    zIndex: 1000, minWidth: 160, overflow: "hidden",
                    animation: "pcp-fadeIn 0.15s",
                  }}>
                    <button className="pcp-dropdown-item" onClick={() => { onMuteAudio?.(participantId); setShowDropdown(false); }}
                      style={{ width: "100%", background: "transparent", border: "none", color: "#e5e5e5", padding: "8px 14px", fontSize: 12, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                      <MicOff size={13} /> Mute Audio
                    </button>
                    <button className="pcp-dropdown-item" onClick={() => { onMuteVideo?.(participantId); setShowDropdown(false); }}
                      style={{ width: "100%", background: "transparent", border: "none", color: "#e5e5e5", padding: "8px 14px", fontSize: 12, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                      <VideoOff size={13} /> Stop Video
                    </button>
                    <div style={{ height: 1, background: "#3e3e42", margin: "2px 0" }} />
                    <button className="pcp-dropdown-item" onClick={() => { onKick?.(participantId); setShowDropdown(false); }}
                      style={{ width: "100%", background: "transparent", border: "none", color: "#ea4335", padding: "8px 14px", fontSize: 12, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                      <Trash2 size={13} /> Remove
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function primaryBtn(background: string) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 18px",
    background,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    transition: "opacity 0.15s, transform 0.1s",
  } as const;
}
