"use client";

import { DropdownMenu as M } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export const Dropdown = M.Root;
export const DropdownTrigger = M.Trigger;

export function DropdownContent({ children, align = "end", className }: { children: ReactNode; align?: "start" | "end" | "center"; className?: string }) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={4}
        className={cn("animate-pop-in z-50 min-w-44 rounded-lg border border-border bg-bg-elevated p-1 shadow-float", className)}
      >
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function DropdownItem({
  children,
  onSelect,
  danger,
  disabled,
  icon,
}: {
  children: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <M.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none data-[disabled]:opacity-50 [&_svg]:size-3.5",
        danger ? "text-danger data-[highlighted]:bg-danger-soft" : "text-fg data-[highlighted]:bg-bg-muted",
      )}
    >
      {icon}
      {children}
    </M.Item>
  );
}

export function DropdownSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <M.Label className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{children}</M.Label>;
}
