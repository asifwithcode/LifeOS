"use client";

import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  wide,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <D.Portal>
      <D.Overlay className="animate-fade-in fixed inset-0 z-50 bg-black/40" />
      <D.Content
        className={cn(
          "animate-pop-in fixed z-50 flex max-h-[min(90dvh,820px)] w-full flex-col border border-border bg-bg-elevated shadow-float focus:outline-none",
          "inset-x-0 bottom-0 rounded-t-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[12vh] sm:-translate-x-1/2 sm:rounded-xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <D.Title className="text-[15px] font-semibold text-fg">{title}</D.Title>
            {description ? <D.Description className="mt-0.5 text-[13px] text-fg-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="-mr-1 grid size-7 place-items-center rounded-md text-fg-subtle hover:bg-bg-muted hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
