// Random warm, food-positive loading messages.
// Tone: curious, celebratory, zero judgment. Food is nourishment and joy —
// never "damage," "guilt," or something to be "judged."
const LOADING_MESSAGES = [
  "🥑 Appreciating that avocado toast…",
  "🍕 Identifying every delicious topping…",
  "🥗 Noting all the colors on your plate…",
  "🍔 Getting to know your burger…",
  "🍜 Estimating those cozy noodles…",
  "🌮 Counting the tacos (they deserve it)…",
  "🥘 Savoring that biryani, one grain at a time…",
  "🍰 Admiring your dessert choice…",
  "🥞 Pancakes detected — excellent decision…",
  "🍛 Consulting the dal oracle…",
  "🥟 Appreciating every dumpling…",
  "🍕 Measuring the cheese pull (for science)…",
  "🥑 Converting avocado units to happiness…",
  "🍜 That ramen looks wonderfully comforting…",
  "🌯 Appreciating a perfectly wrapped burrito…",
  "🧁 Calculating the frosting-to-cake ratio…",
  "🍝 Spaghetti measured and celebrated…",
  "🥗 Fresh greens identified — nice…",
  "🍩 Donuts spotted — a classic for a reason…",
  "🍛 Asking Gemini if that curry needs more salt…",
  "🥞 Stacking pancakes for scale…",
  "🍜 Noodles slurped for research purposes…",
  "🍕 The AI is 90% sure that's pepperoni. 10% mushroom.",
  "🥘 Your meal is being admired by a robot nutritionist…",
  "🍰 Dessert appreciated, macros estimated…",
  "🥑 Avocados: delicious AND nutritious…",
  "🌮 Three tacos found — a well-balanced trio…",
  "🍕 Every slice counted, none judged…",
  "🍛 The dal and rice are both wonderful…",
  "🥗 Salads and everything else — all food is good food…",
  "🍲 A good meal is worth remembering…",
  "🥗 Food is fuel, and yours looks great…",
  "🍛 Estimating with love, not judgment…",
  "🍜 Warm food, warm numbers…",
  "🥘 Every cuisine welcome here…"
];

export function getRandomFunnyMessage() {
  return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
}
