"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SessionForm } from "@/components/forms/session-form";
import { TaskForm } from "@/components/forms/task-form";
import { useShell } from "./providers";

export function GlobalDialogs() {
  const { open, setOpen, options } = useShell();
  const close = () => setOpen(null);
  return (
    <>
      <Dialog open={open === "task"} onOpenChange={(o) => setOpen(o ? "task" : null)}>
        <DialogContent title="New task" wide>
          <TaskForm options={options} onDone={close} />
        </DialogContent>
      </Dialog>
      <Dialog open={open === "session"} onOpenChange={(o) => setOpen(o ? "session" : null)}>
        <DialogContent title="Log a session" description="Logged once, counted everywhere: targets, skills, projects and your timeline." wide>
          <SessionForm options={options} onDone={close} />
        </DialogContent>
      </Dialog>
    </>
  );
}
