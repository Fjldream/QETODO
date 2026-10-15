import type { TaskDto } from '@qetodo/contracts';

export function taskFixture(title: string, patch: Partial<TaskDto> = {}): TaskDto {
  return {
    id: crypto.randomUUID(),
    title,
    description: '',
    status: 'pending',
    priority: 'normal',
    dueAt: null,
    reminderTimes: [],
    waitingOn: null,
    followUpAt: null,
    reference: null,
    tagIds: [],
    tags: [],
    subtasks: [],
    activities: [],
    recurrence: { kind: 'none' },
    recurrenceSeriesId: null,
    attachments: [],
    createdAt: '2026-10-15T02:00:00.000Z',
    updatedAt: '2026-10-15T02:00:00.000Z',
    completedAt: null,
    cancelledAt: null,
    deletedAt: null,
    version: 1,
    ...patch,
  };
}
