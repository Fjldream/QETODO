import { taskDtoSchema, type AttachmentDto, type SubtaskDto, type TaskDto } from '@qetodo/contracts';

export interface TaskRow {
  id: string;
  title: string;
  description: string;
  status: TaskDto['status'];
  priority: TaskDto['priority'];
  dueAt: number | null;
  waitingOn: string | null;
  followUpAt: number | null;
  reference: string | null;
  recurrenceKind: TaskDto['recurrence']['kind'];
  recurrenceInterval: number;
  recurrenceSeriesId: string | null;
  completionNote: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  cancelledAt: number | null;
  deletedAt: number | null;
  version: number;
}

export interface TaskRelations {
  reminderTimes: number[];
  tagIds: string[];
  subtasks: SubtaskDto[];
  attachments: AttachmentDto[];
}

export function mapTaskRow(row: TaskRow, relations: TaskRelations): TaskDto {
  const recurrence =
    row.recurrenceKind === 'none'
      ? { kind: 'none' as const }
      : { kind: row.recurrenceKind, interval: row.recurrenceInterval };

  return taskDtoSchema.parse({
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueAt: toIso(row.dueAt),
    reminderTimes: relations.reminderTimes.map((time) => new Date(time).toISOString()),
    waitingOn: row.waitingOn,
    followUpAt: toIso(row.followUpAt),
    reference: row.reference,
    tagIds: relations.tagIds,
    subtasks: relations.subtasks,
    recurrence,
    recurrenceSeriesId: row.recurrenceSeriesId,
    attachments: relations.attachments,
    ...(row.completionNote === null ? {} : { completionNote: row.completionNote }),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    completedAt: toIso(row.completedAt),
    cancelledAt: toIso(row.cancelledAt),
    deletedAt: toIso(row.deletedAt),
    version: row.version,
  });
}

function toIso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}
