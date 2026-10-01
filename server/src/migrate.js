// Minimal forward-only migration system.
// Each migration is a named SQL block; applied ones are recorded in
// schema_migrations. Never destructive — only CREATE/ALTER ADD COLUMN.
import { db } from './db.js';

const MIGRATIONS = [
  {
    name: '001_baseline',
    sql: `SELECT 1;` // baseline schema is created by db.js SCHEMA at boot; no-op marker
  },
  {
    name: '002_item_corrections_ai_estimates',
    sql: `
      ALTER TABLE meal_items ADD COLUMN IF NOT EXISTS grams REAL;
      ALTER TABLE meal_items ADD COLUMN IF NOT EXISTS confidence TEXT;
      ALTER TABLE foods ADD COLUMN IF NOT EXISTS grams_per_portion REAL;

      CREATE TABLE IF NOT EXISTS ai_estimates (
        id                 SERIAL PRIMARY KEY,
        user_id            INTEGER NOT NULL,
        meal_id            INTEGER REFERENCES meals(id) ON DELETE SET NULL,
        model_name         TEXT NOT NULL DEFAULT '',
        prompt_version     TEXT NOT NULL DEFAULT '',
        raw_model_output   JSONB,
        user_hint          TEXT,
        fat_level          TEXT,
        final_items        JSONB,
        ground_truth_items JSONB,
        is_verified        BOOLEAN NOT NULL DEFAULT FALSE,
        created_at         BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ai_estimates_user ON ai_estimates(user_id, created_at);

      CREATE TABLE IF NOT EXISTS ai_images (
        id            SERIAL PRIMARY KEY,
        ai_estimate_id INTEGER NOT NULL REFERENCES ai_estimates(id) ON DELETE CASCADE,
        image_base64  TEXT NOT NULL,
        mime          TEXT NOT NULL DEFAULT 'image/jpeg',
        created_at    BIGINT NOT NULL
      );
    `
  },
  {
    name: '003_user_recipes',
    sql: `
      CREATE TABLE IF NOT EXISTS user_recipes (
        id                  SERIAL PRIMARY KEY,
        user_id             INTEGER NOT NULL,
        name                TEXT NOT NULL,
        aliases             TEXT[] NOT NULL DEFAULT '{}',
        ingredients         JSONB NOT NULL,
        total_cooked_yield_g REAL NOT NULL,
        cooking_fat_g       REAL NOT NULL DEFAULT 0,
        kcal_per_100g       REAL NOT NULL DEFAULT 0,
        protein_per_100g    REAL NOT NULL DEFAULT 0,
        carbs_per_100g      REAL NOT NULL DEFAULT 0,
        fat_per_100g        REAL NOT NULL DEFAULT 0,
        fiber_per_100g       REAL NOT NULL DEFAULT 0,
        created_at          BIGINT NOT NULL,
        updated_at          BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_user_recipes_user ON user_recipes(user_id);
    `
  },
  {
    name: '004_subscription_plans',
    sql: `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_renews_at BIGINT;
      -- Migrate existing premium users to the plus plan
      UPDATE users SET plan='plus' WHERE is_premium=1;
      CREATE INDEX IF NOT EXISTS idx_usage_month ON usage_log(user_id, endpoint, created_at);
    `
  },
  {
    name: '005_sign_in_with_apple',
    sql: `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_sub TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_sub ON users(apple_sub) WHERE apple_sub IS NOT NULL;
    `
  },
  {
    name: '006_apple_users_nullable_password',
    sql: `
      -- Apple sign-in accounts have no password; allow NULL pass_hash.
      ALTER TABLE users ALTER COLUMN pass_hash DROP NOT NULL;
    `
  }
];

export async function runMigrations() {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at BIGINT NOT NULL
  )`);
  for (const m of MIGRATIONS) {
    const existing = await db.get('SELECT name FROM schema_migrations WHERE name=$1', [m.name]);
    if (existing) continue;
    try {
      // pg allows multiple statements in one query call
      await db.exec(m.sql);
      await db.run('INSERT INTO schema_migrations(name, applied_at) VALUES($1,$2)', [m.name, Date.now()]);
      console.log(`[migrate] applied ${m.name}`);
    } catch (e) {
      console.error(`[migrate] FAILED ${m.name}:`, e.message);
      throw e;
    }
  }
}

// Backfill grams_per_portion for seeded foods whose portion text contains a
// gram weight, e.g. "1 roti (40g)" -> 40. Idempotent: only fills NULLs.
export async function backfillFoodGrams() {
  const rows = await db.all(
    `SELECT id, portion FROM foods WHERE grams_per_portion IS NULL`
  );
  let n = 0;
  for (const r of rows) {
    const m = String(r.portion || '').match(/(\d+(?:\.\d+)?)\s*g\b/i);
    if (m) {
      await db.run('UPDATE foods SET grams_per_portion=$1 WHERE id=$2', [Number(m[1]), r.id]);
      n++;
    }
  }
  if (n > 0) console.log(`[migrate] backfilled grams_per_portion for ${n} foods`);
}
