import {
  addDays,
  differenceInCalendarDays,
  format,
  isWeekend,
  max as maxDate,
  min as minDate,
} from "date-fns";

import type { ISODate } from "@/types/planner";

export function parseISODate(value: ISODate): Date {
  return new Date(`${value}T12:00:00`);
}

export function formatISODate(date: Date): ISODate {
  return format(date, "yyyy-MM-dd");
}

export function todayISO(): ISODate {
  return formatISODate(new Date());
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function compareISODate(a: ISODate, b: ISODate): number {
  return differenceInCalendarDays(parseISODate(a), parseISODate(b));
}

export function minISODate(values: ISODate[]): ISODate {
  return formatISODate(minDate(values.map(parseISODate)));
}

export function maxISODate(values: ISODate[]): ISODate {
  return formatISODate(maxDate(values.map(parseISODate)));
}

export function nextWorkingDay(value: ISODate): ISODate {
  let current = parseISODate(value);

  do {
    current = addDays(current, 1);
  } while (isWeekend(current));

  return formatISODate(current);
}

export function addWorkingDays(value: ISODate, days: number): ISODate {
  if (days === 0) return value;

  let current = parseISODate(value);
  const direction = days > 0 ? 1 : -1;
  let remaining = Math.abs(days);

  while (remaining > 0) {
    current = addDays(current, direction);
    if (!isWeekend(current)) {
      remaining -= 1;
    }
  }

  return formatISODate(current);
}

export function deriveDurationDays(startDate: ISODate, endDate: ISODate): number {
  if (compareISODate(startDate, endDate) > 0) {
    return 1;
  }

  let current = parseISODate(startDate);
  const target = parseISODate(endDate);
  let days = 0;

  while (current <= target) {
    if (!isWeekend(current)) {
      days += 1;
    }
    current = addDays(current, 1);
  }

  return Math.max(days, 1);
}

export function deriveEndDate(startDate: ISODate, durationDays: number): ISODate {
  return addWorkingDays(startDate, Math.max(durationDays, 1) - 1);
}

export function deriveStartDate(endDate: ISODate, durationDays: number): ISODate {
  return addWorkingDays(endDate, -(Math.max(durationDays, 1) - 1));
}

export function ensureWorkingDate(value: ISODate): ISODate {
  const date = parseISODate(value);
  if (!isWeekend(date)) {
    return value;
  }

  return nextWorkingDay(value);
}

export function formatHumanDate(value: ISODate): string {
  return format(parseISODate(value), "dd/MM/yyyy");
}
