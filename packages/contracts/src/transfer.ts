import { z } from 'zod';

import { taskDtoSchema } from './task.js';

export const exportBundleSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.iso.datetime({ offset: true }),
  tasks: z.array(taskDtoSchema),
  attachmentFiles: z.array(z.object({
    attachmentId: z.uuid(),
    taskId: z.uuid(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    dataBase64: z.string().min(1),
  })).default([]),
});

export type ExportBundle = z.infer<typeof exportBundleSchema>;
