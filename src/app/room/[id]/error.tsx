"use client";

import { useEffect } from "react";

export default function RoomError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Room error:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1e1e1e",
        color: "#fff",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔌</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Room Error</h2>
        <p style={{ fontSize: 14, color: "#999", marginBottom: 24 }}>
          {error.message || "Something went wrong loading this room."}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            onClick={reset}
            style={{
              background: "#7C3AED",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 24px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
          <a
            href="/dashboard"
            style={{
              background: "#333",
              color: "#fff",
              borderRadius: 8,
              padding: "10px 24px",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
