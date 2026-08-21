import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';
import { seedFoods } from './seedFoods.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Allow override via env (cloud hosts with persistent volumes). Default to local ./data.
const dataDir = process.env.DATA_DIR
  ? process.env.DATA_DIR
  : join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });
const dbPath = join(dataDir, 'macrosnap.db');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL DEFAULT '',
  pass_hash  TEXT NOT NULL,
  is_premium INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  endpoint   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_log(user_id, created_at);

CREATE TABLE IF NOT EXISTS settings (
  user_id  INTEGER NOT NULL DEFAULT 0,
  key      TEXT NOT NULL,
  value    TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS foods (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  portion    TEXT NOT NULL,
  calories   INTEGER NOT NULL,
  protein_g  REAL NOT NULL,
  carbs_g    REAL NOT NULL,
  fat_g      REAL NOT NULL,
  fiber_g    REAL NOT NULL DEFAULT 0,
  category   TEXT NOT NULL DEFAULT 'other'
);

CREATE TABLE IF NOT EXISTS meals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL DEFAULT 0,
  date        TEXT NOT NULL,
  meal_type   TEXT NOT NULL,
  photo_thumb TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_id       INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  portion       TEXT NOT NULL,
  multiplier    REAL NOT NULL DEFAULT 1,
  calories      INTEGER NOT NULL,
  protein_g     REAL NOT NULL,
  carbs_g       REAL NOT NULL,
  fat_g         REAL NOT NULL,
  fiber_g       REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS water (
  user_id  INTEGER NOT NULL DEFAULT 0,
  date     TEXT NOT NULL,
  glasses  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS weight_log (
  user_id    INTEGER NOT NULL DEFAULT 0,
  date       TEXT NOT NULL,
  weight_kg  REAL NOT NULL,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id     INTEGER NOT NULL DEFAULT 0,
  name        TEXT NOT NULL,
  portion     TEXT NOT NULL,
  calories    INTEGER NOT NULL,
  protein_g   REAL NOT NULL,
  carbs_g     REAL NOT NULL,
  fat_g       REAL NOT NULL,
  fiber_g     REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(user_id, date);
CREATE INDEX IF NOT EXISTS idx_meal_items_meal ON meal_items(meal_id);
`);

// --- Migration: add user_id columns to existing tables (if upgrading from single-user) ---
const addColumnIfMissing = (table, col, def) => {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
  if (!cols.includes(col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def};`);
    console.log(`[db] migrated: added ${col} to ${table}`);
  }
};
addColumnIfMissing('meals', 'user_id', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('settings', 'user_id', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('water', 'user_id', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('weight_log', 'user_id', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('favorites', 'user_id', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('users', 'is_premium', 'INTEGER NOT NULL DEFAULT 0');

// Default settings (applied per-user on signup)
export const DEFAULT_SETTINGS = {
  calorie_goal: '2000',
  protein_goal: '150',
  carbs_goal: '225',
  fat_goal: '67',
  macro_unit: 'g'
};

// Seed default settings for a new user
export function seedUserSettings(userId) {
  const ins = db.prepare(
    'INSERT INTO settings(user_id,key,value) VALUES(?,?,?) ON CONFLICT DO NOTHING'
  );
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(userId, k, v);
}

// Seed default settings for user 0 (legacy single-user) if none exist
const settingsCount = db.prepare('SELECT COUNT(*) c FROM settings WHERE user_id=0').get().c;
if (settingsCount === 0) seedUserSettings(0);

// Seed foods once (shared across all users)
const foodCount = db.prepare('SELECT COUNT(*) c FROM foods').get().c;
if (foodCount === 0) {
  const ins = db.prepare(
    `INSERT INTO foods(name,portion,calories,protein_g,carbs_g,fat_g,fiber_g,category)
     VALUES(@name,@portion,@calories,@protein_g,@carbs_g,@fat_g,@fiber_g,@category)`
  );
  const tx = db.transaction((rows) => {
    for (const r of rows) ins.run(r);
  });
  tx(seedFoods);
  console.log(`[db] seeded ${seedFoods.length} foods`);
}

export function getSetting(userId, key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE user_id=? AND key=?').get(userId, key);
  return row ? row.value : fallback;
}

export function setSetting(userId, key, value) {
  db.prepare(
    'INSERT INTO settings(user_id,key,value) VALUES(?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value'
  ).run(userId, key, String(value));
}

export function getAllSettings(userId) {
  const rows = db.prepare('SELECT key, value FROM settings WHERE user_id=?').all(userId);
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  return obj;
}
