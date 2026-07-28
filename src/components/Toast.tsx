"use client";

import { useEffect } from "react";

export type ToastData = {
  id: string;
  message: string;
  type: "info" | "error" | "success";
};

type ToastContainerProps = {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
};

function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  const bg = toast.type === "error" ? "#c72a2a" : toast.type === "success" ? "#2ea043" : "#007acc";

  return (
    <div
      className="toast-enter"
      style={{
        background: bg,
        color: "#fff",
        padding: "8px 14px",
        borderRadius: 4,
        fontSize: 13,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        maxWidth: 380,
      }}
    >
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1 }}
      >
        ×
      </button>
    </div>
  );
}

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;
  return (
    <div style={{ position: "fixed", bottom: 40, left: 60, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
