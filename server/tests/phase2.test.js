// Phase 2 tests — shared AI prompt schema validation + context building.
// Run: node --test server/tests/phase2.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYSTEM_PROMPT, buildUserText, validateAIResponse } from '../../shared/aiPrompt.js';

// --- JSON schema validation ---

test('validates a well-formed Phase 2 response', () => {
  const out = validateAIResponse({
    items: [
      { name: 'idli', grams: 120, kcal: 130, protein_g: 4, carbs_g: 26, fat_g: 1, fiber_g: 2, confidence: 'high', assumes_added_fat: false },
      { name: 'sambar', grams: 150, kcal: 90, protein_g: 5, carbs_g: 12, fat_g: 3, fiber_g: 4, confidence: 'low', assumes_added_fat: true }
    ],
    visible_fat_cues: ['oil sheen on sambar'],
    clarifying_question: { question: 'Is this sambar or rasam?', options: ['Sambar', 'Rasam'] }
  });
  assert.equal(out.foods.length, 2);
  assert.equal(out.foods[0].calories, 130);
  assert.equal(out.foods[0].grams, 120);
  assert.equal(out.foods[1].confidence, 'low');
  assert.deepEqual(out.visible_fat_cues, ['oil sheen on sambar']);
  assert.equal(out.clarifying_question.options.length, 2);
  assert.equal(out.total_calories, 220);
  assert.equal(out.confidence, 'low'); // any low item -> overall low
});

test('rejects non-object output', () => {
  assert.throws(() => validateAIResponse('hello'), /BAD_SCHEMA|schema/i);
  assert.throws(() => validateAIResponse(null), /BAD_SCHEMA|schema/i);
});

test('rejects missing items array', () => {
  assert.throws(() => validateAIResponse({ visible_fat_cues: [] }), /schema/i);
});

test('normalizes bad values instead of throwing where possible', () => {
  const out = validateAIResponse({
    items: [{ name: 'x', grams: 'abc', kcal: -5, confidence: 'bogus' }],
    visible_fat_cues: 'not an array',
    clarifying_question: { question: 'q', options: ['a'] } // only 1 option -> dropped
  });
  assert.equal(out.foods[0].grams, 0);
  assert.equal(out.foods[0].calories, 0);
  assert.equal(out.foods[0].confidence, 'low'); // invalid -> low
  assert.deepEqual(out.visible_fat_cues, []);
  assert.equal(out.clarifying_question, null); // <2 options rejected
});

test('clarifying question with 5 options is capped to 4', () => {
  const out = validateAIResponse({
    items: [{ name: 'x', confidence: 'low' }],
    clarifying_question: { question: 'q?', options: ['a', 'b', 'c', 'd', 'e'] }
  });
  assert.equal(out.clarifying_question.options.length, 4);
});

test('accepts legacy "calories" key as fallback for "kcal"', () => {
  const out = validateAIResponse({ items: [{ name: 'x', calories: 250 }] });
  assert.equal(out.foods[0].calories, 250);
});

// --- context building for the user message ---

test('buildUserText: bare request has no context lines', () => {
  const t = buildUserText({});
  assert.equal(t, 'Analyze this meal photo and return the JSON.');
});

test('buildUserText: hint and meal source included', () => {
  const t = buildUserText({ hint: 'homemade chicken curry', mealSource: 'Home-cooked' });
  assert.ok(t.includes('User context: homemade chicken curry'));
  assert.ok(t.includes('Meal source: Home-cooked.'));
});

test('buildUserText: correction includes previous output and correction text', () => {
  const t = buildUserText({ previousOutput: { items: [] }, correctionText: 'it is 3 rotis not 2' });
  assert.ok(t.includes('Your previous estimate was:'));
  assert.ok(t.includes('it is 3 rotis not 2'));
});

test('buildUserText: clarifying answer included', () => {
  const t = buildUserText({ clarifyingAnswer: 'Sambar' });
  assert.ok(t.includes('Answer to your earlier question: Sambar'));
});

// --- prompt content sanity ---

test('system prompt instructs excluding cooking fat and reporting cues', () => {
  assert.ok(SYSTEM_PROMPT.includes('EXCLUDING added cooking fat'));
  assert.ok(SYSTEM_PROMPT.includes('visible_fat_cues'));
  assert.ok(SYSTEM_PROMPT.includes('clarifying_question'));
  assert.ok(SYSTEM_PROMPT.includes('assumes_added_fat'));
});
