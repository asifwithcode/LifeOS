import { CalendarDays } from "lucide-react";
import { diffDays } from "@/lib/domain/dates";
import { relativeDay } from "@/lib/ui/format";
import { cn } from "@/lib/ui/cn";

export function DueBadge({ date, today, done }: { date: string | null; today: string; done?: boolean }) {
  if (!date) return null;
  const d = diffDays(today, date);
  const tone = done ? "text-fg-subtle" : d < 0 ? "text-danger" : d === 0 ? "text-warning" : "text-fg-subtle";
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px]", tone)}>
      <CalendarDays className="size-3" aria-hidden />
      {d < 0 && !done ? `${relativeDay(date, today)} · overdue` : relativeDay(date, today)}
    </span>
  );
}
