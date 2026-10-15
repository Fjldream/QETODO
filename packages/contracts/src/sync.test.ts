import { describe, expect, it } from 'vitest';

import { conflictResponseSchema, mutationEnvelopeSchema } from './sync.js';
import { taskDtoSchema } from './task.js';

const task = {
  id: 'd3d9aa36-2f31-4538-a997-f7612c19f904',
  title: '确认纠正措施',
  description: '',
  status: 'in_progress',
  priority: 'important',
  dueAt: '2026-10-16T02:00:00.000Z',
  reminderTimes: [],
  waitingOn: null,
  followUpAt: null,
  reference: 'CAPA-2026-18',
  tagIds: [],
  subtasks: [],
  recurrence: { kind: 'none' },
  attachments: [],
  createdAt: '2026-10-15T02:00:00.000Z',
  updatedAt: '2026-10-15T02:30:00.000Z',
  completedAt: null,
  cancelledAt: null,
  deletedAt: null,
  version: 2,
} as const;

describe('mutation envelope', () => {
  const schema = mutationEnvelopeSchema(taskDtoSchema);

  it('requires the operation ID to be a UUID', () => {
    const result = schema.safeParse({
      operationId: 'not-a-uuid',
      baseVersion: 1,
      data: task,
    });

    expect(result.success).toBe(false);
  });

  it.each([-1, 1.5])('rejects an invalid base version: %s', (baseVersion) => {
    const result = schema.safeParse({
      operationId: '20c6b6a2-ca9d-4fb6-9961-f2128482f01d',
      baseVersion,
      data: task,
    });

    expect(result.success).toBe(false);
  });
});

describe('conflict response', () => {
  it('requires both local and server task versions', () => {
    const complete = conflictResponseSchema.safeParse({
      code: 'VERSION_CONFLICT',
      operationId: '20c6b6a2-ca9d-4fb6-9961-f2128482f01d',
      local: task,
      server: { ...task, title: '服务器版本', version: 3 },
    });
    const missingLocal = conflictResponseSchema.safeParse({
      code: 'VERSION_CONFLICT',
      operationId: '20c6b6a2-ca9d-4fb6-9961-f2128482f01d',
      server: task,
    });

    expect(complete.success).toBe(true);
    expect(missingLocal.success).toBe(false);
  });
});
