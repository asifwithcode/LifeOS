"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { captureAction, captureAndConvertAction, previewCaptureAction } from "@/actions/inbox";
import { suggestCaptureAIAction } from "@/actions/ai";
import type { CaptureSuggestion } from "@/lib/domain/capture";
import { ENTITY_LABEL } from "@/lib/domain/constants";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Kbd } from "@/components/ui/badge";
import { ConversionEditor, conversionFromSuggestion, type Conversion } from "@/components/entities/conversion-editor";
import type { EntityOptions } from "./options";
import { useShell } from "./providers";

export function QuickCapture() {
  const { open, setOpen, captureInitial, options } = useShell();
  return (
    <Dialog open={open === "capture"} onOpenChange={(o) => setOpen(o ? "capture" : null)}>
      <DialogContent title="Quick capture" description="Capture anything. It goes to your Inbox unless you confirm a type now." wide>
        {/* Mounted fresh on every open, so state starts from the initial text. */}
        <CaptureBody initial={captureInitial} options={options} onClose={() => setOpen(null)} />
      </DialogContent>
    </Dialog>
  );
}

function CaptureBody({ initial, options, onClose }: { initial: string; options: EntityOptions; onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [suggestion, setSuggestion] = useState<CaptureSuggestion | null>(null);
  const [edits, setEdits] = useState<Conversion | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  const long = text.trim().length >= 3;
  const shown = long ? suggestion : null;
  // User edits win; otherwise the editor mirrors the latest suggestion.
  const conversion = edits ?? (shown ? conversionFromSuggestion(shown, text.trim(), options.today) : null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  // Debounced suggestion preview (read-only on the server).
  useEffect(() => {
    const t = text.trim();
    if (t.length < 3) return;
    const h = setTimeout(async () => {
      const r = await previewCaptureAction(t);
      if (r.ok && r.data) setSuggestion((cur) => (cur?.source === "ai" ? cur : (r.data ?? null)));
    }, 250);
    return () => clearTimeout(h);
  }, [text]);

  const askAI = () =>
    start(async () => {
      const r = await suggestCaptureAIAction(text);
      if (r.ok && r.data) {
        setSuggestion(r.data);
        setEdits(conversionFromSuggestion(r.data, text.trim(), options.today));
      } else if (!r.ok) toast.error(r.error);
      else toast.error("The AI couldn't classify this.");
    });

  const saveToInbox = () =>
    start(async () => {
      if (!text.trim()) return;
      const r = await captureAction(text);
      if (r.ok) {
        toast.success("Saved to Inbox", { action: { label: "Open", onClick: () => router.push("/inbox") } });
        onClose();
      } else toast.error(r.error);
    });

  const createNow = () =>
    start(async () => {
      if (!text.trim() || !conversion) return;
      const r = await captureAndConvertAction(text, conversion);
      if (r.ok && r.data) {
        const url = r.data.url;
        toast.success(`Created ${r.data.ref}`, { action: { label: "Open", onClick: () => router.push(url) } });
        onClose();
      } else if (!r.ok) toast.error(r.error);
    });

  return (
    <div className="flex flex-col gap-4">
      <Textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (e.shiftKey && conversion) createNow();
            else saveToInbox();
          }
        }}
        placeholder="Try offline wake-word detection on ESP32-S3 for MAYA #esp32"
        className="min-h-24 text-[14px]"
        maxLength={5000}
        aria-label="Capture text"
      />

      {conversion && shown ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg-subtle p-3">
          <div className="flex items-start gap-2 text-xs text-fg-muted">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
            <p>
              <span className="font-medium text-fg">Suggested: {ENTITY_LABEL[conversion.destination]}</span>
              <span className="text-fg-subtle"> · {shown.source === "ai" ? `by AI (${options.ai})` : "by rules"} — {shown.reasons.join(" · ")}</span>
            </p>
          </div>
          <ConversionEditor value={conversion} onChange={setEdits} projects={options.projects} />
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="hidden text-xs text-fg-subtle sm:block">
          <Kbd>⌘</Kbd> <Kbd>↵</Kbd> inbox · <Kbd>⌘</Kbd> <Kbd>⇧</Kbd> <Kbd>↵</Kbd> create
        </p>
        <div className="flex gap-2">
          {options.ai && long ? (
            <Button variant="ghost" onClick={askAI} loading={pending} title={`Sends this text to ${options.ai}`}>
              <Sparkles /> Ask AI
            </Button>
          ) : null}
          <Button onClick={saveToInbox} loading={pending} disabled={!text.trim()}>
            Save to Inbox
          </Button>
          {conversion ? (
            <Button variant="primary" onClick={createNow} loading={pending} disabled={!conversion.title.trim()}>
              Create {ENTITY_LABEL[conversion.destination].toLowerCase()}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
