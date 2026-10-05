import {
  Activity,
  BookOpen,
  CalendarClock,
  CheckSquare,
  Compass,
  Crosshair,
  FileText,
  FolderKanban,
  Gauge,
  Inbox,
  Lightbulb,
  ListChecks,
  Scale,
  Search,
  Settings,
  Sun,
  Timer,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match?: (path: string) => boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Only implemented modules appear here; planned modules are listed in Settings → Roadmap.
export const NAV: NavGroup[] = [
  {
    label: "Home",
    items: [
      { href: "/", label: "Dashboard", icon: Gauge, match: (p) => p === "/" },
      { href: "/today", label: "Today", icon: Sun },
      { href: "/inbox", label: "Inbox", icon: Inbox },
    ],
  },
  {
    label: "Planning",
    items: [
      { href: "/goals", label: "Goals", icon: Compass },
      { href: "/targets", label: "Targets", icon: Crosshair },
      { href: "/routine", label: "Daily Routine", icon: CalendarClock },
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
    ],
  },
  {
    label: "Learning",
    items: [{ href: "/skills", label: "Skills", icon: BookOpen }],
  },
  {
    label: "Build",
    items: [
      { href: "/ideas", label: "Ideas", icon: Lightbulb },
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/decisions", label: "Decision Log", icon: Scale },
    ],
  },
  {
    label: "Knowledge",
    items: [{ href: "/notes", label: "Notes", icon: FileText }],
  },
  {
    label: "Insights",
    items: [
      { href: "/sessions", label: "Sessions", icon: Timer },
      { href: "/timeline", label: "Timeline", icon: Activity },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/search", label: "Search", icon: Search },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const MOBILE_TABS: NavItem[] = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/inbox", label: "Inbox", icon: Inbox },
];

export function isActive(item: NavItem, path: string) {
  if (item.match) return item.match(path);
  return path === item.href || path.startsWith(`${item.href}/`);
}
