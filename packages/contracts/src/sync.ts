import { z } from 'zod';

import { taskDtoSchema } from './task.js';

export function mutationEnvelopeSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    operationId: z.uuid(),
    baseVersion: z.number().int().nonnegative().nullable(),
    data: dataSchema,
  });
}

export function mutationAckSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    operationId: z.uuid(),
    data: dataSchema,
  });
}

export const conflictResponseSchema = z.object({
  code: z.literal('VERSION_CONFLICT'),
  operationId: z.uuid(),
  local: taskDtoSchema,
  server: taskDtoSchema,
});

export type MutationEnvelope<T> = {
  operationId: string;
  baseVersion: number | null;
  data: T;
};

export type MutationAck<T> = {
  operationId: string;
  data: T;
};

export type ConflictResponse = z.infer<typeof conflictResponseSchema>;
