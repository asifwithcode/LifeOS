"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ActionResult } from "@/actions/result";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";

type Act = (id: string, flag: boolean) => Promise<ActionResult<unknown>>;

/** Standard lifecycle menu: edit / archive / restore / move to trash. */
export function EntityMenu({
  id,
  archived,
  deleted,
  onEdit,
  archive,
  remove,
  afterDeleteHref,
  extra,
}: {
  id: string;
  archived?: boolean;
  deleted?: boolean;
  onEdit?: () => void;
  archive?: Act;
  remove?: Act;
  afterDeleteHref?: string;
  extra?: ReactNode;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<ActionResult<unknown>>, msg: string, then?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(msg);
        then?.();
      } else toast.error(r.error);
    });
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button variant="secondary" size="icon" aria-label="More actions" loading={pending}>
          {!pending ? <MoreHorizontal /> : null}
        </Button>
      </DropdownTrigger>
      <DropdownContent>
        {onEdit && !deleted ? (
          <DropdownItem icon={<Pencil />} onSelect={onEdit}>
            Edit
          </DropdownItem>
        ) : null}
        {extra}
        {archive && !deleted ? (
          archived ? (
            <DropdownItem icon={<ArchiveRestore />} onSelect={() => run(() => archive(id, false), "Restored from archive")}>
              Unarchive
            </DropdownItem>
          ) : (
            <DropdownItem icon={<Archive />} onSelect={() => run(() => archive(id, true), "Archived")}>
              Archive
            </DropdownItem>
          )
        ) : null}
        {remove ? (
          <>
            <DropdownSeparator />
            {deleted ? (
              <DropdownItem icon={<RotateCcw />} onSelect={() => run(() => remove(id, false), "Restored")}>
                Restore from trash
              </DropdownItem>
            ) : (
              <DropdownItem
                danger
                icon={<Trash2 />}
                onSelect={() => run(() => remove(id, true), "Moved to trash — restore it from the Trash view", () => afterDeleteHref && router.push(afterDeleteHref))}
              >
                Move to trash
              </DropdownItem>
            )}
          </>
        ) : null}
      </DropdownContent>
    </Dropdown>
  );
}
