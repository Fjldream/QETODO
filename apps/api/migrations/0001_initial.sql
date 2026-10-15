CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
) STRICT;
CREATE INDEX sessions_user_id_idx ON sessions(user_id);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 5000),
  status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'waiting', 'completed', 'cancelled')),
  priority TEXT NOT NULL CHECK(priority IN ('normal', 'important', 'urgent')),
  due_at INTEGER,
  waiting_on TEXT,
  follow_up_at INTEGER,
  reference TEXT,
  recurrence_kind TEXT NOT NULL DEFAULT 'none' CHECK(recurrence_kind IN ('none', 'daily', 'weekly', 'monthly')),
  recurrence_interval INTEGER NOT NULL DEFAULT 1 CHECK(recurrence_interval >= 1),
  recurrence_series_id TEXT,
  occurrence_date TEXT,
  completion_note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  cancelled_at INTEGER,
  deleted_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  CHECK(status <> 'waiting' OR (length(waiting_on) > 0 AND follow_up_at IS NOT NULL)),
  UNIQUE(recurrence_series_id, occurrence_date)
) STRICT;
CREATE INDEX tasks_user_due_idx ON tasks(user_id, due_at);

CREATE TABLE subtasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
  sort_order INTEGER NOT NULL CHECK(sort_order >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX subtasks_task_id_idx ON subtasks(task_id);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, name)
) STRICT;

CREATE TABLE task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(task_id, tag_id)
) STRICT;

CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  remind_at INTEGER NOT NULL,
  sent_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(task_id, remind_at)
) STRICT;
CREATE INDEX reminders_pending_idx ON reminders(sent_at, remind_at);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  storage_name TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK(media_type IN ('image/webp', 'image/jpeg', 'image/png')),
  byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 1000000),
  width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 1920),
  height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 1920),
  checksum TEXT NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX attachments_task_id_idx ON attachments(task_id);

CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  message TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX activities_task_time_idx ON activities(task_id, created_at DESC);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE idempotency_keys (
  operation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_type TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idempotency_keys_user_created_idx ON idempotency_keys(user_id, created_at);
