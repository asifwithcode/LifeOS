# 06 — Design System

Direction: **calm, premium personal workspace.** Apple-like restraint, Linear-like density
where it helps, Vercel-like cleanliness. Not an admin template.

## Principles

1. **Typography carries hierarchy**, not boxes. Prefer headings + spacing over nested cards.
2. **One accent colour**, used sparingly: primary actions, focus rings, active nav, progress.
3. **Borders over shadows.** 1px hairlines (`--border`). Shadows only on floating layers.
4. **Density by context.** Lists are compact (36–40px rows); dashboards breathe.
5. **Every state is designed:** loading (skeleton), empty (purposeful CTA), error (retry),
   offline (shell indicator).
6. **Motion is feedback, not decoration.** ≤200ms, ease-out, disabled under
   `prefers-reduced-motion`.

## Tokens (CSS variables, `src/app/globals.css`)

| Token              | Light            | Dark             | Use                               |
| ------------------ | ---------------- | ---------------- | --------------------------------- |
| `--bg`             | `#ffffff`        | `#0b0b0c`        | app background                    |
| `--bg-subtle`      | `#fafafa`        | `#111113`        | sidebar, wells                    |
| `--bg-muted`       | `#f4f4f5`        | `#18181b`        | hover, inputs                     |
| `--fg`             | `#0a0a0a`        | `#ededef`        | primary text                      |
| `--fg-muted`       | `#52525b`        | `#a1a1aa`        | secondary text                    |
| `--fg-subtle`      | `#a1a1aa`        | `#63636e`        | tertiary, placeholders            |
| `--border`         | `#e9e9ec`        | `#232327`        | hairlines                         |
| `--border-strong`  | `#d4d4d8`        | `#34343a`        | inputs, focused containers        |
| `--accent`         | per accent       | per accent       | primary, progress, focus          |
| `--accent-fg`      | white            | white/black      | text on accent                    |
| `--success` `--warning` `--danger` | muted greens/ambers/reds | | status only          |

Accent palette (user-selectable): `indigo` (default), `blue`, `violet`, `emerald`, `amber`,
`rose`, `graphite`. Implemented as `data-accent` on `<html>` overriding `--accent`.

Theme: `data-theme="light|dark"` on `<html>`, or no attribute = follow system via
`prefers-color-scheme`. Theme is stored in a cookie and applied server-side → no flash.

## Type scale

Font: Geist Sans (UI), Geist Mono (refs, timestamps, numbers in tables).

| Role        | Size / line-height | Weight |
| ----------- | ------------------ | ------ |
| Display     | 28 / 34            | 600, tracking -0.02em |
| H1 (page)   | 22 / 28            | 600    |
| H2 (section)| 15 / 22            | 600    |
| Body        | 14 / 22            | 400    |
| Small       | 13 / 20            | 400    |
| Caption     | 12 / 16            | 500, uppercase tracking 0.04em for section labels |

Numbers use `tabular-nums`. Refs (`PRJ-0003`) are mono, `--fg-subtle`.

## Spacing & shape

4px base grid. Page padding 24px desktop / 16px mobile. Radius: 6px controls, 10px panels,
full for pills. Max content width 1120px (dashboard), 760px (notes/reading).

## Components (`src/components/ui`)

| Component       | Notes                                                                 |
| --------------- | --------------------------------------------------------------------- |
| Button          | `primary` (accent), `secondary` (bordered), `ghost`, `danger`; sm/md; loading state |
| Input/Textarea/Select | 32–36px, `--bg` with `--border-strong`, accent focus ring         |
| Checkbox / TaskCheck | round check for tasks, animated fill on complete                 |
| Dialog          | Radix; centered, 520px; mobile = bottom sheet styling                 |
| DropdownMenu    | Radix; keyboard navigable                                             |
| Command palette | cmdk; 640px; grouped results; ⌘K                                       |
| Badge / StatusPill | subtle tinted backgrounds, never saturated fills                   |
| ProgressBar     | 4px track; accent fill; optional explanation tooltip/line              |
| ProgressRing    | dashboard headline only                                               |
| Section         | heading + optional action + content; no card chrome by default        |
| Panel           | bordered container for grouped content                                |
| EmptyState      | icon, one-line purpose, primary + secondary action                    |
| Skeleton        | shimmer-free pulse, respects reduced motion                           |
| ErrorState      | message + retry                                                       |
| EntityLink      | ref + title, hover underline, type icon                               |
| PageHeader      | title, description, actions                                           |
| Toast           | sonner, bottom-right, short                                           |

## Layout

```
┌──────────┬──────────────────────────────────────────────┐
│ Sidebar  │  PageHeader                                  │
│ 240px    │  ─────────────────────────────────────────── │
│          │  Content (max-w)                             │
│ groups   │                                              │
│ capture  │                                              │
└──────────┴──────────────────────────────────────────────┘
Mobile: top bar (title, search, capture) + bottom tabs (Today, Tasks, ＋, Inbox, More)
```

## Accessibility

- All interactive elements reachable by keyboard; visible `:focus-visible` ring (2px accent).
- Semantic landmarks (`nav`, `main`, `header`), headings in order, `aria-label` on icon buttons.
- Contrast ≥ 4.5:1 for text; status never conveyed by colour alone (icons/labels).
- Respect `prefers-reduced-motion`; rem-based type scales with browser settings.

## Empty-state copy examples

| Module   | Copy                                                                            |
| -------- | ------------------------------------------------------------------------------- |
| Projects | "Start your first project, or convert an existing idea into one."               |
| Goals    | "Define where you want to go. Goals give your projects and targets a direction."|
| Targets  | "Targets turn goals into measurable daily and weekly amounts."                  |
| Inbox    | "Inbox zero. Capture anything with ⌘J — sort it later."                          |
| Skills   | "Track a skill with a topic roadmap. Progress comes from topics you complete."  |
