"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Pencil, Square, Circle, Minus, Type, Eraser, Trash2, Download, Undo2, Redo2, MousePointer2, ArrowUpRight, AlignLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";

type ToolType = "select" | "pen" | "eraser" | "line" | "arrow" | "rect" | "circle" | "text";

interface Point { x: number; y: number; }
interface WbElement {
  id: string; type: ToolType;
  points?: Point[]; x?: number; y?: number; w?: number; h?: number;
  color: string; lineWidth: number;
  text?: string; fontSize?: number; fontFamily?: string;
}

interface WhiteboardProps { roomId: string; currentUserId: string; }

const COLORS = ["#ffffff", "#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#c084fc", "#fb923c", "#22d3ee"];
const WIDTHS = [2, 4, 8, 14];
const FONTS = ["Inter", "JetBrains Mono", "Georgia", "Arial", "Brush Script MT"];

function arrowhead(ctx: CanvasRenderingContext2D, from: Point, to: Point, size = 12) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 6), to.y - size * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 6), to.y - size * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function drawEl(ctx: CanvasRenderingContext2D, el: WbElement, selected = false) {
  ctx.save();
  ctx.strokeStyle = el.color; ctx.fillStyle = el.color;
  ctx.lineWidth = el.lineWidth; ctx.lineCap = "round"; ctx.lineJoin = "round";

  if (el.type === "pen" && el.points && el.points.length > 1) {
    ctx.beginPath(); ctx.moveTo(el.points[0].x, el.points[0].y);
    for (let i = 1; i < el.points.length; i++) ctx.lineTo(el.points[i].x, el.points[i].y);
    ctx.stroke();
  } else if (el.type === "eraser" && el.points && el.points.length > 1) {
    ctx.globalCompositeOperation = "destination-out"; ctx.lineWidth = el.lineWidth * 4;
    ctx.beginPath(); ctx.moveTo(el.points[0].x, el.points[0].y);
    for (let i = 1; i < el.points.length; i++) ctx.lineTo(el.points[i].x, el.points[i].y);
    ctx.stroke();
  } else if ((el.type === "line" || el.type === "arrow") && el.points && el.points.length >= 2) {
    ctx.beginPath(); ctx.moveTo(el.points[0].x, el.points[0].y); ctx.lineTo(el.points[1].x, el.points[1].y); ctx.stroke();
    if (el.type === "arrow") arrowhead(ctx, el.points[0], el.points[1], el.lineWidth * 4 + 8);
  } else if (el.type === "rect" && el.x !== undefined) {
    ctx.strokeRect(el.x, el.y!, el.w!, el.h!);
  } else if (el.type === "circle" && el.x !== undefined) {
    const rx = Math.abs(el.w! / 2), ry = Math.abs(el.h! / 2);
    ctx.beginPath(); ctx.ellipse(el.x + el.w! / 2, el.y! + el.h! / 2, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
  } else if (el.type === "text" && el.text) {
    ctx.font = `${el.fontSize || 18}px "${el.fontFamily || "Inter"}", sans-serif`;
    ctx.textBaseline = "top";
    const lines = el.text.split("\n");
    const lineH = (el.fontSize || 18) * 1.4;
    lines.forEach((line, i) => ctx.fillText(line, el.x!, el.y! + i * lineH));
  }

  if (selected) {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "#60a5fa"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
    const bounds = getElBounds(el);
    if (bounds) ctx.strokeRect(bounds.x - 6, bounds.y - 6, bounds.w + 12, bounds.h + 12);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function getElBounds(el: WbElement): { x: number; y: number; w: number; h: number } | null {
  if (el.points && el.points.length > 0) {
    const xs = el.points.map(p => p.x), ys = el.points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    return { x: minX, y: minY, w: Math.max(maxX - minX, 10), h: Math.max(maxY - minY, 10) };
  }
  if (el.x !== undefined) {
    if (el.type === "text" && el.text) {
      const fontSize = el.fontSize || 18;
      const lines = el.text.split("\n");
      const w = Math.max(50, ...lines.map(line => line.length * fontSize * 0.6));
      const h = Math.max(fontSize * 1.4, lines.length * fontSize * 1.4);
      return { x: el.x, y: el.y!, w, h };
    }
    const x = Math.min(el.x, el.x + (el.w || 0)), y = Math.min(el.y!, el.y! + (el.h || 0));
    return { x, y, w: Math.abs(el.w || 50), h: Math.abs(el.h || 20) };
  }
  return null;
}

function hitTest(el: WbElement, px: number, py: number): boolean {
  const bounds = getElBounds(el);
  if (!bounds) return false;
  return px >= bounds.x - 8 && px <= bounds.x + bounds.w + 8 && py >= bounds.y - 8 && py <= bounds.y + bounds.h + 8;
}

export default function Whiteboard({ roomId, currentUserId }: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [tool, setTool] = useState<ToolType>("pen");
  const [color, setColor] = useState("#ffffff");
  const [lineWidth, setLineWidth] = useState(3);
  const [fontSize, setFontSize] = useState(18);
  const [fontFamily, setFontFamily] = useState("Inter");
  const [showFontPanel, setShowFontPanel] = useState(false);
  const [elements, setElements] = useState<WbElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [redoStack, setRedoStack] = useState<WbElement[][]>([]);

  const [textInput, setTextInput] = useState<{ visible: boolean; x: number; y: number; canvasX: number; canvasY: number; value: string }>({
    visible: false, x: 0, y: 0, canvasX: 0, canvasY: 0, value: ""
  });

  const drawing = useRef(false);
  const startPos = useRef<Point>({ x: 0, y: 0 });
  const currentPoints = useRef<Point[]>([]);
  const currentElId = useRef<string>("");
  const dragStart = useRef<Point | null>(null);
  const dragElSnapshot = useRef<WbElement | null>(null);
  const isDragging = useRef(false);
  const elementsRef = useRef<WbElement[]>([]);
  const pendingMoveElements = useRef<WbElement[] | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => { elementsRef.current = elements; }, [elements]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => {
    if (textInput.visible) {
      requestAnimationFrame(() => textAreaRef.current?.focus());
    }
  }, [textInput.visible]);

  const STORAGE_KEY = `wb_${roomId}`;

  // Supabase Realtime channel ref
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Sync with Supabase Realtime
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase.channel(`wb:${roomId}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "wb-update" }, ({ payload }) => {
        if (payload.userId !== currentUserId && payload.elements) {
          setElements(payload.elements);
        }
      })
      .on("broadcast", { event: "wb-request" }, () => {
        // Send current state to the new joiner
        if (elementsRef.current.length > 0) {
          channel.send({
            type: "broadcast",
            event: "wb-sync",
            payload: { elements: elementsRef.current }
          });
        }
      })
      .on("broadcast", { event: "wb-sync" }, ({ payload }) => {
        if (payload.elements) {
          setElements(payload.elements);
        }
      })
      .subscribe();

    // Delay slightly to make sure connection is established
    setTimeout(() => {
      channel.send({
        type: "broadcast",
        event: "wb-request",
        payload: {}
      });
    }, 500);

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId, currentUserId]);

  // Broadcast helper
  const broadcastUpdate = useCallback((nextEls: WbElement[]) => {
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "wb-update",
        payload: { elements: nextEls, userId: currentUserId }
      });
    }
  }, [currentUserId]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setElements(JSON.parse(saved));
    } catch {}
  }, [STORAGE_KEY]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(elements)); } catch {}
  }, [elements, STORAGE_KEY]);

  const getPos = useCallback((e: React.MouseEvent | MouseEvent): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  }, []);

  const redraw = useCallback((els: WbElement[], selId: string | null = null) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#1a1a2e"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    els.forEach(el => drawEl(ctx, el, el.id === selId));
  }, []);

  useEffect(() => { redraw(elements, selectedId); }, [elements, selectedId, redraw]);

  useEffect(() => {
    const canvas = canvasRef.current, overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      canvas.width = rect.width; canvas.height = rect.height;
      overlay.width = rect.width; overlay.height = rect.height;
      redraw(elementsRef.current, selectedIdRef.current);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, [redraw]);

  const clearOverlay = useCallback(() => {
    const ov = overlayRef.current; if (!ov) return;
    ov.getContext("2d")!.clearRect(0, 0, ov.width, ov.height);
  }, []);

  const drawOverlayPreview = useCallback((start: Point, end: Point) => {
    const ov = overlayRef.current; if (!ov) return;
    const ctx = ov.getContext("2d")!;
    ctx.clearRect(0, 0, ov.width, ov.height);
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.lineCap = "round";
    ctx.setLineDash([6, 3]);
    if (tool === "line" || tool === "arrow") {
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
      if (tool === "arrow") arrowhead(ctx, start, end, lineWidth * 4 + 8);
    } else if (tool === "rect") {
      ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    } else if (tool === "circle") {
      const rx = Math.abs((end.x - start.x) / 2), ry = Math.abs((end.y - start.y) / 2);
      ctx.beginPath(); ctx.ellipse(start.x + (end.x - start.x) / 2, start.y + (end.y - start.y) / 2, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }, [color, lineWidth, tool]);

  const openTextInput = useCallback((screenX?: number, screenY?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = screenX === undefined ? rect.width / 2 - 80 : Math.max(8, Math.min(screenX - rect.left, rect.width - 180));
    const y = screenY === undefined ? rect.height / 2 - 30 : Math.max(8, Math.min(screenY - rect.top, rect.height - 100));
    setTextInput({
      visible: true,
      x,
      y,
      canvasX: x * (canvas.width / rect.width),
      canvasY: y * (canvas.height / rect.height),
      value: "",
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (textInput.visible) return;
    const pos = getPos(e);

    if (tool === "select") {
      const hit = [...elementsRef.current].reverse().find(el => hitTest(el, pos.x, pos.y));
      if (hit) {
        setSelectedId(hit.id);
        dragStart.current = pos;
        dragElSnapshot.current = JSON.parse(JSON.stringify(hit));
        isDragging.current = false;
      } else {
        setSelectedId(null);
        dragStart.current = null;
        dragElSnapshot.current = null;
      }
      return;
    }

    if (tool === "text") {
      openTextInput(e.clientX, e.clientY);
      return;
    }

    drawing.current = true;
    startPos.current = pos;
    currentPoints.current = [pos];
    currentElId.current = `el_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }, [tool, textInput.visible, getPos, openTextInput]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (textInput.visible) return;
    const pos = getPos(e);

    if (tool === "select" && dragStart.current && selectedIdRef.current && dragElSnapshot.current) {
      isDragging.current = true;
      const dx = pos.x - dragStart.current.x, dy = pos.y - dragStart.current.y;
      const snap = dragElSnapshot.current;
      const movedElements = elementsRef.current.map(el => {
        if (el.id !== selectedIdRef.current) return el;
        const moved: WbElement = { ...el };
        if (snap.points) moved.points = snap.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        if (snap.x !== undefined) { moved.x = snap.x + dx; moved.y = snap.y! + dy; }
        return moved;
      });
      pendingMoveElements.current = movedElements;
      redraw(movedElements, selectedIdRef.current);
      return;
    }

    if (!drawing.current) return;

    if (tool === "pen" || tool === "eraser") {
      currentPoints.current.push(pos);
      const canvas = canvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      const pts = currentPoints.current;
      if (pts.length < 2) return;
      ctx.save();
      if (tool === "eraser") { ctx.globalCompositeOperation = "destination-out"; ctx.lineWidth = lineWidth * 4; }
      else { ctx.strokeStyle = color; ctx.lineWidth = lineWidth; }
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y); ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y); ctx.stroke();
      ctx.restore();
    } else {
      drawOverlayPreview(startPos.current, pos);
    }
  }, [tool, color, lineWidth, textInput.visible, getPos, drawOverlayPreview, redraw]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (textInput.visible) return;
    if (tool === "select") {
      if (pendingMoveElements.current) {
        setElements(pendingMoveElements.current);
        broadcastUpdate(pendingMoveElements.current);
        pendingMoveElements.current = null;
      }
      dragStart.current = null;
      dragElSnapshot.current = null;
      isDragging.current = false;
      return;
    }
    if (!drawing.current) return;
    drawing.current = false;
    const pos = getPos(e);
    clearOverlay();

    let newEl: WbElement | null = null;
    const id = currentElId.current;

    if (tool === "pen" || tool === "eraser") {
      if (currentPoints.current.length < 2) return;
      newEl = { id, type: tool, points: [...currentPoints.current], color, lineWidth };
    } else if (tool === "line" || tool === "arrow") {
      newEl = { id, type: tool, points: [startPos.current, pos], color, lineWidth };
    } else if (tool === "rect") {
      newEl = { id, type: "rect", x: startPos.current.x, y: startPos.current.y, w: pos.x - startPos.current.x, h: pos.y - startPos.current.y, color, lineWidth };
    } else if (tool === "circle") {
      newEl = { id, type: "circle", x: startPos.current.x, y: startPos.current.y, w: pos.x - startPos.current.x, h: pos.y - startPos.current.y, color, lineWidth };
    }

    if (newEl) {
      const next = [...elementsRef.current, newEl];
      setElements(next);
      broadcastUpdate(next);
      setRedoStack([]);
    }
    currentPoints.current = [];
  }, [tool, color, lineWidth, textInput.visible, getPos, clearOverlay, broadcastUpdate]);

  function handleTextSubmit() {
    const val = textInput.value.trim();
    if (!val) { setTextInput(p => ({ ...p, visible: false })); return; }
    const el: WbElement = {
      id: `el_${Date.now()}`,
      type: "text",
      x: textInput.canvasX,
      y: textInput.canvasY,
      text: val,
      color, lineWidth,
      fontSize, fontFamily
    };
    const next = [...elementsRef.current, el];
    setElements(next);
    broadcastUpdate(next);
    setRedoStack([]);
    setTextInput({ visible: false, x: 0, y: 0, canvasX: 0, canvasY: 0, value: "" });
  }

  function undo() {
    setElements(prev => {
      if (prev.length === 0) return prev;
      setRedoStack(r => [...r, prev]);
      const next = prev.slice(0, -1);
      broadcastUpdate(next);
      return next;
    });
    setSelectedId(null);
  }

  function redo() {
    if (redoStack.length === 0) return;
    const last = redoStack[redoStack.length - 1];
    setElements(last);
    broadcastUpdate(last);
    setRedoStack(r => r.slice(0, -1));
  }

  function clear() {
    if (!confirm("Clear all drawing?")) return;
    setElements([]);
    broadcastUpdate([]);
    setRedoStack([]);
    setSelectedId(null);
  }

  function download() {
    const canvas = canvasRef.current; if (!canvas) return;
    const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = `whiteboard-${roomId.slice(0, 8)}.png`; a.click();
  }

  function deleteSelected() {
    if (!selectedId) return;
    const next = elementsRef.current.filter(el => el.id !== selectedId);
    setElements(next);
    broadcastUpdate(next);
    setSelectedId(null);
  }

  const TOOLS: { id: ToolType; icon: React.ReactNode; title: string }[] = [
    { id: "select", icon: <MousePointer2 size={15}/>, title: "Select & Move" },
    { id: "pen", icon: <Pencil size={15}/>, title: "Pen" },
    { id: "eraser", icon: <Eraser size={15}/>, title: "Eraser" },
    { id: "line", icon: <Minus size={15}/>, title: "Line" },
    { id: "arrow", icon: <ArrowUpRight size={15}/>, title: "Arrow" },
    { id: "rect", icon: <Square size={15}/>, title: "Rectangle" },
    { id: "circle", icon: <Circle size={15}/>, title: "Circle" },
    { id: "text", icon: <Type size={15}/>, title: "Text (click to place)" },
  ];

  const cursors: Record<ToolType, string> = {
    select: "default", pen: "crosshair", eraser: "cell",
    line: "crosshair", arrow: "crosshair", rect: "crosshair", circle: "crosshair", text: "text"
  };

  return (
    <div style={{ display: "flex", height: "100%", background: "#1a1a2e", position: "relative" }}>
      <div style={{ width: 52, background: "#111", borderRight: "1px solid #1a1a2e", display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0", gap: 3, overflowY: "auto", flexShrink: 0, zIndex: 10 }}>
        {TOOLS.map(t => (
          <button key={t.id} onClick={() => { setTool(t.id); if (t.id === "text") openTextInput(); else setTextInput(p => ({ ...p, visible: false })); }} title={t.title}
            style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", background: tool === t.id ? "#7C3AED" : "transparent", color: tool === t.id ? "#fff" : "#666", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}
            onMouseOver={e => { if (tool !== t.id) (e.currentTarget as HTMLElement).style.background = "#222"; }}
            onMouseOut={e => { if (tool !== t.id) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
            {t.icon}
          </button>
        ))}

        <div style={{ height: 1, background: "#222", width: 32, margin: "6px 0" }}/>

        {COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)}
            style={{ width: color === c ? 26 : 20, height: color === c ? 26 : 20, borderRadius: "50%", background: c, border: color === c ? "2px solid #7C3AED" : "2px solid #333", cursor: "pointer", transition: "all 0.15s", flexShrink: 0, outline: "none" }}
            title={c}/>
        ))}

        <div style={{ height: 1, background: "#222", width: 32, margin: "6px 0" }}/>

        {WIDTHS.map(w => (
          <button key={w} onClick={() => setLineWidth(w)} title={`Width ${w}`}
            style={{ width: 34, height: 28, borderRadius: 6, border: "none", background: lineWidth === w ? "#7C3AED22" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ height: Math.min(w + 1, 10), width: 20, background: lineWidth === w ? "#7C3AED" : "#555", borderRadius: 999 }}/>
          </button>
        ))}

        <div style={{ height: 1, background: "#222", width: 32, margin: "6px 0" }}/>

        <button onClick={() => setShowFontPanel(p => !p)} title="Text Options"
          style={{ width: 36, height: 36, borderRadius: 8, border: "none", background: showFontPanel ? "#7C3AED" : "transparent", color: showFontPanel ? "#fff" : "#666", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AlignLeft size={15}/>
        </button>

        <div style={{ height: 1, background: "#222", width: 32, margin: "6px 0" }}/>

        {[
          { icon: <Undo2 size={14}/>, fn: undo, title: "Undo", disabled: elements.length === 0 },
          { icon: <Redo2 size={14}/>, fn: redo, title: "Redo", disabled: redoStack.length === 0 },
          { icon: <Download size={14}/>, fn: download, title: "Download PNG" },
          { icon: <Trash2 size={14}/>, fn: clear, title: "Clear All", danger: true },
        ].map(a => (
          <button key={a.title} onClick={a.fn} title={a.title} disabled={"disabled" in a ? a.disabled : false}
            style={{ width: 36, height: 36, borderRadius: 8, border: "none", background: "transparent", color: ("disabled" in a && a.disabled) ? "#333" : ("danger" in a && a.danger) ? "#f47" : "#666", cursor: ("disabled" in a && a.disabled) ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {a.icon}
          </button>
        ))}
      </div>

      {showFontPanel && (
        <div style={{ position: "absolute", left: 60, top: 10, background: "#111", border: "1px solid #2a2a2a", borderRadius: 12, padding: 14, zIndex: 20, width: 200, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
          <div style={{ fontSize: 11, color: "#666", fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Text Options</div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: "#555", display: "block", marginBottom: 4 }}>Font Size: {fontSize}px</label>
            <input type="range" min={12} max={72} value={fontSize} onChange={e => setFontSize(+e.target.value)}
              style={{ width: "100%", accentColor: "#7C3AED" }}/>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#555", display: "block", marginBottom: 6 }}>Font Family</label>
            {FONTS.map(f => (
              <button key={f} onClick={() => setFontFamily(f)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "5px 8px", borderRadius: 6, border: "none", background: fontFamily === f ? "#7C3AED22" : "transparent", color: fontFamily === f ? "#c4b5fd" : "#888", cursor: "pointer", fontSize: 12, fontFamily: f, marginBottom: 2 }}>
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedId && (
        <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", background: "#111", border: "1px solid #2a2a2a", borderRadius: 10, padding: "6px 14px", zIndex: 20, display: "flex", gap: 10, alignItems: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
          <span style={{ fontSize: 11, color: "#666" }}>Element selected — drag to move</span>
          <button onClick={deleteSelected} style={{ padding: "4px 10px", background: "#f4474720", border: "1px solid #f4474740", borderRadius: 6, color: "#f47", cursor: "pointer", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
            <Trash2 size={11}/> Delete
          </button>
          <button onClick={() => setSelectedId(null)} style={{ padding: "4px 10px", background: "#222", border: "1px solid #333", borderRadius: 6, color: "#888", cursor: "pointer", fontSize: 11 }}>
            Deselect
          </button>
        </div>
      )}

      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <canvas ref={canvasRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", cursor: cursors[tool] }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { if (drawing.current) { drawing.current = false; clearOverlay(); } }}
        />
        <canvas ref={overlayRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}/>

        {textInput.visible && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onMouseMove={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            style={{ position: "absolute", left: textInput.x, top: Math.max(8, textInput.y - fontSize), zIndex: 30 }}
          >
            <textarea
              ref={textAreaRef}
              autoFocus
              value={textInput.value}
              onChange={e => setTextInput(p => ({ ...p, value: e.target.value }))}
              onKeyDown={e => {
                if (e.key === "Escape") { setTextInput(p => ({ ...p, visible: false })); return; }
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); }
              }}
              onBlur={() => {
                window.setTimeout(() => {
                  if (document.activeElement !== textAreaRef.current) handleTextSubmit();
                }, 0);
              }}
              placeholder="Type here, Enter to place..."
              style={{
                background: "rgba(26,26,46,0.92)",
                border: "1.5px dashed #7C3AED",
                borderRadius: 4,
                color,
                fontSize,
                fontFamily: `"${fontFamily}", sans-serif`,
                outline: "none",
                minWidth: 140,
                minHeight: 76,
                padding: "4px 8px",
                letterSpacing: "normal",
                resize: "none",
                lineHeight: 1.4,
                backdropFilter: "blur(4px)",
                pointerEvents: "auto",
              } as React.CSSProperties}
              rows={3}
            />
            <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>Enter = place · Shift+Enter = newline · Esc = cancel</div>
          </div>
        )}

        {elements.length === 0 && !textInput.visible && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none", color: "#333" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✏️</div>
            <p style={{ fontSize: 13 }}>Pick a tool and start drawing</p>
            <p style={{ fontSize: 11, marginTop: 4, color: "#2a2a2a" }}>Your work is synchronized for all users</p>
          </div>
        )}
      </div>
    </div>
  );
}
