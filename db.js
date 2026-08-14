// Thin wrapper around Node's built-in `node:sqlite` module.
// Node ships an experimental synchronous SQLite driver (stable enough for
// this project, and it means zero extra dependencies to install).
'use strict';

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/**
 * Open (and initialize) a SQLite database at the given path.
 * Pass ':memory:' for an ephemeral in-memory database (used by tests).
 */
function createDb(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);

  return db;
}

module.exports = { createDb };
