"use client";

import { useState, type ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/** A button that opens a dialog whose content receives a `close` callback. */
export function DialogButton({
  label,
  title,
  description,
  children,
  wide,
  defaultOpen,
  ...buttonProps
}: Omit<ButtonProps, "children"> & {
  label: ReactNode;
  title: string;
  description?: ReactNode;
  wide?: boolean;
  defaultOpen?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button {...buttonProps} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <DialogContent title={title} description={description} wide={wide}>
        {open ? children(() => setOpen(false)) : null}
      </DialogContent>
    </Dialog>
  );
}
