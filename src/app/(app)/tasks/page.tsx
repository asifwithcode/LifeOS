import Link from "next/link";
import { CheckSquare, X } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { todayOf } from "@/server/engines/actor";
import { listTasks, TASK_VIEWS, type TaskView } from "@/server/services/tasks";
import { Page, PageHeader, Tabs } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/states";
import { TaskList } from "@/components/entities/task-row";
import { QuickAddTask } from "@/components/entities/quick-add";
import { NewTaskButton } from "../_components/shell-buttons";

export const metadata = { title: "Tasks" };

const LABELS: Record<TaskView, string> = {
  today: "Today",
  upcoming: "Upcoming",
  overdue: "Overdue",
  someday: "Someday",
  completed: "Completed",
  all: "All open",
  archived: "Archived",
  trash: "Trash",
};

const EMPTY: Record<TaskView, string> = {
  today: "Nothing due today. Add a task, or pull one forward from Upcoming.",
  upcoming: "No dated tasks ahead. Give tasks a due date to plan your week.",
  overdue: "Nothing overdue. Nice.",
  someday: "No undated ideas for later. Capture them here when they come up.",
  completed: "Completed tasks will collect here.",
  all: "No open tasks. Capture anything with ⌘J and sort it later.",
  archived: "Archived tasks are hidden from lists but kept with their history.",
  trash: "Trash is empty.",
};

export default async function TasksPage(props: PageProps<"/tasks">) {
  const { actor } = await requireUser();
  const sp = await props.searchParams;
  const view = (TASK_VIEWS as readonly string[]).includes(String(sp.view)) ? (sp.view as TaskView) : "today";
  const tag = typeof sp.tag === "string" ? sp.tag : undefined;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const today = todayOf(actor);
  const [tasks, todayList, overdue, upcoming] = await Promise.all([
    listTasks(actor, { view, tag, q }),
    listTasks(actor, { view: "today" }),
    listTasks(actor, { view: "overdue" }),
    listTasks(actor, { view: "upcoming" }),
  ]);
  const counts: Partial<Record<TaskView, number>> = { today: todayList.length, overdue: overdue.length, upcoming: upcoming.length };
  const qs = (v: TaskView) => `/tasks?view=${v}${tag ? `&tag=${encodeURIComponent(tag)}` : ""}`;

  return (
    <Page>
      <PageHeader title="Tasks" description="Everything you need to do, linked to the projects, goals and skills it moves forward." actions={<NewTaskButton variant="primary" />} />
      <Tabs current={view} items={TASK_VIEWS.map((v) => ({ key: v, label: LABELS[v], href: qs(v), count: counts[v] }))} />
      {tag ? (
        <div className="mb-3 flex items-center gap-2 text-[13px] text-fg-muted">
          Filtered by <span className="rounded bg-bg-muted px-1.5 py-0.5 text-fg">#{tag}</span>
          <Link href={`/tasks?view=${view}`} className="inline-flex items-center gap-1 text-xs hover:text-fg">
            <X className="size-3" /> clear
          </Link>
        </div>
      ) : null}
      {view === "today" || view === "all" || view === "someday" ? (
        <div className="border-b border-border">
          <QuickAddTask extras={view === "today" ? { dueDate: today } : {}} placeholder={view === "today" ? "Add a task for today…" : "Add a task…"} />
        </div>
      ) : null}
      {tasks.length ? (
        <TaskList tasks={tasks} today={today} />
      ) : (
        <EmptyState icon={CheckSquare} title={view === "trash" ? "Trash is empty" : "No tasks here"} description={EMPTY[view]} className="mt-4" />
      )}
    </Page>
  );
}
