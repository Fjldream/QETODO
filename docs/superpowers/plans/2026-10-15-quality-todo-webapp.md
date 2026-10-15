# Quality Todo Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a single-user, iPhone-first quality-management todo PWA with secure cloud persistence, offline editing, reminders, traceable activity, compressed image evidence, export, and backup.

**Architecture:** Use a pnpm TypeScript workspace with a React/Vite PWA, a Fastify API, shared Zod contracts, and SQLite. The client writes through an IndexedDB outbox for immediate offline behavior; the server applies idempotent, version-checked mutations and owns recurrence, Web Push scheduling, authenticated attachments, export, and backup.

**Tech Stack:** Node.js 24 LTS, pnpm 10, TypeScript, React, Vite, Fastify, Zod, Drizzle ORM, better-sqlite3, Dexie, Vitest, Testing Library, Playwright WebKit, vite-plugin-pwa, web-push, Nginx, systemd.

**Spec:** `docs/superpowers/specs/2026-10-15-quality-todo-webapp-design.md`

## Global Constraints

- The product has one fixed account and no self-service registration, team roles, assignment, or approval workflow.
- Task statuses are exactly `pending`, `in_progress`, `waiting`, `completed`, and `cancelled`.
- Task priorities are exactly `normal`, `important`, and `urgent`.
- Changing a task to `waiting` requires both `waitingOn` and `followUpAt`.
- Recurrence supports exactly `daily`, `weekly`, and `monthly` in v1; the next occurrence is generated when the current occurrence reaches its due time.
- Each task accepts at most 6 images; each uploaded image is at most 1 MB after client-side compression, with a 1920-pixel longest edge and 75–80% encoding quality.
- Server timestamps are UTC; product-facing dates and reminder scheduling default to `Asia/Shanghai`.
- The app must work from the iPhone Home Screen, preserve edits offline, and resume synchronization without duplicate mutations.
- HTTPS is mandatory; attachments are never exposed from a public static directory.
- No Docker, external analytics, advertising, OCR, third-party AI, team integrations, or non-image attachments in v1.
- Automated backups run daily and keep 14 successful daily backups by default.
- Every implementation task follows test-driven development and ends with an independently reviewable commit.

## Review Focus

1. **UTC date-boundary input:** a due time just before or after midnight in `Asia/Shanghai` must remain on the intended local day; Task 10 adds scheduler boundary tests.
2. **Repeated offline mutation:** replaying the same `operationId` after a timeout must return the original result without duplicating tasks, activities, reminders, or recurrence instances; Tasks 4 and 8 add idempotency tests.
3. **Session expiry while offline:** a `401` during synchronization must leave the full outbox intact and resume only after reauthentication; Task 8 adds this test.
4. **Deceptive or oversized image input:** renamed executables, invalid image bytes, decompression bombs, a seventh attachment, and output over 1 MB must be rejected without losing task text; Task 9 adds these tests.
5. **Incomplete backup input:** a restore archive with a missing attachment, bad checksum, wrong schema version, or partial database must fail before replacing live data; Task 11 adds atomic restore tests.

---

## Planned File Structure

```text
.
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── app.ts                 # Fastify composition root
│   │   │   ├── server.ts              # Process startup and shutdown
│   │   │   ├── config.ts              # Validated environment configuration
│   │   │   ├── db/                    # SQLite connection, schema, migrations
│   │   │   ├── features/auth/          # Password, sessions, CSRF, login routes
│   │   │   ├── features/tasks/         # Task domain, repository, API, search
│   │   │   ├── features/attachments/   # Authenticated image storage
│   │   │   ├── features/notifications/ # Recurrence and Web Push scheduler
│   │   │   ├── features/transfer/      # CSV/JSON export and JSON import
│   │   │   └── lib/                    # Clock, errors, idempotency, security
│   │   ├── migrations/                 # Ordered SQL migrations
│   │   └── scripts/                    # Admin account and backup utilities
│   └── web/
│       ├── src/
│       │   ├── app/                    # Router, providers, application shell
│       │   ├── api/                    # Typed HTTP client
│       │   ├── db/                     # Dexie local database
│       │   ├── sync/                   # Outbox and conflict handling
│       │   ├── features/tasks/         # Today, tasks, calendar, editor, detail
│       │   ├── features/settings/      # Account, notifications, export, backup
│       │   ├── features/attachments/   # Image compression and picker/gallery
│       │   └── styles/                 # iOS-inspired tokens and global rules
│       └── public/                     # Manifest icons and static assets
├── packages/contracts/                 # Shared Zod schemas and DTO types
├── deploy/                             # Nginx, systemd, install/update scripts
├── tests/e2e/                          # Browser-level acceptance tests
└── docs/operations/                    # Installation, recovery, iPhone checks
```

The repository starts with only the approved design document. New source files follow the boundaries above; files are split when they acquire more than one responsibility.

### Task 1: Workspace and Shared Contracts

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `pnpm-lock.yaml`
- Create: `.nvmrc`
- Modify: `.gitignore`
- Create: `.env.example`
- Create: `tsconfig.base.json`
- Create: `eslint.config.js`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/auth.ts`
- Create: `packages/contracts/src/task.ts`
- Create: `packages/contracts/src/sync.ts`
- Create: `packages/contracts/src/attachment.ts`
- Create: `packages/contracts/src/transfer.ts`
- Create: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/task.test.ts`
- Test: `packages/contracts/src/sync.test.ts`

