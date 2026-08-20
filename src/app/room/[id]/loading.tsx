export default function RoomLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-[#1e1e1e] font-inter text-white">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-[#333] border-t-white" />
        <p className="text-sm text-[#858585]">Loading room…</p>
      </div>
    </div>
  );
}
