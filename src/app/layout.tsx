import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ACCENTS, THEMES } from "@/lib/domain/constants";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LifeOS", template: "%s · LifeOS" },
  description: "Your personal life operating system — goals, targets, routine, tasks, projects, learning and knowledge, connected.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Theme lives in cookies so the server renders the right palette (no flash).
  const store = await cookies();
  const theme = store.get("lifeos_theme")?.value;
  const accent = store.get("lifeos_accent")?.value;
  const themeAttr = theme && (THEMES as readonly string[]).includes(theme) && theme !== "system" ? theme : undefined;
  const accentAttr = accent && (ACCENTS as readonly string[]).includes(accent) ? accent : "indigo";
  return (
    <html lang="en" data-theme={themeAttr} data-accent={accentAttr} className={`${GeistSans.variable} ${GeistMono.variable} h-full`}>
      <body className="min-h-full">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
