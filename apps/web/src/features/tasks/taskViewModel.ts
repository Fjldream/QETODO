import type { TaskDto } from '@qetodo/contracts';

export type TodayGroupKey = 'overdue' | 'today' | 'planned' | 'waiting' | 'upcoming';
export interface TodayGroup {
  key: TodayGroupKey;
  title: string;
  tasks: TaskDto[];
}
export type TodayGroups = TodayGroup[];

const groupTitles: Record<TodayGroupKey, string> = {
  overdue: '已超期',
  today: '今天到期',
  planned: '计划处理',
  waiting: '等待跟进',
  upcoming: '未来 7 天',
};
const priorities = { urgent: 0, important: 1, normal: 2 } as const;

export function groupTasksForToday(
  tasks: TaskDto[],
  now: Date,
  timezone: string,
): TodayGroups {
  const today = dateKey(now, timezone);
  const through = addDays(today, 7);
  const grouped: Record<TodayGroupKey, TaskDto[]> = {
    overdue: [],
    today: [],
    planned: [],
    waiting: [],
    upcoming: [],
  };

  for (const task of tasks) {
    if (
      task.deletedAt ||
      task.status === 'completed' ||
      task.status === 'cancelled'
    ) {
      continue;
    }

    const due = task.dueAt ? dateKey(new Date(task.dueAt), timezone) : null;
    if (due && due < today) grouped.overdue.push(task);
    else if (due === today) grouped.today.push(task);
    else if (task.plannedDate && task.plannedDate <= today) grouped.planned.push(task);
    else if (task.status === 'waiting' && task.followUpAt) grouped.waiting.push(task);
    else if (due && due > today && due <= through) grouped.upcoming.push(task);
  }

  return (Object.keys(grouped) as TodayGroupKey[])
    .map((key) => ({ key, title: groupTitles[key], tasks: grouped[key].sort(key === 'planned' ? comparePlannedTasks : compareTasks) }))
    .filter(({ tasks: items }) => items.length > 0);
}

export function formatTaskDate(value: string | null, timezone = 'Asia/Shanghai'): string {
  if (!value) return '未设置截止时间';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function compareTasks(left: TaskDto, right: TaskDto): number {
  const priority = priorities[left.priority] - priorities[right.priority];
  if (priority !== 0) return priority;
  const leftTime = left.dueAt ?? left.followUpAt ?? '9999';
  const rightTime = right.dueAt ?? right.followUpAt ?? '9999';
  return leftTime.localeCompare(rightTime);
}

export function dateKey(date: Date, timezone = 'Asia/Shanghai'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function isActiveTask(task: TaskDto): boolean {
  return !task.deletedAt && task.status !== 'completed' && task.status !== 'cancelled';
}

export function taskCalendarDates(task: TaskDto): string[] {
  if (!isActiveTask(task)) return [];
  return [...new Set([task.plannedDate, task.dueAt ? dateKey(new Date(task.dueAt)) : null].filter((date): date is string => Boolean(date)))];
}

export function calendarReasons(task: TaskDto, date: string): string {
  return [task.plannedDate === date ? '计划处理' : '', task.dueAt && dateKey(new Date(task.dueAt)) === date ? '到期' : ''].filter(Boolean).join(' · ');
}

export function formatPlannedDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${Number(month)}月${Number(day)}日`;
}

function comparePlannedTasks(left: TaskDto, right: TaskDto): number {
  return priorities[left.priority] - priorities[right.priority]
    || (left.plannedDate ?? '').localeCompare(right.plannedDate ?? '')
    || compareTasks(left, right);
}

function addDays(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return date.toISOString().slice(0, 10);
}

export function latestProgress(task: TaskDto) {
  return [...task.activities].filter(item => item.kind === 'manual' && item.message).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
