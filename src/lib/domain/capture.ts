// Quick-capture classification. Phase 1 uses transparent rules; Phase 2 adds an AI
// classifier that returns the same CaptureSuggestion shape (see docs/05-ai-architecture.md).

import type { InboxDestination, Priority } from "./constants";

export interface CaptureSuggestion {
  type: InboxDestination | "resource";
  title: string;
  projectId?: string | null;
  projectTitle?: string | null;
  tags: string[];
  priority?: Priority;
  dueHint?: "today" | "tomorrow" | null;
  url?: string | null;
  reasons: string[];
  source: "rules" | "ai";
}

export interface ClassifierContext {
  projects: { id: string; title: string }[];
}

export interface CaptureClassifier {
  classify(text: string, ctx: ClassifierContext): CaptureSuggestion | Promise<CaptureSuggestion>;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/i;
const TAG_RE = /(^|\s)#([\p{L}\p{N}_-]{1,40})/gu;
const TASK_VERBS = [
  "try",
  "buy",
  "call",
  "email",
  "fix",
  "finish",
  "complete",
  "review",
  "revise",
  "read",
  "watch",
  "write",
  "send",
  "book",
  "pay",
  "submit",
  "prepare",
  "practice",
  "practise",
  "implement",
  "test",
  "check",
  "update",
  "install",
  "setup",
  "set up",
  "schedule",
  "learn",
  "study",
  "clean",
  "plan",
  "refactor",
  "deploy",
  "order",
  "ask",
  "meet",
  "research",
];
const IDEA_MARKERS = ["idea:", "what if", "app that", "app for", "startup", "business idea", "could build", "would be cool", "imagine"];
const NOTE_MARKERS = ["note:", "til:", "today i learned", "learned that", "remember that", "insight:"];
const GOAL_MARKERS = ["goal:", "i want to become", "by 20", "achieve", "long-term"];
const SKILL_MARKERS = ["skill:", "get better at", "improve my", "master "];

function stripMarkers(text: string): string {
  return text
    .replace(/^(idea|note|task|todo|goal|skill|til|insight)\s*:\s*/i, "")
    .replace(TAG_RE, " ")
    .replace(/!(urgent|high|medium|low)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTags(text: string): string[] {
  const tags = new Set<string>();
  for (const m of text.matchAll(TAG_RE)) tags.add(m[2].toLowerCase());
  return [...tags];
}

function titleFrom(text: string, url: string | null): string {
  const base = stripMarkers(url ? text.replace(url, " ") : text).trim();
  const first = base.split(/\n|(?<=[.!?])\s/)[0]?.trim() ?? "";
  const t = first || url || text.trim();
  return t.length > 120 ? `${t.slice(0, 117).trimEnd()}…` : t;
}

export function classifyByRules(raw: string, ctx: ClassifierContext): CaptureSuggestion {
  const text = raw.trim();
  const lower = text.toLowerCase();
  const reasons: string[] = [];
  const tags = extractTags(text);
  const urlMatch = text.match(URL_RE);
  const url = urlMatch ? urlMatch[0] : null;

  let priority: Priority | undefined;
  const pm = lower.match(/!(urgent|high|medium|low)\b/);
  if (pm) {
    priority = pm[1] as Priority;
    reasons.push(`Priority marker !${pm[1]}`);
  } else if (/\burgent\b|\basap\b/.test(lower)) {
    priority = "high";
    reasons.push("Mentions urgency");
  }

  let dueHint: CaptureSuggestion["dueHint"] = null;
  if (/\btoday\b|\btonight\b/.test(lower)) dueHint = "today";
  else if (/\btomorrow\b/.test(lower)) dueHint = "tomorrow";

  // Project mention: longest project title found as a whole word.
  let project: { id: string; title: string } | null = null;
  for (const p of [...ctx.projects].sort((a, b) => b.title.length - a.title.length)) {
    const escaped = p.title.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (p.title.length >= 2 && new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "u").test(lower)) {
      project = p;
      reasons.push(`Mentions project "${p.title}"`);
      break;
    }
    if (tags.includes(p.title.toLowerCase())) {
      project = p;
      reasons.push(`Tagged with project "${p.title}"`);
      break;
    }
  }

  let type: CaptureSuggestion["type"];
  const firstWord = stripMarkers(lower).split(/\s+/).slice(0, 2).join(" ");
  const startsWithVerb = TASK_VERBS.some((v) => firstWord === v || firstWord.startsWith(`${v} `));

  if (/^(task|todo)\s*:/i.test(text)) {
    type = "task";
    reasons.push("Explicit task prefix");
  } else if (/^idea\s*:/i.test(text) || IDEA_MARKERS.some((m) => lower.includes(m))) {
    type = "idea";
    reasons.push("Reads like an idea");
  } else if (/^goal\s*:/i.test(text) || GOAL_MARKERS.some((m) => lower.includes(m))) {
    type = "goal";
    reasons.push("Reads like a long-term goal");
  } else if (/^skill\s*:/i.test(text) || SKILL_MARKERS.some((m) => lower.includes(m))) {
    type = "skill";
    reasons.push("Mentions improving a skill");
  } else if (NOTE_MARKERS.some((m) => lower.includes(m))) {
    type = "note";
    reasons.push("Reads like a note to remember");
  } else if (url && stripMarkers(text.replace(url, "")).length < 40) {
    type = "resource";
    reasons.push("Contains a link");
  } else if (startsWithVerb || /\b(need to|have to|must|should)\b/.test(lower) || dueHint || priority) {
    type = "task";
    reasons.push(startsWithVerb ? "Starts with an action verb" : "Contains an action cue");
  } else if (text.length > 280 || text.includes("\n")) {
    type = "note";
    reasons.push("Longer text");
  } else {
    type = "note";
    reasons.push("No strong signal — defaulting to note");
  }

  if (tags.length) reasons.push(`Tags: ${tags.map((t) => `#${t}`).join(" ")}`);

  return {
    type,
    title: titleFrom(text, url),
    projectId: project?.id ?? null,
    projectTitle: project?.title ?? null,
    tags,
    priority: type === "task" ? (priority ?? "medium") : undefined,
    dueHint: type === "task" ? dueHint : null,
    url,
    reasons,
    source: "rules",
  };
}

export const ruleBasedClassifier: CaptureClassifier = { classify: classifyByRules };
