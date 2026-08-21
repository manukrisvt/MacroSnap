import crypto from 'crypto';
import { db, seedUserSettings } from './db.js';

export const FREE_SNAP_LIMIT = 3;
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
  } catch { return null; }
}

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

export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const userId = getUserIdFromToken(token);
  req.userId = userId !== null ? userId : 0;
  next();
}

export function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const userId = getUserIdFromToken(token);
  if (userId === null) return res.status(401).json({ error: 'Authentication required.' });
  req.userId = userId;
  next();
}

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
