import { requireUser } from "@/server/auth/dal";
import { inboxCount } from "@/server/services/inbox";
import { getEntityOptions } from "@/server/services/options";
import { CommandPalette } from "@/components/app/command-palette";
import { GlobalDialogs } from "@/components/app/global-dialogs";
import { MobileTabBar, MobileTopBar } from "@/components/app/mobile-nav";
import { OfflineIndicator } from "@/components/app/offline-indicator";
import { ShellProvider } from "@/components/app/providers";
import { QuickCapture } from "@/components/app/quick-capture";
import { Sidebar } from "@/components/app/sidebar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, actor } = await requireUser();
  const [options, inbox] = await Promise.all([getEntityOptions(actor), inboxCount(user.id)]);
  return (
    <ShellProvider options={options}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-bg-elevated focus:px-3 focus:py-2 focus:shadow-float">
        Skip to content
      </a>
      <div className="flex min-h-dvh">
        <Sidebar user={{ name: user.name, email: user.email }} inboxCount={inbox} />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileTopBar />
          <main id="main" className="flex-1">
            {children}
          </main>
        </div>
      </div>
      <MobileTabBar inboxCount={inbox} />
      <CommandPalette />
      <QuickCapture />
      <GlobalDialogs />
      <OfflineIndicator />
    </ShellProvider>
  );
}
