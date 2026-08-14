// Minimal HTTP layer built on Node's built-in `http` module.
// Deliberately framework-free: for an API this small it keeps the project
// at zero npm dependencies, and every request/response step is explicit.
'use strict';

const http = require('node:http');
const { createQueries, NotFoundError, ValidationError } = require('./queries');

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      // Basic guard against absurdly large bodies.
      if (raw.length > 1_000_000) {
        reject(new ValidationError('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new ValidationError('Request body must be valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/** Build a request-handling http.Server bound to the given db instance. */
function createApp(db) {
  const queries = createQueries(db);

  const routes = [
    {
      method: 'GET',
      pattern: /^\/api\/boards\/?$/,
      handler: async () => {
        const boards = db.prepare('SELECT id, name, created_at FROM boards ORDER BY id').all();
        return { status: 200, body: boards };
      },
    },
    {
      method: 'GET',
      pattern: /^\/api\/boards\/(\d+)$/,
      handler: async (req, match, url) => {
        const boardId = Number(match[1]);
        const board = queries.getBoard(boardId);
        const columns = queries.getColumnsByBoard(boardId);
        const priority = url.searchParams.get('priority');

        const tasks = priority
          ? queries.getTasksByPriority(boardId, priority)
          : queries.getAllTasksForBoard(boardId);

        const counts = queries.getTaskCountsPerColumn(boardId);
        const countByColumn = Object.fromEntries(
          counts.map((c) => [c.column_id, c.task_count])
        );

        const columnsWithTasks = columns.map((col) => ({
          ...col,
          taskCount: countByColumn[col.id] ?? 0,
          tasks: tasks.filter((t) => t.column_id === col.id),
        }));

        return { status: 200, body: { ...board, columns: columnsWithTasks } };
      },
    },
    {
      method: 'POST',
      pattern: /^\/api\/tasks\/?$/,
      handler: async (req) => {
        const body = await readJsonBody(req);
        const task = queries.createTask({
          columnId: body.columnId,
          title: body.title,
          description: body.description,
          priority: body.priority,
        });
        return { status: 201, body: task };
      },
    },
    {
      method: 'PUT',
      pattern: /^\/api\/tasks\/(\d+)$/,
      handler: async (req, match) => {
        const body = await readJsonBody(req);
        const task = queries.updateTask(Number(match[1]), {
          title: body.title,
          description: body.description,
          priority: body.priority,
        });
        return { status: 200, body: task };
      },
    },
    {
      method: 'PATCH',
      pattern: /^\/api\/tasks\/(\d+)\/move$/,
      handler: async (req, match) => {
        const body = await readJsonBody(req);
        if (body.columnId === undefined) {
          throw new ValidationError('columnId is required');
        }
        const task = queries.moveTask(Number(match[1]), Number(body.columnId));
        return { status: 200, body: task };
      },
    },
    {
      method: 'DELETE',
      pattern: /^\/api\/tasks\/(\d+)$/,
      handler: async (req, match) => {
        queries.deleteTask(Number(match[1]));
        return { status: 204, body: null };
      },
    },
    {
      method: 'GET',
      pattern: /^\/api\/health$/,
      handler: async () => ({ status: 200, body: { ok: true } }),
    },
  ];

  return http.createServer(async (req, res) => {
    // Permissive CORS: this is a local take-home project, not a public API.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const route = routes.find(
      (r) => r.method === req.method && r.pattern.test(url.pathname)
    );

    if (!route) {
      sendJson(res, 404, { error: `No route for ${req.method} ${url.pathname}` });
      return;
    }

    try {
      const match = url.pathname.match(route.pattern);
      const { status, body } = await route.handler(req, match, url);
      if (status === 204) {
        res.writeHead(204);
        res.end();
      } else {
        sendJson(res, status, body);
      }
    } catch (err) {
      if (err instanceof NotFoundError) {
        sendJson(res, 404, { error: err.message });
      } else if (err instanceof ValidationError) {
        sendJson(res, 400, { error: err.message });
      } else if (err.code === 'ERR_SQLITE_ERROR' || /CHECK constraint failed/i.test(err.message || '')) {
        // Belt-and-suspenders: DB-level CHECK constraints (title, priority)
        // also reject bad data even if application validation is bypassed.
        sendJson(res, 400, { error: 'Invalid data' });
      } else {
        console.error('Unexpected error:', err);
        sendJson(res, 500, { error: 'Internal server error' });
      }
    }
  });
}

module.exports = { createApp };
