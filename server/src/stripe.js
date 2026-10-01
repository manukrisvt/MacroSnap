// Stripe integration — Checkout sessions + webhook handling.
// Requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET env vars.
// Uses the REST API directly (no SDK dependency — keeps the Docker
// image lean and avoids a native-build step).

import { db } from './db.js';
import { PLANS } from '../../shared/plans.js';

const STRIPE_API = 'https://api.stripe.com/v1';

function stripeKey() {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) {
    const err = new Error('Payments not configured. Set STRIPE_SECRET_KEY.');
    err.code = 'NO_STRIPE';
    throw err;
  }
  return k;
}

async function stripeRequest(path, params) {
  const body = new URLSearchParams(params);
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json?.error?.message || `Stripe error ${res.status}`);
    err.code = 'STRIPE_ERROR';
    throw err;
  }
  return json;
}

// Create a Checkout session for a plan upgrade.
export async function createCheckoutSession(userId, email, planId, appUrl) {
  const plan = PLANS[planId];
  if (!plan || plan.priceUsd === 0) {
    const err = new Error('Unknown or free plan.');
    err.code = 'BAD_PLAN';
    throw err;
  }
  const session = await stripeRequest('/checkout/sessions', {
    mode: 'subscription',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(plan.priceUsd * 100),
    'line_items[0][price_data][recurring][interval]': 'month',
    'line_items[0][price_data][product_data][name]': `MacroSnap ${plan.label}`,
    'line_items[0][quantity]': '1',
    customer_email: email || undefined,
    client_reference_id: String(userId),
    'metadata[userId]': String(userId),
    'metadata[planId]': planId,
    'subscription_data[metadata][userId]': String(userId),
    'subscription_data[metadata][planId]': planId,
    success_url: `${appUrl}/#/settings?upgraded=1`,
    cancel_url: `${appUrl}/#/settings?canceled=1`
  });
  return { url: session.url, id: session.id };
}

// Verify webhook signature (Stripe sends v1 scheme HMAC-SHA256 over
// the raw body + timestamp).
import crypto from 'crypto';

export function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(sigHeader.split(',').map((p) => p.split('=')));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  // Reject events older than 5 minutes
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// Handle a verified webhook event: activate/deactivate the user's plan.
export async function handleStripeEvent(event) {
  const type = event.type;

  if (type === 'checkout.session.completed' || type === 'invoice.paid') {
    const meta = event.data?.object?.metadata || {};
    const subMeta = event.data?.object?.subscription_details?.metadata || {};
    const userId = Number(meta.userId || subMeta.userId);
    const planId = meta.planId || subMeta.planId;
    if (userId && PLANS[planId]) {
      const periodEnd = event.data?.object?.current_period_end;
      await db.run('UPDATE users SET plan=$1, plan_renews_at=$2, is_premium=1 WHERE id=$3',
        [planId, periodEnd ? periodEnd * 1000 : null, userId]);
      console.log(`[stripe] user ${userId} -> ${planId}`);
      return { ok: true, userId, planId };
    }
  }

  if (type === 'customer.subscription.deleted' || type === 'invoice.payment_failed') {
    const meta = event.data?.object?.metadata || {};
    const userId = Number(meta.userId);
    if (userId) {
      await db.run("UPDATE users SET plan='free', plan_renews_at=NULL, is_premium=0 WHERE id=$1", [userId]);
      console.log(`[stripe] user ${userId} -> free (${type})`);
      return { ok: true, userId, planId: 'free' };
    }
  }

  return { ok: true, ignored: type };
}
