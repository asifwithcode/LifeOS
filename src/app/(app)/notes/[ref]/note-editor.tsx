"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CheckSquare, Eye, Lightbulb, Pencil, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import { archiveNoteAction, deleteNoteAction, pinNoteAction, saveNoteAction } from "@/actions/notes";
import { captureAndConvertAction } from "@/actions/inbox";
import type { RelatedItem } from "@/server/engines/relations";
import type { Option } from "@/components/app/options";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { EntityMenu } from "@/components/entities/entity-menu";
import { LinksPanel } from "@/components/entities/links-panel";
import { Markdown } from "@/components/entities/markdown";
import { Section } from "@/components/ui/layout";

interface NoteData {
  id: string;
  ref: string;
  title: string;
  content: string;
  collection: string | null;
  pinned: boolean;
  lifeAreaId: string | null;
  tags: string[];
  archived: boolean;
  deleted: boolean;
  updatedAt: string;
}

type SaveState = "saved" | "saving" | "error";

export function NoteEditor({
  note,
  startEditing,
  related,
  mentionUrls,
  collections,
  lifeAreas,
}: {
  note: NoteData;
  startEditing: boolean;
  related: RelatedItem[];
  mentionUrls: Record<string, string>;
  collections: string[];
  lifeAreas: Option[];
}) {
  const [editing, setEditing] = useState(startEditing && !note.deleted);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [collection, setCollection] = useState(note.collection ?? "");
  const [tags, setTags] = useState(note.tags.join(", "));
  const [lifeAreaId, setLifeAreaId] = useState(note.lifeAreaId ?? "");
  const [state, setState] = useState<SaveState>("saved");
  const [selection, setSelection] = useState("");
  const [pending, start] = useTransition();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const snapshot = JSON.stringify([title, content, collection, tags, lifeAreaId]);
  // Last content known to be persisted; autosave only fires when the editor differs from it.
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);

  const save = useCallback(async () => {
    const sent = JSON.stringify([title, content, collection, tags, lifeAreaId]);
    setState("saving");
    const r = await saveNoteAction(note.id, {
      title: title.trim() || "Untitled note",
      content,
      collection: collection.trim() || null,
      pinned: note.pinned,
      lifeAreaId: lifeAreaId || null,
      tags: tags.split(/[,\s]+/).map((t) => t.replace(/^#/, "")).filter(Boolean),
    });
    if (r.ok) setSavedSnapshot(sent);
    setState(r.ok ? "saved" : "error");
    if (!r.ok) toast.error(r.error);
  }, [note.id, note.pinned, title, content, collection, lifeAreaId, tags]);

  const dirty = snapshot !== savedSnapshot;

  // Debounced autosave while there are unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => void save(), 1200);
    return () => clearTimeout(t);
  }, [snapshot, dirty, save]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty || state === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, state]);

  const convertSelection = (destination: "task" | "idea") =>
    start(async () => {
      const text = selection.trim();
      if (!text) return;
      const r = await captureAndConvertAction(`${text}\n\nFrom note ${note.ref}`, { destination, title: text.slice(0, 120), projectId: null, priority: "none", dueDate: null, tags: [] });
      if (r.ok && r.data) toast.success(`Created ${r.data.ref} from selection`);
      else if (!r.ok) toast.error(r.error);
    });

  const insertMentionHint = () => {
    const el = textRef.current;
    if (!el) return;
    const pos = el.selectionStart;
    const next = `${content.slice(0, pos)}[[PRJ-0001]]${content.slice(el.selectionEnd)}`;
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos + 2, pos + 10);
    });
  };

  const backlinks = related.filter((r) => r.direction === "incoming" && r.relationType === "mentions");
  const others = related.filter((r) => !(r.direction === "incoming" && r.relationType === "mentions"));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-fg-subtle" aria-live="polite">
          {state === "saving" ? "Saving…" : state === "error" ? "Couldn't save — retrying on next change" : dirty ? "Unsaved changes" : editing ? "All changes saved" : ""}
        </span>
        <div className="flex gap-2">
          {editing ? (
            <Button size="sm" onClick={async () => { await save(); setEditing(false); }}>
              <Eye /> Done
            </Button>
          ) : !note.deleted ? (
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              start(async () => {
                const r = await pinNoteAction(note.id, !note.pinned);
                if (!r.ok) toast.error(r.error);
              })
            }
            aria-label={note.pinned ? "Unpin" : "Pin"}
          >
            {note.pinned ? <PinOff /> : <Pin />}
          </Button>
          <EntityMenu id={note.id} archived={note.archived} deleted={note.deleted} archive={archiveNoteAction} remove={deleteNoteAction} afterDeleteHref="/notes" />
        </div>
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-transparent text-[26px] font-semibold tracking-[-0.02em] text-fg placeholder:text-fg-subtle focus:outline-none"
            placeholder="Title"
            aria-label="Title"
            maxLength={200}
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Input value={collection} onChange={(e) => setCollection(e.target.value)} placeholder="Collection" list="collections" aria-label="Collection" />
            <datalist id="collections">
              {collections.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags" aria-label="Tags" />
            <Select value={lifeAreaId} onChange={(e) => setLifeAreaId(e.target.value)} aria-label="Life area">
              <option value="">No life area</option>
              {lifeAreas.map((a) => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
            </Select>
          </div>
          <Textarea
            ref={textRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onSelect={(e) => {
              const el = e.currentTarget;
              setSelection(el.value.slice(el.selectionStart, el.selectionEnd));
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                e.preventDefault();
                void save();
              }
            }}
            className="min-h-[55vh] border-border bg-bg-subtle font-mono text-[13px] leading-6"
            placeholder={"# Heading\n\nWrite in Markdown. Link items with [[PRJ-0001]].\n\n- [ ] checklists\n| tables | work |"}
            aria-label="Note content (Markdown)"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
            <button type="button" onClick={insertMentionHint} className="rounded border border-border px-1.5 py-0.5 font-mono hover:text-fg">[[REF]]</button>
            <span>Markdown · ⌘S to save · autosaves</span>
            {selection.trim() ? (
              <span className="ml-auto flex gap-1.5">
                <Button size="sm" variant="secondary" loading={pending} onClick={() => convertSelection("task")}>
                  <CheckSquare /> Selection → Task
                </Button>
                <Button size="sm" variant="secondary" loading={pending} onClick={() => convertSelection("idea")}>
                  <Lightbulb /> Selection → Idea
                </Button>
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <article>
          <h1 className="mb-5 text-[26px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
          {content.trim() ? (
            <Markdown content={content} resolve={mentionUrls} />
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="text-[14px] text-fg-subtle hover:text-fg">
              Empty note — click to start writing.
            </button>
          )}
          {note.tags.length ? <p className="mt-6 text-[13px] text-fg-subtle">{note.tags.map((t) => `#${t}`).join(" ")}</p> : null}
        </article>
      )}

      <div className="mt-4 grid grid-cols-1 gap-8 border-t border-border pt-6 sm:grid-cols-2">
        <Section title={`Backlinks · ${backlinks.length}`}>
          {backlinks.length ? (
            <ul className="flex flex-col">
              {backlinks.map((b) => (
                <li key={b.relationId} className="py-1 text-[13px]">
                  <a href={b.urlPath} className="hover:underline hover:underline-offset-2">{b.title}</a>
                  {b.ref ? <span className="ml-2 font-mono text-[11px] text-fg-subtle">{b.ref}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-fg-subtle">No notes mention {note.ref} yet. Reference it elsewhere with [[{note.ref}]].</p>
          )}
        </Section>
        <Section title="Links & mentions">
          <LinksPanel source={{ type: "note", id: note.id }} related={others} />
        </Section>
      </div>
    </div>
  );
}
