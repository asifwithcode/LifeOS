"use client";

import { Plus, Timer, CheckSquare } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useShell } from "@/components/app/providers";

export function LogSessionButton(props: Omit<ButtonProps, "onClick">) {
  const { setOpen } = useShell();
  return (
    <Button {...props} onClick={() => setOpen("session")}>
      <Timer /> Log session
    </Button>
  );
}

export function NewTaskButton(props: Omit<ButtonProps, "onClick">) {
  const { setOpen } = useShell();
  return (
    <Button {...props} onClick={() => setOpen("task")}>
      <CheckSquare /> New task
    </Button>
  );
}

export function CaptureButton({ initial, label = "Capture", ...props }: Omit<ButtonProps, "onClick"> & { initial?: string; label?: string }) {
  const { openCapture } = useShell();
  return (
    <Button {...props} onClick={() => openCapture(initial)}>
      <Plus /> {label}
    </Button>
  );
}
