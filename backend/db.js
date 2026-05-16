const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'abilitypro.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT    UNIQUE NOT NULL,
    password TEXT    NOT NULL,
    role     TEXT    NOT NULL DEFAULT 'admin',
    created_at TEXT  DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS batches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    total       INTEGER DEFAULT 0,
    signed      INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now')),
    data_json   TEXT
  );

  CREATE TABLE IF NOT EXISTS colaboradores (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id    INTEGER REFERENCES batches(id),
    nome        TEXT NOT NULL,
    cpf         TEXT NOT NULL,
    nr06        INTEGER DEFAULT 0,
    nr10        INTEGER DEFAULT 0,
    direcao     INTEGER DEFAULT 0,
    nr35        INTEGER DEFAULT 0,
    sga_nr20    INTEGER DEFAULT 0,
    nr33        INTEGER DEFAULT 0,
    nr10sep     INTEGER DEFAULT 0,
    token       TEXT UNIQUE,
    status      TEXT DEFAULT 'pending',
    signed_at   TEXT,
    signature_data TEXT,
    ip_address  TEXT,
    pdf_path    TEXT
  );

  CREATE TABLE IF NOT EXISTS logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    action     TEXT,
    details    TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Seed admin if not exists
const bcrypt = require('bcryptjs');
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('Admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('Admin2024!', 10);
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('Admin', hash, 'admin');
  console.log('✅ Admin padrão criado');
}

module.exports = db;
