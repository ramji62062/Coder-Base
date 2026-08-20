"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] font-inter text-white">
      <div className="max-w-[420px] text-center">
        <div className="mb-3 text-5xl">⚠️</div>
        <h2 className="mb-2 text-[22px] font-bold">Something went wrong</h2>
        <p className="mb-6 text-sm text-[#999]">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={reset}
          className="cursor-pointer rounded-lg border-0 bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-gray-200"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
