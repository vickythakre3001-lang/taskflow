'use strict';

const path = require('node:path');
const { createDb } = require('./db');
const { createApp } = require('./app');
const { seed } = require('./seed');

const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, '..', 'data', 'taskflow.db');

const db = createDb(DB_PATH);

// If the database is empty (fresh clone), seed it automatically so the
// app isn't blank on first run.
const boardCount = db.prepare('SELECT COUNT(*) AS n FROM boards').get().n;
if (boardCount === 0) {
  seed(db);
  console.log('Database was empty — seeded demo data.');
}

const server = createApp(db);
server.listen(PORT, () => {
  console.log(`TaskFlow API listening on http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
