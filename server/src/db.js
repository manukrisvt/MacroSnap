// Database abstraction — uses Postgres on Railway (DATABASE_URL set),
// falls back to SQLite (better-sqlite3) for local dev.
// Both expose the same async query interface.

let impl;

if (process.env.DATABASE_URL) {
  // ---- Postgres (cloud) ----
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  impl = {
    async exec(sql) {
      const c = await pool.connect();
      try { await c.query(sql); } finally { c.release(); }
    },
    async run(sql, params = []) {
      const c = await pool.connect();
      try { return await c.query(sql, params); } finally { c.release(); }
    },
    async get(sql, params = []) {
      const c = await pool.connect();
      try { const r = await c.query(sql, params); return r.rows[0] || null; } finally { c.release(); }
    },
    async all(sql, params = []) {
      const c = await pool.connect();
      try { const r = await c.query(sql, params); return r.rows; } finally { c.release(); }
    },
    async transaction(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const result = await fn({
          run: (sql, params) => c.query(sql, params),
          get: async (sql, params) => (await c.query(sql, params)).rows[0] || null,
          all: async (sql, params) => (await c.query(sql, params)).rows,
        });
        await c.query('COMMIT');
        return result;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally { c.release(); }
    }
  };
} else {
  // ---- SQLite (local dev) ----
  const Database = (await import('better-sqlite3')).default;
  const { fileURLToPath } = await import('url');
  const { dirname, join } = await import('path');
  const { mkdirSync } = await import('fs');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const dataDir = process.env.DATA_DIR || join(__dirname, '..', 'data');
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, 'macrosnap.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Convert $1, $2 style params (Postgres) to ? (SQLite) automatically
  // Also strip RETURNING (SQLite doesn't support it; use lastInsertRowid instead)
  const toSqlite = (sql) => sql.replace(/\$\d+/g, '?').replace(/RETURNING\s+\w+/gi, '');

  // SQLite uses AUTOINCREMENT instead of SERIAL, and ? instead of $1
  const PK = process.env.DATABASE_URL ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const LIKE = process.env.DATABASE_URL ? 'ILIKE' : 'LIKE';

  impl = {
    exec(sql) { db.exec(sql.replace(/SERIAL PRIMARY KEY/g, PK)); },
    run(sql, params = []) { return db.prepare(toSqlite(sql)).run(...params); },
    get(sql, params = []) { return db.prepare(toSqlite(sql)).get(...params); },
    all(sql, params = []) { return db.prepare(toSqlite(sql).replace(/ILIKE/g, 'LIKE')).all(...params); },
    transaction(fn) {
      const tx = db.transaction(fn);
      return tx({
        run: (sql, params) => db.prepare(toSqlite(sql)).run(...params),
        get: (sql, params) => db.prepare(toSqlite(sql)).get(...params),
        all: (sql, params) => db.prepare(toSqlite(sql).replace(/ILIKE/g, 'LIKE')).all(...params),
      });
    }
  };
}

export const db = impl;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL DEFAULT '',
  pass_hash  TEXT NOT NULL,
  is_premium INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  user_id  INTEGER NOT NULL DEFAULT 0,
  key      TEXT NOT NULL,
  value    TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS foods (
  id         SERIAL PRIMARY KEY,
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
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL DEFAULT 0,
  date        TEXT NOT NULL,
  meal_type   TEXT NOT NULL,
  photo_thumb TEXT,
  created_at  BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS meal_items (
  id            SERIAL PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS usage_log (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  endpoint   TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meals_user_date ON meals(user_id, date);
CREATE INDEX IF NOT EXISTS idx_meal_items_meal ON meal_items(meal_id);
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_log(user_id, created_at);
`;

// Initialize schema on startup
await db.exec(SCHEMA);

// Seed default settings for user 0 (legacy)
const settingsCount = await db.get('SELECT COUNT(*) as c FROM settings WHERE user_id=0');
if (settingsCount?.c === 0 || settingsCount?.c === '0') {
  for (const [k, v] of Object.entries({
    calorie_goal: '2000', protein_goal: '150', carbs_goal: '225', fat_goal: '67', macro_unit: 'g'
  })) {
    await db.run('INSERT INTO settings(user_id,key,value) VALUES(0,?,?) ON CONFLICT DO NOTHING', [k, v]);
  }
}

// Seed foods once
const foodCount = await db.get('SELECT COUNT(*) as c FROM foods');
if (foodCount?.c === 0 || foodCount?.c === '0') {
  const { seedFoods } = await import('./seedFoods.js');
  for (const r of seedFoods) {
    await db.run(
      'INSERT INTO foods(name,portion,calories,protein_g,carbs_g,fat_g,fiber_g,category) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [r.name, r.portion, r.calories, r.protein_g, r.carbs_g, r.fat_g, r.fiber_g, r.category]
    );
  }
  console.log(`[db] seeded ${seedFoods.length} foods`);
}

export const DEFAULT_SETTINGS = {
  calorie_goal: '2000', protein_goal: '150', carbs_goal: '225', fat_goal: '67', macro_unit: 'g'
};

export async function seedUserSettings(userId) {
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await db.run('INSERT INTO settings(user_id,key,value) VALUES(?,?,?) ON CONFLICT DO NOTHING', [userId, k, v]);
  }
}

export async function getSetting(userId, key, fallback = null) {
  const row = await db.get('SELECT value FROM settings WHERE user_id=$1 AND key=$2', [userId, key]);
  return row ? row.value : fallback;
}

export async function setSetting(userId, key, value) {
  await db.run(
    'INSERT INTO settings(user_id,key,value) VALUES($1,$2,$3) ON CONFLICT(user_id,key) DO UPDATE SET value=EXCLUDED.value',
    [userId, key, String(value)]
  );
}

export async function getAllSettings(userId) {
  const rows = await db.all('SELECT key, value FROM settings WHERE user_id=$1', [userId]);
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  return obj;
}
