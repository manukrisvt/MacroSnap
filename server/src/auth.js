import crypto from 'crypto';
import { db, seedUserSettings } from './db.js';

// Free tier: 3 server-side photo analyses. BYO-key users are unlimited (calls go direct).
export const FREE_SNAP_LIMIT = 3;

// Simple password hashing using Node's built-in scrypt (no external deps).
const SALT_LEN = 16;
const KEY_LEN = 32;

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

// Simple opaque token: base64(userId:random). Not JWT, but sufficient for personal use.
export function createToken(userId) {
  const rand = crypto.randomBytes(24).toString('hex');
  return Buffer.from(`${userId}:${rand}`).toString('base64');
}

export function getUserIdFromToken(token) {
  if (!token) return null;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [userId] = decoded.split(':');
    const id = parseInt(userId, 10);
    return isNaN(id) ? null : id;
  } catch {
    return null;
  }
}

export function signup(email, password, name = '') {
  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase());
  if (existing) {
    const err = new Error('An account with this email already exists.');
    err.code = 'EMAIL_EXISTS';
    throw err;
  }
  const hash = hashPassword(password);
  const info = db.prepare(
    'INSERT INTO users(email, name, pass_hash, created_at) VALUES(?,?,?,?)'
  ).run(email.toLowerCase(), name, hash, Date.now());
  const userId = info.lastInsertRowid;
  seedUserSettings(userId);
  return { userId, token: createToken(userId) };
}

export function login(email, password) {
  const user = db.prepare('SELECT id, pass_hash FROM users WHERE email=?').get(email.toLowerCase());
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

// Express middleware: extracts user_id from Authorization header.
// Falls back to user_id=0 (legacy single-user) if no token — for backward compat.
export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const userId = getUserIdFromToken(token);
  req.userId = userId !== null ? userId : 0;
  next();
}

// Strict auth: requires a valid token (for signup/login routes that don't need auth,
// and for routes that MUST have a logged-in user).
export function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const userId = getUserIdFromToken(token);
  if (userId === null) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  req.userId = userId;
  next();
}

// Check if user is premium
export function isPremium(userId) {
  const row = db.prepare('SELECT is_premium FROM users WHERE id=?').get(userId);
  return row?.is_premium === 1;
}

// Count server-side analyze calls for a user
export function getSnapCount(userId) {
  const row = db.prepare(
    `SELECT COUNT(*) as c FROM usage_log WHERE user_id=? AND endpoint='analyze'`
  ).get(userId);
  return row?.c || 0;
}

// Log a server-side analyze call
export function logSnap(userId) {
  db.prepare('INSERT INTO usage_log(user_id, endpoint, created_at) VALUES(?,?,?)')
    .run(userId, 'analyze', Date.now());
}

// Check quota — returns { allowed, used, limit, isPremium }
export function checkQuota(userId) {
  const premium = isPremium(userId);
  const used = getSnapCount(userId);
  const limit = FREE_SNAP_LIMIT;
  return {
    allowed: premium || used < limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    isPremium: premium
  };
}

// Set premium status (for manual granting or after payment)
export function setPremium(userId, premium) {
  db.prepare('UPDATE users SET is_premium=? WHERE id=?').run(premium ? 1 : 0, userId);
}
