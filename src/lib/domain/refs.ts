import { REF_PREFIX, type EntityType } from "./constants";

export function formatRef(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

const REF_RE = /^([A-Z]{3})-(\d{4,})$/;

export function parseRef(ref: string): { prefix: string; number: number } | null {
  const m = REF_RE.exec(ref.trim().toUpperCase());
  if (!m) return null;
  return { prefix: m[1], number: Number(m[2]) };
}

const PREFIX_TO_TYPE: Record<string, EntityType> = Object.fromEntries(
  Object.entries(REF_PREFIX).map(([type, prefix]) => [prefix, type as EntityType]),
);

export function entityTypeForRef(ref: string): EntityType | null {
  const p = parseRef(ref);
  return p ? (PREFIX_TO_TYPE[p.prefix] ?? null) : null;
}

/** Finds [[REF]] mentions in markdown, e.g. "[[PRJ-0003]]" → ["PRJ-0003"]. */
export function extractRefMentions(markdown: string): string[] {
  const out = new Set<string>();
  for (const m of markdown.matchAll(/\[\[([A-Za-z]{3}-\d{4,})\]\]/g)) out.add(m[1].toUpperCase());
  return [...out];
}
