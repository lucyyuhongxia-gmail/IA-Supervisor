export type MilestoneDueState =
  | "no_due_date"
  | "overdue"
  | "due_today"
  | "due_soon"
  | "upcoming";

const millisecondsPerDay = 24 * 60 * 60 * 1000;
const dueSoonDayLimit = 7;

export function getMilestoneDueState(
  dueDate: Date | null,
  now = new Date(),
): MilestoneDueState {
  if (!dueDate) {
    return "no_due_date";
  }

  const daysUntilDue = getCalendarDayDifference(dueDate, now);

  if (daysUntilDue < 0) {
    return "overdue";
  }

  if (daysUntilDue === 0) {
    return "due_today";
  }

  if (daysUntilDue <= dueSoonDayLimit) {
    return "due_soon";
  }

  return "upcoming";
}

export function formatMilestoneDueLabel(dueDate: Date | null, now = new Date()) {
  if (!dueDate) {
    return "No due date";
  }

  const absoluteDate = `Due ${dueDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
  const daysUntilDue = getCalendarDayDifference(dueDate, now);

  if (daysUntilDue < 0) {
    return `${absoluteDate} · Overdue by ${pluralizeDays(Math.abs(daysUntilDue))}`;
  }

  if (daysUntilDue === 0) {
    return `${absoluteDate} · Due today`;
  }

  return `${absoluteDate} · Due in ${pluralizeDays(daysUntilDue)}`;
}

export function formatMilestoneDueState(state: MilestoneDueState) {
  switch (state) {
    case "overdue":
      return "Overdue";
    case "due_today":
      return "Due today";
    case "due_soon":
      return "Due soon";
    case "upcoming":
      return "Upcoming";
    case "no_due_date":
    default:
      return "No due date";
  }
}

export function getMilestoneDueTone(state: MilestoneDueState) {
  switch (state) {
    case "overdue":
      return "border-red-200 bg-red-50 text-red-800";
    case "due_today":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "due_soon":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "upcoming":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "no_due_date":
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function getCalendarDayDifference(dueDate: Date, now: Date) {
  const dueDay = new Date(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate(),
  );
  const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return Math.round((dueDay.getTime() - currentDay.getTime()) / millisecondsPerDay);
}

function pluralizeDays(days: number) {
  return `${days} ${days === 1 ? "day" : "days"}`;
}
