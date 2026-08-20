"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Pencil, Square, Circle, Minus, Type, Eraser, Trash2, Download, Undo2, Redo2, MousePointer2, ArrowUpRight, Hand, Sparkles, Box, RotateCcw, Image as ImageIcon, Upload, Copy, Trash2 as TrashIcon, Minimize2, Maximize2, RotateCcw as RotateIcon, ZoomIn, ZoomOut } from "lucide-react";
import { supabase } from "@/lib/supabase";

type ToolType = "select" | "pen" | "eraser" | "line" | "arrow" | "rect" | "circle" | "text" | "pan" | "image";

interface Point { x: number; y: number; }
interface WbElement {
  id: string; type: ToolType;
  points?: Point[]; x?: number; y?: number; w?: number; h?: number;
  color: string; lineWidth: number;
  text?: string; fontSize?: number; fontFamily?: string;
  src?: string; alt?: string; rotation?: number;
}

interface WhiteboardProps { roomId: string; currentUserId: string; }

const COLORS = [
  "#ffffff", "#f8fafc", "#e0e0e0", "#cccccc",
  "#22d3ee", "#06b6d4", "#0891b2",
  "#a78bfa", "#8b5cf6", "#7c3aed",
  "#f472b6", "#ec4899", "#db2777",
  "#fb923c", "#f97316", "#ea580c",
  "#4ade80", "#22c55e", "#16a34a",
  "#f87171", "#ef4444", "#dc2626",
  "#facc15", "#eab308", "#ca8a04",
  "#818cf8", "#6366f1", "#4f46e5",
  "#2dd4bf", "#14b8a6", "#0d9488",
  "#fb7185", "#f43f5e", "#e11d48",
  "#888888", "#666666", "#444444", "#222222", "#000000"
];
const WIDTHS = [2, 4, 8, 14];
const FONTS = ["Inter", "JetBrains Mono", "Georgia", "Arial", "Brush Script MT"];
const imageCache = new Map<string, HTMLImageElement>();

