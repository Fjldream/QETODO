import { z } from 'zod';

export const appConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
  APP_ORIGIN: z.url(),
  APP_TIMEZONE: z.string().default('Asia/Shanghai'),
  DATABASE_PATH: z.string().min(1),
  UPLOAD_DIR: z.string().min(1),
  BACKUP_DIR: z.string().min(1),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return appConfigSchema.parse(environment);
}
