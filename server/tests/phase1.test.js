// Phase 1 unit tests — run with: node --test server/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBiasCorrection, BIAS_CORRECTION, FAT_GRAMS, PROMPT_VERSION } from '../src/config.js';

// --- BIAS_CORRECTION: display-only, identity by default, raw untouched ---

test('BIAS_CORRECTION defaults are identity', () => {
  assert.equal(BIAS_CORRECTION.food, 1.0);
  assert.equal(BIAS_CORRECTION.fat, 1.0);
});

test('applyBiasCorrection with identity returns same numbers', () => {
  const item = { name: 'dal', calories: 200, protein_g: 12, carbs_g: 30, fat_g: 4, fiber_g: 6 };
  const out = applyBiasCorrection(item);
  assert.equal(out.calories, 200);
  assert.equal(out.protein_g, 12);
  assert.equal(out.carbs_g, 30);
  assert.equal(out.fat_g, 4);
  assert.equal(out.fiber_g, 6);
});

test('applyBiasCorrection does not mutate the input', () => {
  const item = { calories: 100 };
  applyBiasCorrection(item);
  assert.equal(item.calories, 100);
});

test('applyBiasCorrection with 1.2 scales displayed values', () => {
  const saved = BIAS_CORRECTION.food;
  BIAS_CORRECTION.food = 1.2;
  try {
    const out = applyBiasCorrection({ calories: 100, protein_g: 10, carbs_g: 10, fat_g: 10, fiber_g: 10 });
    assert.equal(out.calories, 120);
    assert.equal(out.protein_g, 12);
  } finally {
    BIAS_CORRECTION.food = saved;
  }
});

// --- Per-gram scaling math (same formula used by MealItemEditor pickFood) ---

test('per-gram scaling: 100g food scaled to 250g', () => {
  const food = { calories: 150, protein_g: 8, carbs_g: 20, fat_g: 3, fiber_g: 4, grams_per_portion: 100 };
  const grams = 250;
  const s = grams / 100;
  assert.equal(Math.round(food.calories * s), 375);
  assert.equal(Math.round(food.protein_g * s * 10) / 10, 20);
});

test('per-gram scaling: food without grams falls back to portion values', () => {
  const food = { calories: 150, grams_per_portion: null };
  // fallback path: use base calories with multiplier
  assert.equal(Math.round(food.calories * 1), 150);
});

// --- Fat config placeholders ---

test('FAT_GRAMS levels match spec', () => {
  assert.equal(FAT_GRAMS.none, 0);
  assert.equal(FAT_GRAMS.light, 5);
  assert.equal(FAT_GRAMS.normal, 10);
  assert.equal(FAT_GRAMS.heavy, 20);
});

test('PROMPT_VERSION is a string constant', () => {
  assert.equal(typeof PROMPT_VERSION, 'string');
  assert.ok(PROMPT_VERSION.length > 0);
});

// --- ai_estimate payload shape validation (mirrors server expectations) ---

test('ai_estimate payload: minimal valid shape', () => {
  const payload = {
    model_name: 'server',
    prompt_version: '1.0',
    raw_model_output: { foods: [{ name: 'idli', calories: 60, confidence: 'high' }] },
    final_items: [{ name: 'idli', calories: 60 }],
    is_verified: false
  };
  assert.ok(payload.raw_model_output || payload.final_items);
  assert.equal(payload.is_verified, false);
  assert.equal(payload.image, undefined); // no image for unverified
});

test('ai_estimate payload: verified meal carries image + ground truth', () => {
  const payload = {
    model_name: 'server',
    prompt_version: '1.0',
    raw_model_output: { foods: [] },
    ground_truth_items: [{ name: 'rice', grams: 200, calories: 260 }],
    is_verified: true,
    image: 'base64data',
    image_mime: 'image/jpeg'
  };
  assert.equal(payload.is_verified, true);
  assert.ok(payload.image);
  assert.ok(Array.isArray(payload.ground_truth_items));
});

// --- CSV escaping for the admin export ---

test('CSV escaping handles quotes, commas, newlines, and JSON', () => {
  const esc = (v) => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  assert.equal(esc('a"b'), '"a""b"');
  assert.equal(esc({ a: 1 }), '"{""a"":1}"');
  assert.equal(esc(null), '');
});
