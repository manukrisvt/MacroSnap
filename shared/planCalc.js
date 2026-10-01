// ─────────────────────────────────────────────────────────────
// Plan calculation — BMR → activity → TDEE → goal delta → target
// + macro presets, guardrails, veg protein warning.
// Shared config so every number is tunable in ONE place.
// ─────────────────────────────────────────────────────────────

export const CONFIG = {
  // Protein floor for Balanced / Lower-carb styles (g per kg body weight)
  PROTEIN_G_PER_KG: 1.6,
  ACTIVITY: {
    sedentary: { mult: 1.2, label: 'Mostly sitting', desc: 'Desk job, little or no exercise' },
    light: { mult: 1.375, label: 'Lightly active', desc: 'Walks, light exercise 1–3 days a week' },
    moderate: { mult: 1.55, label: 'Moderately active', desc: 'Exercise 3–5 days a week' },
    active: { mult: 1.725, label: 'Very active', desc: 'Hard exercise 6–7 days a week' }
  },
  PACES: [0.25, 0.5, 0.75], // kg per week
  MAX_PACE: 0.75,
  CALORIE_FLOOR: { male: 1500, female: 1200 },
  KCAL_PER_KG_WEIGHT: 7700, // energy density of body weight change
  MACRO_STYLES: {
    balanced: {
      label: 'Balanced',
      desc: 'Protein at 1.6 g/kg, fat 30%, carbs the rest',
      proteinGPerKg: null, // uses PROTEIN_G_PER_KG
      fatPct: 0.30,
      minCarbsG: 0
    },
    high_protein: {
      label: 'High protein',
      desc: 'Protein 2.0 g/kg to stay full and keep muscle',
      proteinGPerKg: 2.0,
      fatPct: 0.25,
      minCarbsG: 0
    },
    lower_carb: {
      label: 'Lower carb',
      desc: 'Fat 40%, carbs capped — never below 100 g',
      proteinGPerKg: null,
      fatPct: 0.40,
      minCarbsG: 100
    }
  },
  LOW_CARB_MIN_G: 100,
  VEG_PROTEIN_WARN_G_PER_KG: 1.2,
  MODERATE_PROTEIN_G_PER_KG: 1.2,
  FIBER_PER_1000_KCAL: 14,
  MIN_AGE: 18,
  KCAL_PER_G: { protein: 4, carbs: 4, fat: 9 }
};

// Mifflin-St Jeor BMR
export function calcBMR(sex, weightKg, heightCm, age) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(sex === 'male' ? base + 5 : base - 161);
}

export function calcAge(birthYear) {
  return new Date().getFullYear() - Number(birthYear);
}

