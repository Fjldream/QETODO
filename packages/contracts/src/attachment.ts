import { z } from 'zod';

export const attachmentDtoSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  fileName: z.string().min(1).max(255),
  mediaType: z.enum(['image/webp', 'image/jpeg', 'image/png']),
  byteSize: z.number().int().positive().max(1_000_000),
  width: z.number().int().positive().max(1920),
  height: z.number().int().positive().max(1920),
  createdAt: z.iso.datetime({ offset: true }),
});

export type AttachmentDto = z.infer<typeof attachmentDtoSchema>;
