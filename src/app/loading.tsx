export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] font-inter text-white">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-[#222] border-t-white" />
        <p className="text-sm text-[#999]">Loading…</p>
      </div>
    </div>
  );
}
