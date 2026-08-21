import crypto from 'crypto';
import { db, seedUserSettings } from './db.js';

export const FREE_SNAP_LIMIT = 3;
const SALT_LEN = 16;
const KEY_LEN = 32;
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5; // 5 attempts per minute

// ---- Password hashing ----
export function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LEN);
  const hash = crypto.scryptSync(password, salt, KEY_LEN);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

export function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const hash = Buffer.from(hashHex, 'hex');
  const test = crypto.scryptSync(password, salt, KEY_LEN);
  return crypto.timingSafeEqual(hash, test);
}

// ---- Token with expiry ----
// Format: base64(userId:expiryTimestamp:random)
export function createToken(userId) {
  const expiry = Date.now() + TOKEN_TTL_MS;
  const rand = crypto.randomBytes(24).toString('hex');
  return Buffer.from(`${userId}:${expiry}:${rand}`).toString('base64');
}

export function getUserIdFromToken(token) {
  if (!token) return null;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length < 2) return null;
    const userId = parseInt(parts[0], 10);
    const expiry = parseInt(parts[1], 10);
    if (isNaN(userId) || isNaN(expiry)) return null;
    if (Date.now() > expiry) return null; // token expired
    return userId;
  } catch { return null; }
}

export function isTokenExpired(token) {
  if (!token) return true;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length < 2) return true;
    const expiry = parseInt(parts[1], 10);
    return isNaN(expiry) || Date.now() > expiry;
  } catch { return true; }
}

// ---- Rate limiting (in-memory, per IP) ----
const rateLimitMap = new Map(); // ip -> [{ timestamp }]
export function rateLimit(max = RATE_LIMIT_MAX, windowMs = RATE_LIMIT_WINDOW_MS) {
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const entries = rateLimitMap.get(ip) || [];
    const recent = entries.filter(t => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: 'Too many attempts. Please wait a minute.' });
    }
    recent.push(now);
    rateLimitMap.set(ip, recent);
    next();
  };
}

// ---- Auth ----
export async function signup(email, password, name = '') {
  const existing = await db.get('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
  if (existing) {
    const err = new Error('An account with this email already exists.');
    err.code = 'EMAIL_EXISTS';
    throw err;
  }
  const hash = hashPassword(password);
  const r = await db.run(
    'INSERT INTO users(email, name, pass_hash, created_at) VALUES($1,$2,$3,$4) RETURNING id',
    [email.toLowerCase(), name, hash, Date.now()]
  );
  const userId = r.rows?.[0]?.id || r.lastInsertRowid;
  await seedUserSettings(userId);
  return { userId, token: createToken(userId) };
}

export async function login(email, password) {
  const user = await db.get('SELECT id, pass_hash FROM users WHERE email=$1', [email.toLowerCase()]);
  if (!user) {
    const err = new Error('No account found with this email.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (!verifyPassword(password, user.pass_hash)) {
    const err = new Error('Incorrect password.');
    err.code = 'WRONG_PASSWORD';
    throw err;
  }
  return { userId: user.id, token: createToken(user.id) };
}

// ---- Admin password reset (for beta — no email service needed) ----
// Usage: curl -X POST .../api/admin/reset-password -H "X-Admin-Key: ..." -d '{"email":"...","newPassword":"..."}'
export async function adminResetPassword(email, newPassword, adminKey) {
  if (adminKey !== process.env.ADMIN_KEY) {
    const err = new Error('Unauthorized.');
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  const user = await db.get('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]);
  if (!user) {
    const err = new Error('No account found with this email.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const hash = hashPassword(newPassword);
  await db.run('UPDATE users SET pass_hash=$1 WHERE id=$2', [hash, user.id]);
  return { ok: true, token: createToken(user.id) };
}

// ---- Delete account ----
export async function deleteAccount(userId) {
  await db.run('DELETE FROM meal_items WHERE meal_id IN (SELECT id FROM meals WHERE user_id=$1)', [userId]);
  await db.run('DELETE FROM meals WHERE user_id=$1', [userId]);
  await db.run('DELETE FROM settings WHERE user_id=$1', [userId]);
  await db.run('DELETE FROM water WHERE user_id=$1', [userId]);
  await db.run('DELETE FROM weight_log WHERE user_id=$1', [userId]);
  await db.run('DELETE FROM favorites WHERE user_id=$1', [userId]);
  await db.run('DELETE FROM usage_log WHERE user_id=$1', [userId]);
  await db.run('DELETE FROM users WHERE id=$1', [userId]);
}

// ---- Middleware ----
export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const userId = getUserIdFromToken(token);
  req.userId = userId !== null ? userId : 0;
  req.tokenExpired = token ? isTokenExpired(token) : false;
  next();
}

export function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const userId = getUserIdFromToken(token);
  if (userId === null) {
    return res.status(401).json({ error: 'Authentication required.', code: 'TOKEN_EXPIRED' });
  }
  req.userId = userId;
  next();
}

// ---- Quota ----
export async function isPremium(userId) {
  const row = await db.get('SELECT is_premium FROM users WHERE id=$1', [userId]);
  return row?.is_premium === 1 || row?.is_premium === '1';
}

export async function getSnapCount(userId) {
  const row = await db.get(
    "SELECT COUNT(*) as c FROM usage_log WHERE user_id=$1 AND endpoint='analyze'", [userId]
  );
  return parseInt(row?.c || 0, 10);
}

export async function logSnap(userId) {
  await db.run(
    'INSERT INTO usage_log(user_id, endpoint, created_at) VALUES($1,$2,$3)',
    [userId, 'analyze', Date.now()]
  );
}

export async function checkQuota(userId) {
  const premium = await isPremium(userId);
  const used = await getSnapCount(userId);
  const limit = FREE_SNAP_LIMIT;
  return {
    allowed: premium || used < limit,
    used, limit,
    remaining: Math.max(0, limit - used),
    isPremium: premium
  };
}

export async function setPremium(userId, premium) {
  await db.run('UPDATE users SET is_premium=$1 WHERE id=$2', [premium ? 1 : 0, userId]);
}
