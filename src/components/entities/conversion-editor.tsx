"use client";

import { INBOX_DESTINATIONS, ENTITY_LABEL, PRIORITIES, type InboxDestination, type Priority } from "@/lib/domain/constants";
import type { CaptureSuggestion } from "@/lib/domain/capture";
import { addDays } from "@/lib/domain/dates";
import { Input, Select } from "@/components/ui/input";
import type { Option } from "@/components/app/options";

export interface Conversion {
  destination: InboxDestination;
  title: string;
  projectId: string | null;
  priority: Priority;
  dueDate: string | null;
  tags: string[];
}

export function conversionFromSuggestion(s: CaptureSuggestion | null | undefined, fallbackTitle: string, today: string): Conversion {
  const destination: InboxDestination = s && s.type !== "resource" ? s.type : "note";
  return {
    destination,
    title: s?.title || fallbackTitle.slice(0, 120),
    projectId: s?.projectId ?? null,
    priority: s?.priority ?? "none",
    dueDate: s?.dueHint === "today" ? today : s?.dueHint === "tomorrow" ? addDays(today, 1) : null,
    tags: s?.tags ?? [],
  };
}

/** Editable form of a classification suggestion — nothing is saved until the user confirms. */
export function ConversionEditor({ value, onChange, projects }: { value: Conversion; onChange: (c: Conversion) => void; projects: Option[] }) {
  const set = (patch: Partial<Conversion>) => onChange({ ...value, ...patch });
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <label className="col-span-1 flex flex-col gap-1 text-xs text-fg-muted">
        Type
        <Select value={value.destination} onChange={(e) => set({ destination: e.target.value as InboxDestination })}>
          {INBOX_DESTINATIONS.map((d) => (
            <option key={d} value={d}>
              {ENTITY_LABEL[d]}
            </option>
          ))}
        </Select>
      </label>
      <label className="col-span-1 flex flex-col gap-1 text-xs text-fg-muted sm:col-span-3">
        Title
        <Input value={value.title} onChange={(e) => set({ title: e.target.value })} maxLength={300} />
      </label>
      {value.destination === "task" ? (
        <>
          <label className="col-span-2 flex flex-col gap-1 text-xs text-fg-muted">
            Project
            <Select value={value.projectId ?? ""} onChange={(e) => set({ projectId: e.target.value || null })}>
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Priority
            <Select value={value.priority} onChange={(e) => set({ priority: e.target.value as Priority })}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p === "none" ? "No priority" : p[0].toUpperCase() + p.slice(1)}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Due
            <Input type="date" value={value.dueDate ?? ""} onChange={(e) => set({ dueDate: e.target.value || null })} />
          </label>
        </>
      ) : null}
      {value.destination !== "goal" && value.destination !== "skill" ? (
        <label className="col-span-2 flex flex-col gap-1 text-xs text-fg-muted sm:col-span-4">
          Tags
          <Input
            value={value.tags.join(", ")}
            onChange={(e) => set({ tags: e.target.value.split(/[,\s]+/).map((t) => t.replace(/^#/, "").toLowerCase()).filter(Boolean) })}
            placeholder="esp32, voice"
          />
        </label>
      ) : null}
    </div>
  );
}
