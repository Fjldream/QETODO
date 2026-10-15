import { z } from 'zod';

import { taskDtoSchema } from './task.js';

export const exportBundleSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.iso.datetime({ offset: true }),
  tasks: z.array(taskDtoSchema),
});

export type ExportBundle = z.infer<typeof exportBundleSchema>;
