import fs from 'fs';
import path from 'path';
import { ScheduleSlot, loadScheduleConfig } from '../content/slotMapper.js';

export const ASIA_KARACHI_OFFSET_HOURS = 5; // UTC+5, zero DST

/**
 * Returns current date/time components formatted for Asia/Karachi (UTC+5)
 */
export function getKarachiNow(baseDate: Date = new Date()): {
  year: number;
  month: number; // 1-12
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm
  isoKarachi: string; // YYYY-MM-DDTHH:mm:ss+05:00
} {
  const utcTime = baseDate.getTime() + baseDate.getTimezoneOffset() * 60000;
  const karachiTime = new Date(utcTime + 3600000 * ASIA_KARACHI_OFFSET_HOURS);

  const year = karachiTime.getFullYear();
  const month = karachiTime.getMonth() + 1;
  const day = karachiTime.getDate();
  const hours = karachiTime.getHours();
  const minutes = karachiTime.getMinutes();
  const seconds = karachiTime.getSeconds();

  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${year}-${pad(month)}-${pad(day)}`;
  const timeStr = `${pad(hours)}:${pad(minutes)}`;
  const isoKarachi = `${dateStr}T${timeStr}:${pad(seconds)}+05:00`;

  return {
    year,
    month,
    day,
    hours,
    minutes,
    seconds,
    dateStr,
    timeStr,
    isoKarachi
  };
}

/**
 * Parses an ISO-8601 string into timestamp in milliseconds
 */
export function parseScheduledTimestamp(scheduledAt: string): number {
  return new Date(scheduledAt).getTime();
}

/**
 * Checks whether a scheduled post is due for publishing at reference time
 */
export function isPostDue(scheduledAt: string, referenceTime: Date = new Date()): boolean {
  const scheduledTime = parseScheduledTimestamp(scheduledAt);
  const nowTime = referenceTime.getTime();
  // Due if scheduledAt is on or before current time
  return scheduledTime <= nowTime;
}

/**
 * Returns the target date for nightly generation (next day in Asia/Karachi)
 */
export function getNextDayKarachi(baseDate: Date = new Date()): string {
  const now = getKarachiNow(baseDate);
  const tomorrow = new Date(now.year, now.month - 1, now.day + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
}
