import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';
import { db, getSetting, setSetting } from './db.js';
import { analyzeMealImage } from './moonshot.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' }));

const PORT = process.env.PORT || 8787;

// ---------- helpers ----------
const today = () => new Date().toISOString().slice(0, 10);

function rowToMealWithItems(meal) {
  const items = db
    .prepare('SELECT * FROM meal_items WHERE meal_id=? ORDER BY id')
    .all(meal.id);
  return { ...meal, items };
}

// ---------- photo analysis ----------
app.post('/api/analyze', async (req, res) => {
  try {
    const { image, mimeType } = req.body || {};
    if (!image) return res.status(400).json({ error: 'No image provided.' });
    const result = await analyzeMealImage(image, mimeType);
    res.json(result);
  } catch (err) {
    console.error('[analyze] error:', err.message);
    const fallback = { error: err.message, code: err.code, fallback: true };
    res.status(502).json(fallback);
  }
});

// ---------- foods (local DB search) ----------
app.get('/api/foods', (req, res) => {
  const q = (req.query.q || '').trim();
  let rows;
  if (q) {
    rows = db
      .prepare(
        `SELECT * FROM foods WHERE name LIKE ? ORDER BY
           CASE WHEN name LIKE ? THEN 0 ELSE 1 END, name LIMIT 50`
      )
      .all(`%${q}%`, `${q}%`);
  } else {
    rows = db.prepare('SELECT * FROM foods ORDER BY name LIMIT 50').all();
  }
  res.json(rows);
});

app.post('/api/foods', (req, res) => {
  const f = req.body || {};
  const stmt = db.prepare(
    `INSERT INTO foods(name,portion,calories,protein_g,carbs_g,fat_g,fiber_g,category)
     VALUES(@name,@portion,@calories,@protein_g,@carbs_g,@fat_g,@fiber_g,@category)`
  );
  const info = stmt.run({
    name: f.name, portion: f.portion || '1 serving',
    calories: Number(f.calories) || 0,
    protein_g: Number(f.protein_g) || 0,
    carbs_g: Number(f.carbs_g) || 0,
    fat_g: Number(f.fat_g) || 0,
    fiber_g: Number(f.fiber_g) || 0,
    category: f.category || 'other'
  });
  res.json({ id: info.lastInsertRowid });
});

// ---------- meals ----------
app.get('/api/meals', (req, res) => {
  const date = req.query.date || today();
  const meals = db
    .prepare('SELECT * FROM meals WHERE date=? ORDER BY created_at')
    .all(date);
  res.json(meals.map(rowToMealWithItems));
});

app.get('/api/meals/:id', (req, res) => {
  const meal = db.prepare('SELECT * FROM meals WHERE id=?').get(req.params.id);
  if (!meal) return res.status(404).json({ error: 'Not found' });
  res.json(rowToMealWithItems(meal));
});

