import { cn } from "@/lib/ui/cn";

export const AREA_HEX: Record<string, string> = {
  indigo: "#5e6ad2",
  blue: "#2f7cf6",
  violet: "#8b5cf6",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  graphite: "#71717a",
  cyan: "#06b6d4",
  orange: "#f97316",
};

export function AreaDot({ color, className }: { color?: string | null; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: AREA_HEX[color ?? "graphite"] ?? AREA_HEX.graphite }} aria-hidden />;
}
