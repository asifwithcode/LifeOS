"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { quickAddTaskAction } from "@/actions/tasks";

/** Inline "add a task" line. Enter to save; context (project, parent…) is attached automatically. */
export function QuickAddTask({ extras = {}, placeholder = "Add a task…" }: { extras?: Parameters<typeof quickAddTaskAction>[1]; placeholder?: string }) {
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);
  const submit = () => {
    const title = value.trim();
    if (!title) return;
    start(async () => {
      const r = await quickAddTaskAction(title, extras);
      if (r.ok) {
        setValue("");
        ref.current?.focus();
      } else toast.error(r.error);
    });
  };
  return (
    <div className="flex items-center gap-3 px-1 py-2">
      <Plus className="size-[18px] shrink-0 text-fg-subtle" aria-hidden />
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        disabled={pending}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={300}
        className="h-7 flex-1 bg-transparent text-[13px] text-fg placeholder:text-fg-subtle focus:outline-none"
      />
      {value ? <span className="text-[11px] text-fg-subtle">↵ to add</span> : null}
    </div>
  );
}
