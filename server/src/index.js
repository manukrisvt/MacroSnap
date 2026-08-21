import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync } from 'fs';
import { db, getAllSettings, setSetting } from './db.js';
import { analyzeMealImage } from './moonshot.js';
import { signup, login, authMiddleware, requireAuth, checkQuota, logSnap, deleteAccount, adminResetPassword, rateLimit } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' }));

const PORT = process.env.PORT || 8787;
const today = () => new Date().toISOString().slice(0, 10);

// ---------- auth routes (rate limited) ----------
app.post('/api/signup', rateLimit(), async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    const { userId, token } = await signup(email, password, name || '');
    res.json({ userId, token, email });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/login', rateLimit(), async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
    const { userId, token } = await login(email, password);
    res.json({ userId, token, email });
  } catch (err) { res.status(401).json({ error: err.message }); }
});

// ---------- admin password reset (beta — no email needed) ----------
app.post('/api/admin/reset-password', rateLimit(3), async (req, res) => {
  try {
    const { email, newPassword, adminKey } = req.body || {};
    if (!email || !newPassword) return res.status(400).json({ error: 'Email and newPassword required.' });
    const result = await adminResetPassword(email, newPassword, adminKey);
    res.json(result);
  } catch (err) {
    res.status(err.code === 'UNAUTHORIZED' ? 403 : 400).json({ error: err.message });
  }
});

