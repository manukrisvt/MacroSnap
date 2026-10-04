// Gamification: streaks, badges, achievements
// All stored on-device (no server changes needed)

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const STREAK_KEY = 'macrosnap_streak';
const BADGES_KEY = 'macrosnap_badges';
const LAST_LOG_KEY = 'macrosnap_last_log_date';

export async function getStreak() {
  const { value } = await Preferences.get({ key: STREAK_KEY });
  return parseInt(value || '0', 10);
}

export async function getLastLogDate() {
  const { value } = await Preferences.get({ key: LAST_LOG_KEY });
  return value || null;
}

export async function getBadges() {
  const { value } = await Preferences.get({ key: BADGES_KEY });
  return value ? JSON.parse(value) : [];
}

async function saveBadges(badges) {
  await Preferences.set({ key: BADGES_KEY, value: JSON.stringify(badges) });
}

// Called when user logs a meal — updates streak and checks for new badges
export async function onMealLogged(totalMeals, totalCalories, streakDays) {
  const today = new Date().toLocaleDateString('en-CA'); // local date as YYYY-MM-DD
  const lastLog = await getLastLogDate();
  let newStreak = streakDays || 0;

  if (lastLog !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (lastLog === yesterday) {
      newStreak = (await getStreak()) + 1;
    } else {
      newStreak = 1;
    }
    await Preferences.set({ key: STREAK_KEY, value: String(newStreak) });
    await Preferences.set({ key: LAST_LOG_KEY, value: today });
  }

  // Check for new badges
  const badges = await getBadges();
  const newBadges = [];

  const checkBadge = (id, label, emoji, condition) => {
    if (!badges.includes(id) && condition) {
      newBadges.push({ id, label, emoji });
    }
  };

  checkBadge('first_meal', 'First Meal Logged', '🍽️', totalMeals >= 1);
  checkBadge('streak_3', '3-Day Streak', '🔥', newStreak >= 3);
  checkBadge('streak_7', 'Week Warrior', '⚡', newStreak >= 7);
  checkBadge('streak_30', 'Month Master', '👑', newStreak >= 30);
  checkBadge('meals_10', '10 Meals Logged', '📈', totalMeals >= 10);
  checkBadge('meals_50', '50 Meals Logged', '🏆', totalMeals >= 50);
  checkBadge('meals_100', '100 Meals Logged', '💯', totalMeals >= 100);
  checkBadge('photo_5', 'Photo Snapper', '📸', totalMeals >= 5);
  checkBadge('calorie_goal', 'Goal Crusher', '🎯', totalCalories > 0);

  if (newBadges.length > 0) {
    const allBadges = [...badges, ...newBadges.map(b => b.id)];
    await saveBadges(allBadges);
  }

  return { streak: newStreak, newBadges };
}

export const ALL_BADGES = [
  { id: 'first_meal', label: 'First Meal Logged', emoji: '🍽️', desc: 'Log your first meal' },
  { id: 'streak_3', label: '3-Day Streak', emoji: '🔥', desc: 'Log meals 3 days in a row' },
  { id: 'streak_7', label: 'Week Warrior', emoji: '⚡', desc: '7-day streak' },
  { id: 'streak_30', label: 'Month Master', emoji: '👑', desc: '30-day streak' },
  { id: 'meals_10', label: '10 Meals', emoji: '📈', desc: 'Log 10 meals total' },
  { id: 'meals_50', label: '50 Meals', emoji: '🏆', desc: 'Log 50 meals total' },
  { id: 'meals_100', label: '100 Meals', emoji: '💯', desc: 'Log 100 meals total' },
  { id: 'photo_5', label: 'Photo Snapper', emoji: '📸', desc: 'Log 5 meals with photos' },
  { id: 'calorie_goal', label: 'Goal Crusher', emoji: '🎯', desc: 'Hit your calorie goal' },
];