CREATE TABLE notification_deliveries (
  dedupe_key TEXT NOT NULL,
  subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(dedupe_key, subscription_id)
) STRICT;

CREATE TABLE notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  digest_time TEXT NOT NULL DEFAULT '09:00',
  default_advance_minutes INTEGER NOT NULL DEFAULT 0 CHECK(default_advance_minutes >= 0),
  updated_at INTEGER NOT NULL
) STRICT;
