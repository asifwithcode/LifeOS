"use client";

import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckSquare, Compass, FileText, FolderKanban, Lightbulb, Moon, Plus, Search, Sun, Timer, Laptop, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { quickNoteAction } from "@/actions/notes";
import { updateAppearanceAction } from "@/actions/settings";
import { ENTITY_LABEL, type EntityType } from "@/lib/domain/constants";
import { Kbd, Ref } from "@/components/ui/badge";
import { NAV } from "./nav-config";
import { useShell } from "./providers";

interface Hit {
  entityType: EntityType;
  entityId: string;
  ref: string | null;
  title: string;
  urlPath: string;
}

function Item({ icon: Icon, children, onSelect, shortcut, value }: { icon: LucideIcon; children: React.ReactNode; onSelect: () => void; shortcut?: string; value?: string }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-9 cursor-default select-none items-center gap-2.5 rounded-md px-2.5 text-[13px] text-fg data-[selected=true]:bg-bg-muted"
    >
      <Icon className="size-4 text-fg-subtle" aria-hidden />
      <span className="flex-1 truncate">{children}</span>
      {shortcut ? <Kbd>{shortcut}</Kbd> : null}
    </Command.Item>
  );
}

const GROUP = "px-1 py-1.5 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-fg-subtle";

export function CommandPalette() {
  const { open, setOpen, openCapture } = useShell();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const isOpen = open === "palette";

  useEffect(() => {
    const q = query.trim();
    if (!isOpen || q.length < 2) return;
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`, { signal: ctrl.signal });
        if (res.ok) setHits((await res.json()).hits);
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 140);
    return () => clearTimeout(t);
  }, [query, isOpen]);

  const visibleHits = query.trim().length >= 2 ? hits : [];

  const close = () => {
    setOpen(null);
    setQuery("");
  };
  const go = (href: string) => {
    close();
    router.push(href);
  };
  const theme = async (t: string) => {
    close();
    const accent = document.documentElement.dataset.accent ?? "indigo";
    const r = await updateAppearanceAction(t, accent);
    if (r.ok) router.refresh();
  };

  return (
    <D.Root open={isOpen} onOpenChange={(o) => (o ? setOpen("palette") : close())}>
      <D.Portal>
        <D.Overlay className="animate-fade-in fixed inset-0 z-50 bg-black/30" />
        <D.Content className="animate-pop-in fixed left-1/2 top-[10vh] z-50 w-[calc(100%-24px)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-float focus:outline-none">
          <D.Title className="sr-only">Command palette</D.Title>
          <D.Description className="sr-only">Search or run a command</D.Description>
          <Command loop shouldFilter={true} label="Command palette">
            <div className="flex items-center gap-2 border-b border-border px-3.5">
              <Search className="size-4 text-fg-subtle" aria-hidden />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search everything or type a command…"
                className="h-12 flex-1 bg-transparent text-[14px] text-fg placeholder:text-fg-subtle focus:outline-none"
              />
              {loading ? <span className="text-[11px] text-fg-subtle">Searching…</span> : <Kbd>esc</Kbd>}
            </div>
            <Command.List className="max-h-[min(60vh,440px)] overflow-y-auto p-1">
              <Command.Empty className="px-3 py-8 text-center text-[13px] text-fg-muted">No results. Press ⌘J to capture “{query}” instead.</Command.Empty>

              {visibleHits.length > 0 ? (
                <Command.Group heading="Results" className={GROUP}>
                  {visibleHits.map((h) => (
                    <Command.Item
                      key={`${h.entityType}:${h.entityId}`}
                      value={`result ${h.ref ?? ""} ${h.title} ${query}`}
                      onSelect={() => go(h.urlPath)}
                      className="flex h-9 cursor-default select-none items-center gap-2.5 rounded-md px-2.5 text-[13px] text-fg data-[selected=true]:bg-bg-muted"
                    >
                      <span className="w-16 shrink-0 text-[11px] text-fg-subtle">{ENTITY_LABEL[h.entityType]}</span>
                      <span className="flex-1 truncate">{h.title}</span>
                      {h.ref ? <Ref>{h.ref}</Ref> : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              <Command.Group heading="Create" className={GROUP}>
                <Item icon={Plus} shortcut="⌘J" onSelect={() => { close(); openCapture(query); }}>Quick capture</Item>
                <Item icon={CheckSquare} onSelect={() => { close(); setOpen("task"); }}>Create task</Item>
                <Item icon={Timer} onSelect={() => { close(); setOpen("session"); }}>Log session</Item>
                <Item
                  icon={FileText}
                  onSelect={async () => {
                    close();
                    const r = await quickNoteAction(query.trim() || "Untitled note");
                    if (r.ok && r.data) router.push(`/notes/${r.data.ref}?edit=1`);
                    else if (!r.ok) toast.error(r.error);
                  }}
                >
                  Add note
                </Item>
                <Item icon={Lightbulb} onSelect={() => { close(); openCapture(`Idea: ${query}`); }}>Capture idea</Item>
                <Item icon={Compass} onSelect={() => go("/goals?new=1")}>Create goal</Item>
                <Item icon={FolderKanban} onSelect={() => go("/projects?new=1")}>Create project</Item>
              </Command.Group>

              <Command.Group heading="Go to" className={GROUP}>
                {NAV.flatMap((g) => g.items).map((item) => (
                  <Item key={item.href} icon={item.icon} value={`go ${item.label}`} onSelect={() => go(item.href)}>
                    {item.label}
                  </Item>
                ))}
              </Command.Group>

              <Command.Group heading="Appearance" className={GROUP}>
                <Item icon={Sun} value="theme light" onSelect={() => theme("light")}>Light theme</Item>
                <Item icon={Moon} value="theme dark" onSelect={() => theme("dark")}>Dark theme</Item>
                <Item icon={Laptop} value="theme system" onSelect={() => theme("system")}>System theme</Item>
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
