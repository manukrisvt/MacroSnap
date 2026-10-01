// Phase 3 tests — cooking fat computation + defaults.
// Run: node --test server/tests/phase3.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAT_GRAMS, FAT_KCAL_PER_G, computeFatItem, defaultFatLevel } from '../../shared/fatConfig.js';

test('FAT_GRAMS levels match spec', () => {
  assert.equal(FAT_GRAMS.none, 0);
  assert.equal(FAT_GRAMS.light, 5);
  assert.equal(FAT_GRAMS.normal, 10);
  assert.equal(FAT_GRAMS.heavy, 20);
});

test('computeFatItem: normal ghee = 90 kcal, 10g fat', () => {
  const it = computeFatItem('normal', 'ghee');
  assert.equal(it.calories, 90); // 10g * 9 kcal/g
  assert.equal(it.fat_g, 10);
  assert.equal(it.protein_g, 0);
  assert.equal(it.carbs_g, 0);
  assert.equal(it.name, 'Cooking fat (ghee)');
  assert.equal(it.is_cooking_fat, true);
});

test('computeFatItem: light oil = 45 kcal, 5g fat', () => {
  const it = computeFatItem('light', 'oil');
  assert.equal(it.calories, 45);
  assert.equal(it.fat_g, 5);
});

test('computeFatItem: none = 0 kcal', () => {
  const it = computeFatItem('none', 'oil');
  assert.equal(it.calories, 0);
  assert.equal(it.fat_g, 0);
  assert.equal(it.name, 'Cooking fat (none)');
});

test('computeFatItem: heavy butter = 180 kcal, 20g fat', () => {
  const it = computeFatItem('heavy', 'butter');
  assert.equal(it.calories, 180);
  assert.equal(it.fat_g, 20);
});

test('computeFatItem: unknown level treated as 0', () => {
  const it = computeFatItem('bogus', 'oil');
  assert.equal(it.calories, 0);
});

test('defaultFatLevel: visible cues -> normal', () => {
  assert.equal(defaultFatLevel(['oil sheen'], null), 'normal');
  assert.equal(defaultFatLevel(['oil sheen'], 'Home-cooked'), 'normal');
});

test('defaultFatLevel: restaurant -> normal', () => {
  assert.equal(defaultFatLevel([], 'Restaurant'), 'normal');
});

test('defaultFatLevel: no cues, home-cooked or unknown -> light', () => {
  assert.equal(defaultFatLevel([], 'Home-cooked'), 'light');
  assert.equal(defaultFatLevel([], null), 'light');
  assert.equal(defaultFatLevel([], 'Packaged'), 'light');
});

test('fat kcal math is consistent across all levels', () => {
  for (const [level, grams] of Object.entries(FAT_GRAMS)) {
    const it = computeFatItem(level, 'oil');
    assert.equal(it.calories, grams * FAT_KCAL_PER_G);
    assert.equal(it.fat_g, grams);
  }
});
