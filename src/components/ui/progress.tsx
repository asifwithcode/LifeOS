import { cn } from "@/lib/ui/cn";

export function ProgressBar({
  value,
  className,
  tone = "accent",
  label,
}: {
  value: number | null;
  className?: string;
  tone?: "accent" | "success" | "warning" | "muted";
  label?: string;
}) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  const fill = { accent: "bg-accent", success: "bg-success", warning: "bg-warning", muted: "bg-fg-subtle" }[tone];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(pct)}
      className={cn("h-1 w-full overflow-hidden rounded-full bg-bg-muted", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ProgressRing({ value, size = 56, stroke = 5, label }: { value: number | null; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? (value === null ? "No data" : `${Math.round(pct)}%`)} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-muted)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (pct / 100) * c}
        className="transition-[stroke-dashoffset] duration-700 ease-out"
      />
    </svg>
  );
}

/** Percent + explanation line; every progress display says how it was calculated. */
export function ProgressExplained({ percent, explanation, className }: { percent: number | null; explanation: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-3">
        <ProgressBar value={percent} className="flex-1" label="Progress" />
        <span className="tabular w-10 text-right text-xs font-medium text-fg">{percent === null ? "—" : `${Math.round(percent)}%`}</span>
      </div>
      <p className="text-xs text-fg-subtle">{explanation}</p>
    </div>
  );
}
