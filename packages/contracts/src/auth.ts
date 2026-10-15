import { z } from 'zod';

export const loginInputSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(256),
});

export const sessionDtoSchema = z.object({
  userId: z.uuid(),
  username: z.string().min(1).max(100),
  csrfToken: z.string().min(32).max(256),
  expiresAt: z.iso.datetime({ offset: true }),
});

export type LoginInput = z.infer<typeof loginInputSchema>;
export type SessionDto = z.infer<typeof sessionDtoSchema>;