**Interfaces:**
- Consumes: Approved field names and exact enum values from the spec.
- Produces: `TaskDto`, `TaskStatus`, `TaskPriority`, `RecurrenceRule`, `CreateTaskInput`, `UpdateTaskInput`, `MutationEnvelope<T>`, `MutationAck<T>`, `ConflictResponse`, `LoginInput`, `SessionDto`, `AttachmentDto`, `ExportBundle` and their Zod schemas from `@qetodo/contracts`.

- [ ] **Step 1: Create the pnpm workspace and test runner scaffold**

Pin Node to `24` in `.nvmrc`, set `packageManager` to pnpm 10, add root scripts `lint`, `typecheck`, `test`, `build`, and `e2e`, configure TypeScript strict mode and ESLint without adding application code, then run `pnpm install` to create the lockfile.

- [ ] **Step 2: Write failing contract tests**

In `task.test.ts`, assert the five statuses, three priorities, optional completion note, maximum title length of 200, and rejection of `waiting` without both `waitingOn` and `followUpAt`. In `sync.test.ts`, assert that operation IDs are UUIDs, base versions are non-negative integers, and conflict payloads contain both local and server task versions.

- [ ] **Step 3: Run the contract tests and verify failure**

Run: `pnpm --filter @qetodo/contracts test`

Expected: FAIL because schemas and exported types do not exist.

- [ ] **Step 4: Implement the shared schemas and inferred TypeScript types**

Export Zod schemas and `z.infer` types from the files listed above. Use ISO-8601 strings for transport timestamps, UUID strings for identifiers, and discriminated unions for recurrence and sync conflicts.

- [ ] **Step 5: Run contract quality checks**

Run: `pnpm --filter @qetodo/contracts test && pnpm --filter @qetodo/contracts typecheck && pnpm lint`

Expected: all tests pass, TypeScript reports no errors, and ESLint exits 0.

- [ ] **Step 6: Commit the workspace foundation**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml .nvmrc .gitignore .env.example tsconfig.base.json eslint.config.js packages/contracts
git commit -m "build: establish TypeScript workspace and contracts"
```

### Task 2: SQLite Schema and Migration Harness

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/config.ts`
- Create: `apps/api/src/db/client.ts`
- Create: `apps/api/src/db/schema.ts`
- Create: `apps/api/src/db/migrate.ts`
- Create: `apps/api/src/db/testDatabase.ts`
- Create: `apps/api/migrations/0001_initial.sql`
- Test: `apps/api/src/db/migrate.test.ts`
- Test: `apps/api/src/db/schema.test.ts`

**Interfaces:**
- Consumes: DTO enum values from `@qetodo/contracts`.
- Produces: `createDatabase(path: string): AppDatabase`, `migrateDatabase(db: AppDatabase): void`, `createTestDatabase(): AppDatabase`, and Drizzle table exports for all entities named in the spec.

- [ ] **Step 1: Add API package dependencies and an isolated SQLite test harness**

Add Fastify, Drizzle ORM, better-sqlite3, Zod, Vitest, and TypeScript dependencies. Configure tests to create a unique temporary database and remove it after each test.

- [ ] **Step 2: Write failing migration and constraint tests**

Assert that migration creates `users`, `sessions`, `tasks`, `subtasks`, `tags`, `task_tags`, `reminders`, `attachments`, `activities`, `push_subscriptions`, and `idempotency_keys`; enables WAL and foreign keys; cascades task-owned rows; and enforces unique `(recurrence_series_id, occurrence_date)` and unique operation IDs.

- [ ] **Step 3: Run database tests and verify failure**

Run: `pnpm --filter @qetodo/api test -- src/db`

Expected: FAIL because the migration and database factory are missing.

- [ ] **Step 4: Implement schema, migration, and connection factories**

`createDatabase` must enable `journal_mode=WAL`, `foreign_keys=ON`, and a busy timeout. `migrateDatabase` must run ordered migrations transactionally. Use integer Unix milliseconds for stored UTC times and integer task versions beginning at 1.

- [ ] **Step 5: Run database tests and type checking**

Run: `pnpm --filter @qetodo/api test -- src/db && pnpm --filter @qetodo/api typecheck`

Expected: all database tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit the persistence foundation**

```bash
git add apps/api/package.json apps/api/tsconfig.json apps/api/src/config.ts apps/api/src/db apps/api/migrations
git commit -m "feat: add SQLite schema and migrations"
```

### Task 3: Single-User Authentication and Request Security

**Files:**
- Create: `apps/api/src/lib/clock.ts`
- Create: `apps/api/src/lib/httpErrors.ts`
- Create: `apps/api/src/lib/security.ts`
- Create: `apps/api/src/features/auth/password.ts`
- Create: `apps/api/src/features/auth/auth.repository.ts`
- Create: `apps/api/src/features/auth/auth.service.ts`
- Create: `apps/api/src/features/auth/auth.routes.ts`
- Create: `apps/api/src/features/auth/auth.guard.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/scripts/set-admin-password.ts`
- Test: `apps/api/src/features/auth/auth.service.test.ts`
- Test: `apps/api/src/features/auth/auth.routes.test.ts`