function arrowhead(ctx: CanvasRenderingContext2D, from: Point, to: Point, size = 12) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 6), to.y - size * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 6), to.y - size * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function drawEl(ctx: CanvasRenderingContext2D, el: WbElement, selected = false, is3D = false, depth = 40) {
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
  } else if (el.type === "rect" && el.x !== undefined && el.y !== undefined && el.w !== undefined && el.h !== undefined) {
    if (is3D && el.text) {
      const d = depth;
      ctx.fillStyle = el.color; ctx.globalAlpha = 0.4;
      ctx.fillRect(el.x + d, el.y + d, el.w, el.h);
      ctx.globalAlpha = 1; ctx.fillStyle = "#000000";
      ctx.fillRect(el.x + d, el.y + d, el.w, el.h);
      ctx.fillStyle = el.color; ctx.strokeRect(el.x + d, el.y + d, el.w, el.h);

      ctx.beginPath();
      ctx.moveTo(el.x, el.y); ctx.lineTo(el.x + d, el.y + d);
      ctx.moveTo(el.x + el.w, el.y); ctx.lineTo(el.x + el.w + d, el.y + d);
      ctx.moveTo(el.x, el.y + el.h); ctx.lineTo(el.x + d, el.y + el.h + d);
      ctx.moveTo(el.x + el.w, el.y + el.h); ctx.lineTo(el.x + el.w + d, el.y + el.h + d);
      ctx.stroke();

      ctx.fillStyle = "#000000";
      ctx.fillRect(el.x, el.y!, el.w!, el.h!);
      ctx.strokeRect(el.x, el.y!, el.w!, el.h!);

      if (el.text) {
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold 13px "Inter", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(el.text, el.x + el.w! / 2, el.y! + el.h! / 2);
      }
    } else {
      ctx.strokeRect(el.x, el.y!, el.w!, el.h!);
      if (el.text) {
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold 12px "Inter", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(el.text, el.x + el.w! / 2, el.y! + el.h! / 2);
      }
    }
  } else if (el.type === "circle" && el.x !== undefined) {
    const rx = Math.abs(el.w! / 2), ry = Math.abs(el.h! / 2);
    ctx.beginPath(); ctx.ellipse(el.x + el.w! / 2, el.y! + el.h! / 2, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    if (el.text) {
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold 12px "Inter", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(el.text, el.x + el.w! / 2, el.y! + el.h! / 2);
    }
  } else if (el.type === "image" && el.src) {
    let img = imageCache.get(el.src);
    if (!img) {
      img = new window.Image();
      img.onload = () => window.dispatchEvent(new CustomEvent("codetogether:whiteboard-image-loaded"));
      img.src = el.src;
      imageCache.set(el.src, img);
    }
    if (img.complete) {
      ctx.save();
      ctx.translate(el.x! + el.w! / 2, el.y! + el.h! / 2);
      ctx.rotate((el.rotation || 0) * Math.PI / 180);
      ctx.drawImage(img, -el.w! / 2, -el.h! / 2, el.w!, el.h!);
      ctx.restore();
    } else {
      ctx.fillStyle = "#333";
      ctx.fillRect(el.x!, el.y!, el.w!, el.h!);
    }
    if (selected) {
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.setLineDash([5, 3]);
      ctx.strokeRect(el.x!, el.y!, el.w!, el.h!);
      ctx.setLineDash([]);
    }
  } else if (el.type === "text" && el.text) {
    ctx.font = `${el.fontSize || 18}px "${el.fontFamily || "Inter"}", sans-serif`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    const lines = el.text.split("\n");
    const lineH = (el.fontSize || 18) * 1.4;
    lines.forEach((line, i) => ctx.fillText(line, el.x!, el.y! + i * lineH));
  }

  if (selected && el.type !== "image") {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
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

function computeCanvasSize(elements: WbElement[], viewportW: number, viewportH: number) {
  let width = Math.max(viewportW, 800);
  let height = Math.max(viewportH, 600);
  for (const el of elements) {
    const b = getElBounds(el);
    if (b) {
      width = Math.max(width, b.x + b.w + 160);
      height = Math.max(height, b.y + b.h + 160);
    }
  }
  return { width, height };
}

function toWbElement(raw: Record<string, unknown>, index: number): WbElement {
  const id = `el_ai_${Date.now()}_${index}`;
  const type = (raw.type as ToolType) || "text";
  const color = typeof raw.color === "string" ? raw.color : "#ffffff";
  const lineWidth = typeof raw.lineWidth === "number" ? raw.lineWidth : 3;
  const text = typeof raw.text === "string" ? raw.text : "";
  const src = typeof raw.src === "string" ? raw.src : undefined;
  
  if (type === "text") {
    return { id, type: "text", x: Number(raw.x) || 80, y: Number(raw.y) || 80, text: text || "Text", color, lineWidth: 1, fontSize: typeof raw.fontSize === "number" ? raw.fontSize : 18 };
  }
  if (type === "line" || type === "arrow") {
    const points = Array.isArray(raw.points) ? raw.points as Point[] : [
      { x: Number(raw.x) || 0, y: Number(raw.y) || 0 },
      { x: (Number(raw.x) || 0) + (Number(raw.w) || 120), y: (Number(raw.y) || 0) + (Number(raw.h) || 0) },
    ];
    return { id, type, points, color, lineWidth };
  }
  if (type === "image") {
    return {
      id, type: "image", x: Number(raw.x) || 80, y: Number(raw.y) || 80,
      w: Number(raw.w) || 300, h: Number(raw.h) || 200,
      color, lineWidth, src, alt: typeof raw.alt === "string" ? raw.alt : "Image",
      rotation: typeof raw.rotation === "number" ? raw.rotation : 0
    };
  }
  return {
    id, type: type === "circle" ? "circle" : "rect",
    x: Number(raw.x) || 80, y: Number(raw.y) || 80,
    w: Number(raw.w) || 160, h: Number(raw.h) || 80,
    color, lineWidth, text,
  };
}

const canvasRef = { current: null as HTMLCanvasElement | null };
const overlayRef = { current: null as HTMLCanvasElement | null };

export default function Whiteboard({ roomId, currentUserId }: WhiteboardProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [elements, setElements] = useState<WbElement[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [history, setHistory] = useState<WbElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [redoStack, setRedoStack] = useState<WbElement[][]>([]);
  const [tool, setTool] = useState<ToolType>("pen");
  const [color, setColor] = useState("#ffffff");
  const [lineWidth, setLineWidth] = useState(2);
  const [fontSize, setFontSize] = useState(20);
  const [fontFamily, setFontFamily] = useState("Inter");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFontPanel, setShowFontPanel] = useState(false);

  const [textInput, setTextInput] = useState<{ visible: boolean; x: number; y: number; value: string }>({
    visible: false, x: 0, y: 0, value: ""
  });
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<Point>({ x: 0, y: 0 });
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiStatus, setAiStatus] = useState<"idle" | "success" | "error">("idle");
  const [is3DMode, setIs3DMode] = useState(false);
  const [cameraAngle, setCameraAngle] = useState({ rotateX: 60, rotateZ: -45 });
  const [depth3D, setDepth3D] = useState(40);
  const [selectedImage, setSelectedImage] = useState<WbElement | null>(null);
  const [zoom, setZoom] = useState(1);

  const drawing = useRef(false);
  const startPt = useRef<Point>({ x: 0, y: 0 });
  const currentPath = useRef<Point[]>([]);
  const draggingId = useRef<string | null>(null);
  const dragOffset = useRef<Point>({ x: 0, y: 0 });
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const elementsRef = useRef(elements);
  const isSavingHistory = useRef(false);

  useEffect(() => { elementsRef.current = elements; }, [elements]);

  const pushHistory = useCallback((newEls: WbElement[]) => {
    if (isSavingHistory.current) return;
    isSavingHistory.current = true;
    setHistory((prev) => {
      const next = prev.slice(0, historyIndex + 1);
      next.push(newEls);
      return next.slice(-100);
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 99));
    setRedoStack([]);
    setTimeout(() => { isSavingHistory.current = false; }, 0);
  }, [historyIndex]);

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setElements(history[newIndex]);
      broadcastEls(history[newIndex]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setElements(history[newIndex]);
      broadcastEls(history[newIndex]);
    }
  };

  useEffect(() => {
    if (!roomId) return;
    const channel = supabase.channel(`wb:${roomId}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "wb-update" }, ({ payload }: { payload: { elements: WbElement[] } }) => {
        setElements(payload.elements);
        pushHistory(payload.elements);
      })
      .on("broadcast", { event: "wb-add-elements" }, ({ payload }: { payload: { elements: WbElement[] } }) => {
        setElements((prev) => {
          const next = [...prev, ...payload.elements];
          pushHistory(next);
          return next;
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId, pushHistory]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.roomId !== roomId) return;
      const incoming = (detail.elements || []).map((raw: Record<string, unknown>, i: number) => toWbElement(raw, i));
      if (!incoming.length) return;
      setElements((prev) => {
        const next = [...prev, ...incoming];
        if (channelRef.current) {
          channelRef.current.send({ type: "broadcast", event: "wb-add-elements", payload: { elements: incoming } });
        }
        pushHistory(next);
        return next;
      });
    };
    window.addEventListener("codetogether:wb-add", handler);
    return () => window.removeEventListener("codetogether:wb-add", handler);
  }, [roomId, pushHistory]);

  const broadcastEls = (newEls: WbElement[]) => {
    if (channelRef.current) {
      channelRef.current.send({ type: "broadcast", event: "wb-update", payload: { elements: newEls } });
    }
  };

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    elements.forEach(el => drawEl(ctx, el, el.id === selectedId, is3DMode, depth3D));
  }, [elements, selectedId, is3DMode, depth3D]);

  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current, o = overlayRef.current, scroll = scrollRef.current;
      if (!c || !o || !scroll) return;
      const viewportW = scroll.clientWidth || 800;
      const viewportH = scroll.clientHeight || 600;
      const size = computeCanvasSize(elementsRef.current, viewportW, viewportH);
      setCanvasSize(size);
      c.width = size.width; c.height = size.height;
      o.width = size.width; o.height = size.height;
      redrawAll();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [redrawAll]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const viewportW = scroll.clientWidth || 800;
    const viewportH = scroll.clientHeight || 600;
    const size = computeCanvasSize(elements, viewportW, viewportH);
    setCanvasSize(size);
    const c = canvasRef.current, o = overlayRef.current;
    if (c && o) { c.width = size.width; c.height = size.height; o.width = size.width; o.height = size.height; }
  }, [elements]);

  useEffect(() => { redrawAll(); }, [redrawAll]);

  useEffect(() => {
    const handleImageLoaded = () => redrawAll();
    window.addEventListener("codetogether:whiteboard-image-loaded", handleImageLoaded);
    return () => window.removeEventListener("codetogether:whiteboard-image-loaded", handleImageLoaded);
  }, [redrawAll]);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getPos(e);
    drawing.current = true;
    startPt.current = pt;

    if (tool === "pan") {
      setIsPanning(true);
      panStart.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
      drawing.current = false;
      return;
    }

    if (tool === "select") {
      const hit = [...elements].reverse().find(el => hitTest(el, pt.x, pt.y));
      if (hit) {
        setSelectedId(hit.id);
        if (hit.type === "image") setSelectedImage(hit);
        else setSelectedImage(null);
        draggingId.current = hit.id;
        const b = getElBounds(hit);
        dragOffset.current = { x: pt.x - (b?.x || 0), y: pt.y - (b?.y || 0) };
      } else {
        setSelectedId(null);
        setSelectedImage(null);
      }
      return;
    }

    if (tool === "text") {
      setTextInput({ visible: true, x: pt.x, y: pt.y, value: "" });
      drawing.current = false;
      return;
    }

    if (tool === "pen" || tool === "eraser") {
      currentPath.current = [pt];
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === "pan" && isPanning) {
      setPanOffset({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
      return;
    }

    if (!drawing.current) return;
    const pt = getPos(e);

    if (tool === "select" && draggingId.current) {
      const targetId = draggingId.current;
      const currentEls = elementsRef.current;
      const updated = currentEls.map(el => {
        if (el.id !== targetId) return el;
        const b = getElBounds(el);
        if (!b) return el;
        const dx = pt.x - dragOffset.current.x - b.x;
        const dy = pt.y - dragOffset.current.y - b.y;
        if (el.points) return { ...el, points: el.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
        if (el.x !== undefined) return { ...el, x: el.x + dx, y: el.y! + dy };
        return el;
      });
      setElements(updated);
      elementsRef.current = updated;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          updated.forEach(el => drawEl(ctx, el, el.id === selectedId, is3DMode, depth3D));
        }
      }
      return;
    }

    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (tool === "pen" || tool === "eraser") {
      currentPath.current.push(pt);
      const tempEl: WbElement = { id: "temp", type: tool, points: [...currentPath.current], color, lineWidth };
      drawEl(ctx, tempEl);
    } else if (tool === "line" || tool === "arrow") {
      const tempEl: WbElement = { id: "temp", type: tool, points: [startPt.current, pt], color, lineWidth };
      drawEl(ctx, tempEl);
    } else if (tool === "rect") {
      const x = Math.min(startPt.current.x, pt.x), y = Math.min(startPt.current.y, pt.y);
      const w = Math.abs(pt.x - startPt.current.x), h = Math.abs(pt.y - startPt.current.y);
      const tempEl: WbElement = { id: "temp", type: "rect", x, y, w, h, color, lineWidth };
      drawEl(ctx, tempEl);
    } else if (tool === "circle") {
      const x = Math.min(startPt.current.x, pt.x), y = Math.min(startPt.current.y, pt.y);
      const w = Math.abs(pt.x - startPt.current.x), h = Math.abs(pt.y - startPt.current.y);
      const tempEl: WbElement = { id: "temp", type: "circle", x, y, w, h, color, lineWidth };
      drawEl(ctx, tempEl);
    }
  };

  const clearOverlay = () => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    ctx?.clearRect(0, 0, overlay.width, overlay.height);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === "pan") { setIsPanning(false); return; }
    if (!drawing.current) return;
    drawing.current = false;
    clearOverlay();

    if (tool === "select") {
      if (draggingId.current) {
        draggingId.current = null;
        broadcastEls(elementsRef.current);
      }
      return;
    }

    const pt = getPos(e);
    let newEl: WbElement | null = null;
    const id = `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    if ((tool === "pen" || tool === "eraser") && currentPath.current.length > 1) {
      newEl = { id, type: tool, points: [...currentPath.current], color, lineWidth };
      currentPath.current = [];
    } else if ((tool === "line" || tool === "arrow") && (startPt.current.x !== pt.x || startPt.current.y !== pt.y)) {
      newEl = { id, type: tool, points: [startPt.current, pt], color, lineWidth };
    } else if (tool === "rect") {
      const x = Math.min(startPt.current.x, pt.x), y = Math.min(startPt.current.y, pt.y);
      const w = Math.abs(pt.x - startPt.current.x), h = Math.abs(pt.y - startPt.current.y);
      if (w > 4 && h > 4) newEl = { id, type: "rect", x, y, w, h, color, lineWidth };
    } else if (tool === "circle") {
      const x = Math.min(startPt.current.x, pt.x), y = Math.min(startPt.current.y, pt.y);
      const w = Math.abs(pt.x - startPt.current.x), h = Math.abs(pt.y - startPt.current.y);
      if (w > 4 && h > 4) newEl = { id, type: "circle", x, y, w, h, color, lineWidth };
    }

    if (newEl) pushState([...elements, newEl]);
  };

  const pushState = (newEls: WbElement[]) => {
    setElements(newEls);
    pushHistory(newEls);
    broadcastEls(newEls);
  };

  const openTextInput = () => { setTextInput({ visible: true, x: 80, y: 80, value: "" }); };

  const handleTextSubmit = () => {
    if (!textInput.visible) return;
    const val = textInput.value.trim();
    if (val) {
      const id = `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const newEl: WbElement = { id, type: "text", x: textInput.x, y: textInput.y, text: val, color, lineWidth: 1, fontSize, fontFamily };
      pushState([...elements, newEl]);
    }
    setTextInput({ visible: false, x: 0, y: 0, value: "" });
  };

  const clear = () => { if (confirm("Clear the whiteboard for everyone?")) { pushState([]); setSelectedId(null); } };
  const deleteSelected = () => { if (!selectedId) return; const next = elements.filter(el => el.id !== selectedId); pushState(next); setSelectedId(null); setSelectedImage(null); };
  const download = () => { const canvas = canvasRef.current; if (!canvas) return; const link = document.createElement("a"); link.download = `whiteboard-${roomId}.png`; link.href = canvas.toDataURL(); link.click(); };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const id = `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const newEl: WbElement = { id, type: "image", x: 100, y: 100, w: 300, h: 200, color: "#ffffff", lineWidth: 1, src: dataUrl, alt: file.name, rotation: 0 };
      pushState([...elements, newEl]);
      setTool("select");
      setSelectedId(id);
      setSelectedImage(newEl);
      e.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData.items;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            const id = `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const newEl: WbElement = { id, type: "image", x: 100, y: 100, w: 300, h: 200, color: "#ffffff", lineWidth: 1, src: dataUrl, alt: "Pasted image", rotation: 0 };
            pushState([...elements, newEl]);
            setTool("select");
            setSelectedId(id);
            setSelectedImage(newEl);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleImageAction = (action: string) => {
    if (!selectedImage) return;
    const img = selectedImage;
    switch (action) {
      case "minimize": {
        const nextImage = { ...img, w: 80, h: 80 };
        setSelectedImage(nextImage);
        pushState(elements.map(el => el.id === img.id ? nextImage : el));
        break;
      }
      case "maximize": {
        const nextImage = { ...img, w: 600, h: 400 };
        setSelectedImage(nextImage);
        pushState(elements.map(el => el.id === img.id ? nextImage : el));
        break;
      }
      case "copy": navigator.clipboard.writeText(`!${img.alt}(${img.src})`); break;
      case "rotate": {
        const nextImage = { ...img, rotation: ((img.rotation ?? 0) + 90) % 360 };
        setSelectedImage(nextImage);
        pushState(elements.map(el => el.id === img.id ? nextImage : el));
        break;
      }
      case "delete": { const next = elements.filter(el => el.id !== img.id); pushState(next); setSelectedId(null); setSelectedImage(null); break; }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const id = `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const rect = canvasRef.current!.getBoundingClientRect();
        const x = (e.clientX - rect.left) / zoom - panOffset.x;
        const y = (e.clientY - rect.top) / zoom - panOffset.y;
        const newEl: WbElement = { id, type: "image", x, y, w: 300, h: 200, color: "#ffffff", lineWidth: 1, src: dataUrl, alt: file.name, rotation: 0 };
        pushState([...elements, newEl]);
        setTool("select");
        setSelectedId(id);
        setSelectedImage(newEl);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); };

  const TOOLS: { id: ToolType; icon: React.ReactNode; title: string; shortcut?: string }[] = [
    { id: "select", icon: <MousePointer2 size={16}/>, title: "Select (V)", shortcut: "V" },
    { id: "pan", icon: <Hand size={16}/>, title: "Pan (H)", shortcut: "H" },
    { id: "pen", icon: <Pencil size={16}/>, title: "Pen (P)", shortcut: "P" },
    { id: "eraser", icon: <Eraser size={16}/>, title: "Eraser (E)", shortcut: "E" },
    { id: "line", icon: <Minus size={16}/>, title: "Line (L)", shortcut: "L" },
    { id: "arrow", icon: <ArrowUpRight size={16}/>, title: "Arrow (A)", shortcut: "A" },
    { id: "rect", icon: <Square size={16}/>, title: "Rectangle (R)", shortcut: "R" },
    { id: "circle", icon: <Circle size={16}/>, title: "Circle (C)", shortcut: "C" },
    { id: "text", icon: <Type size={16}/>, title: "Text (T)", shortcut: "T" },
    { id: "image", icon: <ImageIcon size={16}/>, title: "Image (I)", shortcut: "I" },
  ];

  const setZoomLevel = (nextZoom: number) => {
    setZoom(Math.min(2.5, Math.max(0.35, Number(nextZoom.toFixed(2)))));
  };

  const cursors: Record<ToolType, string> = {
    select: "default", pen: "crosshair", eraser: "cell", line: "crosshair", arrow: "crosshair",
    rect: "crosshair", circle: "crosshair", text: "text", pan: isPanning ? "grabbing" : "grab",
    image: "copy"
  };

  return (
    <div className="flex h-full bg-black relative font-inter overflow-hidden" onDrop={handleDrop} onDragOver={handleDragOver}>
      {/* Top Toolbar */}
      <div className="absolute top-0 left-0 right-0 z-50 bg-ct-dark-black/95 backdrop-blur-sm border-b border-[#222] overflow-x-auto">
        <div className="min-w-max flex items-center gap-3 px-2 py-2">
        {/* Left - Tools */}
        <div className="flex items-center gap-1 md:gap-2 shrink-0">
          {TOOLS.map(t => (
            <button key={t.id} onClick={() => { if (t.id === "image") fileInputRef.current?.click(); setTool(t.id); if (t.id === "text") openTextInput(); else setTextInput(p => ({ ...p, visible: false })); }} title={`${t.title}${t.shortcut ? ` (${t.shortcut})` : ""}`}
              className={`w-9 h-9 md:w-10 md:h-10 rounded-lg border-none cursor-pointer flex items-center justify-center transition-colors shrink-0 ${
                tool === t.id ? "bg-white text-black font-bold" : "bg-transparent text-gray-400 hover:bg-white/10 hover:text-white"
              }`}>
              {t.icon}
            </button>
          ))}
        </div>

        {/* Center - Color, Width, Font */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1 max-w-[340px] overflow-x-auto py-1">
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} className={`w-6 h-6 rounded-full cursor-pointer transition-all shrink-0 outline-none ${
                color === c ? "border-2 border-white scale-110" : "border border-gray-600 hover:border-white/50"
              }`} style={{ background: c }} title={c}/>
            ))}
          </div>
          <div className="w-px h-6 bg-[#333] mx-1"/>
          <div className="flex items-center gap-1">
            {WIDTHS.map(w => (
              <button key={w} onClick={() => setLineWidth(w)} className={`w-8 h-8 rounded-md cursor-pointer flex items-center justify-center ${ lineWidth === w ? "bg-white/20" : "bg-transparent" }`}>
                <div className={`w-4 rounded-full ${lineWidth === w ? "bg-white" : "bg-gray-500"}`} style={{ height: Math.min(w + 1, 10) }}/>
              </button>
            ))}
          </div>
          <div className="w-px h-6 bg-[#333] mx-1"/>
          <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} className="bg-[#1a1a2e] border border-[#333] text-white text-xs px-2 py-1 rounded">
            {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
          </select>
          <input type="range" min={12} max={72} value={fontSize} onChange={e => setFontSize(+e.target.value)} className="w-32 accent-white" title="Font Size"/>
          <span className="text-xs text-gray-400">{fontSize}px</span>
        </div>

        {/* Right - Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 rounded-lg border border-[#333] bg-black/40 px-1">
            <button onClick={() => setZoomLevel(zoom - 0.1)} title="Zoom out" className="p-2 rounded-md bg-transparent text-gray-400 hover:text-white hover:bg-white/10 cursor-pointer"><ZoomOut size={16}/></button>
            <span className="w-12 text-center text-xs text-gray-300">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoomLevel(zoom + 0.1)} title="Zoom in" className="p-2 rounded-md bg-transparent text-gray-400 hover:text-white hover:bg-white/10 cursor-pointer"><ZoomIn size={16}/></button>
          </div>
          <button onClick={undo} disabled={historyIndex === 0} title="Undo (Ctrl+Z)" className="p-2 rounded-lg bg-transparent text-gray-400 hover:text-white hover:bg-white/10 cursor-pointer disabled:opacity-30"><Undo2 size={16}/></button>
          <button onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Y)" className="p-2 rounded-lg bg-transparent text-gray-400 hover:text-white hover:bg-white/10 cursor-pointer disabled:opacity-30"><Redo2 size={16}/></button>
          <div className="w-px h-6 bg-[#333] mx-1"/>
          <button onClick={download} title="Download PNG" className="p-2 rounded-lg bg-transparent text-gray-400 hover:text-white hover:bg-white/10 cursor-pointer"><Download size={16}/></button>
          <button onClick={clear} title="Clear All" className="p-2 rounded-lg bg-transparent text-red-400 hover:bg-red-500/20 cursor-pointer"><Trash2 size={16}/></button>
          <div className="w-px h-6 bg-[#333] mx-1"/>
          <button onClick={() => setShowAiPanel(p => !p)} title="AI Architecture" className={`p-2 rounded-lg ${showAiPanel ? "bg-purple-600 text-white" : "bg-transparent text-purple-400 hover:bg-purple-500/20 hover:text-purple-300"} cursor-pointer`}><Sparkles size={16}/></button>
          <button onClick={() => setIs3DMode(p => !p)} title="3D Mode" className={`p-2 rounded-lg ${is3DMode ? "bg-blue-600 text-white" : "bg-transparent text-blue-400 hover:bg-blue-500/20 hover:text-blue-300"} cursor-pointer`}><Box size={16}/></button>
          <button onClick={() => fileInputRef.current?.click()} title="Upload Image" className="p-2 rounded-lg bg-transparent text-gray-400 hover:text-white hover:bg-white/10 cursor-pointer"><Upload size={16}/></button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden"/>
        </div>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 pt-[58px] relative min-w-0">
        <div ref={scrollRef} className="h-full w-full overflow-auto bg-black" onPaste={handlePaste} onDragOver={handleDragOver} onDrop={handleDrop}>
          <div style={{
            width: canvasSize.width * zoom,
            height: canvasSize.height * zoom,
            position: "relative",
            transform: is3DMode
              ? `perspective(1200px) rotateX(${cameraAngle.rotateX}deg) rotateZ(${cameraAngle.rotateZ}deg) scale(${zoom}) translate(${panOffset.x}px, ${panOffset.y}px)`
              : `scale(${zoom}) translate(${panOffset.x}px, ${panOffset.y}px)`,
            transformOrigin: "0 0",
            transformStyle: "preserve-3d",
          }}>
            <canvas ref={canvasRef}
              className="absolute top-0 left-0 block"
              style={{ width: canvasSize.width, height: canvasSize.height, cursor: cursors[tool] }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => { if (drawing.current) { drawing.current = false; clearOverlay(); } }}
            />
            <canvas ref={overlayRef} className="absolute top-0 left-0 pointer-events-none" style={{ width: canvasSize.width, height: canvasSize.height }} />

            {textInput.visible && (
              <div style={{ left: textInput.x, top: Math.max(8, textInput.y - fontSize) }} className="absolute z-30 pointer-events-none">
                <textarea ref={textAreaRef} autoFocus value={textInput.value} onChange={e => setTextInput(p => ({ ...p, value: e.target.value }))} onKeyDown={e => { if (e.key === "Escape") { setTextInput(p => ({ ...p, visible: false })); return; } if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); } }} placeholder="Type here, Enter to place..." className="pointer-events-auto bg-black/90 border-1.5 border-dashed border-white rounded-md text-white outline-none min-w-[140px] min-h-[76px] p-[4px_8px] resize-none leading-relaxed backdrop-blur-sm" style={{ color, fontSize, fontFamily: `"${fontFamily}", sans-serif` }} rows={3} />
                <div className="text-[10px] text-gray-500 mt-0.5 pointer-events-none">Enter = place · Shift+Enter = newline · Esc = cancel</div>
              </div>
            )}

            {elements.length === 0 && !textInput.visible && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none text-gray-500" style={{ width: canvasSize.width }}>
                <div className="text-4xl mb-2.5">✏️</div>
                <p className="text-xs">Pick a tool and start drawing</p>
                <p className="text-[11px] mt-1 text-gray-600">Canvas expands and scrolls as your diagram grows</p>
                <p className="text-[11px] mt-1 text-gray-600">Drag & drop images, paste (Ctrl+V), or use the image tool</p>
              </div>
            )}
          </div>
        </div>

        {/* Selected Image Controls */}
        {selectedImage && (
          <div className="fixed bottom-20 right-4 z-40 bg-black/90 border border-white/20 rounded-xl p-3 flex items-center gap-2 shadow-xl">
            <button onClick={() => handleImageAction("minimize")} title="Minimize" className="p-2 rounded bg-white/10 hover:bg-white/20 text-white"><Minimize2 size={14}/></button>
            <button onClick={() => handleImageAction("maximize")} title="Maximize" className="p-2 rounded bg-white/10 hover:bg-white/20 text-white"><Maximize2 size={14}/></button>
            <button onClick={() => handleImageAction("copy")} title="Copy" className="p-2 rounded bg-white/10 hover:bg-white/20 text-white"><Copy size={14}/></button>
            <button onClick={() => handleImageAction("rotate")} title="Rotate" className="p-2 rounded bg-white/10 hover:bg-white/20 text-white"><RotateIcon size={14}/></button>
            <button onClick={() => handleImageAction("delete")} title="Delete" className="p-2 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400"><TrashIcon size={14}/></button>
            <button onClick={() => { setSelectedImage(null); setSelectedId(null); }} className="p-2 rounded bg-white/10 hover:bg-white/20 text-white ml-2">Done</button>
          </div>
        )}

        {/* Selected Element Actions */}
        {selectedId && !selectedImage && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 bg-ct-dark-black border border-white/20 rounded-xl p-3 flex items-center gap-2 shadow-xl">
            <span className="text-xs text-gray-400">Element selected — drag to move</span>
            <button onClick={deleteSelected} className="p-2 rounded bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30"><Trash2 size={12}/></button>
            <button onClick={() => { setSelectedId(null); setSelectedImage(null); }} className="p-2 rounded bg-white/10 hover:bg-white/20 text-gray-400 hover:text-white">Deselect</button>
          </div>
        )}

        {/* History Indicator */}
        <div className="fixed bottom-4 left-4 z-20 bg-black/80 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-400">
          History: {historyIndex + 1} / {history.length} · <kbd className="px-1.5 py-0.5 bg-white/10 rounded">Ctrl+Z</kbd> Undo · <kbd className="px-1.5 py-0.5 bg-white/10 rounded">Ctrl+Y</kbd> Redo
        </div>
      </div>

      {/* Floating Panels */}
      {showFontPanel && (
        <div className="fixed top-20 right-4 z-30 bg-ct-card border border-[#2a2a2a] rounded-xl p-3.5 w-[200px] shadow-2xl">
          <div className="text-[11px] text-gray-400 font-bold mb-2.5 uppercase tracking-wider">Text Options</div>
          <div className="mb-2.5"><label className="text-[11px] text-gray-400 block mb-1">Font Size: {fontSize}px</label><input type="range" min={12} max={72} value={fontSize} onChange={e => setFontSize(+e.target.value)} className="w-full accent-white"/></div>
          <div><label className="text-[11px] text-gray-400 block mb-1.5">Font Family</label>{FONTS.map(f => (<button key={f} onClick={() => setFontFamily(f)} className={`block w-full text-left p-[5px_8px] rounded-md border-none cursor-pointer text-xs mb-0.5 ${fontFamily === f ? "bg-white/20 text-white font-bold" : "bg-transparent text-gray-400 hover:text-white"}`} style={{ fontFamily: f }}>{f}</button>))}</div>
        </div>
      )}

      {is3DMode && (
        <div className="fixed top-20 left-4 z-30 bg-ct-card border border-white/30 rounded-xl p-3.5 w-[220px] shadow-2xl">
          <div className="text-[11px] text-white font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5"><Box size={12}/> 3D Mode Controls</div>
          <div className="space-y-3">
            <div><label className="text-[10px] text-gray-400 block mb-1">Depth: {depth3D}px</label><input type="range" min={10} max={80} value={depth3D} onChange={e => setDepth3D(+e.target.value)} className="w-full accent-blue-500"/></div>
            <div><label className="text-[10px] text-gray-400 block mb-1">Rotation: {cameraAngle.rotateZ}°</label><input type="range" min={-180} max={180} value={cameraAngle.rotateZ} onChange={e => setCameraAngle(p => ({ ...p, rotateZ: +e.target.value }))} className="w-full accent-blue-500"/></div>
            <button onClick={() => setCameraAngle({ rotateX: 60, rotateZ: -45 })} className="w-full py-1.5 bg-[#222222] hover:bg-[#333333] text-gray-300 text-[10px] rounded-lg border border-[#333333] cursor-pointer flex items-center justify-center gap-1"><RotateCcw size={10}/> Reset View</button>
          </div>
          <p className="text-[9px] text-gray-500 mt-3 leading-relaxed">3D boxes show depth effect. Use AI to generate 3D architecture.</p>
        </div>
      )}

      {showAiPanel && (
        <div className="fixed top-20 right-4 z-30 bg-ct-card border border-white/30 rounded-xl p-3.5 w-[320px] shadow-2xl">
          <div className="flex items-center justify-between mb-3"><div className="text-[11px] text-white font-bold uppercase tracking-wider flex items-center gap-1.5"><Sparkles size={12}/> AI Architecture Generator</div><button onClick={() => setShowAiPanel(false)} className="text-gray-500 hover:text-white text-xs">✕</button></div>
          <p className="text-[10px] text-gray-400 mb-3 leading-relaxed">Describe what you want to draw and AI will generate it on the whiteboard.</p>
          <div className="mb-3"><textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="Describe the architecture you want to create...&#10;&#10;Examples:&#10;- Draw a 3D client-server architecture&#10;- Create a microservices diagram&#10;- Draw a database schema&#10;- Create a network topology" className="w-full h-[120px] bg-[#1a1a2e] border border-[#333] rounded-lg p-2.5 text-white text-xs resize-none outline-none focus:border-white/50 placeholder-gray-500" style={{ fontFamily: '"Inter", sans-serif' }} /></div>
          <div className="space-y-2">
            <button onClick={async () => { if (!aiPrompt.trim()) return; setAiGenerating(true); setAiStatus("idle"); try { const response = await fetch("/api/ai-whiteboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: aiPrompt, roomId, type: "3d" }) }); const data = await response.json(); if (data.elements && data.elements.length > 0) { const newElements = data.elements.map((el: Record<string, unknown>, i: number) => toWbElement(el, i)); pushState([...elements, ...newElements]); setAiStatus("success"); setTimeout(() => setAiStatus("idle"), 3000); } else { setAiStatus("error"); setTimeout(() => setAiStatus("idle"), 3000); } } catch (err) { console.error("AI generation failed:", err); setAiStatus("error"); setTimeout(() => setAiStatus("idle"), 3000); } setAiGenerating(false); }} disabled={aiGenerating || !aiPrompt.trim()} className="w-full py-2.5 bg-white hover:bg-gray-200 disabled:bg-gray-800 disabled:opacity-50 text-black disabled:text-gray-500 text-xs font-bold rounded-lg border-none cursor-pointer transition-colors">{aiGenerating ? "Generating..." : "Generate 3D Architecture"}</button>
            <button onClick={async () => { if (!aiPrompt.trim()) return; setAiGenerating(true); setAiStatus("idle"); try { const response = await fetch("/api/ai-whiteboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: aiPrompt, roomId, type: "flowchart" }) }); const data = await response.json(); if (data.elements && data.elements.length > 0) { const newElements = data.elements.map((el: Record<string, unknown>, i: number) => toWbElement(el, i)); pushState([...elements, ...newElements]); setAiStatus("success"); setTimeout(() => setAiStatus("idle"), 3000); } else { setAiStatus("error"); setTimeout(() => setAiStatus("idle"), 3000); } } catch (err) { console.error("AI generation failed:", err); setAiStatus("error"); setTimeout(() => setAiStatus("idle"), 3000); } setAiGenerating(false); }} disabled={aiGenerating || !aiPrompt.trim()} className="w-full py-2 bg-[#222222] hover:bg-[#333333] disabled:opacity-50 text-gray-300 text-xs font-bold rounded-lg border border-[#333333] cursor-pointer transition-colors">{aiGenerating ? "Generating..." : "Generate Flow Diagram"}</button>
            {aiStatus === "success" && <p className="text-[10px] text-green-400 mt-2 text-center">✓ Diagram generated successfully!</p>}
            {aiStatus === "error" && <p className="text-[10px] text-red-400 mt-2 text-center">✗ Failed to generate. Try again.</p>}
          </div>
          <div className="mt-3 pt-3 border-t border-[#333]"><p className="text-[9px] text-gray-500 mb-2">Quick prompts:</p><div className="flex flex-wrap gap-1.5">{["3D Client-Server", "Microservices", "Database Schema", "Network Topology", "UML Diagram", "Cloud Architecture"].map((preset) => (<button key={preset} onClick={() => setAiPrompt(preset)} className="px-2 py-1 bg-[#1a1a2e] hover:bg-[#252540] text-gray-400 text-[9px] rounded border border-[#333] cursor-pointer transition-colors">{preset}</button>))}</div></div>
        </div>
      )}
    </div>
  );
}
