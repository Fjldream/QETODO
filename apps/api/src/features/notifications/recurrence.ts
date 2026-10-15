import type { RecurrenceRule } from '@qetodo/contracts';

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function nextOccurrence(rule: RecurrenceRule, dueAt: Date, timeZone: string): Date {
  if (rule.kind === 'none') throw new Error('重复任务必须设置周期');
  const current = partsInZone(dueAt, timeZone);
  let next: DateParts;
  if (rule.kind === 'monthly') {
    const monthIndex = current.month - 1 + rule.interval;
    const year = current.year + Math.floor(monthIndex / 12);
    const month = ((monthIndex % 12) + 12) % 12 + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    next = { ...current, year, month, day: Math.min(current.day, lastDay) };
  } else {
    const days = rule.kind === 'daily' ? rule.interval : rule.interval * 7;
    const calendar = new Date(Date.UTC(current.year, current.month - 1, current.day + days, current.hour, current.minute, current.second));
    next = utcParts(calendar);
  }
  return zonedPartsToDate(next, timeZone);
}

export function localDateKey(date: Date, timeZone: string): string {
  const parts = partsInZone(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function localTimeKey(date: Date, timeZone: string): string {
  const parts = partsInZone(date, timeZone);
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function partsInZone(date: Date, timeZone: string): DateParts {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(formatted.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') };
}

function utcParts(date: Date): DateParts {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds() };
}

function zonedPartsToDate(parts: DateParts, timeZone: string): Date {
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let result = localAsUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const observed = partsInZone(new Date(result), timeZone);
    const observedAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second);
    result += localAsUtc - observedAsUtc;
  }
  return new Date(result);
}
