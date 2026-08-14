// Data-access layer. Every hand-written SQL query for the app lives here,
// so the routing layer stays free of SQL and this file is easy to unit test.
'use strict';

const VALID_PRIORITIES = new Set(['Low', 'Medium', 'High']);

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

/** Build the query layer bound to a specific db instance. */
function createQueries(db) {
  // ---- boards / columns -------------------------------------------------

  function getBoard(boardId) {
    const board = db
      .prepare('SELECT id, name, created_at FROM boards WHERE id = ?')
      .get(boardId);
    if (!board) throw new NotFoundError(`Board ${boardId} not found`);
    return board;
  }

  function getColumnsByBoard(boardId) {
    return db
      .prepare(
        `SELECT id, board_id, name, position, created_at
         FROM columns
         WHERE board_id = ?
         ORDER BY position ASC, id ASC`
      )
      .all(boardId);
  }

  function getColumnById(columnId) {
    return db
      .prepare('SELECT id, board_id, name, position FROM columns WHERE id = ?')
      .get(columnId);
  }

  // ---- "get everything" queries (simple, not the two required ones) ----

  function getAllTasksForBoard(boardId) {
    return db
      .prepare(
        `SELECT tasks.id, tasks.column_id, tasks.title, tasks.description,
                tasks.priority, tasks.position, tasks.created_at
         FROM tasks
         JOIN columns ON columns.id = tasks.column_id
         WHERE columns.board_id = ?
         ORDER BY tasks.position ASC, tasks.created_at ASC`
      )
      .all(boardId);
  }

  // ---- required query #1: tasks with a given priority, newest first ----
  // Joins through columns so we only touch tasks belonging to this board.

  function getTasksByPriority(boardId, priority) {
    if (!VALID_PRIORITIES.has(priority)) {
      throw new ValidationError(`Invalid priority "${priority}"`);
    }
    return db
      .prepare(
        `SELECT tasks.id, tasks.column_id, tasks.title, tasks.description,
                tasks.priority, tasks.position, tasks.created_at
         FROM tasks
         JOIN columns ON columns.id = tasks.column_id
         WHERE columns.board_id = ? AND tasks.priority = ?
         ORDER BY tasks.created_at DESC, tasks.id DESC`
      )
      .all(boardId, priority);
  }

  // ---- required query #2: count of tasks per column on a board ---------
  // LEFT JOIN so empty columns show up with a count of 0.

  function getTaskCountsPerColumn(boardId) {
    return db
      .prepare(
        `SELECT columns.id AS column_id, columns.name AS column_name,
                COUNT(tasks.id) AS task_count
         FROM columns
         LEFT JOIN tasks ON tasks.column_id = columns.id
         WHERE columns.board_id = ?
         GROUP BY columns.id
         ORDER BY columns.position ASC, columns.id ASC`
      )
      .all(boardId);
  }

  // ---- task mutations -----------------------------------------------

  function assertValidTitle(title) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      throw new ValidationError('Title is required');
    }
  }

  function assertValidPriority(priority) {
    if (priority !== undefined && !VALID_PRIORITIES.has(priority)) {
      throw new ValidationError(
        `Priority must be one of ${[...VALID_PRIORITIES].join(', ')}`
      );
    }
  }

  function getTaskById(taskId) {
    const task = db
      .prepare(
        `SELECT id, column_id, title, description, priority, position, created_at
         FROM tasks WHERE id = ?`
      )
      .get(taskId);
    if (!task) throw new NotFoundError(`Task ${taskId} not found`);
    return task;
  }

  function createTask({ columnId, title, description, priority }) {
    assertValidTitle(title);
    assertValidPriority(priority);

    const column = getColumnById(columnId);
    if (!column) throw new ValidationError(`Column ${columnId} does not exist`);

    const nextPosition = db
      .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM tasks WHERE column_id = ?')
      .get(columnId).pos;

    const result = db
      .prepare(
        `INSERT INTO tasks (column_id, title, description, priority, position)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        columnId,
        title.trim(),
        description ? description.trim() : null,
        priority || 'Medium',
        nextPosition
      );

    return getTaskById(result.lastInsertRowid);
  }

  function updateTask(taskId, { title, description, priority }) {
    const current = getTaskById(taskId); // throws NotFoundError if missing

    if (title !== undefined) assertValidTitle(title);
    assertValidPriority(priority);

    const nextTitle = title !== undefined ? title.trim() : current.title;
    const nextDescription =
      description !== undefined ? (description ? description.trim() : null) : current.description;
    const nextPriority = priority !== undefined ? priority : current.priority;

    db.prepare('UPDATE tasks SET title = ?, description = ?, priority = ? WHERE id = ?').run(
      nextTitle,
      nextDescription,
      nextPriority,
      taskId
    );

    return getTaskById(taskId);
  }

  function moveTask(taskId, columnId) {
    getTaskById(taskId); // throws if missing
    const column = getColumnById(columnId);
    if (!column) throw new ValidationError(`Column ${columnId} does not exist`);

    const nextPosition = db
      .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM tasks WHERE column_id = ?')
      .get(columnId).pos;

    db.prepare('UPDATE tasks SET column_id = ?, position = ? WHERE id = ?').run(
      columnId,
      nextPosition,
      taskId
    );

    return getTaskById(taskId);
  }

  function deleteTask(taskId) {
    getTaskById(taskId); // throws if missing
    db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
  }

  return {
    getBoard,
    getColumnsByBoard,
    getColumnById,
    getAllTasksForBoard,
    getTasksByPriority,
    getTaskCountsPerColumn,
    getTaskById,
    createTask,
    updateTask,
    moveTask,
    deleteTask,
  };
}

module.exports = { createQueries, NotFoundError, ValidationError, VALID_PRIORITIES };
