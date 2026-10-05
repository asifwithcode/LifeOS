import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="text-center">
        <p className="text-sm text-fg-muted">404 — page not found</p>
        <Link href="/" className="mt-3 inline-block text-sm text-accent underline-offset-2 hover:underline">
          Back to LifeOS
        </Link>
      </div>
    </div>
  );
}
