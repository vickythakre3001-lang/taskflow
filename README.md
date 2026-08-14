# TaskFlow

A lightweight Trello-style task board: one board, a few columns, tasks you can create, edit, move, delete, and filter by priority.

- **Frontend:** React (Vite)
- **Backend:** Node.js — plain `http` module, zero npm dependencies, using Node's built-in `node:sqlite`
- **Database:** SQLite

## Quick start

Requires **Node.js 22.5+** (for the built-in `node:sqlite` module). Check with `node -v`.

```bash
# 1. Backend
cd server
npm install        # no-op — zero dependencies, but keeps the workflow standard
npm run dev         # starts the API on http://localhost:3001
```

The first time it starts, the backend automatically seeds a demo board (since the database is empty on a fresh clone) — you don't need to run the seed script separately. If you ever want to reset back to that demo data, run `npm run seed` while the server is stopped.

```bash
# 2. Frontend (in a second terminal)
cd client
npm install
npm run dev         # starts the app on http://localhost:5173
```

Open **http://localhost:5173**. The Vite dev server proxies `/api/*` requests to the backend on port 3001 (see `client/vite.config.js`), so no CORS setup is needed in dev.

### Running the tests

```bash
cd server
npm test
```

This runs the full backend test suite (21 tests) with Node's built-in test runner — no test framework install required.

### Production-style build

```bash
cd client && npm run build     # outputs client/dist
cd server && npm start         # serves the API only, on PORT (default 3001)
```

`client/dist` is a static folder — deploy it to any static host (or have the Node server serve it) and point it at the deployed API's URL.

## Data model

```
Board (1) ── (many) Column (1) ── (many) Task
```

See [`server/src/schema.sql`](server/src/schema.sql) for the actual `CREATE TABLE` statements. Summary:

- **boards**: `id`, `name`, `created_at`
- **columns**: `id`, `board_id` (FK → boards), `name`, `position`, `created_at`
- **tasks**: `id`, `column_id` (FK → columns), `title` (`NOT NULL`, plus a `CHECK` that it isn't blank/whitespace-only), `description` (nullable), `priority` (`CHECK` in `Low`/`Medium`/`High`), `position`, `created_at`

A task's "status" is simply which column it belongs to (`column_id`) — moving a task between columns is an `UPDATE tasks SET column_id = ...`.

## The two required non-trivial queries

Both live in [`server/src/queries.js`](server/src/queries.js) and are actually used by the API (not just written and left unused):

1. **`getTasksByPriority(boardId, priority)`** — tasks with a given priority, newest first. Joins `tasks` → `columns` to scope by board, filters on `priority`, orders by `created_at DESC`. Powers the priority filter: `GET /api/boards/:id?priority=High` runs this query server-side rather than fetching everything and filtering in JS.

2. **`getTaskCountsPerColumn(boardId)`** — count of tasks per column on a board. `LEFT JOIN` from `columns` to `tasks` with `GROUP BY columns.id`, so empty columns still show a count of 0. Powers the task-count badge in each column header, and is unaffected by the priority filter (it always reflects the true count).

Both are covered directly by tests in `server/tests/queries.test.js` against known seed data (e.g. asserting the exact ordering of the 3 seeded High-priority tasks).

## API

| Method | Path                     | Purpose                                  |
|--------|--------------------------|-------------------------------------------|
| GET    | `/api/boards`            | List boards                               |
| GET    | `/api/boards/:id`        | Board detail with columns + tasks (optional `?priority=High\|Medium\|Low`) |
| POST   | `/api/tasks`              | Create a task (`columnId`, `title`, `description?`, `priority?`) |
| PUT    | `/api/tasks/:id`          | Edit a task's title/description/priority  |
| PATCH  | `/api/tasks/:id/move`     | Move a task to a different column (`columnId`) |
| DELETE | `/api/tasks/:id`          | Delete a task                             |

All error responses are JSON: `{ "error": "message" }`, with appropriate status codes (400 for validation, 404 for missing resources).

## Decisions & assumptions

- **No framework on the backend.** Given the small surface area, I used Node's built-in `http` module and `node:sqlite` instead of Express + a separate SQLite driver. This keeps the project at zero npm dependencies for the server (faster/simpler install, nothing to go out of date) and let me exercise it thoroughly with Node's built-in test runner. The trade-off is it's a little less "idiomatic Node backend" than Express — happy to talk through that choice.
- **Priority filtering happens server-side**, via a real `WHERE` query, rather than fetching all tasks and filtering in the browser — this was called out explicitly as a grading criterion.
- **Title search (stretch goal) is client-side**, since it's just filtering already-loaded data by substring and a round trip isn't needed.
- **Single board.** The schema and API support multiple boards, but the UI just loads the first one, matching "a simple task board for small teams" and the explicit out-of-scope note on multi-user/team features.
- **Move via dropdown, not drag-and-drop** — per the assignment's own guidance that a working dropdown beats a fragile drag-and-drop implementation.
- **Task `position`** is tracked (for stable ordering within a column) but there's no manual reordering UI within a column — new/moved tasks go to the end.
- Deleting a task asks for confirmation via a plain `window.confirm` rather than a custom modal, to keep the UI surface small.

## What I'd improve with more time

- Drag-and-drop for moving tasks (with the dropdown as an accessible fallback)
- Optimistic UI updates instead of refetching the whole board after each mutation
- Manual drag-to-reorder within a column
- Multiple boards with a switcher in the UI
- Deploying it live (Render/Railway) so it's a clickable link rather than clone-and-run

## Time spent

_[Fill in — roughly how long you spent on this.]_

## Something I found interesting

_[Fill in — one thing you looked up, learned, or found genuinely interesting while building this.]_
