/**
 * On board task board — the columns and priorities shared by the portal screen
 * and /api/portal/tasks, so both agree on what a card can be.
 */
export const TASK_STATUSES = ["backlog", "todo", "in_progress", "waiting", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  waiting: "Waiting",
  done: "Done",
};

/** One line under each column heading. */
export const TASK_STATUS_HINT: Record<TaskStatus, string> = {
  backlog: "Ideas and jobs for later",
  todo: "Agreed — next up",
  in_progress: "Being worked on now",
  waiting: "On hold for parts, a contractor or a decision",
  done: "Finished",
};

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low", normal: "Normal", high: "High", urgent: "Urgent",
};

/** Sort weight — urgent first. */
export const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export type TaskChecklistItem = { id: string; text: string; done: boolean };

export type OnboardTask = {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  department: string | null;
  assignee_crew_id: string | null;
  assignee_name: string | null;
  due_date: string | null;
  waiting_on: string | null;
  /** Raised from this inventory item ("Repair or replace…"). */
  inventory_item_id?: string | null;
  labels: string[];
  checklist: TaskChecklistItem[];
  sort_order: number;
  created_by_name: string | null;
  completed_at: string | null;
  completed_by_name: string | null;
  created_at: string;
  updated_at: string;
};

/** Where to drop a card between two neighbours (either may be missing). */
export function sortBetween(before: number | null | undefined, after: number | null | undefined): number {
  if (before == null && after == null) return 0;
  if (before == null) return (after as number) - 1;
  if (after == null) return before + 1;
  return (before + after) / 2;
}

/** A card past its due date that isn't done. */
export function isOverdue(t: Pick<OnboardTask, "due_date" | "status">, today = new Date().toISOString().slice(0, 10)): boolean {
  return !!t.due_date && t.status !== "done" && t.due_date < today;
}