**Interfaces:**
- Consumes: `LoginInput`, `SessionDto`, `AppDatabase`.
- Produces: `Clock.now(): Date`, `PasswordHasher.hash(password): Promise<string>`, `PasswordHasher.verify(password, hash): Promise<boolean>`, `SessionService.create(userId): Promise<SessionToken>`, `SessionService.authenticate(rawToken): Promise<AuthenticatedUser | null>`, `requireAuth(request)`, and `buildApp(dependencies): FastifyInstance`.

- [ ] **Step 1: Write failing password and session service tests**

Assert independent salts produce different hashes, correct passwords verify, incorrect passwords fail, raw session tokens are never stored, expired/revoked sessions fail, and constant-time token-hash comparison is used.

- [ ] **Step 2: Run service tests and verify failure**

Run: `pnpm --filter @qetodo/api test -- src/features/auth/auth.service.test.ts`

Expected: FAIL because authentication services do not exist.

- [ ] **Step 3: Implement password and session services**

Use Node `crypto.scrypt`, 16-byte random salts, 32-byte derived keys, 32-byte random session tokens, and SHA-256 token hashes in the database. Inject `Clock` for deterministic expiry tests.

- [ ] **Step 4: Write failing route-security tests**

Using Fastify `inject`, assert successful login sets `Secure`, `HttpOnly`, `SameSite=Strict`; bad credentials return a generic `401`; repeated failures receive `429`; mutating routes reject missing CSRF token or wrong `Origin`; logout and “revoke other sessions” invalidate tokens.

- [ ] **Step 5: Implement login, session, logout, CSRF, and rate-limit routes**

Expose `POST /api/auth/login`, `GET /api/auth/session`, `POST /api/auth/logout`, `POST /api/auth/revoke-others`, and `POST /api/auth/password`. Do not expose registration or password-reset email flows.

- [ ] **Step 6: Run authentication checks**

Run: `pnpm --filter @qetodo/api test -- src/features/auth && pnpm --filter @qetodo/api typecheck`

Expected: all authentication and route-security tests pass.

- [ ] **Step 7: Commit authentication**

```bash
git add apps/api/src apps/api/scripts
git commit -m "feat: add secure single-user authentication"
```

### Task 4: Core Task Domain and Versioned API

**Files:**
- Create: `apps/api/src/features/tasks/task.repository.ts`
- Create: `apps/api/src/features/tasks/activity.repository.ts`
- Create: `apps/api/src/features/tasks/task.service.ts`
- Create: `apps/api/src/features/tasks/task.routes.ts`
- Create: `apps/api/src/features/tasks/task.mapper.ts`
- Create: `apps/api/src/lib/idempotency.ts`
- Test: `apps/api/src/features/tasks/task.service.test.ts`
- Test: `apps/api/src/features/tasks/task.routes.test.ts`

**Interfaces:**
- Consumes: `CreateTaskInput`, `UpdateTaskInput`, `MutationEnvelope<T>`, authentication guard, `Clock`, and `AppDatabase`.
- Produces: `TaskRepository`, `ActivityRepository`, `TaskService.create(input, operationId)`, `TaskService.update(id, baseVersion, patch, operationId)`, `TaskService.transition(id, baseVersion, transition, operationId)`, `TaskService.get(id)`, `TaskService.list(query)`, and REST routes under `/api/tasks`.

- [ ] **Step 1: Write failing task service tests**

Assert creation defaults to `pending` and `normal`, versions begin at 1, updates increment versions, waiting validation is enforced, completed/cancelled timestamps are correct, optional completion notes persist, and system activity rows are appended for every state change.

- [ ] **Step 2: Add Review Focus idempotency and conflict tests**

Assert a repeated `operationId` returns the first serialized result without a second task/activity; stale `baseVersion` returns a `VERSION_CONFLICT` containing server state; different operations on the current version succeed.

- [ ] **Step 3: Run task service tests and verify failure**

Run: `pnpm --filter @qetodo/api test -- src/features/tasks/task.service.test.ts`

Expected: FAIL because repositories and task service do not exist.

- [ ] **Step 4: Implement repositories and transactional task service**

All mutations must run task change, version increment, idempotency record, and activity append in one SQLite transaction. Map database rows to `TaskDto` only through `task.mapper.ts`.

- [ ] **Step 5: Write failing route tests**

Assert authentication is required; create, get, list, patch, complete, cancel, and restore return contract-valid DTOs; invalid bodies return structured `400`; absent tasks return `404`; conflicts return `409` and `ConflictResponse`.

- [ ] **Step 6: Implement typed task routes**

Expose `POST /api/tasks`, `GET /api/tasks`, `GET /api/tasks/:id`, `PATCH /api/tasks/:id`, and `POST /api/tasks/:id/transitions`. Validate every request and response with shared schemas.

- [ ] **Step 7: Run core task checks**

Run: `pnpm --filter @qetodo/api test -- src/features/tasks && pnpm --filter @qetodo/api typecheck`

Expected: all core task tests pass.

- [ ] **Step 8: Commit the task vertical slice**

```bash
git add apps/api/src/features/tasks apps/api/src/lib/idempotency.ts apps/api/src/app.ts packages/contracts
git commit -m "feat: add versioned task API"
```

