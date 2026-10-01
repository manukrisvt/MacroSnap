// Phase 4 tests — recipe macro computation + fuzzy matching.
// Run: node --test server/tests/phase4.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRecipeMacros, scaleRecipeToGrams, similarity, matchRecipe, RECIPE_MATCH_THRESHOLD } from '../../shared/recipeLogic.js';

// --- recipe macro computation ---

test('computeRecipeMacros: simple 2-ingredient recipe', () => {
  // 200g rice (350 kcal/100g) + 100g dal (110 kcal/100g), cooked yield 800g
  const m = computeRecipeMacros([
    { name: 'rice', grams: 200, kcal_per_100g: 350, protein_per_100g: 7, carbs_per_100g: 77, fat_per_100g: 1, fiber_per_100g: 1 },
    { name: 'dal', grams: 100, kcal_per_100g: 110, protein_per_100g: 9, carbs_per_100g: 20, fat_per_100g: 0.5, fiber_per_100g: 8 }
  ], 800);
  // total kcal = 700 + 110 = 810; per 100g cooked = 810/8 = 101.25 -> 101.3
  assert.equal(m.kcal_per_100g, 101.3);
  // protein = 14 + 9 = 23g; per 100g = 2.875 -> 2.9
  assert.equal(m.protein_per_100g, 2.9);
});

test('computeRecipeMacros: cooking fat included as ingredient', () => {
  // 500g veggies (50 kcal/100g) + 20g oil (900 kcal/100g), yield 450g
  const m = computeRecipeMacros([
    { name: 'veggies', grams: 500, kcal_per_100g: 50, protein_per_100g: 2, carbs_per_100g: 10, fat_per_100g: 0, fiber_per_100g: 3 },
    { name: 'oil', grams: 20, kcal_per_100g: 900, protein_per_100g: 0, carbs_per_100g: 0, fat_per_100g: 100, fiber_per_100g: 0 }
  ], 450);
  // total = 250 + 180 = 430 kcal; per 100g = 95.6
  assert.equal(m.kcal_per_100g, 95.6);
  assert.equal(m.fat_per_100g, 4.4); // 20g fat / 4.5
});

test('computeRecipeMacros: rejects zero yield', () => {
  assert.throws(() => computeRecipeMacros([{ grams: 100, kcal_per_100g: 100 }], 0), /yield/);
});

test('scaleRecipeToGrams: 250g serving of a 120 kcal/100g recipe', () => {
  const item = scaleRecipeToGrams(
    { id: 1, name: 'Chicken curry', kcal_per_100g: 120, protein_per_100g: 10, carbs_per_100g: 5, fat_per_100g: 7, fiber_per_100g: 1 },
    250
  );
  assert.equal(item.calories, 300);
  assert.equal(item.protein_g, 25);
  assert.equal(item.fat_g, 17.5);
  assert.equal(item.recipe_matched, true);
  assert.equal(item.confidence, 'high');
});

// --- fuzzy matching ---

test('similarity: exact match = 1', () => {
  assert.equal(similarity('chicken curry', 'chicken curry'), 1);
});

test('similarity: case + punctuation insensitive', () => {
  assert.equal(similarity('Chicken Curry!', 'chicken curry'), 1);
});

test('similarity: subset words score high', () => {
  const s = similarity('chicken curry', 'homemade chicken curry');
  assert.ok(s >= 0.6, `expected >= 0.6, got ${s}`);
});

test('similarity: no overlap = 0', () => {
  assert.equal(similarity('pizza', 'dal'), 0);
});

test('matchRecipe: matches by name above threshold', () => {
  const recipes = [{ id: 1, name: 'Chicken curry', aliases: [] }];
  const m = matchRecipe('chicken curry', recipes);
  assert.ok(m);
  assert.equal(m.recipe.id, 1);
});

test('matchRecipe: matches by alias', () => {
  const recipes = [{ id: 2, name: 'Kerala chicken curry', aliases: ['chicken curry', 'curry chicken'] }];
  const m = matchRecipe('Chicken Curry', recipes);
  assert.ok(m);
  assert.equal(m.recipe.id, 2);
});

test('matchRecipe: below threshold returns null', () => {
  const recipes = [{ id: 1, name: 'pizza margherita', aliases: [] }];
  assert.equal(matchRecipe('dal fry', recipes), null);
});

test('matchRecipe: empty recipes returns null', () => {
  assert.equal(matchRecipe('anything', []), null);
});

test('RECIPE_MATCH_THRESHOLD is sensible', () => {
  assert.ok(RECIPE_MATCH_THRESHOLD >= 0.5 && RECIPE_MATCH_THRESHOLD <= 0.9);
});
