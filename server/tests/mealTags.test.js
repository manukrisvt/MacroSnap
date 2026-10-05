import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMeal, bucketShares, mergeTags, BUCKET_LABELS } from '../../shared/mealTags.js';

test('classifyMeal: burger+fries+soda -> ultra_processed', () => {
  const t = classifyMeal([
    { name: 'cheeseburger', calories: 550, protein_g: 25, carbs_g: 40, fat_g: 28 },
    { name: 'fries', calories: 320, protein_g: 3, carbs_g: 40, fat_g: 15 },
    { name: 'soda', calories: 150, protein_g: 0, carbs_g: 39, fat_g: 0 },
  ]);
  assert.equal(t.processing, 'ultra_processed');
});

test('classifyMeal: grilled chicken + salad -> fresh', () => {
  const t = classifyMeal([
    { name: 'grilled chicken', calories: 300, protein_g: 40, carbs_g: 0, fat_g: 10 },
    { name: 'salad', calories: 80, protein_g: 2, carbs_g: 10, fat_g: 3 },
  ]);
  assert.equal(t.processing, 'fresh');
  assert.equal(t.profile, 'high_protein');
});

test('classifyMeal: pasta dish -> carb_heavy', () => {
  const t = classifyMeal([
    { name: 'pasta with tomato sauce', calories: 500, protein_g: 15, carbs_g: 90, fat_g: 8 },
  ]);
  assert.equal(t.profile, 'carb_heavy');
});

test('classifyMeal: empty items -> empty tags', () => {
  assert.deepEqual(classifyMeal([]), {});
});

test('mergeTags: AI tags win, retro fills gaps', () => {
  const merged = mergeTags(
    { source: 'restaurant', processing: null, profile: 'balanced' },
    [{ name: 'dal and rice', calories: 400, protein_g: 18, carbs_g: 70, fat_g: 6 }]
  );
  assert.equal(merged.source, 'restaurant'); // from AI
  assert.equal(merged.processing, 'fresh'); // derived retroactively
  assert.equal(merged.profile, 'balanced'); // from AI
});

test('mergeTags: invalid AI values fall back to retroactive', () => {
  const merged = mergeTags(
    { source: 'mars', processing: 'organic', profile: 'balanced' },
    [{ name: 'grilled fish', calories: 300, protein_g: 45, carbs_g: 0, fat_g: 10 }]
  );
  assert.equal(merged.source, null); // invalid AI value, retro can't derive source
  assert.equal(merged.processing, 'fresh'); // invalid AI value -> retroactive
  assert.equal(merged.profile, 'balanced'); // valid AI value wins over retroactive
});

test('bucketShares: percentages sum to ~100 per bucket', () => {
  const meals = [
    { date: '2026-10-01', items: [{ name: 'grilled chicken', calories: 300, protein_g: 40, carbs_g: 0, fat_g: 10 }] },
    { date: '2026-10-02', items: [{ name: 'fries', calories: 320, protein_g: 3, carbs_g: 40, fat_g: 15 }] },
    { date: '2026-10-03', items: [{ name: 'salad', calories: 80, protein_g: 2, carbs_g: 10, fat_g: 3 }] },
    { date: '2026-10-04', items: [{ name: 'pizza', calories: 600, protein_g: 20, carbs_g: 70, fat_g: 22 }] },
  ];
  const shares = bucketShares(meals);
  const procSum = Object.values(shares.overall.processing).reduce((s, n) => s + n, 0);
  assert.ok(Math.abs(procSum - 100) <= 1 || procSum === 0);
  assert.ok(shares.overall.processing.ultra_processed >= 25); // fries + pizza
  assert.ok(Object.keys(shares.weeks).length >= 1);
});

test('bucketShares: empty meals -> empty result', () => {
  const shares = bucketShares([]);
  assert.deepEqual(shares.overall, { processing: {}, profile: {} });
});

test('BUCKET_LABELS covers all bucket values', () => {
  for (const b of ['fresh', 'minimally_processed', 'ultra_processed', 'high_protein', 'balanced', 'carb_heavy', 'high_fat', 'high_sugar', 'home', 'restaurant', 'packaged']) {
    assert.ok(BUCKET_LABELS[b], `missing label for ${b}`);
  }
});