### Task 5: Tags, Subtasks, Search, Timeline, and Trash

**Files:**
- Modify: `packages/contracts/src/task.ts`
- Modify: `apps/api/src/features/tasks/task.repository.ts`
- Modify: `apps/api/src/features/tasks/task.service.ts`
- Modify: `apps/api/src/features/tasks/task.routes.ts`
- Create: `apps/api/src/features/tasks/search.repository.ts`
- Create: `apps/api/src/features/tasks/trash.service.ts`
- Create: `apps/api/migrations/0002_task_search.sql`
- Test: `apps/api/src/features/tasks/task-details.test.ts`
- Test: `apps/api/src/features/tasks/search.test.ts`
- Test: `apps/api/src/features/tasks/trash.test.ts`

**Interfaces:**
- Consumes: `TaskService`, task/version transactions, shared task schemas.
- Produces: `TaskService.setTags`, `TaskService.createSubtask`, `TaskService.updateSubtask`, `TaskService.addManualActivity`, `TaskService.softDelete`, `TaskService.restoreDeleted`, `TaskSearchRepository.search(query)`, and `TrashService.purgeExpired(now)`.

- [ ] **Step 1: Write failing detail-operation tests**

Assert tags are unique case-insensitively, subtasks retain explicit ordering, main-task completion with open subtasks returns a confirmation-required response unless `confirmOpenSubtasks=true`, manual activities append but system activities cannot be edited, and every change increments the task version once.

- [ ] **Step 2: Write failing search and trash tests**

Assert Chinese and ASCII queries match title, description, tags, reference, and waiting person; filters compose across status/priority/tag/date/person; completed/cancelled are excluded from active defaults; soft-deleted tasks disappear from normal lists, restore correctly, and purge only after 30 days.

- [ ] **Step 3: Run extended-domain tests and verify failure**

Run: `pnpm --filter @qetodo/api test -- src/features/tasks/task-details.test.ts src/features/tasks/search.test.ts src/features/tasks/trash.test.ts`

Expected: FAIL because the detail, FTS5, and trash operations are missing.

- [ ] **Step 4: Implement tags, subtasks, activities, search, and trash**

Use an FTS5 external-content index maintained transactionally with task/tag changes. Return ordered subtasks and reverse-chronological activities in `TaskDto` detail responses.

- [ ] **Step 5: Add and test routes for detail operations**

Expose tag replacement, subtask create/update/delete/reorder, manual activity creation, soft delete, trash listing, and restore endpoints. Verify every endpoint uses version checks and operation IDs.

- [ ] **Step 6: Run API regression tests**

Run: `pnpm --filter @qetodo/api test && pnpm --filter @qetodo/api typecheck`

Expected: all API tests through Task 5 pass.

- [ ] **Step 7: Commit extended task management**

```bash
git add packages/contracts apps/api/src/features/tasks apps/api/migrations/0002_task_search.sql
git commit -m "feat: add task details search and recovery"
```

