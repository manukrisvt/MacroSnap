// Random funny food-related loading messages
const FUNNY_MESSAGES = [
  "🥑 Counting every avocado toast calorie…",
  "🍕 Debating if that's a large or extra-large pizza…",
  "🥗 Judging your salad choices…",
  "🍔 Asking the AI if that's really just one burger…",
  "🍜 Measuring noodles with a ruler…",
  "🌮 Counting hidden tacos in your photo…",
  "🥘 Calculating the damage from that biryani…",
  "🍰 Estimating how many slices you'll actually eat…",
  "🥞 Wondering if syrup counts as a beverage…",
  "🍛 Consulting the dal oracle…",
  "🥟 Counting dumplings you're pretending not to eat…",
  "🍕 Measuring cheese pull distance for calorie estimation…",
  "🥑 Converting avocado units to happiness…",
  "🍜 Asking if that ramen is 'just broth' (it's not)…",
  "🌯 Calculating the burrito's emotional weight…",
  "🧁 Estimating frosting-to-cake ratio…",
  "🍝 Measuring spaghetti by the strand (just kidding)…",
  "🥗 Judging your 'light lunch' (it's not light)…",
  "🍩 Counting the donuts you said you wouldn't eat…",
  "🍛 Asking Gemini if that curry needs more salt…",
  "🥞 Stacking pancakes for scale…",
  "🍜 Slurping noodles for research purposes…",
  "🍕 The AI is 90% sure that's pepperoni. 10% mushroom.",
  "🥘 Your meal is being judged by a robot nutritionist…",
  "🍰 Calculating how many gym sessions this costs…",
  "🥑 Good news: avocados are healthy. Bad news: calories.",
  "🌮 The AI found 3 tacos you tried to hide in the photo…",
  "🍕 Estimating pizza slice #4 you said was 'just a bite'…",
  "🍛 The dal is innocent. The rice is not.",
  "🥗 Even the AI knows you didn't eat just salad today…"
];

export function getRandomFunnyMessage() {
  return FUNNY_MESSAGES[Math.floor(Math.random() * FUNNY_MESSAGES.length)];
}