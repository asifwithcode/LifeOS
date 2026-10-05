"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addTopicsAction, archiveSkillAction, deleteSkillAction, deleteTopicAction, moveTopicAction, renameTopicAction, setTopicStatusAction } from "@/actions/skills";
import type { Skill } from "@/server/db/schema";
import type { EntityOptions } from "@/components/app/options";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Textarea } from "@/components/ui/input";
import { EntityMenu } from "@/components/entities/entity-menu";
import { SkillForm } from "@/components/forms/skill-form";
import { SessionForm } from "@/components/forms/session-form";
import { cn } from "@/lib/ui/cn";

export function SkillActions({ skill, options }: { skill: Skill; options: EntityOptions }) {
  const [editing, setEditing] = useState(false);
  const [logging, setLogging] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setLogging(true)}>Log practice</Button>
      <Button onClick={() => setEditing(true)}>Edit</Button>
      <EntityMenu id={skill.id} archived={!!skill.archivedAt} deleted={!!skill.deletedAt} archive={archiveSkillAction} remove={deleteSkillAction} afterDeleteHref="/skills" />
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title={`Edit ${skill.name}`} description="Level changes are recorded in history as self-assessments." wide>
          <SkillForm options={options} skill={skill} onDone={() => setEditing(false)} />
        </DialogContent>
      </Dialog>
      <Dialog open={logging} onOpenChange={setLogging}>
        <DialogContent title={`Log ${skill.name} practice`} wide>
          <SessionForm options={options} defaults={{ title: `${skill.name} practice`, skillId: skill.id, activityType: skill.category === "language" ? "language" : skill.category === "technical" ? "coding" : "practice" }} onDone={() => setLogging(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

const NEXT: Record<string, string> = { not_started: "learning", learning: "done", done: "not_started" };
const MARK: Record<string, string> = { not_started: "○", learning: "◐", done: "✓" };

export function TopicRoadmap({ skillId, topics }: { skillId: string; topics: { id: string; title: string; status: string }[] }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Failed");
      else if (msg) toast.success(msg);
    });
  return (
    <div className="flex flex-col">
      {topics.length === 0 ? <p className="pb-2 text-xs text-fg-subtle">No topics yet. Add the roadmap you want to follow, one topic per line.</p> : null}
      <ol className="flex flex-col">
        {topics.map((t, i) => (
          <li key={t.id} className="group flex items-center gap-3 border-b border-border py-2 last:border-b-0">
            <span className="tabular w-6 text-right text-[11px] text-fg-subtle">{String(i + 1).padStart(2, "0")}</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => setTopicStatusAction(t.id, NEXT[t.status]), NEXT[t.status] === "done" ? `Completed ${t.title}` : undefined)}
              className={cn(
                "grid size-6 place-items-center rounded-full text-[13px] transition-colors",
                t.status === "done" ? "bg-accent text-accent-fg" : t.status === "learning" ? "bg-accent-soft text-accent" : "text-fg-subtle hover:bg-bg-muted",
              )}
              aria-label={`${t.title}: ${t.status.replace("_", " ")}. Advance status.`}
            >
              {MARK[t.status]}
            </button>
            <span className={cn("flex-1 text-[13px]", t.status === "done" && "text-fg-muted")}>{t.title}</span>
            <Dropdown>
              <DropdownTrigger className="grid size-6 place-items-center rounded text-fg-subtle opacity-60 hover:bg-bg-muted group-hover:opacity-100" aria-label={`Actions for ${t.title}`}>
                <MoreHorizontal className="size-4" />
              </DropdownTrigger>
              <DropdownContent>
                <DropdownItem onSelect={() => run(() => setTopicStatusAction(t.id, "not_started"))}>○ Not started</DropdownItem>
                <DropdownItem onSelect={() => run(() => setTopicStatusAction(t.id, "learning"))}>◐ Learning</DropdownItem>
                <DropdownItem onSelect={() => run(() => setTopicStatusAction(t.id, "done"))}>✓ Done</DropdownItem>
                <DropdownSeparator />
                <DropdownItem
                  icon={<Pencil />}
                  onSelect={() => {
                    const v = window.prompt("Rename topic", t.title);
                    if (v && v.trim() && v !== t.title) run(() => renameTopicAction(t.id, v));
                  }}
                >
                  Rename
                </DropdownItem>
                <DropdownItem icon={<ArrowUp />} disabled={i === 0} onSelect={() => run(() => moveTopicAction(t.id, "up"))}>Move up</DropdownItem>
                <DropdownItem icon={<ArrowDown />} disabled={i === topics.length - 1} onSelect={() => run(() => moveTopicAction(t.id, "down"))}>Move down</DropdownItem>
                <DropdownSeparator />
                <DropdownItem danger icon={<Trash2 />} onSelect={() => run(() => deleteTopicAction(t.id), "Topic removed")}>Delete</DropdownItem>
              </DropdownContent>
            </Dropdown>
          </li>
        ))}
      </ol>
      {adding ? (
        <div className="mt-2 flex flex-col gap-2">
          <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={"Coroutines\nFlow\nKtor"} aria-label="New topics, one per line" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              size="sm"
              variant="primary"
              loading={pending}
              disabled={!text.trim()}
              onClick={() =>
                start(async () => {
                  const r = await addTopicsAction(skillId, text);
                  if (r.ok) {
                    setText("");
                    setAdding(false);
                  } else toast.error(r.error);
                })
              }
            >
              Add topics
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="mt-1 self-start" onClick={() => setAdding(true)}>
          <Plus /> Add topics
        </Button>
      )}
    </div>
  );
}
