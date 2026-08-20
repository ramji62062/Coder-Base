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
    <div className="flex min-h-screen items-center justify-center bg-[#1e1e1e] font-inter text-white">
      <div className="max-w-[420px] text-center">
        <div className="mb-3 text-5xl">🔌</div>
        <h2 className="mb-2 text-[22px] font-bold">Room Error</h2>
        <p className="mb-6 text-sm text-[#999]">
          {error.message || "Something went wrong loading this room."}
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={reset}
            className="cursor-pointer rounded-lg border-0 bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-gray-200"
          >
            Retry
          </button>
          <a
            href="/dashboard"
            className="inline-block rounded-lg bg-[#333] px-6 py-2.5 text-sm font-semibold text-white no-underline transition hover:bg-[#444]"
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