### Task 6: iPhone-First Application Shell

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app/App.tsx`
- Create: `apps/web/src/app/router.tsx`
- Create: `apps/web/src/app/AppShell.tsx`
- Create: `apps/web/src/api/http.ts`
- Create: `apps/web/src/features/auth/LoginPage.tsx`
- Create: `apps/web/src/features/settings/AccountSettings.tsx`
- Create: `apps/web/src/features/tasks/TodayPage.tsx`
- Create: `apps/web/src/features/tasks/TasksPage.tsx`
- Create: `apps/web/src/features/tasks/CalendarPage.tsx`
- Create: `apps/web/src/features/settings/SettingsPage.tsx`
- Create: `apps/web/src/styles/tokens.css`
- Create: `apps/web/src/styles/base.css`
- Test: `apps/web/src/app/AppShell.test.tsx`
- Test: `apps/web/src/features/auth/LoginPage.test.tsx`
- Test: `apps/web/src/features/settings/AccountSettings.test.tsx`

**Interfaces:**
- Consumes: auth and task DTOs from `@qetodo/contracts` and JSON endpoints from Tasks 3–5.
- Produces: `apiClient.request<T>()`, authenticated router, four-tab `AppShell`, `AccountSettings`, and route components for `/today`, `/tasks`, `/calendar`, `/settings`, and `/login`.

- [ ] **Step 1: Scaffold the web package and browser test environment**

Add React, React Router, Lucide React, Vitest, jsdom, Testing Library, and user-event. Configure TypeScript aliases without implementing the screens.

- [ ] **Step 2: Write failing login and shell tests**

Assert unauthenticated users see only login, successful login routes to Today, expired sessions return to login without deleting local data, the four tabs have 44-pixel hit areas and correct accessible names, selected-tab state is announced, and account settings can change password, revoke other sessions, log out, and surface API errors without clearing local task data.

- [ ] **Step 3: Run UI tests and verify failure**

Run: `pnpm --filter @qetodo/web test -- src/app/AppShell.test.tsx src/features/auth/LoginPage.test.tsx`

Expected: FAIL because the shell and authentication UI do not exist.

- [ ] **Step 4: Implement the authenticated shell and iOS visual tokens**

Use system fonts, one blue action color, semantic red/orange status colors, plain grouped lists, a translucent tab bar with a solid reduced-transparency fallback, safe-area insets, dark mode, `prefers-reduced-motion`, `prefers-contrast`, and minimum 16-pixel editable text.

- [ ] **Step 5: Implement API client and login flow**

`apiClient.request<T>(path, options)` must attach CSRF headers to mutations, parse structured API errors, treat `401` distinctly, and never store passwords or session tokens in Web Storage. Wire `AccountSettings` to the password, revoke-session, and logout endpoints from Task 3.

- [ ] **Step 6: Run UI quality checks**

Run: `pnpm --filter @qetodo/web test && pnpm --filter @qetodo/web typecheck && pnpm lint`

Expected: shell and login tests pass with no type or lint errors.

- [ ] **Step 7: Commit the application shell**

```bash
git add apps/web packages/contracts package.json pnpm-lock.yaml
git commit -m "feat: add iPhone-first application shell"
```

### Task 7: Task Screens and Daily Workflow

**Files:**
- Create: `apps/web/src/api/tasks.ts`
- Create: `apps/web/src/features/tasks/taskViewModel.ts`
- Create: `apps/web/src/features/tasks/components/TaskRow.tsx`
- Create: `apps/web/src/features/tasks/components/TaskSection.tsx`
- Create: `apps/web/src/features/tasks/components/TaskEditorSheet.tsx`
- Create: `apps/web/src/features/tasks/components/TaskDetailSheet.tsx`
- Create: `apps/web/src/features/tasks/components/TaskFilters.tsx`
- Create: `apps/web/src/features/tasks/components/TaskCalendar.tsx`
- Modify: `apps/web/src/features/tasks/TodayPage.tsx`
- Modify: `apps/web/src/features/tasks/TasksPage.tsx`
- Modify: `apps/web/src/features/tasks/CalendarPage.tsx`
- Test: `apps/web/src/features/tasks/TodayPage.test.tsx`
- Test: `apps/web/src/features/tasks/TaskEditorSheet.test.tsx`
- Test: `apps/web/src/features/tasks/TaskDetailSheet.test.tsx`

**Interfaces:**
- Consumes: typed API client, task DTOs, task/search endpoints.
- Produces: `groupTasksForToday(tasks, now, timezone): TodayGroups`, `TaskEditorSheet`, `TaskDetailSheet`, reusable task rows, filters, and calendar selection.

- [ ] **Step 1: Write failing Today grouping and sorting tests**

Assert overdue appears first, then today, waiting follow-ups, and future seven days; overdue beats priority; urgent beats important/normal within the same time risk; completed/cancelled/deleted do not enter active groups.

- [ ] **Step 2: Write failing editor and detail interaction tests**

Assert quick creation focuses title, waiting status requires person and follow-up time inline, tags are freely addable, at most 6 image placeholders are accepted, open subtasks trigger completion confirmation, complete/delete show undo, a task row can postpone its due time without opening the full editor, and task detail renders reference, subtasks, attachments, and reverse-chronological activity.

- [ ] **Step 3: Run workflow tests and verify failure**

Run: `pnpm --filter @qetodo/web test -- src/features/tasks`

Expected: FAIL because task view models and components are missing.

- [ ] **Step 4: Implement task view models and API bindings**

Keep grouping/sorting/date-label logic in `taskViewModel.ts`. Keep network calls in `api/tasks.ts`. Do not let pages construct raw API request bodies.

- [ ] **Step 5: Implement Today, Tasks, Calendar, editor, and detail UI**

Match the approved interaction direction: large iOS-style page titles, grouped list rows, top-right add action, bottom sheets for create/detail, visible sync state, compact context text, and no dashboard card grid.

- [ ] **Step 6: Test keyboard, large-text, and reduced-motion behavior**

Add assertions that sheets trap focus and close with Escape, controls retain accessible names, layout classes support large text, and reduced motion replaces sheet translation with a short fade.

- [ ] **Step 7: Run web regression checks**

Run: `pnpm --filter @qetodo/web test && pnpm --filter @qetodo/web typecheck`

Expected: all web tests through Task 7 pass.

- [ ] **Step 8: Commit the complete online task workflow**

```bash
git add apps/web/src
git commit -m "feat: implement daily task workflow"
```

### Task 8: PWA Installation, Local Database, and Offline Sync

**Files:**
- Modify: `apps/web/vite.config.ts`
- Create: `apps/web/public/manifest.webmanifest`
- Create: `apps/web/public/icons/`
- Create: `apps/web/src/db/localDb.ts`
- Create: `apps/web/src/db/taskStore.ts`
- Create: `apps/web/src/sync/outbox.ts`
- Create: `apps/web/src/sync/syncEngine.ts`
- Create: `apps/web/src/sync/conflictResolver.tsx`
- Create: `apps/web/src/sync/SyncStatus.tsx`
- Create: `apps/web/src/app/UpdatePrompt.tsx`
- Test: `apps/web/src/sync/outbox.test.ts`
- Test: `apps/web/src/sync/syncEngine.test.ts`
- Test: `apps/web/src/app/UpdatePrompt.test.tsx`

**Interfaces:**
- Consumes: `MutationEnvelope`, `MutationAck`, `ConflictResponse`, task endpoints, and authenticated shell.
- Produces: `LocalTaskStore`, `OutboxRepository.enqueue/peek/ack/fail`, `SyncEngine.start/stop/flush`, `resolveConflict(choice)`, `useSyncStatus()`, installable manifest, and update prompt.

- [ ] **Step 1: Write failing local-store and outbox tests**

Assert a local mutation updates visible task data before network response, outbox records preserve FIFO order, identical operation IDs are stored once, task deletion is a tombstone until acknowledged, and the app can reconstruct state after reload.

- [ ] **Step 2: Write failing sync tests including Review Focus cases**

Assert network failures retain operations, a repeated acknowledged operation does not duplicate effects, `401` pauses sync without dropping any outbox row, successful reauthentication resumes, `409` opens conflict UI with both versions, and user choice creates a new version-checked operation.

- [ ] **Step 3: Run sync tests and verify failure**

Run: `pnpm --filter @qetodo/web test -- src/sync`

Expected: FAIL because IndexedDB and sync engine are missing.

- [ ] **Step 4: Implement Dexie schema, local task store, and outbox**

Use tables `tasks`, `outbox`, and `metadata`. Keep server DTO shape in `tasks`; keep operation payload, base version, retry count, and last error in `outbox`.

- [ ] **Step 5: Implement synchronization and conflict UI**

The engine flushes one task stream at a time, applies exponential retry with a cap, stops on authentication failure, and never merges conflicting text automatically.

- [ ] **Step 6: Add PWA manifest, app-shell caching, and safe update flow**

Use `vite-plugin-pwa`. Cache hashed static assets only; keep task/API data in IndexedDB rather than Cache Storage. Delay service-worker activation while an editor is dirty or outbox writes are in flight.

- [ ] **Step 7: Run offline and build checks**

Run: `pnpm --filter @qetodo/web test && pnpm --filter @qetodo/web build`

Expected: all sync/update tests pass and the build emits a valid manifest and service worker.

- [ ] **Step 8: Commit offline PWA support**

```bash
git add apps/web
git commit -m "feat: add installable offline synchronization"
```

### Task 9: Compressed and Authenticated Image Attachments

**Files:**
- Modify: `packages/contracts/src/attachment.ts`
- Create: `apps/web/src/features/attachments/imageCompression.ts`
- Create: `apps/web/src/features/attachments/AttachmentPicker.tsx`
- Create: `apps/web/src/features/attachments/AttachmentGallery.tsx`
- Create: `apps/api/src/features/attachments/attachment.repository.ts`
- Create: `apps/api/src/features/attachments/attachment.storage.ts`
- Create: `apps/api/src/features/attachments/attachment.service.ts`
- Create: `apps/api/src/features/attachments/attachment.routes.ts`
- Test: `apps/web/src/features/attachments/imageCompression.test.ts`
- Test: `apps/api/src/features/attachments/attachment.service.test.ts`
- Test: `apps/api/src/features/attachments/attachment.routes.test.ts`

**Interfaces:**
- Consumes: task authorization/versioning, `AttachmentDto`, local outbox, configured private upload directory.
- Produces: `compressImage(file, options): Promise<CompressedImage>`, `AttachmentStorage.save/read/delete`, `AttachmentService.attach/delete/list`, and authenticated `/api/tasks/:id/attachments` routes.

- [ ] **Step 1: Write failing compression tests**

Test `calculateDimensions(width, height, 1920)`, WebP selection with JPEG fallback, preservation of orientation, rejection of non-images, target quality range, and refusal to enqueue output over 1 MB.

- [ ] **Step 2: Write failing server validation tests including Review Focus cases**

Assert magic bytes rather than extensions decide file type; invalid bytes, oversized multipart bodies, decompression-bomb dimensions, a seventh image, another task’s attachment ID, and unauthenticated reads are rejected; a failed image never rolls back task text.

- [ ] **Step 3: Run attachment tests and verify failure**

Run: `pnpm --filter @qetodo/web test -- src/features/attachments && pnpm --filter @qetodo/api test -- src/features/attachments`

Expected: FAIL because compression and attachment services do not exist.

- [ ] **Step 4: Implement browser compression and attachment UI**

Decode with `createImageBitmap` when available, honor EXIF orientation, draw to canvas at a maximum 1920-pixel edge, encode at 0.78 quality, and retry JPEG if WebP is unavailable. Show original and compressed sizes before upload.

- [ ] **Step 5: Implement private attachment storage and routes**

Generate random storage names, persist original display name only as escaped metadata, verify content with `file-type`, set safe response headers, stream authenticated reads, and delete files only after the database transaction commits.

- [ ] **Step 6: Run attachment and regression checks**

Run: `pnpm --filter @qetodo/web test && pnpm --filter @qetodo/api test && pnpm typecheck`

Expected: all image, API, and existing tests pass.

- [ ] **Step 7: Commit image evidence support**

```bash
git add packages/contracts apps/web/src/features/attachments apps/api/src/features/attachments apps/api/src/app.ts
git commit -m "feat: add compressed private image attachments"
```

### Task 10: Recurrence, Reminders, and Web Push

**Files:**
- Modify: `packages/contracts/src/task.ts`
- Create: `apps/api/src/features/notifications/recurrence.ts`
- Create: `apps/api/src/features/notifications/reminder.repository.ts`
- Create: `apps/api/src/features/notifications/push.repository.ts`
- Create: `apps/api/src/features/notifications/push.sender.ts`
- Create: `apps/api/src/features/notifications/scheduler.ts`
- Create: `apps/api/src/features/notifications/notification.routes.ts`
- Create: `apps/web/src/features/settings/NotificationSettings.tsx`
- Create: `apps/web/src/sw.ts`
- Create: `apps/web/src/features/tasks/components/ReminderEditor.tsx`
- Create: `apps/web/src/features/tasks/components/RecurrenceEditor.tsx`
- Test: `apps/api/src/features/notifications/recurrence.test.ts`
- Test: `apps/api/src/features/notifications/scheduler.test.ts`
- Test: `apps/web/src/features/settings/NotificationSettings.test.tsx`

**Interfaces:**
- Consumes: tasks/reminders tables, `Clock`, task repository, authenticated API, and Web Push subscription API.
- Produces: `nextOccurrence(rule, dueAt, timezone): Date`, `NotificationScheduler.tick(now): Promise<SchedulerResult>`, `PushSender.send(subscription, payload)`, push subscription routes, a service-worker push/click handler, and notification/recurrence editors.

- [ ] **Step 1: Write failing recurrence tests**

Assert daily/weekly/monthly calculations, rejection of recurrence without a due time, month-end clamping, leap-year behavior, `Asia/Shanghai` local-day preservation, and uniqueness of `(seriesId, occurrenceDate)` during repeated ticks.

- [ ] **Step 2: Write failing reminder scheduler tests including Review Focus boundaries**

Assert reminders just before/after local midnight fire on the intended day, advance reminders and due reminders send once, waiting follow-ups use `followUpAt`, overdue digest contains only unfinished overdue titles, payloads exclude notes/reference/images, failed sends retry without duplicate success, and revoked subscriptions are removed.

- [ ] **Step 3: Run scheduler tests and verify failure**

Run: `pnpm --filter @qetodo/api test -- src/features/notifications`

Expected: FAIL because recurrence and notification scheduler do not exist.

- [ ] **Step 4: Implement recurrence and scheduler services**

Poll due rows on a configurable short interval, claim work transactionally, create the next recurrence at current due time, and record sent/failed states with deterministic dedupe keys. Inject `Clock` and `PushSender`.

- [ ] **Step 5: Implement authenticated push-subscription and preference routes**

Expose VAPID public-key retrieval, subscription upsert/delete, notification permission status, digest time, and reminder defaults. Keep private VAPID keys in environment variables.

- [ ] **Step 6: Implement client notification and recurrence controls**

Ask for notification permission only after an explicit user action in the installed PWA. Explain denied/unsupported states and retain in-app overdue indicators. The service worker displays privacy-limited payloads and opens the matching task when the notification is tapped.

- [ ] **Step 7: Run time and notification regression checks**

Run: `TZ=UTC pnpm --filter @qetodo/api test -- src/features/notifications && TZ=Asia/Shanghai pnpm --filter @qetodo/api test -- src/features/notifications && pnpm --filter @qetodo/web test`

Expected: identical logical results in both host time zones and all UI tests pass.

- [ ] **Step 8: Commit recurrence and notifications**

```bash
git add packages/contracts apps/api/src/features/notifications apps/web/src/features/settings apps/web/src/features/tasks/components
git commit -m "feat: add recurrence and secure reminders"
```

### Task 11: Export, Import, Backup, and Atomic Restore

**Files:**
- Modify: `packages/contracts/src/transfer.ts`
- Create: `apps/api/src/features/transfer/export.service.ts`
- Create: `apps/api/src/features/transfer/import.service.ts`
- Create: `apps/api/src/features/transfer/transfer.routes.ts`
- Create: `apps/api/scripts/backup.ts`
- Create: `apps/api/scripts/restore.ts`
- Create: `apps/api/scripts/prune-backups.ts`
- Create: `apps/web/src/features/settings/DataTransfer.tsx`
- Test: `apps/api/src/features/transfer/export.test.ts`
- Test: `apps/api/src/features/transfer/import.test.ts`
- Test: `apps/api/scripts/backup-restore.test.ts`

**Interfaces:**
- Consumes: all database entities, private upload directory, schema version, authenticated settings screen.
- Produces: `ExportService.toCsv()`, `ExportService.toJson()`, `ImportService.validate/apply()`, `createBackup(config)`, `verifyBackup(path)`, `restoreBackup(path, config)`, and `/api/transfer` routes.

- [ ] **Step 1: Write failing CSV and JSON export tests**

Assert CSV begins with a UTF-8 BOM, opens columns for Chinese title/status/dates/tags/waiting person/reference, escapes spreadsheet formulas, and JSON contains schema version plus all task-related entities without password/session secrets.

- [ ] **Step 2: Write failing import and Review Focus restore tests**

Assert JSON is schema-validated before writes; import uses a transaction; duplicate IDs are deterministic; missing attachment, bad SHA-256 checksum, wrong schema version, truncated SQLite snapshot, or invalid manifest aborts before live data changes.

- [ ] **Step 3: Run transfer tests and verify failure**

Run: `pnpm --filter @qetodo/api test -- src/features/transfer scripts/backup-restore.test.ts`

Expected: FAIL because export/import/backup services are missing.

- [ ] **Step 4: Implement exports and transactional JSON import**

CSV is for inspection only. JSON is the supported logical import format and includes task relationships and attachment checksums. Import into a staging database, validate counts and foreign keys, then replace data in one controlled transaction.

- [ ] **Step 5: Implement daily backup, verification, restore, and retention scripts**

Use SQLite’s online backup API for a consistent snapshot, copy attachments, write a SHA-256 manifest, archive to a timestamped directory, verify before marking success, and keep the latest 14 verified backups. Restore into staging paths and atomically swap only after verification.

- [ ] **Step 6: Implement Settings transfer UI**

Provide explicit CSV/JSON export actions, JSON import preview with record counts, recent backup-success timestamp, and a non-dismissible warning when the most recent scheduled backup failed.

- [ ] **Step 7: Run data-safety regression checks**

Run: `pnpm --filter @qetodo/api test -- src/features/transfer scripts/backup-restore.test.ts && pnpm --filter @qetodo/web test && pnpm typecheck`

Expected: all export/import/backup tests pass and corrupted fixtures leave live data unchanged.

- [ ] **Step 8: Commit transfer and backup support**

```bash
git add packages/contracts apps/api/src/features/transfer apps/api/scripts apps/web/src/features/settings
git commit -m "feat: add data export and verified backups"
```

### Task 12: Production Deployment, End-to-End Acceptance, and Operations

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/auth.spec.ts`
- Create: `tests/e2e/task-flow.spec.ts`
- Create: `tests/e2e/offline-sync.spec.ts`
- Create: `tests/e2e/attachments.spec.ts`
- Create: `tests/e2e/accessibility.spec.ts`
- Create: `deploy/nginx/qetodo.conf`
- Create: `deploy/systemd/qetodo.service`
- Create: `deploy/systemd/qetodo-backup.service`
- Create: `deploy/systemd/qetodo-backup.timer`
- Create: `deploy/install.sh`
- Create: `deploy/update.sh`
- Create: `deploy/smoke-test.sh`
- Create: `docs/operations/installation.md`
- Create: `docs/operations/backup-and-recovery.md`
- Create: `docs/operations/iphone-acceptance.md`
- Create: `README.md`

