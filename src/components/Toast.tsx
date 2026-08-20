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

  const toneClass =
    toast.type === "error"
      ? "bg-[#c72a2a] text-white"
      : toast.type === "success"
        ? "bg-[#2ea043] text-white"
        : "bg-white text-black";

  return (
    <div className={`toast-enter flex max-w-[380px] items-center gap-2 rounded px-3.5 py-2 text-[13px] shadow-[0_4px_16px_rgba(0,0,0,0.4)] ${toneClass}`}>
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className={`cursor-pointer border-none bg-transparent p-0 text-base leading-none ${toast.type === "info" ? "text-black" : "text-white"}`}
      >
        ×
      </button>
    </div>
  );
}

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-10 left-[60px] z-[9999] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
