import { describe, expect, it } from 'vitest';

import { nextOccurrence } from './recurrence.js';

describe('nextOccurrence', () => {
  it('advances daily and weekly rules while preserving the Asia/Shanghai local time', () => {
    const due = new Date('2026-10-15T15:30:00.000Z'); // 23:30 Shanghai
    expect(nextOccurrence({ kind: 'daily', interval: 1 }, due, 'Asia/Shanghai').toISOString()).toBe('2026-10-16T15:30:00.000Z');
    expect(nextOccurrence({ kind: 'weekly', interval: 2 }, due, 'Asia/Shanghai').toISOString()).toBe('2026-10-29T15:30:00.000Z');
  });

  it('clamps month ends and handles leap years', () => {
    expect(nextOccurrence({ kind: 'monthly', interval: 1 }, new Date('2028-01-31T10:00:00.000Z'), 'UTC').toISOString()).toBe('2028-02-29T10:00:00.000Z');
    expect(nextOccurrence({ kind: 'monthly', interval: 1 }, new Date('2027-01-31T10:00:00.000Z'), 'UTC').toISOString()).toBe('2027-02-28T10:00:00.000Z');
  });

  it('rejects a non-repeating rule', () => {
    expect(() => nextOccurrence({ kind: 'none' }, new Date(), 'UTC')).toThrow('重复任务必须设置周期');
  });
});