// The full plan. answers: { goal, sex, birthYear, heightCm, weightKg,
//   activity, pace, goalWeightKg, diet, macroStyle, pregnant }
// Returns { bmr, tdee, target, pace, notes[], macros, vegWarn, style }
export function calculatePlan(answers) {
  const notes = [];
  const age = calcAge(answers.birthYear);
  const weightKg = Number(answers.weightKg);
  const heightCm = Number(answers.heightCm);
  const sex = answers.sex === 'male' ? 'male' : 'female';

  const bmr = calcBMR(sex, weightKg, heightCm, age);
  const mult = CONFIG.ACTIVITY[answers.activity]?.mult || 1.2;
  const tdee = Math.round(bmr * mult);

  let goal = answers.goal; // may be overridden by guardrails
  let pace = Number(answers.pace) || 0.5;

  // Guardrail: under 18 — no deficit/surplus
  if (age < CONFIG.MIN_AGE && goal !== 'maintain') {
    goal = 'maintain';
    notes.push('You’re under 18, so we set this to maintain — talk to a doctor before changing it.');
  }
  // Guardrail: pregnant/breastfeeding — maintain
  if (answers.pregnant && goal !== 'maintain') {
    goal = 'maintain';
    notes.push('Pregnant or breastfeeding — we set this to maintain. Please talk to your doctor.');
  }

  // Guardrail: pace cap
  if (goal !== 'maintain') {
    if (pace > CONFIG.MAX_PACE) {
      notes.push(`We capped your pace at ${CONFIG.MAX_PACE} kg/week for safety.`);
      pace = CONFIG.MAX_PACE;
    }
  } else {
    pace = 0;
  }

  // Target calories
  let target = tdee;
  if (goal === 'lose') target = tdee - Math.round((pace * CONFIG.KCAL_PER_KG_WEIGHT) / 7);
  if (goal === 'gain') target = tdee + Math.round((pace * CONFIG.KCAL_PER_KG_WEIGHT) / 7);

  // Guardrail: calorie floor
  const floor = CONFIG.CALORIE_FLOOR[sex];
  if (target < floor) {
    notes.push(`We raised your target to ${floor} kcal — going lower isn’t safe.`);
    target = floor;
  }

  // Macros from style
  const style = CONFIG.MACRO_STYLES[answers.macroStyle] || CONFIG.MACRO_STYLES.balanced;
  const proteinGPerKg = style.proteinGPerKg || CONFIG.PROTEIN_G_PER_KG;
  let protein = Math.round(weightKg * proteinGPerKg);
  let fat = Math.round((target * style.fatPct) / CONFIG.KCAL_PER_G.fat);
  let carbs = Math.round((target - protein * 4 - fat * 9) / CONFIG.KCAL_PER_G.carbs);

  // Lower-carb floor
  if (style.minCarbsG > 0 && carbs < style.minCarbsG) {
    carbs = style.minCarbsG;
    // rebalance fat downward to keep kcal near target
    fat = Math.max(30, Math.round((target - protein * 4 - carbs * 4) / 9));
  }
  if (carbs < 0) carbs = 0;

  const fiber = Math.round((target / 1000) * CONFIG.FIBER_PER_1000_KCAL);

  // Veg protein warning
  const vegWarn =
    (answers.diet === 'veg' || answers.diet === 'vegan') && proteinGPerKg > CONFIG.VEG_PROTEIN_WARN_G_PER_KG
      ? {
          gPerKg: proteinGPerKg,
          moderateProteinG: Math.round(weightKg * CONFIG.MODERATE_PROTEIN_G_PER_KG),
          sources:
            answers.diet === 'vegan'
              ? 'dal, soy chunks, tofu, peanut butter, protein powder'
              : 'paneer, curd, dal, soy, whey'
        }
      : null;

  // Weeks to goal weight (if provided)
  let weeksToGoal = null;
  if (answers.goalWeightKg && pace > 0) {
    const delta = Math.abs(weightKg - Number(answers.goalWeightKg));
    weeksToGoal = delta > 0 ? Math.ceil(delta / pace) : 0;
  }

  return {
    bmr, tdee, target, pace, goal, notes, weeksToGoal, vegWarn, style: answers.macroStyle,
    macros: { protein, carbs, fat, fiber },
    macroKcalPct: macroPct({ protein, carbs, fat })
  };
}

// % of calories per macro
export function macroPct({ protein, carbs, fat }) {
  const p = protein * 4, c = carbs * 4, f = fat * 9;
  const total = p + c + f || 1;
  return {
    protein: Math.round((p / total) * 100),
    carbs: Math.round((c / total) * 100),
    fat: Math.round((f / total) * 100)
  };
}

// Convert % of a calorie target to grams
export function pctToGrams(target, { proteinPct, carbsPct, fatPct }) {
  return {
    protein: Math.round((target * proteinPct / 100) / 4),
    carbs: Math.round((target * carbsPct / 100) / 4),
    fat: Math.round((target * fatPct / 100) / 9)
  };
}

// Validate that macro grams sum to within ±5% of the calorie target.
// Returns { ok, sumKcal, mismatchPct }
export function validateMacroSum(target, { protein, carbs, fat }) {
  const sumKcal = protein * 4 + carbs * 4 + fat * 9;
  const mismatchPct = target > 0 ? Math.abs(sumKcal - target) / target * 100 : 0;
  return { ok: mismatchPct <= 5, sumKcal: Math.round(sumKcal), mismatchPct: Math.round(mismatchPct * 10) / 10 };
}

// Unit conversions
export const kgToLb = (kg) => Math.round(kg * 2.20462 * 10) / 10;
export const lbToKg = (lb) => Math.round(lb / 2.20462 * 10) / 10;
export const cmToFtIn = (cm) => {
  const totalIn = Math.round(cm / 2.54);
  return { ft: Math.floor(totalIn / 12), in: totalIn % 12 };
};
export const ftInToCm = (ft, inch) => Math.round((Number(ft) * 12 + Number(inch)) * 2.54);
