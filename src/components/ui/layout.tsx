import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export function Page({ children, className, width = "default" }: { children: ReactNode; className?: string; width?: "default" | "narrow" | "wide" }) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 pb-24 pt-5 md:px-8 md:pb-12 md:pt-8",
        width === "narrow" ? "max-w-3xl" : width === "wide" ? "max-w-7xl" : "max-w-5xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-col gap-3 md:mb-8 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 flex items-center gap-2 text-xs text-fg-subtle">{eyebrow}</div> : null}
        <h1 className="text-[22px] font-semibold leading-7 tracking-[-0.015em] text-fg">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-[13px] text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Section({
  title,
  action,
  children,
  className,
  description,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      {title || action ? (
        <div className="flex items-center justify-between gap-2">
          <div>
            {title ? <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-fg-subtle">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-[10px] border border-border bg-bg", className)}>{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-fg-subtle">{label}</span>
      <span className="tabular text-lg font-semibold tracking-tight text-fg">{value}</span>
      {hint ? <span className="text-xs text-fg-subtle">{hint}</span> : null}
    </div>
  );
}

export function Tabs({ items, current }: { items: { href: string; label: string; count?: number; key: string }[]; current: string }) {
  return (
    <nav className="-mx-1 mb-5 flex gap-0.5 overflow-x-auto border-b border-border" aria-label="Views">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={cn(
            "relative flex shrink-0 items-center gap-1.5 px-2.5 pb-2.5 pt-1 text-[13px] transition-colors",
            t.key === current ? "text-fg after:absolute after:inset-x-2 after:-bottom-px after:h-[1.5px] after:rounded-full after:bg-fg" : "text-fg-muted hover:text-fg",
          )}
        >
          {t.label}
          {t.count !== undefined ? <span className="tabular text-[11px] text-fg-subtle">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
