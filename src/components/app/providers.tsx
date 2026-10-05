"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { EntityOptions } from "./options";

type DialogKind = "capture" | "palette" | "task" | "session" | null;

interface ShellContextValue {
  options: EntityOptions;
  open: DialogKind;
  setOpen: (k: DialogKind) => void;
  openCapture: (initial?: string) => void;
  captureInitial: string;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside <ShellProvider>");
  return ctx;
}

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** Global dialogs + keyboard shortcuts (⌘K palette, ⌘J / c capture). */
export function ShellProvider({ options, children }: { options: EntityOptions; children: ReactNode }) {
  const [open, setOpen] = useState<DialogKind>(null);
  const [captureInitial, setCaptureInitial] = useState("");

  const openCapture = useCallback((initial = "") => {
    setCaptureInitial(initial);
    setOpen("capture");
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => (o === "palette" ? null : "palette"));
      } else if (mod && e.key.toLowerCase() === "j") {
        e.preventDefault();
        openCapture();
      } else if (!mod && !e.altKey && e.key === "c" && !isTypingTarget(e.target) && open === null) {
        e.preventDefault();
        openCapture();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openCapture]);

  const value = useMemo(() => ({ options, open, setOpen, openCapture, captureInitial }), [options, open, openCapture, captureInitial]);
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}
