"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Archive, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { archiveConversationAction, deleteConversationAction, renameConversationAction } from "@/actions/ai";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";

export function ConversationMenu({ id, title, active }: { id: string; title: string; active: boolean }) {
  const [, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Failed");
      else after?.();
    });
  return (
    <Dropdown>
      <DropdownTrigger className="mr-1 grid size-6 shrink-0 place-items-center rounded text-fg-subtle opacity-0 hover:bg-bg-muted group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Actions for ${title}`}>
        <MoreHorizontal className="size-4" />
      </DropdownTrigger>
      <DropdownContent>
        <DropdownItem
          icon={<Pencil />}
          onSelect={() => {
            const t = window.prompt("Rename conversation", title);
            if (t && t.trim()) run(() => renameConversationAction(id, t));
          }}
        >
          Rename
        </DropdownItem>
        <DropdownItem icon={<Archive />} onSelect={() => run(() => archiveConversationAction(id, true), () => active && router.push("/ai"))}>
          Archive
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem
          danger
          icon={<Trash2 />}
          onSelect={() => {
            if (window.confirm("Delete this conversation and its messages? Approved actions and anything they created are kept.")) run(() => deleteConversationAction(id), () => active && router.push("/ai"));
          }}
        >
          Delete
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
