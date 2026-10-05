import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/ui/cn";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-px text-[11px] font-medium leading-4 whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-bg-muted text-fg-muted",
      accent: "bg-accent-soft text-accent",
      success: "bg-success-soft text-success",
      warning: "bg-warning-soft text-warning",
      danger: "bg-danger-soft text-danger",
      outline: "border border-border text-fg-muted",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-bg-subtle px-1 font-mono text-[10px] text-fg-subtle", className)}>
      {children}
    </kbd>
  );
}

export function Ref({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[11px] tracking-tight text-fg-subtle", className)}>{children}</span>;
}
