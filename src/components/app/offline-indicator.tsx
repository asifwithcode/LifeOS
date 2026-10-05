"use client";

import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function OfflineIndicator() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <div role="status" className="fixed left-1/2 top-3 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-bg-elevated px-3 py-1.5 text-xs text-fg-muted shadow-float">
      <WifiOff className="size-3.5 text-warning" aria-hidden />
      You&apos;re offline — changes won&apos;t save until you reconnect.
    </div>
  );
}