**Interfaces:**
- Consumes: production web build, API server, migration/admin/backup scripts, complete acceptance criteria.
- Produces: reproducible non-Docker installation, systemd-managed service and backup timer, Nginx HTTPS proxy, browser acceptance suite, recovery guide, and physical-iPhone checklist.

- [ ] **Step 1: Write failing browser acceptance tests**

Cover login, task creation/edit/completion/cancellation/restore, waiting-field validation, tag/reference/person search, subtask confirmation, calendar selection, undo, image upload/delete, dark/large-text/reduced-motion modes, and keyboard focus behavior.

- [ ] **Step 2: Add offline and restart acceptance tests**

Use Playwright WebKit to create a task offline, reload, restore network, and assert one server record; expire the session mid-outbox and assert operations remain; restart the API and assert data, scheduler, and sync recover.

- [ ] **Step 3: Run E2E tests and verify failure**

Run: `pnpm build && pnpm e2e`

Expected: FAIL until production serving, fixtures, and deployment configuration are complete.

- [ ] **Step 4: Implement deployment configuration**

`qetodo.service` runs as a dedicated unprivileged user, loads a mode-0600 environment file, restarts on failure, and grants write access only to configured data/upload paths. Nginx terminates HTTPS, serves hashed static assets, applies security headers and upload limits, and proxies `/api` without exposing storage paths.

