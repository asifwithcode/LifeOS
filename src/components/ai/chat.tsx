"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Brain, CheckSquare, FileText, Info, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";
import { addMemoryAction } from "@/actions/ai";
import { createNoteAction } from "@/actions/notes";
import type { PresentedAction } from "@/server/ai/action-service";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/entities/markdown";
import { TaskForm } from "@/components/forms/task-form";
import { useShell } from "@/components/app/providers";
import { cn } from "@/lib/ui/cn";
import { ActionCard } from "./action-card";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  status: string;
  error?: string | null;
  contextRefs?: { type: string; ref: string | null; title: string }[];
  provider?: string | null;
}

interface Props {
  conversationId: string | null;
  mode: string;
  modes: { key: string; label: string; description: string }[];
  initialMessages: ChatMessage[];
  initialActions: PresentedAction[];
  providerLabel: string;
  starters: string[];
  initialPrompt?: string;
}

const KIND_LABEL: Record<string, string> = { target: "Targets", task: "Tasks", project: "Projects", goal: "Goals", skill: "Skills", note: "Notes", idea: "Ideas", decision: "Decisions", memory: "Memory", routine_item: "Routine" };

export function Chat({ conversationId, mode: initialMode, modes, initialMessages, initialActions, providerLabel, starters, initialPrompt }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [actions, setActions] = useState(initialActions);
  const [mode, setMode] = useState(initialMode);
  const [input, setInput] = useState(initialPrompt ?? "");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const convRef = useRef<string | null>(conversationId);
  const createdRef = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, actions]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    const tempUser: ChatMessage = { id: `u-${Date.now()}`, role: "user", text: message, status: "complete" };
    const tempAssistant: ChatMessage = { id: `a-${Date.now()}`, role: "assistant", text: "", status: "pending" };
    setMessages((m) => [...m, tempUser, tempAssistant]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let assistantId = tempAssistant.id;
    const patchAssistant = (fn: (m: ChatMessage) => ChatMessage) => setMessages((all) => all.map((m) => (m.id === assistantId ? fn(m) : m)));
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convRef.current, message, mode }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        patchAssistant((m) => ({ ...m, status: "error", error: err.error }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const e = JSON.parse(line);
          if (e.type === "start") {
            const newId = e.messageId as string;
            setMessages((all) => all.map((m) => (m.id === assistantId ? { ...m, id: newId, contextRefs: e.contextRefs, provider: e.provider } : m)));
            assistantId = newId;
            if (!convRef.current) {
              convRef.current = e.conversationId;
              createdRef.current = true;
            }
          } else if (e.type === "text") patchAssistant((m) => ({ ...m, text: m.text + e.delta }));
          else if (e.type === "action") setActions((a) => [...a, e.action]);
          else if (e.type === "done") patchAssistant((m) => ({ ...m, status: e.stop === "refusal" ? "refused" : "complete" }));
          else if (e.type === "error") patchAssistant((m) => ({ ...m, status: "error", error: e.message }));
        }
      }
    } catch (err) {
      patchAssistant((m) => ({ ...m, status: "error", error: (err as Error).name === "AbortError" ? "Stopped." : "Connection lost." }));
    } finally {
      setBusy(false);
      abortRef.current = null;
      // A new conversation gets its URL only after the stream ends, so the pane never remounts mid-answer.
      if (createdRef.current) {
        createdRef.current = false;
        router.replace(`/ai?c=${convRef.current}`);
      } else router.refresh();
    }
  };

  const empty = messages.length === 0;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
          {empty ? (
            <div className="flex flex-col items-center gap-5 py-10 text-center">
              <div className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
                <Sparkles className="size-5" aria-hidden />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Ask about your goals, targets, projects and plans</h2>
                <p className="mt-1 text-[13px] text-fg-muted">Answers use the parts of your LifeOS you&apos;ve shared. Changes are proposed as cards you approve.</p>
              </div>
              {!conversationId ? (
                <label className="flex items-center gap-2 text-xs text-fg-muted">
                  Mode
                  <Select value={mode} onChange={(e) => setMode(e.target.value)} className="w-52" aria-label="Assistant mode">
                    {modes.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}
              <p className="-mt-2 text-xs text-fg-subtle">{modes.find((m) => m.key === mode)?.description}</p>
              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {starters.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="rounded-lg border border-border px-3 py-2.5 text-left text-[13px] text-fg-muted transition-colors hover:border-border-strong hover:bg-bg-subtle hover:text-fg">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {messages.map((m) => (
            <MessageView key={m.id} message={m} actions={actions.filter((a) => a.messageId === m.id)} onActionChange={(a) => setActions((all) => all.map((x) => (x.id === a.id ? a : x)))} />
          ))}
          {/* Proposals whose message id isn't known yet (still streaming) */}
          {actions
            .filter((a) => !messages.some((m) => m.id === a.messageId))
            .map((a) => (
              <ActionCard key={a.id} action={a} />
            ))}
          <div ref={endRef} />
        </div>
      </div>
      <div className="border-t border-border bg-bg px-4 pb-[calc(env(safe-area-inset-bottom)+72px)] pt-3 md:px-6 lg:pb-4">
        <form
          className="mx-auto flex w-full max-w-3xl items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            placeholder="Ask anything — e.g. “What should I focus on this week?”"
            className="max-h-48 min-h-10 resize-none text-[14px]"
            aria-label="Message"
            maxLength={8000}
          />
          {busy ? (
            <Button type="button" size="icon" onClick={() => abortRef.current?.abort()} aria-label="Stop">
              <Square />
            </Button>
          ) : (
            <Button type="submit" variant="primary" size="icon" disabled={!input.trim()} aria-label="Send">
              <ArrowUp />
            </Button>
          )}
        </form>
        <p className="mx-auto mt-1.5 flex max-w-3xl items-center gap-1 text-[11px] text-fg-subtle">
          <Info className="size-3" aria-hidden /> Relevant items you&apos;ve allowed are sent to {providerLabel}. Manage in Settings → AI & privacy.
        </p>
      </div>
    </div>
  );
}

function MessageView({ message: m, actions, onActionChange }: { message: ChatMessage; actions: PresentedAction[]; onActionChange: (a: PresentedAction) => void }) {
  const [open, setOpen] = useState<"note" | "task" | "memory" | null>(null);
  const { options } = useShell();
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-bg-muted px-4 py-2.5 text-[14px] leading-relaxed">{m.text}</div>
      </div>
    );
  }
  const groups = new Map<string, number>();
  for (const r of m.contextRefs ?? []) groups.set(r.type, (groups.get(r.type) ?? 0) + 1);
  return (
    <div className="flex flex-col gap-3">
      {m.status === "pending" && !m.text ? <p className="animate-skeleton text-[13px] text-fg-subtle">Thinking with your data…</p> : null}
      {m.text ? <Markdown content={m.text} /> : null}
      {m.status === "refused" ? <p className="rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning">The model declined to answer this request.</p> : null}
      {m.status === "error" ? <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{m.error ?? "Something went wrong."}</p> : null}
      {actions.map((a) => (
        <ActionCard key={a.id} action={a} onChange={onActionChange} />
      ))}
      {m.status === "complete" || m.contextRefs?.length ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle">
          {groups.size ? (
            <details className="group">
              <summary className="cursor-pointer list-none hover:text-fg">
                Used {m.contextRefs!.length} item{m.contextRefs!.length === 1 ? "" : "s"}: {[...groups.entries()].map(([k, n]) => `${n} ${KIND_LABEL[k] ?? k}`).join(" · ")}
              </summary>
              <ul className="mt-1 max-h-40 overflow-y-auto">
                {m.contextRefs!.map((r, i) => (
                  <li key={i}>
                    {r.ref ? <span className="font-mono">{r.ref}</span> : null} {r.title}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {m.text && m.status === "complete" ? (
            <span className={cn("flex gap-2")}>
              <button type="button" className="inline-flex items-center gap-1 hover:text-fg" onClick={() => setOpen("note")}>
                <FileText className="size-3" /> Save as note
              </button>
              <button type="button" className="inline-flex items-center gap-1 hover:text-fg" onClick={() => setOpen("task")}>
                <CheckSquare className="size-3" /> Create task
              </button>
              <button type="button" className="inline-flex items-center gap-1 hover:text-fg" onClick={() => setOpen("memory")}>
                <Brain className="size-3" /> Remember
              </button>
            </span>
          ) : null}
        </div>
      ) : null}
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent title={open === "note" ? "Save as note" : open === "task" ? "Create task from answer" : "Save to AI memory"} description="Review what will be created." wide>
          {open === "note" ? <SaveNote text={m.text} onDone={() => setOpen(null)} /> : null}
          {open === "task" ? <TaskForm options={options} initial={{ title: firstLine(m.text), description: m.text.slice(0, 4000) }} onDone={() => setOpen(null)} /> : null}
          {open === "memory" ? <SaveMemory text={firstLine(m.text)} onDone={() => setOpen(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function firstLine(text: string) {
  return (text.split("\n").find((l) => l.trim()) ?? "").replace(/^[#>*\-\s]+/, "").slice(0, 200);
}

function SaveNote({ text, onDone }: { text: string; onDone: () => void }) {
  const [title, setTitle] = useState(firstLine(text) || "AI answer");
  const [content, setContent] = useState(text);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  return (
    <div className="flex flex-col gap-3">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
      <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={12} className="font-mono text-[12px]" aria-label="Content" />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button
          variant="primary"
          loading={pending}
          onClick={async () => {
            setPending(true);
            const fd = new FormData();
            fd.set("title", title || "AI answer");
            fd.set("content", content);
            fd.set("collection", "AI");
            const r = await createNoteAction(null, fd);
            setPending(false);
            if (r.ok) {
              toast.success(r.message ?? "Saved", { action: r.redirectTo ? { label: "Open", onClick: () => router.push(r.redirectTo!.replace("?edit=1", "")) } : undefined });
              onDone();
            } else toast.error(r.error);
          }}
        >
          Save note
        </Button>
      </div>
    </div>
  );
}

function SaveMemory({ text, onDone }: { text: string; onDone: () => void }) {
  const [content, setContent] = useState(text);
  const [kind, setKind] = useState("fact");
  const [pending, setPending] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-fg-subtle">Memories are durable facts the assistant may use in future conversations (only while memory is enabled). Keep them short and specific.</p>
      <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} maxLength={1000} aria-label="Memory" />
      <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind">
        {["preference", "goal", "decision", "constraint", "plan", "fact"].map((k) => (
          <option key={k} value={k}>{k}</option>
        ))}
      </Select>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button
          variant="primary"
          loading={pending}
          onClick={async () => {
            setPending(true);
            const r = await addMemoryAction(content, kind);
            setPending(false);
            if (r.ok) {
              toast.success("Saved to AI memory");
              onDone();
            } else toast.error(r.error);
          }}
        >
          Remember
        </Button>
      </div>
    </div>
  );
}
