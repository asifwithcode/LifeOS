"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Plus, Search } from "lucide-react";
import { Dialog as D } from "radix-ui";
import { useState } from "react";
import { logoutAction } from "@/actions/auth";
import { cn } from "@/lib/ui/cn";
import { MOBILE_TABS, NAV, isActive } from "./nav-config";
import { useShell } from "./providers";

export function MobileTopBar() {
  const { setOpen } = useShell();
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-bg/90 px-4 backdrop-blur lg:hidden">
      <Link href="/" className="text-[15px] font-semibold tracking-tight">
        LifeOS
      </Link>
      <button type="button" onClick={() => setOpen("palette")} className="grid size-9 place-items-center rounded-md text-fg-muted hover:bg-bg-muted" aria-label="Search and commands">
        <Search className="size-[18px]" />
      </button>
    </header>
  );
}

export function MobileTabBar({ inboxCount }: { inboxCount: number }) {
  const path = usePathname();
  const { openCapture } = useShell();
  const [more, setMore] = useState(false);
  const tab = (href: string, label: string, Icon: typeof Plus, active: boolean, badge?: number) => (
    <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]", active ? "text-fg" : "text-fg-subtle")}>
      <Icon className="size-5" aria-hidden />
      {label}
      {badge ? <span className="absolute right-[calc(50%-18px)] top-1 rounded-full bg-accent px-1 text-[9px] leading-3.5 text-accent-fg">{badge}</span> : null}
    </Link>
  );
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Primary">
        {tab(MOBILE_TABS[0].href, MOBILE_TABS[0].label, MOBILE_TABS[0].icon, isActive(MOBILE_TABS[0], path))}
        {tab(MOBILE_TABS[1].href, MOBILE_TABS[1].label, MOBILE_TABS[1].icon, isActive(MOBILE_TABS[1], path))}
        <button type="button" onClick={() => openCapture()} className="flex flex-1 items-center justify-center" aria-label="Quick capture">
          <span className="grid size-10 place-items-center rounded-full bg-accent text-accent-fg shadow-float">
            <Plus className="size-5" />
          </span>
        </button>
        {tab(MOBILE_TABS[2].href, MOBILE_TABS[2].label, MOBILE_TABS[2].icon, isActive(MOBILE_TABS[2], path), inboxCount)}
        <button type="button" onClick={() => setMore(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] text-fg-subtle">
          <Menu className="size-5" aria-hidden />
          More
        </button>
      </nav>
      <D.Root open={more} onOpenChange={setMore}>
        <D.Portal>
          <D.Overlay className="animate-fade-in fixed inset-0 z-40 bg-black/40 lg:hidden" />
          <D.Content className="animate-pop-in fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-bg-elevated px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 lg:hidden">
            <D.Title className="sr-only">Navigation</D.Title>
            <D.Description className="sr-only">All sections</D.Description>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />
            {NAV.map((g) => (
              <div key={g.label} className="mb-3">
                <p className="px-1 pb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">{g.label}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {g.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMore(false)}
                        className={cn("flex flex-col items-center gap-1 rounded-lg border border-border px-2 py-3 text-[11px]", isActive(item, path) ? "bg-bg-muted text-fg" : "text-fg-muted")}
                      >
                        <Icon className="size-[18px]" aria-hidden />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
            <button type="button" onClick={() => void logoutAction()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-[13px] text-fg-muted">
              <LogOut className="size-4" /> Sign out
            </button>
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  );
}
