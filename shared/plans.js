// ─────────────────────────────────────────────────────────────
// Subscription tiers — single source of truth for plans, prices,
// and snap limits. Tune everything here.
// ─────────────────────────────────────────────────────────────

export const PLANS = {
  free: {
    id: 'free',
    label: 'Free',
    priceUsd: 0,
    snapsPerMonth: 3,      // lifetime for free tier (not monthly)
    lifetimeQuota: true,
    tagline: 'Try it out'
  },
  basic: {
    id: 'basic',
    label: 'Basic',
    priceUsd: 2,
    snapsPerMonth: 90,    // ~3/day
    lifetimeQuota: false,
    tagline: 'For daily tracking'
  },
  plus: {
    id: 'plus',
    label: 'Plus',
    priceUsd: 10,
    snapsPerMonth: 500,   // ~16/day
    lifetimeQuota: false,
    tagline: 'For power users'
  }
};

export const PLAN_ORDER = ['free', 'basic', 'plus'];

export function getPlan(planId) {
  return PLANS[planId] || PLANS.free;
}

// Monthly quota window: calendar month, UTC
export function monthStart() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}
