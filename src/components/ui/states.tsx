import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
  compact,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 py-6" : "gap-3 rounded-xl border border-dashed border-border px-6 py-12", className)}>
      {Icon ? (
        <div className={cn("grid place-items-center rounded-lg bg-bg-muted text-fg-subtle", compact ? "size-8" : "size-10")}>
          <Icon className={compact ? "size-4" : "size-5"} aria-hidden />
        </div>
      ) : null}
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-sm font-medium text-fg">{title}</p>
        {description ? <p className="text-[13px] text-fg-muted">{description}</p> : null}
      </div>
      {children ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-skeleton rounded-md bg-bg-muted", className)} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-8 flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
