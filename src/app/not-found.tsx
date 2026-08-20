import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] font-inter text-white">
      <div className="max-w-[420px] text-center">
        <div className="mb-2 text-6xl font-extrabold text-white">404</div>
        <h2 className="mb-2 text-[22px] font-bold">Page Not Found</h2>
        <p className="mb-6 text-sm text-[#999]">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/dashboard"
          className="inline-block rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-black no-underline transition hover:bg-gray-200"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
