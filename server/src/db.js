// Postgres-only database module. No SQLite fallback.
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false, require: true } : undefined,
  connectionTimeoutMillis: 10000,
  max: 5
});

export const db = {
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

const SCHEMA = `
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

// Initialize schema with retry (Railway Postgres might not be ready immediately)
async function initDB(retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      await db.exec(SCHEMA);
      console.log('[db] schema created');

      // Seed default settings for user 0
      const sc = await db.get('SELECT COUNT(*) as c FROM settings WHERE user_id=0');
      if (sc?.c === 0 || sc?.c === '0') {
        for (const [k, v] of Object.entries({ calorie_goal: '2000', protein_goal: '150', carbs_goal: '225', fat_goal: '67', macro_unit: 'g' })) {
          await db.run('INSERT INTO settings(user_id,key,value) VALUES(0,$1,$2) ON CONFLICT DO NOTHING', [k, v]);
        }
      }

      // Seed foods once
      const fc = await db.get('SELECT COUNT(*) as c FROM foods');
      if (fc?.c === 0 || fc?.c === '0') {
        const { seedFoods } = await import('./seedFoods.js');
        for (const r of seedFoods) {
          await db.run(
            'INSERT INTO foods(name,portion,calories,protein_g,carbs_g,fat_g,fiber_g,category) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
            [r.name, r.portion, r.calories, r.protein_g, r.carbs_g, r.fat_g, r.fiber_g, r.category]
          );
        }
        console.log(`[db] seeded ${seedFoods.length} foods`);
      }
      console.log('[db] initialization complete');
      return;
    } catch (e) {
      console.error(`[db] init attempt ${i+1}/${retries} failed:`, e.message);
      if (i < retries - 1) await new Promise(r => setTimeout(r, 3000));
    }
  }
  console.error('[db] failed to initialize after retries — starting anyway');
}

initDB();

export const DEFAULT_SETTINGS = { calorie_goal: '2000', protein_goal: '150', carbs_goal: '225', fat_goal: '67', macro_unit: 'g' };

export async function seedUserSettings(userId) {
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await db.run('INSERT INTO settings(user_id,key,value) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [userId, k, v]);
  }
}

export async function getSetting(userId, key, fallback = null) {
  const row = await db.get('SELECT value FROM settings WHERE user_id=$1 AND key=$2', [userId, key]);
  return row ? row.value : fallback;
}

export async function setSetting(userId, key, value) {
  await db.run('INSERT INTO settings(user_id,key,value) VALUES($1,$2,$3) ON CONFLICT(user_id,key) DO UPDATE SET value=EXCLUDED.value', [userId, key, String(value)]);
}

export async function getAllSettings(userId) {
  const rows = await db.all('SELECT key, value FROM settings WHERE user_id=$1', [userId]);
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  return obj;
}
