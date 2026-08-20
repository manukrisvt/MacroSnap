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
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
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
  date        TEXT NOT NULL,            -- YYYY-MM-DD
  meal_type   TEXT NOT NULL,            -- breakfast|lunch|dinner|snacks
  photo_thumb TEXT,                     -- base64 thumbnail
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
  date  TEXT PRIMARY KEY,
  glasses INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS weight_log (
  date  TEXT PRIMARY KEY,
  weight_kg REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  name        TEXT PRIMARY KEY,
  portion     TEXT NOT NULL,
  calories    INTEGER NOT NULL,
  protein_g   REAL NOT NULL,
  carbs_g     REAL NOT NULL,
  fat_g       REAL NOT NULL,
  fiber_g     REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);
CREATE INDEX IF NOT EXISTS idx_meal_items_meal ON meal_items(meal_id);
`);

// Default settings
const defaults = {
  calorie_goal: '2000',
  protein_goal: '150',
  carbs_goal: '225',
  fat_goal: '67',
  macro_unit: 'g' // 'g' or 'percent'
};
const upsertSetting = db.prepare(
  'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING'
);
for (const [k, v] of Object.entries(defaults)) upsertSetting.run(k, v);

// Seed foods once
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

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
  ).run(key, String(value));
}
