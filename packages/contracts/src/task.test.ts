import { describe, expect, it } from 'vitest';

import {
  createTaskInputSchema,
  taskDtoSchema,
  taskPrioritySchema,
  taskStatusSchema,
} from './task.js';

const validTask = {
  id: 'd3d9aa36-2f31-4538-a997-f7612c19f904',
  title: '跟进供应商整改报告',
  description: '',
  status: 'pending',
  priority: 'normal',
  dueAt: null,
  reminderTimes: [],
  waitingOn: null,
  followUpAt: null,
  reference: null,
  tagIds: [],
  subtasks: [],
  recurrence: { kind: 'none' },
  attachments: [],
  createdAt: '2026-10-15T02:00:00.000Z',
  updatedAt: '2026-10-15T02:00:00.000Z',
  completedAt: null,
  cancelledAt: null,
  deletedAt: null,
  version: 1,
} as const;

describe('task enums', () => {
  it('accepts exactly the five task statuses', () => {
    expect(taskStatusSchema.options).toEqual([
      'pending',
      'in_progress',
      'waiting',
      'completed',
      'cancelled',
    ]);
  });

  it('accepts exactly the three task priorities', () => {
    expect(taskPrioritySchema.options).toEqual(['normal', 'important', 'urgent']);
  });
});

describe('task validation', () => {
  it('allows the completion note to be omitted', () => {
    expect(taskDtoSchema.parse(validTask)).not.toHaveProperty('completionNote');
  });

  it('rejects a title longer than 200 characters', () => {
    const result = createTaskInputSchema.safeParse({
      title: '质'.repeat(201),
      status: 'pending',
      priority: 'normal',
    });

    expect(result.success).toBe(false);
  });

  it.each([
    { waitingOn: undefined, followUpAt: '2026-10-16T02:00:00.000Z' },
    { waitingOn: '供应商', followUpAt: undefined },
  ])('rejects waiting without both waiting fields: %o', ({ waitingOn, followUpAt }) => {
    const result = createTaskInputSchema.safeParse({
      title: '等待整改回复',
      status: 'waiting',
      priority: 'important',
      waitingOn,
      followUpAt,
    });

    expect(result.success).toBe(false);
  });

  it('accepts waiting when both waiting fields are present', () => {
    const result = createTaskInputSchema.safeParse({
      title: '等待整改回复',
      status: 'waiting',
      priority: 'important',
      waitingOn: '供应商',
      followUpAt: '2026-10-16T02:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('rejects recurrence without a due time', () => {
    const result = createTaskInputSchema.safeParse({
      title: '每月计量校准',
      recurrence: { kind: 'monthly', interval: 1 },
      dueAt: null,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ['dueAt'] })]));
  });
});
