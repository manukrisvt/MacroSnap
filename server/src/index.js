import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync } from 'fs';
import { db, getAllSettings, setSetting } from './db.js';
import { analyzeMealImage } from './moonshot.js';
import { signup, login, authMiddleware, requireAuth, checkQuota, logSnap, deleteAccount, adminResetPassword, rateLimit, appleSignIn } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
// Parse JSON for everything EXCEPT the Stripe webhook, which needs the
// raw body for signature verification.
app.use((req, res, next) => {
  if (req.path === '/api/stripe/webhook') return next();
  express.json({ limit: '12mb' })(req, res, next);
});

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

// ---------- Sign in with Apple ----------
app.post('/api/auth/apple', rateLimit(), async (req, res) => {
  try {
    const { identityToken } = req.body || {};
    if (!identityToken) return res.status(400).json({ error: 'identityToken required.' });
    const { userId, token, email } = await appleSignIn(identityToken);
    res.json({ userId, token, email });
  } catch (err) {
    console.error('[apple-signin] error:', err.message);
    res.status(401).json({ error: err.message });
  }
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

app.use(authMiddleware);

// ---------- feedback (stores with real user_id) ----------
app.post('/api/feedback', async (req, res) => {
  try {
    const { message, type } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Message required.' });
    const userId = req.userId || 0;
    const endpoint = `feedback:${type || 'bug'}:${String(message).slice(0, 200)}`;
    console.log(`[feedback] user=${userId} type=${type || 'bug'}: ${message}`);
    await db.run(
      'INSERT INTO usage_log(user_id, endpoint, created_at) VALUES($1, $2, $3)',
      [userId, endpoint, Date.now()]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[feedback] error:', e.message, e.code, e.detail);
    res.status(500).json({ error: 'Failed to submit feedback.', detail: e.message || 'unknown' });
  }
});

// ---------- admin: view feedback ----------
app.get('/api/admin/feedback', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized.' });
  }
  try {
    const rows = await db.all(`
      SELECT u.id as user_id, u.email, u.name,
             REPLACE(REPLACE(l.endpoint, 'feedback:', ''), SUBSTRING(l.endpoint FROM 1 FOR POSITION(':' IN l.endpoint)), '') as message,
             l.endpoint, l.created_at
      FROM usage_log l
      LEFT JOIN users u ON u.id = l.user_id
      WHERE l.endpoint LIKE 'feedback:%'
      ORDER BY l.created_at DESC
      LIMIT 100
    `);
    // Clean up the message extraction
    const feedback = rows.map(r => {
      const parts = r.endpoint.split(':');
      const type = parts[1] || 'bug';
      const msg = parts.slice(2).join(':');
      return {
        user_id: r.user_id,
        email: r.email || 'anonymous',
        name: r.name || '',
        type,
        message: msg,
        created_at: r.created_at,
        date: new Date(r.created_at).toISOString()
      };
    });
    res.json(feedback);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch feedback.' });
  }
});

// ---------- clear all data (admin) ----------
app.post('/api/admin/clear-all', async (req, res) => {
  const adminKey = req.body?.adminKey || req.headers['x-admin-key'];
  const validKey = process.env.ADMIN_KEY || 'macrosnap-admin-2026';
  if (adminKey !== validKey) {
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

// ---------- admin: export verified ai_estimates as CSV ----------
app.get('/api/admin/export/ai-estimates', async (req, res) => {
  const adminKey = req.headers['x-admin-key'] || req.query.key;
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized.' });
  }
  try {
    const rows = await db.all(`
      SELECT e.id, e.user_id, e.meal_id, e.model_name, e.prompt_version,
             e.raw_model_output, e.final_items, e.ground_truth_items,
             e.is_verified, e.created_at
      FROM ai_estimates e
      WHERE e.is_verified = TRUE
      ORDER BY e.created_at DESC
    `);
    const esc = (v) => {
      if (v == null) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = ['estimate_id,user_id,meal_id,model_name,prompt_version,created_at,is_verified,raw_model_output,final_items,ground_truth_items,ai_total_kcal,gt_total_kcal,ai_total_grams,gt_total_grams'];
    for (const r of rows) {
      const raw = r.raw_model_output || {};
      const rawFoods = Array.isArray(raw.foods) ? raw.foods : [];
      const gt = Array.isArray(r.ground_truth_items) ? r.ground_truth_items : [];
      const aiKcal = rawFoods.reduce((s, f) => s + (Number(f.calories) || 0), 0);
      const gtKcal = gt.reduce((s, f) => s + (Number(f.calories) || 0), 0);
      const aiG = rawFoods.reduce((s, f) => s + (Number(f.grams) || 0), 0);
      const gtG = gt.reduce((s, f) => s + (Number(f.grams) || 0), 0);
      lines.push([
        r.id, r.user_id, r.meal_id, esc(r.model_name), esc(r.prompt_version),
        r.created_at, r.is_verified, esc(raw), esc(r.final_items), esc(gt),
        aiKcal, gtKcal, aiG, gtG
      ].join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ai_estimates_verified.csv"');
    res.send(lines.join('\n'));
  } catch (e) {
    console.error('[export] error:', e.message);
    res.status(500).json({ error: 'Failed to export.' });
  }
});

// ---------- photo analysis ----------
app.post('/api/analyze', async (req, res) => {
  try {
    const { image, mimeType, hint, mealSource } = req.body || {};
    if (!image) return res.status(400).json({ error: 'No image provided.' });
    const quota = await checkQuota(req.userId);
    if (!quota.allowed) {
      return res.status(402).json({ error: 'You have used all 3 free photo analyses.', code: 'QUOTA_EXCEEDED', quota, upgrade: true });
    }
    const result = await analyzeMealImage(image, mimeType, { hint, mealSource });
    await logSnap(req.userId);
    res.json({ ...result, quota: await checkQuota(req.userId) });
  } catch (err) {
    console.error('[analyze] error:', err.message);
    res.status(502).json({ error: err.message, code: err.code, fallback: true });
  }
});

// ---------- re-analyze (hint / correction / clarifying answer) ----------
// Does NOT consume a free snap — it refines the same meal. Rate-limited to
// 3 re-analyses per user per 10 minutes to protect API costs.
const reanalyzeCounts = new Map(); // userId -> { count, windowStart }
app.post('/api/reanalyze', async (req, res) => {
  try {
    const { image, mimeType, hint, mealSource, previousOutput, correctionText, clarifyingAnswer } = req.body || {};
    if (!image) return res.status(400).json({ error: 'No image provided.' });

    // Rate limit: 3 re-analyzes per user per 10-minute window
    const now = Date.now();
    const WINDOW = 10 * 60 * 1000;
    let entry = reanalyzeCounts.get(req.userId);
    if (!entry || now - entry.windowStart > WINDOW) {
      entry = { count: 0, windowStart: now };
      reanalyzeCounts.set(req.userId, entry);
    }
    if (entry.count >= 3) {
      return res.status(429).json({ error: 'Too many re-analyses. Wait a few minutes or edit items manually.', code: 'REANALYZE_LIMIT' });
    }
    entry.count++;

    const result = await analyzeMealImage(image, mimeType, { hint, mealSource, previousOutput, correctionText, clarifyingAnswer });
    res.json(result);
  } catch (err) {
    console.error('[reanalyze] error:', err.message, err.code, err.raw ? `RAW: ${String(err.raw).slice(0, 500)}` : '');
    res.status(502).json({ error: err.message, code: err.code, fallback: true });
  }
});

// ---------- usage / quota ----------
app.get('/api/usage', async (req, res) => {
  res.json(await checkQuota(req.userId));
});

// ---------- subscription plans ----------
import { PLANS, PLAN_ORDER } from '../../shared/plans.js';
import { createCheckoutSession, verifyStripeSignature, handleStripeEvent } from './stripe.js';

// Current plan + usage (authenticated)
app.get('/api/plan', async (req, res) => {
  const quota = await checkQuota(req.userId);
  const user = await db.get('SELECT plan, plan_renews_at FROM users WHERE id=$1', [req.userId]);
  res.json({
    plan: quota.plan,
    limit: quota.limit,
    used: quota.used,
    remaining: quota.remaining,
    resetsMonthly: quota.resetsMonthly,
    renewsAt: user?.plan_renews_at || null,
    stripeConfigured: !!process.env.STRIPE_SECRET_KEY
  });
});

// All plans (public pricing info)
app.get('/api/plans', (req, res) => {
  res.json({ plans: PLAN_ORDER.map((id) => PLANS[id]), stripeConfigured: !!process.env.STRIPE_SECRET_KEY });
});

// Start a Stripe checkout session for an upgrade
app.post('/api/checkout', async (req, res) => {
  try {
    const { planId } = req.body || {};
    const user = await db.get('SELECT id, email FROM users WHERE id=$1', [req.userId]);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
    const session = await createCheckoutSession(req.userId, user.email, planId, appUrl);
    res.json(session);
  } catch (err) {
    console.error('[checkout] error:', err.message);
    res.status(400).json({ error: err.message, code: err.code });
  }
});

// Stripe webhook (UNAUTHENTICATED by design — verified by signature).
// Body arrives raw thanks to the json-parser exclusion above.
app.post('/api/stripe/webhook', async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(501).json({ error: 'Webhook not configured.' });
  const sig = req.headers['stripe-signature'];
  const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
  if (!verifyStripeSignature(payload, sig, secret)) {
    return res.status(400).json({ error: 'Invalid signature.' });
  }
  try {
    const result = await handleStripeEvent(JSON.parse(payload));
    res.json(result);
  } catch (e) {
    console.error('[stripe webhook] error:', e.message);
    res.status(500).json({ error: 'Webhook processing failed.' });
  }
});

// ---------- user profile ----------
app.get('/api/me', async (req, res) => {
  const user = await db.get('SELECT id, email, name, plan FROM users WHERE id=$1', [req.userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const quota = await checkQuota(req.userId);
  res.json({
    id: user.id, email: user.email, name: user.name,
    plan: user.plan || 'free',
    isPremium: quota.isPremium,
    quota
  });
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
  const { date, meal_type, photo_thumb, items, ai_estimate } = req.body || {};
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
        'INSERT INTO meal_items(meal_id,name,portion,multiplier,calories,protein_g,carbs_g,fat_g,fiber_g,grams,confidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [id, it.name, it.portion||'', Number(it.multiplier)||1, Math.round(Number(it.calories)||0), Number(it.protein_g)||0, Number(it.carbs_g)||0, Number(it.fat_g)||0, Number(it.fiber_g)||0, it.grams != null ? Number(it.grams) : null, it.confidence || null]
      );
    }
    // Persist the AI estimate (raw vs final vs ground truth) for accuracy analysis.
    if (ai_estimate && (ai_estimate.raw_model_output || ai_estimate.final_items)) {
      const er = await tx.run(
        `INSERT INTO ai_estimates(user_id,meal_id,model_name,prompt_version,raw_model_output,user_hint,fat_level,final_items,ground_truth_items,is_verified,created_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [
          req.userId, id,
          String(ai_estimate.model_name || ''),
          String(ai_estimate.prompt_version || ''),
          ai_estimate.raw_model_output ? JSON.stringify(ai_estimate.raw_model_output) : null,
          ai_estimate.user_hint || null,
          ai_estimate.fat_level || null,
          ai_estimate.final_items ? JSON.stringify(ai_estimate.final_items) : null,
          ai_estimate.ground_truth_items ? JSON.stringify(ai_estimate.ground_truth_items) : null,
          ai_estimate.is_verified === true,
          Date.now()
        ]
      );
      const estId = er.rows?.[0]?.id;
      // Verified meals keep the 1024px image so future models/prompts can be
      // re-run against the same ground truth.
      if (estId && ai_estimate.is_verified === true && ai_estimate.image) {
        await tx.run(
          'INSERT INTO ai_images(ai_estimate_id,image_base64,mime,created_at) VALUES($1,$2,$3,$4)',
          [estId, ai_estimate.image, ai_estimate.image_mime || 'image/jpeg', Date.now()]
        );
      }
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

// Edit a logged meal: replace its items (and meal type).
app.put('/api/meals/:id', async (req, res) => {
  const { meal_type, items } = req.body || {};
  const meal = await db.get('SELECT * FROM meals WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
  if (!meal) return res.status(404).json({ error: 'Not found' });
  await db.transaction(async (tx) => {
    if (meal_type) {
      await tx.run('UPDATE meals SET meal_type=$1 WHERE id=$2', [meal_type, meal.id]);
    }
    if (items) {
      await tx.run('DELETE FROM meal_items WHERE meal_id=$1', [meal.id]);
      for (const it of items) {
        await tx.run(
          'INSERT INTO meal_items(meal_id,name,portion,multiplier,calories,protein_g,carbs_g,fat_g,fiber_g,grams,confidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
          [meal.id, it.name, it.portion||'', Number(it.multiplier)||1, Math.round(Number(it.calories)||0), Number(it.protein_g)||0, Number(it.carbs_g)||0, Number(it.fat_g)||0, Number(it.fiber_g)||0, it.grams != null ? Number(it.grams) : null, it.confidence || null]
        );
      }
    }
  });
  const updated = await db.get('SELECT * FROM meals WHERE id=$1', [meal.id]);
  res.json(await rowToMealWithItems(updated));
});

// ---------- user recipes (Phase 4) ----------
import { computeRecipeMacros, matchRecipe } from '../../shared/recipeLogic.js';

app.get('/api/recipes', async (req, res) => {
  const rows = await db.all('SELECT * FROM user_recipes WHERE user_id=$1 ORDER BY updated_at DESC', [req.userId]);
  res.json(rows);
});

app.post('/api/recipes', async (req, res) => {
  const { name, aliases, ingredients, total_cooked_yield_g, cooking_fat_g } = req.body || {};
  if (!name || !Array.isArray(ingredients) || ingredients.length === 0 || !Number(total_cooked_yield_g)) {
    return res.status(400).json({ error: 'name, ingredients, and total_cooked_yield_g are required.' });
  }
  // Cooking fat is just an ingredient like any other — caller includes it in
  // ingredients (or as cooking_fat_g, which we convert to an ingredient).
  let ings = ingredients;
  const fatG = Number(cooking_fat_g) || 0;
  if (fatG > 0 && !ings.some((i) => i.is_cooking_fat)) {
    ings = [...ings, { name: 'cooking fat', grams: fatG, kcal_per_100g: 900, protein_per_100g: 0, carbs_per_100g: 0, fat_per_100g: 100, fiber_per_100g: 0, is_cooking_fat: true }];
  }
  let macros;
  try {
    macros = computeRecipeMacros(ings, Number(total_cooked_yield_g));
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const r = await db.run(
    `INSERT INTO user_recipes(user_id,name,aliases,ingredients,total_cooked_yield_g,cooking_fat_g,kcal_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g,fiber_per_100g,created_at,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [req.userId, name, aliases || [], JSON.stringify(ings), Number(total_cooked_yield_g), fatG,
     macros.kcal_per_100g, macros.protein_per_100g, macros.carbs_per_100g, macros.fat_per_100g, macros.fiber_per_100g,
     Date.now(), Date.now()]
  );
  res.json(r.rows[0]);
});

app.put('/api/recipes/:id', async (req, res) => {
  const existing = await db.get('SELECT * FROM user_recipes WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
  if (!existing) return res.status(404).json({ error: 'Recipe not found.' });
  const { name, aliases, ingredients, total_cooked_yield_g, cooking_fat_g } = req.body || {};
  const ings = Array.isArray(ingredients) && ingredients.length ? ingredients : JSON.parse(existing.ingredients);
  const yieldG = Number(total_cooked_yield_g) || existing.total_cooked_yield_g;
  const fatG = cooking_fat_g != null ? Number(cooking_fat_g) : existing.cooking_fat_g;
  let withFat = ings;
  if (fatG > 0 && !ings.some((i) => i.is_cooking_fat)) {
    withFat = [...ings, { name: 'cooking fat', grams: fatG, kcal_per_100g: 900, protein_per_100g: 0, carbs_per_100g: 0, fat_per_100g: 100, fiber_per_100g: 0, is_cooking_fat: true }];
  }
  const macros = computeRecipeMacros(withFat, yieldG);
  const r = await db.run(
    `UPDATE user_recipes SET name=$1, aliases=$2, ingredients=$3, total_cooked_yield_g=$4, cooking_fat_g=$5,
     kcal_per_100g=$6, protein_per_100g=$7, carbs_per_100g=$8, fat_per_100g=$9, fiber_per_100g=$10, updated_at=$11
     WHERE id=$12 RETURNING *`,
    [name || existing.name, aliases || existing.aliases, JSON.stringify(withFat), yieldG, fatG,
     macros.kcal_per_100g, macros.protein_per_100g, macros.carbs_per_100g, macros.fat_per_100g, macros.fiber_per_100g,
     Date.now(), existing.id]
  );
  res.json(r.rows[0]);
});

app.delete('/api/recipes/:id', async (req, res) => {
  await db.run('DELETE FROM user_recipes WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
  res.json({ ok: true });
});

// Match AI items against the user's recipes (used by the frontend after analyze).
app.post('/api/recipes/match', async (req, res) => {
  const { itemNames } = req.body || {};
  if (!Array.isArray(itemNames)) return res.status(400).json({ error: 'itemNames array required.' });
  const recipes = await db.all('SELECT * FROM user_recipes WHERE user_id=$1', [req.userId]);
  const matches = itemNames.map((name) => {
    const m = matchRecipe(name, recipes);
    return m ? { name, recipe_id: m.recipe.id, recipe_name: m.recipe.name, score: Math.round(m.score * 100) / 100 } : null;
  });
  res.json({ matches });
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
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await db.all(
    `SELECT m.date, SUM(mi.calories) AS calories, SUM(mi.protein_g) AS protein_g
     FROM meals m JOIN meal_items mi ON mi.meal_id = m.id
     WHERE m.user_id=$1 AND m.date >= $2
     GROUP BY m.date ORDER BY m.date`,
    [req.userId, cutoff]
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
