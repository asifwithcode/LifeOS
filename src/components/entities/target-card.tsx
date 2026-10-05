import Link from "next/link";
import { formatTargetAmount } from "@/lib/domain/targets";
import type { EvaluatedTarget } from "@/server/services/targets";
import { ProgressBar } from "@/components/ui/progress";
import { cn } from "@/lib/ui/cn";

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  complete: { text: "Done", className: "text-success" },
  ahead: { text: "Ahead", className: "text-success" },
  on_track: { text: "On track", className: "text-fg-muted" },
  behind: { text: "Behind pace", className: "text-warning" },
  not_started: { text: "Not started", className: "text-fg-subtle" },
};

/** One-line target with actual / amount, bar and neutral pace summary. */
export function TargetLine({ target, showPace = true, href = true }: { target: EvaluatedTarget; showPace?: boolean; href?: boolean }) {
  const e = target.evaluation;
  const status = STATUS_LABEL[e.status];
  const content = (
    <div className="flex flex-col gap-1.5 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[13px] font-medium text-fg">{target.title}</span>
        <span className="tabular shrink-0 text-[13px] text-fg-muted">
          <span className="text-fg">{formatTargetAmount(e.actual, target.unit, target.customUnit)}</span> / {formatTargetAmount(e.amount, target.unit, target.customUnit)}
        </span>
      </div>
      <ProgressBar value={e.percent} tone={e.status === "complete" ? "success" : "accent"} label={`${target.title} progress`} />
      {showPace ? (
        <div className="flex items-center justify-between gap-3 text-[11px]">
          <span className="truncate text-fg-subtle">{target.summary}</span>
          {target.period !== "daily" ? <span className={cn("shrink-0", status.className)}>{status.text}</span> : null}
        </div>
      ) : null}
    </div>
  );
  return href ? (
    <Link href={`/targets/${target.ref}`} className="block rounded-md hover:bg-bg-subtle">
      {content}
    </Link>
  ) : (
    content
  );
}
