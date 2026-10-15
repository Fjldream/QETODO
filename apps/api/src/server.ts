import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { migrateDatabase } from './db/migrate.js';
import { PushSender } from './features/notifications/push.sender.js';
import { NotificationScheduler } from './features/notifications/scheduler.js';

const config = loadConfig();
const database = createDatabase(config.DATABASE_PATH);
migrateDatabase(database);

const app = buildApp({
  database,
  appOrigin: config.APP_ORIGIN,
  uploadDir: config.UPLOAD_DIR,
  vapidPublicKey: config.VAPID_PUBLIC_KEY,
  sessionTtlMs: config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1_000,
});

const scheduler = config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY
  ? new NotificationScheduler(
      database,
      new PushSender(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY),
      config.APP_TIMEZONE,
    )
  : null;
const schedulerTimer = scheduler
  ? setInterval(() => void scheduler.tick(new Date()).catch((error: unknown) => app.log.error(error)), 30_000)
  : null;

const close = async () => {
  if (schedulerTimer) clearInterval(schedulerTimer);
  await app.close();
  database.close();
};

process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());

await app.listen({ host: config.HOST, port: config.PORT });
