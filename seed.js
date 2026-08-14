// Populates a fresh database with one demo board so the app isn't empty
// on first run. Safe to re-run: it wipes existing rows first.
'use strict';

const path = require('node:path');
const { createDb } = require('./db');

const DB_PATH = path.join(__dirname, '..', 'data', 'taskflow.db');

function seed(db) {
  db.exec('DELETE FROM tasks; DELETE FROM columns; DELETE FROM boards;');
  // Reset autoincrement counters so ids are predictable across re-seeds.
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('tasks', 'columns', 'boards');");

  const insertBoard = db.prepare('INSERT INTO boards (name) VALUES (?)');
  const boardId = insertBoard.run('Product Launch').lastInsertRowid;

  const insertColumn = db.prepare(
    'INSERT INTO columns (board_id, name, position) VALUES (?, ?, ?)'
  );
  const todoId = insertColumn.run(boardId, 'To Do', 0).lastInsertRowid;
  const inProgressId = insertColumn.run(boardId, 'In Progress', 1).lastInsertRowid;
  const doneId = insertColumn.run(boardId, 'Done', 2).lastInsertRowid;

  // Insert with explicit created_at timestamps (staggered) so ordering by
  // date is meaningful when you reload the seeded data.
  const insertTask = db.prepare(
    `INSERT INTO tasks (column_id, title, description, priority, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const tasks = [
    [todoId, 'Write launch announcement blog post', 'Draft the main post for the company blog.', 'High', 0, '2026-08-01 09:00:00'],
    [todoId, 'Line up beta customer quotes', 'Reach out to 3-4 beta users for testimonials.', 'Medium', 1, '2026-08-02 10:15:00'],
    [todoId, 'Update pricing page copy', null, 'Low', 2, '2026-08-03 11:30:00'],
    [inProgressId, 'Build onboarding email sequence', 'Three emails: welcome, tips, check-in.', 'High', 0, '2026-08-04 13:00:00'],
    [inProgressId, 'QA the signup flow', 'Test on Chrome, Firefox, and Safari.', 'High', 1, '2026-08-05 08:45:00'],
    [inProgressId, 'Prepare social media assets', 'Twitter/X and LinkedIn banner images.', 'Medium', 2, '2026-08-06 16:20:00'],
    [doneId, 'Finalize launch date', 'Confirmed for August 20th with the team.', 'Medium', 0, '2026-08-07 09:10:00'],
    [doneId, 'Set up analytics dashboard', 'Tracking signups, activation, and churn.', 'Low', 1, '2026-08-07 14:00:00'],
  ];

  for (const [columnId, title, description, priority, position, createdAt] of tasks) {
    insertTask.run(columnId, title, description, priority, position, createdAt);
  }

  return boardId;
}

if (require.main === module) {
  const db = createDb(DB_PATH);
  const boardId = seed(db);
  console.log(`Seeded database at ${DB_PATH} (board id ${boardId}).`);
  db.close();
}

module.exports = { seed };
