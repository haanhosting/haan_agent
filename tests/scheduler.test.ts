import { describe, it, expect } from 'vitest';
import {
  getKarachiNow,
  isPostDue,
  getNextDayKarachi,
  ASIA_KARACHI_OFFSET_HOURS
} from '../src/schedule/scheduler.js';

describe('Scheduler - Timezone & Slots (Asia/Karachi UTC+5)', () => {
  it('correctly offsets UTC time by +5 hours without daylight savings', () => {
    // 2026-11-18 04:30:00 UTC -> 09:30:00 PKT
    const testUtc = new Date('2026-11-18T04:30:00Z');
    const karachi = getKarachiNow(testUtc);

    expect(karachi.dateStr).toBe('2026-11-18');
    expect(karachi.timeStr).toBe('09:30');
    expect(karachi.isoKarachi).toBe('2026-11-18T09:30:00+05:00');
  });

  it('correctly handles day-rollover in PKT vs UTC', () => {
    // 2026-11-17 21:00:00 UTC -> 2026-11-18 02:00:00 PKT
    const testUtc = new Date('2026-11-17T21:00:00Z');
    const karachi = getKarachiNow(testUtc);

    expect(karachi.dateStr).toBe('2026-11-18');
    expect(karachi.timeStr).toBe('02:00');
  });

  it('identifies when a scheduled post is due', () => {
    const scheduledAt = '2026-11-18T09:30:00+05:00';

    // Before due time
    const beforeTime = new Date('2026-11-18T04:00:00Z'); // 09:00 PKT
    expect(isPostDue(scheduledAt, beforeTime)).toBe(false);

    // Exactly at due time
    const exactTime = new Date('2026-11-18T04:30:00Z'); // 09:30 PKT
    expect(isPostDue(scheduledAt, exactTime)).toBe(true);

    // After due time
    const afterTime = new Date('2026-11-18T05:00:00Z'); // 10:00 PKT
    expect(isPostDue(scheduledAt, afterTime)).toBe(true);
  });

  it('calculates next day date in Asia/Karachi for nightly generation', () => {
    const testUtc = new Date('2026-11-17T19:30:00Z'); // 2026-11-18 00:30 PKT
    const nextDay = getNextDayKarachi(testUtc);
    expect(nextDay).toBe('2026-11-19');
  });
});
