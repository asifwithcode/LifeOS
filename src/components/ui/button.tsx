import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/ui/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[background,color,border-color,box-shadow,opacity] duration-150 disabled:pointer-events-none disabled:opacity-50 select-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:opacity-90 shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]",
        secondary: "border border-border-strong bg-bg hover:bg-bg-muted text-fg",
        ghost: "text-fg-muted hover:text-fg hover:bg-bg-muted",
        danger: "bg-danger text-white hover:opacity-90",
        "danger-ghost": "text-danger hover:bg-danger-soft",
        link: "text-accent underline-offset-2 hover:underline px-0 h-auto",
      },
      size: {
        sm: "h-7 px-2.5 text-[13px] [&_svg]:size-3.5",
        md: "h-8 px-3 text-[13px] [&_svg]:size-4",
        lg: "h-10 px-4 text-sm [&_svg]:size-4",
        icon: "size-8 [&_svg]:size-4",
        "icon-sm": "size-7 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, disabled, children, type = "button", ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
