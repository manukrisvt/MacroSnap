// Onboarding plan calculation tests.
// Run: node --test server/tests/onboarding.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePlan, calcBMR, macroPct, pctToGrams, validateMacroSum, CONFIG } from '../../shared/planCalc.js';

const BASE = { goal: 'lose', sex: 'male', birthYear: 1990, heightCm: 175, weightKg: 80, activity: 'moderate', pace: 0.5, diet: 'non_veg', macroStyle: 'balanced' };

// --- BMR (Mifflin-St Jeor) ---
test('BMR male: 80kg, 175cm, 35y = 1724', () => {
  assert.equal(calcBMR('male', 80, 175, 35), 1724);
});
test('BMR female: 60kg, 160cm, 30y = 1289', () => {
  assert.equal(calcBMR('female', 60, 160, 30), 1289);
});

// --- Full plan: lose 0.5 kg/wk ---
test('lose 0.5 kg/wk: target = TDEE - 550', () => {
  const p = calculatePlan(BASE);
  const age = new Date().getFullYear() - 1990; // calcAge
  assert.equal(p.bmr, calcBMR('male', 80, 175, age));
  assert.equal(p.tdee, Math.round(calcBMR('male', 80, 175, age) * 1.55));
  assert.equal(p.target, p.tdee - 550);
  assert.equal(p.pace, 0.5);
  assert.deepEqual(p.notes, []);
});

test('gain 0.25 kg/wk: target = TDEE + 275', () => {
  const p = calculatePlan({ ...BASE, goal: 'gain', pace: 0.25 });
  assert.equal(p.target, p.tdee + 275);
});

test('maintain: target = TDEE, pace 0', () => {
  const p = calculatePlan({ ...BASE, goal: 'maintain' });
  assert.equal(p.target, p.tdee);
  assert.equal(p.pace, 0);
});

// --- Guardrails ---
test('pace capped at 0.75 with neutral note', () => {
  const p = calculatePlan({ ...BASE, pace: 1.0 });
  assert.equal(p.pace, 0.75);
  assert.ok(p.notes.some((n) => n.includes('capped your pace at 0.75')));
});

test('calorie floor: small woman, aggressive deficit -> 1200 floor', () => {
  const p = calculatePlan({ ...BASE, sex: 'female', weightKg: 50, heightCm: 155, birthYear: 1995, pace: 0.75, activity: 'sedentary' });
  assert.ok(p.target >= 1200);
  assert.ok(p.notes.some((n) => n.includes('raised your target')));
});

test('under 18 forced to maintain with note', () => {
  const p = calculatePlan({ ...BASE, birthYear: new Date().getFullYear() - 16 });
  assert.equal(p.goal, 'maintain');
  assert.ok(p.notes.some((n) => n.includes('under 18')));
});

test('pregnant forced to maintain with note', () => {
  const p = calculatePlan({ ...BASE, pregnant: true });
  assert.equal(p.goal, 'maintain');
  assert.ok(p.notes.some((n) => n.includes('Pregnant')));
});

// --- Macro presets ---
test('balanced: protein 1.6 g/kg, fat 30%, carbs remainder', () => {
  const p = calculatePlan(BASE); // 80kg -> 128g protein
  assert.equal(p.macros.protein, 128);
  const fatKcal = p.target * 0.30;
  assert.equal(p.macros.fat, Math.round(fatKcal / 9));
  const carbsKcal = p.target - 128 * 4 - p.macros.fat * 9;
  assert.equal(p.macros.carbs, Math.round(carbsKcal / 4));
});

test('high protein: 2.0 g/kg', () => {
  const p = calculatePlan({ ...BASE, macroStyle: 'high_protein' });
  assert.equal(p.macros.protein, 160); // 80 * 2.0
});

test('lower carb: carbs never below 100g', () => {
  // Small target that would push carbs below 100
  const p = calculatePlan({ ...BASE, sex: 'female', weightKg: 50, heightCm: 160, birthYear: 1995, activity: 'sedentary', macroStyle: 'lower_carb' });
  assert.ok(p.macros.carbs >= 100);
});

// --- Veg protein warning ---
test('veg + high protein (2.0 g/kg > 1.2) triggers warning with sources', () => {
  const p = calculatePlan({ ...BASE, diet: 'veg', macroStyle: 'high_protein' });
  assert.ok(p.vegWarn);
  assert.ok(p.vegWarn.sources.includes('paneer'));
  assert.equal(p.vegWarn.moderateProteinG, 96); // 80 * 1.2
});

test('veg + balanced (1.6 g/kg > 1.2) also warns', () => {
  const p = calculatePlan({ ...BASE, diet: 'veg' });
  assert.ok(p.vegWarn);
});

test('non-veg never warns', () => {
  const p = calculatePlan({ ...BASE, macroStyle: 'high_protein' });
  assert.equal(p.vegWarn, null);
});

test('vegan warning lists vegan sources only', () => {
  const p = calculatePlan({ ...BASE, diet: 'vegan', macroStyle: 'high_protein' });
  assert.ok(p.vegWarn.sources.includes('tofu'));
  assert.ok(!p.vegWarn.sources.includes('paneer'));
});

// --- % <-> grams conversion + validation ---
test('macroPct sums to ~100', () => {
  const pct = macroPct({ protein: 128, carbs: 200, fat: 70 });
  const sum = pct.protein + pct.carbs + pct.fat;
  assert.ok(sum >= 98 && sum <= 102);
});

test('pctToGrams round-trips', () => {
  const g = pctToGrams(2000, { proteinPct: 30, carbsPct: 40, fatPct: 30 });
  assert.equal(g.protein, 150); // 600/4
  assert.equal(g.carbs, 200);   // 800/4
  assert.equal(g.fat, 67);      // 600/9
});

test('validateMacroSum: matching macros pass', () => {
  const v = validateMacroSum(2003, { protein: 150, carbs: 200, fat: 67 });
  assert.ok(v.ok);
  assert.equal(v.mismatchPct, 0);
});

test('validateMacroSum: 10% mismatch fails with pct shown', () => {
  const v = validateMacroSum(2000, { protein: 150, carbs: 200, fat: 100 });
  assert.ok(!v.ok);
  assert.ok(v.mismatchPct > 5);
});

test('validateMacroSum: within 5% tolerance passes', () => {
  const v = validateMacroSum(2000, { protein: 150, carbs: 200, fat: 70 });
  // sum = 600+800+630 = 2030 -> 1.5% off
  assert.ok(v.ok);
  assert.equal(v.mismatchPct, 1.5);
});

// --- Weeks to goal ---
test('weeksToGoal: 10kg at 0.5/wk = 20 weeks', () => {
  const p = calculatePlan({ ...BASE, goalWeightKg: 70 });
  assert.equal(p.weeksToGoal, 20);
});

// --- Fiber scales with calories ---
test('fiber = 14g per 1000 kcal', () => {
  const p = calculatePlan(BASE);
  assert.equal(p.macros.fiber, Math.round((p.target / 1000) * 14));
});