app.post('/api/meals', (req, res) => {
  const { date, meal_type, photo_thumb, items } = req.body || {};
  if (!meal_type) return res.status(400).json({ error: 'meal_type required' });
  const d = date || today();
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO meals(date,meal_type,photo_thumb,created_at) VALUES(?,?,?,?)`
      )
      .run(d, meal_type, photo_thumb || null, Date.now());
    const mealId = info.lastInsertRowid;
    const ins = db.prepare(
      `INSERT INTO meal_items(meal_id,name,portion,multiplier,calories,protein_g,carbs_g,fat_g,fiber_g)
       VALUES(@meal_id,@name,@portion,@multiplier,@calories,@protein_g,@carbs_g,@fat_g,@fiber_g)`
    );
    for (const it of items || []) {
      ins.run({
        meal_id: mealId,
        name: it.name,
        portion: it.portion || '',
        multiplier: Number(it.multiplier) || 1,
        calories: Math.round(Number(it.calories) || 0),
        protein_g: Number(it.protein_g) || 0,
        carbs_g: Number(it.carbs_g) || 0,
        fat_g: Number(it.fat_g) || 0,
        fiber_g: Number(it.fiber_g) || 0
      });
    }
    return mealId;
  });
  const mealId = tx();
  res.json(rowToMealWithItems(db.prepare('SELECT * FROM meals WHERE id=?').get(mealId)));
});

app.delete('/api/meals/:id', (req, res) => {
  db.prepare('DELETE FROM meals WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- day summary ----------
app.get('/api/day', (req, res) => {
  const date = req.query.date || today();
  const meals = db
    .prepare('SELECT * FROM meals WHERE date=? ORDER BY created_at')
    .all(date);
  let calories = 0, protein = 0, carbs = 0, fat = 0, fiber = 0;
  for (const m of meals) {
    const items = db.prepare('SELECT * FROM meal_items WHERE meal_id=?').all(m.id);
    for (const it of items) {
      calories += it.calories;
      protein += it.protein_g;
      carbs += it.carbs_g;
      fat += it.fat_g;
      fiber += it.fiber_g;
    }
  }
  const water = db.prepare('SELECT glasses FROM water WHERE date=?').get(date);
  res.json({
    date,
    totals: { calories, protein_g: protein, carbs_g: carbs, fat_g: fat, fiber_g: fiber },
    meals: meals.map(rowToMealWithItems),
    water_glasses: water?.glasses || 0
  });
});

// ---------- water ----------
app.post('/api/water', (req, res) => {
  const date = req.body.date || today();
  const delta = Number(req.body.delta) || 0;
  db.prepare(
    `INSERT INTO water(date,glasses) VALUES(?,?) ON CONFLICT(date)
     DO UPDATE SET glasses=MAX(0, water.glasses + ?)`
  ).run(date, Math.max(0, delta), delta);
  const row = db.prepare('SELECT glasses FROM water WHERE date=?').get(date);
  res.json({ date, glasses: row?.glasses || 0 });
});

// ---------- history ----------
app.get('/api/history', (req, res) => {
  const days = Number(req.query.days) || 30;
  const rows = db
    .prepare(
      `SELECT date,
              SUM(item_cal) AS calories,
              SUM(item_pro) AS protein_g
       FROM (
         SELECT m.date, mi.calories AS item_cal, mi.protein_g AS item_pro
         FROM meals m JOIN meal_items mi ON mi.meal_id = m.id
         WHERE m.date >= date('now', ?)
       )
       GROUP BY date ORDER BY date`
    )
    .all(`-${days} days`);
  res.json(rows.map((r) => ({ ...r, calories: r.calories || 0, protein_g: r.protein_g || 0 })));
});

// ---------- favorites ----------
app.get('/api/favorites', (req, res) => {
  res.json(db.prepare('SELECT * FROM favorites ORDER BY name').all());
});

app.post('/api/favorites', (req, res) => {
  const f = req.body || {};
  db.prepare(
    `INSERT INTO favorites(name,portion,calories,protein_g,carbs_g,fat_g,fiber_g)
     VALUES(@name,@portion,@calories,@protein_g,@carbs_g,@fat_g,@fiber_g)
     ON CONFLICT(name) DO UPDATE SET
       portion=excluded.portion, calories=excluded.calories,
       protein_g=excluded.protein_g, carbs_g=excluded.carbs_g,
       fat_g=excluded.fat_g, fiber_g=excluded.fiber_g`
  ).run({
    name: f.name, portion: f.portion || '',
    calories: Number(f.calories) || 0,
    protein_g: Number(f.protein_g) || 0,
    carbs_g: Number(f.carbs_g) || 0,
    fat_g: Number(f.fat_g) || 0,
    fiber_g: Number(f.fiber_g) || 0
  });
  res.json({ ok: true });
});

app.delete('/api/favorites/:name', (req, res) => {
  db.prepare('DELETE FROM favorites WHERE name=?').run(req.params.name);
  res.json({ ok: true });
});

// ---------- settings ----------
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  res.json(obj);
});

app.post('/api/settings', (req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) setSetting(k, v);
  res.json({ ok: true });
});

// ---------- weight log ----------
app.get('/api/weight', (req, res) => {
  res.json(db.prepare('SELECT * FROM weight_log ORDER BY date').all());
});

app.post('/api/weight', (req, res) => {
  const { date, weight_kg } = req.body || {};
  const d = date || today();
  db.prepare(
    `INSERT INTO weight_log(date,weight_kg) VALUES(?,?) ON CONFLICT(date)
     DO UPDATE SET weight_kg=excluded.weight_kg`
  ).run(d, Number(weight_kg));
  res.json({ ok: true });
});

// ---------- recent foods ----------
app.get('/api/recent', (req, res) => {
  const limit = Number(req.query.limit) || 20;
  const rows = db
    .prepare(
      `SELECT DISTINCT name, portion, calories, protein_g, carbs_g, fat_g, fiber_g
       FROM meal_items ORDER BY id DESC LIMIT ?`
    )
    .all(limit);
  res.json(rows);
});

const HOST = process.env.HOST || '0.0.0.0';

// Serve the built frontend (dist/) so one server serves both the API and the web app.
// In dev, Vite serves the frontend separately; in production (cloud), this serves it.
const distDir = resolve(__dirname, '..', '..', 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback: serve index.html for any non-/api route.
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(join(distDir, 'index.html'));
  });
  console.log(`[MacroSnap] Serving frontend from ${distDir}`);
}

const server = app.listen(PORT, HOST, () => {
  console.log(`[MacroSnap] API listening on http://${HOST}:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[MacroSnap] Port ${PORT} is already in use.`);
    console.error(`  Another server instance may still be running. Try:`);
    console.error(`  lsof -ti:${PORT} | xargs kill -9\n`);
    process.exit(1);
  } else {
    console.error('[MacroSnap] Server error:', err);
    process.exit(1);
  }
});
