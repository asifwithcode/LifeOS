"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/ui/cn";

interface TaskCheckProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  priority?: string;
  size?: "sm" | "md";
}

const ring: Record<string, string> = {
  urgent: "border-danger",
  high: "border-warning",
  medium: "border-accent/70",
};

/** Round completion check used for tasks, routine blocks and milestones. */
export function TaskCheck({ checked, onChange, disabled, label, priority, size = "md" }: TaskCheckProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onChange(!checked);
      }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full border-[1.5px] transition-colors duration-150 disabled:opacity-50",
        size === "sm" ? "size-4" : "size-[18px]",
        checked ? "border-accent bg-accent text-accent-fg" : cn("border-border-strong hover:border-accent hover:bg-accent-soft", priority && ring[priority]),
      )}
    >
      {checked ? <Check className={cn("animate-check", size === "sm" ? "size-2.5" : "size-3")} strokeWidth={3} aria-hidden /> : null}
    </button>
  );
}

export function Checkbox({ name, defaultChecked, label, value }: { name: string; defaultChecked?: boolean; label: string; value?: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-fg">
      <input type="checkbox" name={name} value={value ?? "true"} defaultChecked={defaultChecked} className="size-3.5 rounded accent-[var(--accent)]" />
      {label}
    </label>
  );
}
