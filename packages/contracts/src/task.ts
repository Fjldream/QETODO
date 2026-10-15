import { z } from 'zod';

import { attachmentDtoSchema } from './attachment.js';

export const taskStatusSchema = z.enum([
  'pending',
  'in_progress',
  'waiting',
  'completed',
  'cancelled',
]);

export const taskPrioritySchema = z.enum(['normal', 'important', 'urgent']);

export const recurrenceRuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('daily'), interval: z.number().int().positive().default(1) }),
  z.object({ kind: z.literal('weekly'), interval: z.number().int().positive().default(1) }),
  z.object({ kind: z.literal('monthly'), interval: z.number().int().positive().default(1) }),
]);

export const subtaskDtoSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
  completed: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
});

export const tagDtoSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(50),
  color: z.string().max(30).nullable(),
});

export const activityDtoSchema = z.object({
  id: z.uuid(),
  kind: z.string().min(1).max(100),
  message: z.string().max(2_000).nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  system: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
});

const waitingFields = {
  waitingOn: z.string().trim().min(1).max(200).nullable(),
  followUpAt: z.iso.datetime({ offset: true }).nullable(),
};

function requireWaitingDetails(
  value: {
    status?: string | undefined;
    waitingOn?: string | null | undefined;
    followUpAt?: string | null | undefined;
  },
  context: z.RefinementCtx,
): void {
  if (value.status !== 'waiting') {
    return;
  }

  if (!value.waitingOn) {
    context.addIssue({
      code: 'custom',
      message: '等待他人时必须填写等待对象',
      path: ['waitingOn'],
    });
  }

  if (!value.followUpAt) {
    context.addIssue({
      code: 'custom',
      message: '等待他人时必须填写下次跟进时间',
      path: ['followUpAt'],
    });
  }
}

const taskDtoObjectSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5_000),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  dueAt: z.iso.datetime({ offset: true }).nullable(),
  reminderTimes: z.array(z.iso.datetime({ offset: true })),
  ...waitingFields,
  reference: z.string().trim().max(200).nullable(),
  tagIds: z.array(z.uuid()),
  tags: z.array(tagDtoSchema).default([]),
  subtasks: z.array(subtaskDtoSchema),
  activities: z.array(activityDtoSchema).default([]),
  recurrence: recurrenceRuleSchema,
  recurrenceSeriesId: z.uuid().nullable().optional(),
  attachments: z.array(attachmentDtoSchema).max(6),
  completionNote: z.string().trim().max(2_000).optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
  cancelledAt: z.iso.datetime({ offset: true }).nullable(),
  deletedAt: z.iso.datetime({ offset: true }).nullable(),
  version: z.number().int().positive(),
});

export const taskDtoSchema = taskDtoObjectSchema.superRefine(requireWaitingDetails);

const createTaskInputObjectSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5_000).default(''),
  status: taskStatusSchema.default('pending'),
  priority: taskPrioritySchema.default('normal'),
  dueAt: z.iso.datetime({ offset: true }).nullable().default(null),
  reminderTimes: z.array(z.iso.datetime({ offset: true })).default([]),
  waitingOn: waitingFields.waitingOn.optional().default(null),
  followUpAt: waitingFields.followUpAt.optional().default(null),
  reference: z.string().trim().max(200).nullable().default(null),
  tagIds: z.array(z.uuid()).default([]),
  subtasks: z
    .array(z.object({ title: z.string().trim().min(1).max(200) }))
    .default([]),
  recurrence: recurrenceRuleSchema.default({ kind: 'none' }),
  completionNote: z.string().trim().max(2_000).optional(),
});

export const createTaskInputSchema = createTaskInputObjectSchema.superRefine((value, context) => {
  requireWaitingDetails(value, context);
  if (value.recurrence.kind !== 'none' && !value.dueAt) {
    context.addIssue({ code: 'custom', message: '重复任务必须设置截止时间', path: ['dueAt'] });
  }
});

export const updateTaskInputSchema = createTaskInputObjectSchema
  .partial()
  .extend({
    tagNames: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
    confirmOpenSubtasks: z.boolean().optional(),
  })
  .superRefine(requireWaitingDetails);

export const taskTransitionInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }),
  z.object({
    type: z.literal('complete'),
    completionNote: z.string().trim().max(2_000).optional(),
    confirmOpenSubtasks: z.boolean().default(false),
  }),
  z.object({ type: z.literal('cancel') }),
  z.object({ type: z.literal('restore') }),
  z.object({
    type: z.literal('wait'),
    waitingOn: z.string().trim().min(1).max(200),
    followUpAt: z.iso.datetime({ offset: true }),
  }),
]);

export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type RecurrenceRule = z.infer<typeof recurrenceRuleSchema>;
export type SubtaskDto = z.infer<typeof subtaskDtoSchema>;
export type TagDto = z.infer<typeof tagDtoSchema>;
export type ActivityDto = z.infer<typeof activityDtoSchema>;
export type TaskDto = z.infer<typeof taskDtoSchema>;
export type CreateTaskInput = z.input<typeof createTaskInputSchema>;
export type UpdateTaskInput = z.input<typeof updateTaskInputSchema>;
export type TaskTransitionInput = z.input<typeof taskTransitionInputSchema>;
