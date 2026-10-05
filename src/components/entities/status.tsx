import { Badge } from "@/components/ui/badge";
import { titleCase } from "@/lib/ui/format";

const TONES: Record<string, "neutral" | "accent" | "success" | "warning" | "danger" | "outline"> = {
  active: "accent",
  in_progress: "accent",
  building: "accent",
  planned: "outline",
  not_started: "outline",
  captured: "outline",
  exploring: "neutral",
  researching: "neutral",
  validated: "success",
  achieved: "success",
  completed: "success",
  done: "success",
  paused: "warning",
  on_hold: "warning",
  superseded: "neutral",
  reverted: "danger",
  abandoned: "neutral",
  cancelled: "neutral",
  archived: "neutral",
  todo: "outline",
  pending: "outline",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={TONES[status] ?? "neutral"}>{label ?? titleCase(status)}</Badge>;
}

const PRIORITY_TONE: Record<string, "danger" | "warning" | "accent" | "neutral"> = { urgent: "danger", high: "warning", medium: "accent", low: "neutral" };

export function PriorityBadge({ priority }: { priority: string }) {
  if (!priority || priority === "none") return null;
  return <Badge tone={PRIORITY_TONE[priority] ?? "neutral"}>{titleCase(priority)}</Badge>;
}