// ---------- delete account ----------
app.delete('/api/account', async (req, res) => {
  try {
    await deleteAccount(req.userId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete account.' }); }
});

// ---------- feedback (logs to server console + stores in DB) ----------
app.post('/api/feedback', async (req, res) => {
  try {
    const { message, type } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Message required.' });
    console.log(`[feedback] user=${req.userId} type=${type||'bug'}: ${message}`);
    // Store in usage_log as 'feedback' so it's queryable
    await db.run(
      'INSERT INTO usage_log(user_id, endpoint, created_at) VALUES($1,$2,$3)',
      [req.userId, `feedback:${type||'bug'}:${message.slice(0,200)}`, Date.now()]
    );
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Failed to submit feedback.' }); }
});

app.use(authMiddleware);

// ---------- clear all data (admin) ----------
app.post('/api/admin/clear-all', async (req, res) => {
  const adminKey = req.body?.adminKey;
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized.' });
  }
  try {
    await db.run('DELETE FROM meal_items');
    await db.run('DELETE FROM meals');
    await db.run('DELETE FROM settings');
    await db.run('DELETE FROM water');
    await db.run('DELETE FROM weight_log');
    await db.run('DELETE FROM favorites');
    await db.run('DELETE FROM usage_log');
    await db.run('DELETE FROM users');
    // Re-seed default settings for user 0
    for (const [k, v] of Object.entries({ calorie_goal: '2000', protein_goal: '150', carbs_goal: '225', fat_goal: '67', macro_unit: 'g' })) {
      await db.run('INSERT INTO settings(user_id,key,value) VALUES(0,$1,$2) ON CONFLICT DO NOTHING', [k, v]);
    }
    res.json({ ok: true, message: 'All data cleared.' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to clear data.' });
  }
});

// ---------- photo analysis ----------
app.post('/api/analyze', async (req, res) => {
  try {
    const { image, mimeType } = req.body || {};
    if (!image) return res.status(400).json({ error: 'No image provided.' });
    const quota = await checkQuota(req.userId);
    if (!quota.allowed) {
      return res.status(402).json({ error: 'You have used all 3 free photo analyses.', code: 'QUOTA_EXCEEDED', quota, upgrade: true });
    }
    const result = await analyzeMealImage(image, mimeType);
    await logSnap(req.userId);
    res.json({ ...result, quota: await checkQuota(req.userId) });
  } catch (err) {
    console.error('[analyze] error:', err.message);
    res.status(502).json({ error: err.message, code: err.code, fallback: true });
  }
});

// ---------- usage / quota ----------
app.get('/api/usage', async (req, res) => {
  res.json(await checkQuota(req.userId));
});

// ---------- user profile ----------
app.get('/api/me', async (req, res) => {
  const user = await db.get('SELECT id, email, name, is_premium FROM users WHERE id=$1', [req.userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const quota = await checkQuota(req.userId);
  res.json({ id: user.id, email: user.email, name: user.name, isPremium: user.is_premium == 1, tier: user.is_premium == 1 ? 'premium' : 'free', quota });
});

// ---------- barcode lookup ----------
app.get('/api/barcode/:code', async (req, res) => {
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${req.params.code}.json`);
    const data = await r.json();
    if (data.status !== 1 || !data.product) return res.status(404).json({ error: 'Product not found' });
    const p = data.product, n = p.nutriments || {};
    res.json({
      name: p.product_name || 'Unknown', brand: p.brands || '', portion: p.serving_size || '100g',
      calories: Math.round(Number(n['energy-kcal_serving']) || Number(n['energy-kcal_100g']) || 0),
      protein_g: Math.round(Number(n.proteins_serving || n.proteins_100g) * 10) / 10 || 0,
      carbs_g: Math.round(Number(n.carbohydrates_serving || n.carbohydrates_100g) * 10) / 10 || 0,
      fat_g: Math.round(Number(n.fat_serving || n.fat_100g) * 10) / 10 || 0,
      fiber_g: Math.round(Number(n.fiber_serving || n.fiber_100g) * 10) / 10 || 0,
      image_url: p.image_front_url || p.image_url || null
    });
  } catch { res.status(502).json({ error: 'Barcode lookup failed' }); }
});

// ---------- foods ----------
app.get('/api/foods', async (req, res) => {
  const q = (req.query.q || '').trim();
  let rows;
  if (q) {
    rows = await db.all('SELECT * FROM foods WHERE name ILIKE $1 ORDER BY CASE WHEN name ILIKE $2 THEN 0 ELSE 1 END, name LIMIT 50', [`%${q}%`, `${q}%`]);
  } else {
    rows = await db.all('SELECT * FROM foods ORDER BY name LIMIT 50');
  }
  res.json(rows);
});

app.post('/api/foods', async (req, res) => {
  const f = req.body || {};
  const r = await db.run(
    'INSERT INTO foods(name,portion,calories,protein_g,carbs_g,fat_g,fiber_g,category) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [f.name, f.portion || '1 serving', Number(f.calories)||0, Number(f.protein_g)||0, Number(f.carbs_g)||0, Number(f.fat_g)||0, Number(f.fiber_g)||0, f.category||'other']
  );
  res.json({ id: r.rows?.[0]?.id || r.lastInsertRowid });
});

// ---------- meals ----------
async function rowToMealWithItems(meal) {
  const items = await db.all('SELECT * FROM meal_items WHERE meal_id=$1 ORDER BY id', [meal.id]);
  return { ...meal, items };
}

app.get('/api/meals', async (req, res) => {
  const date = req.query.date || today();
  const meals = await db.all('SELECT * FROM meals WHERE user_id=$1 AND date=$2 ORDER BY created_at', [req.userId, date]);
  res.json(await Promise.all(meals.map(rowToMealWithItems)));
});

app.get('/api/meals/:id', async (req, res) => {
  const meal = await db.get('SELECT * FROM meals WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
  if (!meal) return res.status(404).json({ error: 'Not found' });
  res.json(await rowToMealWithItems(meal));
});

app.post('/api/meals', async (req, res) => {
  const { date, meal_type, photo_thumb, items } = req.body || {};
  if (!meal_type) return res.status(400).json({ error: 'meal_type required' });
  const d = date || today();
  const mealId = await db.transaction(async (tx) => {
    const r = await tx.run(
      'INSERT INTO meals(user_id,date,meal_type,photo_thumb,created_at) VALUES($1,$2,$3,$4,$5) RETURNING id',
      [req.userId, d, meal_type, photo_thumb || null, Date.now()]
    );
    const id = r.rows?.[0]?.id || r.lastInsertRowid;
    for (const it of items || []) {
      await tx.run(
        'INSERT INTO meal_items(meal_id,name,portion,multiplier,calories,protein_g,carbs_g,fat_g,fiber_g) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [id, it.name, it.portion||'', Number(it.multiplier)||1, Math.round(Number(it.calories)||0), Number(it.protein_g)||0, Number(it.carbs_g)||0, Number(it.fat_g)||0, Number(it.fiber_g)||0]
      );
    }
    return id;
  });
  const meal = await db.get('SELECT * FROM meals WHERE id=$1', [mealId]);
  res.json(await rowToMealWithItems(meal));
});

app.delete('/api/meals/:id', async (req, res) => {
  await db.run('DELETE FROM meals WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
  res.json({ ok: true });
});

// ---------- day summary ----------
app.get('/api/day', async (req, res) => {
  const date = req.query.date || today();
  const meals = await db.all('SELECT * FROM meals WHERE user_id=$1 AND date=$2 ORDER BY created_at', [req.userId, date]);
  let calories=0, protein=0, carbs=0, fat=0, fiber=0;
  for (const m of meals) {
    const items = await db.all('SELECT * FROM meal_items WHERE meal_id=$1', [m.id]);
    for (const it of items) {
      calories += it.calories; protein += it.protein_g; carbs += it.carbs_g; fat += it.fat_g; fiber += it.fiber_g;
    }
  }
  const water = await db.get('SELECT glasses FROM water WHERE user_id=$1 AND date=$2', [req.userId, date]);
  res.json({ date, totals: { calories, protein_g: protein, carbs_g: carbs, fat_g: fat, fiber_g: fiber }, meals: await Promise.all(meals.map(rowToMealWithItems)), water_glasses: water?.glasses || 0 });
});

// ---------- water ----------
app.post('/api/water', async (req, res) => {
  const date = req.body.date || today();
  const delta = Number(req.body.delta) || 0;
  await db.run(
    'INSERT INTO water(user_id,date,glasses) VALUES($1,$2,$3) ON CONFLICT(user_id,date) DO UPDATE SET glasses=MAX(0, water.glasses + $3)',
    [req.userId, date, delta]
  );
  const row = await db.get('SELECT glasses FROM water WHERE user_id=$1 AND date=$2', [req.userId, date]);
  res.json({ date, glasses: row?.glasses || 0 });
});

// ---------- history ----------
app.get('/api/history', async (req, res) => {
  const days = Number(req.query.days) || 30;
  const rows = await db.all(
    `SELECT m.date, SUM(mi.calories) AS calories, SUM(mi.protein_g) AS protein_g
     FROM meals m JOIN meal_items mi ON mi.meal_id = m.id
     WHERE m.user_id=$1 AND m.date >= date('now', $2)
     GROUP BY m.date ORDER BY m.date`,
    [req.userId, `-${days} days`]
  );
  res.json(rows.map(r => ({ ...r, calories: r.calories||0, protein_g: r.protein_g||0 })));
});

// ---------- favorites ----------
app.get('/api/favorites', async (req, res) => {
  res.json(await db.all('SELECT * FROM favorites WHERE user_id=$1 ORDER BY name', [req.userId]));
});

app.post('/api/favorites', async (req, res) => {
  const f = req.body || {};
  await db.run(
    `INSERT INTO favorites(user_id,name,portion,calories,protein_g,carbs_g,fat_g,fiber_g) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT(user_id,name) DO UPDATE SET portion=EXCLUDED.portion, calories=EXCLUDED.calories, protein_g=EXCLUDED.protein_g, carbs_g=EXCLUDED.carbs_g, fat_g=EXCLUDED.fat_g, fiber_g=EXCLUDED.fiber_g`,
    [req.userId, f.name, f.portion||'', Number(f.calories)||0, Number(f.protein_g)||0, Number(f.carbs_g)||0, Number(f.fat_g)||0, Number(f.fiber_g)||0]
  );
  res.json({ ok: true });
});

app.delete('/api/favorites/:name', async (req, res) => {
  await db.run('DELETE FROM favorites WHERE user_id=$1 AND name=$2', [req.userId, req.params.name]);
  res.json({ ok: true });
});

// ---------- settings ----------
app.get('/api/settings', async (req, res) => {
  res.json(await getAllSettings(req.userId));
});

app.post('/api/settings', async (req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) await setSetting(req.userId, k, v);
  res.json({ ok: true });
});

// ---------- weight log ----------
app.get('/api/weight', async (req, res) => {
  res.json(await db.all('SELECT * FROM weight_log WHERE user_id=$1 ORDER BY date', [req.userId]));
});

app.post('/api/weight', async (req, res) => {
  const { date, weight_kg } = req.body || {};
  const d = date || today();
  await db.run(
    'INSERT INTO weight_log(user_id,date,weight_kg) VALUES($1,$2,$3) ON CONFLICT(user_id,date) DO UPDATE SET weight_kg=EXCLUDED.weight_kg',
    [req.userId, d, Number(weight_kg)]
  );
  res.json({ ok: true });
});

// ---------- recent foods ----------
app.get('/api/recent', async (req, res) => {
  const limit = Number(req.query.limit) || 20;
  const rows = await db.all(
    `SELECT DISTINCT mi.name, mi.portion, mi.calories, mi.protein_g, mi.carbs_g, mi.fat_g, mi.fiber_g
     FROM meal_items mi JOIN meals m ON mi.meal_id = m.id
     WHERE m.user_id=$1 ORDER BY mi.id DESC LIMIT $2`,
    [req.userId, limit]
  );
  res.json(rows);
});

// ---------- serve frontend ----------
const HOST = process.env.HOST || '0.0.0.0';
const distDir = resolve(__dirname, '..', '..', 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(resolve(distDir, 'index.html')));
  console.log(`[MacroSnap] Serving frontend from ${distDir}`);
}

const server = app.listen(PORT, HOST, () => {
  console.log(`[MacroSnap] API listening on http://${HOST}:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[MacroSnap] Port ${PORT} is already in use. Try: lsof -ti:${PORT} | xargs kill -9\n`);
    process.exit(1);
  } else { console.error('[MacroSnap] Server error:', err); process.exit(1); }
});