- [ ] **Step 5: Implement idempotent install, update, smoke-test, and backup timer scripts**

Install validates Node 24, creates directories and permissions, migrates before starting, and never overwrites an existing environment file. Update builds to a staging release and switches only after health checks. Smoke test verifies health, login rejection, manifest, database write, and authenticated attachment denial.

- [ ] **Step 6: Write operating and physical-iPhone procedures**

Document DNS/HTTPS, initial account setup, update/rollback, journal inspection, backup verification, restore drill, Safari “Add to Home Screen,” standalone launch, notification permission, lock-screen delivery, offline use, and attachment capture.

- [ ] **Step 7: Run the complete verification matrix**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e`

Expected: every command exits 0 with no skipped critical suite.

- [ ] **Step 8: Run deployment fixture verification**

Run: `bash deploy/smoke-test.sh http://127.0.0.1:3000`

Expected: reports healthy API, valid PWA manifest, protected attachments, working database, and successful backup verification.

- [ ] **Step 9: Commit the production release foundation**

```bash
git add playwright.config.ts tests deploy docs/operations README.md package.json pnpm-lock.yaml
git commit -m "feat: prepare production deployment and acceptance"
```

## Final Release Gate

- [ ] Review every acceptance item in the design spec against an automated or physical-device test result.
- [ ] Run `git status --short` and confirm only intentionally generated, ignored runtime files exist.
- [ ] Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e` once more from a clean checkout.
- [ ] Restore the latest verified backup into an empty staging directory and compare task, activity, tag, subtask, reminder, and attachment counts.
- [ ] Complete `docs/operations/iphone-acceptance.md` on the target iPhone, including installed-PWA notification delivery.
- [ ] Request a whole-branch code review before deployment.
- [ ] Fix all blocking review findings and rerun the affected suite plus the complete verification matrix.
- [ ] Push the reviewed branch and record the deployed commit SHA in the operations log.
