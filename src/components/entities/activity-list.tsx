import Link from "next/link";
import { entityUrl, type EntityType } from "@/lib/domain/constants";
import { formatMinutes } from "@/lib/domain/dates";
import { EVENT_VERB, type EventType } from "@/lib/domain/events";
import type { ActivityEvent } from "@/server/db/schema";
import { timeOfDay } from "@/lib/ui/format";
import { Ref } from "@/components/ui/badge";

function detail(e: ActivityEvent): string | null {
  const p = e.payload as Record<string, unknown>;
  if (e.type === "session.logged") {
    const parts: string[] = [];
    if (typeof p.durationMinutes === "number") parts.push(formatMinutes(p.durationMinutes));
    if (typeof p.quantity === "number") parts.push(`${p.quantity} ${p.unit ?? ""}`.trim());
    return parts.join(" · ") || null;
  }
  if (e.type === "routine.item_completed" && typeof p.actualMinutes === "number") return formatMinutes(p.actualMinutes);
  if ((e.type.endsWith("status_changed")) && p.to) return `→ ${String(p.to).replace(/_/g, " ")}`;
  if (e.type === "idea.converted" && p.projectRef) return `→ ${p.projectRef}`;
  if (e.type === "inbox.processed" && p.ref) return `→ ${p.ref}`;
  if (e.type === "skill.topic_completed" && p.topic) return String(p.topic);
  if (e.type === "skill.level_changed") return `level ${p.from} → ${p.to}`;
  if (e.type === "entity.linked" && p.targetTitle) return `↔ ${p.targetTitle}`;
  return null;
}

export function ActivityList({ events, timezone, showDate }: { events: ActivityEvent[]; timezone: string; showDate?: boolean }) {
  return (
    <ul className="flex flex-col">
      {events.map((e) => {
        const d = detail(e);
        const href = e.entityType === "session" ? "/sessions" : entityUrl(e.entityType as EntityType, e.entityRef);
        return (
          <li key={e.id} className="flex items-baseline gap-3 py-1.5 text-[13px]">
            <span className="tabular w-11 shrink-0 text-xs text-fg-subtle">{showDate ? e.localDate.slice(5) : timeOfDay(e.occurredAt, timezone)}</span>
            <span className="min-w-0 flex-1 truncate">
              <span className="text-fg-muted">{EVENT_VERB[e.type as EventType] ?? e.type}</span>{" "}
              <Link href={href} className="text-fg hover:underline hover:underline-offset-2">
                {e.entityTitle}
              </Link>
              {d ? <span className="text-fg-subtle"> · {d}</span> : null}
            </span>
            {e.entityRef ? <Ref className="hidden sm:inline">{e.entityRef}</Ref> : null}
          </li>
        );
      })}
    </ul>
  );
}
