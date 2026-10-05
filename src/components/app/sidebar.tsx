"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Plus, Search, Settings } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { Kbd } from "@/components/ui/badge";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { cn } from "@/lib/ui/cn";
import { NAV, isActive } from "./nav-config";
import { useShell } from "./providers";

export function Sidebar({ user, inboxCount }: { user: { name: string; email: string }; inboxCount: number }) {
  const path = usePathname();
  const router = useRouter();
  const { setOpen, openCapture } = useShell();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-bg-subtle lg:flex" aria-label="Main navigation">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <Dropdown>
          <DropdownTrigger className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-bg-muted">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-fg text-[11px] font-semibold text-bg">{user.name.slice(0, 1).toUpperCase()}</span>
            <span className="truncate text-[13px] font-medium">{user.name}</span>
          </DropdownTrigger>
          <DropdownContent align="start">
            <div className="px-2 py-1.5 text-xs text-fg-subtle">{user.email}</div>
            <DropdownSeparator />
            <DropdownItem icon={<Settings />} onSelect={() => router.push("/settings")}>
              Settings
            </DropdownItem>
            <DropdownItem icon={<LogOut />} onSelect={() => void logoutAction()}>
              Sign out
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      </div>

      <div className="flex flex-col gap-1 px-3 pb-3">
        <button
          type="button"
          onClick={() => openCapture()}
          className="flex h-8 items-center gap-2 rounded-md border border-border-strong bg-bg px-2.5 text-[13px] text-fg shadow-[0_1px_0_rgb(0_0_0/0.02)] hover:bg-bg-muted"
        >
          <Plus className="size-4 text-fg-muted" aria-hidden />
          <span className="flex-1 text-left">Quick capture</span>
          <Kbd>⌘J</Kbd>
        </button>
        <button type="button" onClick={() => setOpen("palette")} className="flex h-8 items-center gap-2 rounded-md px-2.5 text-[13px] text-fg-muted hover:bg-bg-muted hover:text-fg">
          <Search className="size-4" aria-hidden />
          <span className="flex-1 text-left">Search & commands</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        {NAV.map((group) => (
          <div key={group.label} className="mt-3 first:mt-0">
            <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">{group.label}</p>
            <ul className="flex flex-col gap-px">
              {group.items.map((item) => {
                const active = isActive(item, path);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-7 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
                        active ? "bg-bg-muted font-medium text-fg" : "text-fg-muted hover:bg-bg-muted/70 hover:text-fg",
                      )}
                    >
                      <Icon className={cn("size-4", active ? "text-fg" : "text-fg-subtle")} aria-hidden />
                      <span className="flex-1">{item.label}</span>
                      {item.href === "/inbox" && inboxCount > 0 ? <span className="tabular text-[11px] text-fg-subtle">{inboxCount}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
