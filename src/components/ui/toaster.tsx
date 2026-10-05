"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      theme="system"
      toastOptions={{
        classNames: {
          toast: "!bg-bg-elevated !text-fg !border !border-border !shadow-float !rounded-lg !text-[13px]",
          description: "!text-fg-muted",
          actionButton: "!bg-accent !text-accent-fg",
        },
      }}
    />
  );
}
