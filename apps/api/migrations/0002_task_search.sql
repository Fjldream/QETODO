ALTER TABLE tasks ADD COLUMN search_tags TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX tags_user_name_nocase_unique
  ON tags(user_id, name COLLATE NOCASE);

CREATE VIRTUAL TABLE task_search USING fts5(
  title,
  description,
  reference,
  waiting_on,
  search_tags,
  content='tasks',
  content_rowid='rowid',
  tokenize='trigram'
);

CREATE TRIGGER tasks_search_insert AFTER INSERT ON tasks BEGIN
  INSERT INTO task_search(rowid, title, description, reference, waiting_on, search_tags)
  VALUES (new.rowid, new.title, new.description, new.reference, new.waiting_on, new.search_tags);
END;

CREATE TRIGGER tasks_search_delete AFTER DELETE ON tasks BEGIN
  INSERT INTO task_search(task_search, rowid, title, description, reference, waiting_on, search_tags)
  VALUES ('delete', old.rowid, old.title, old.description, old.reference, old.waiting_on, old.search_tags);
END;

CREATE TRIGGER tasks_search_update AFTER UPDATE ON tasks BEGIN
  INSERT INTO task_search(task_search, rowid, title, description, reference, waiting_on, search_tags)
  VALUES ('delete', old.rowid, old.title, old.description, old.reference, old.waiting_on, old.search_tags);
  INSERT INTO task_search(rowid, title, description, reference, waiting_on, search_tags)
  VALUES (new.rowid, new.title, new.description, new.reference, new.waiting_on, new.search_tags);
END;

INSERT INTO task_search(rowid, title, description, reference, waiting_on, search_tags)
SELECT rowid, title, description, reference, waiting_on, search_tags FROM tasks;
