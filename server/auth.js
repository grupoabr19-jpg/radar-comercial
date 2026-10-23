import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const COOKIE_NAME = 'radar_session';
const SESSION_SECONDS = 12 * 60 * 60;
export const MIN_PASSWORD_LENGTH = 12;

export function isValidPassword(password) {
  return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(value) {
  return crypto.createHmac('sha256', sessionSecret()).update(value).digest('base64url');
}

function sessionSecret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('SESSION_SECRET deve ter pelo menos 32 caracteres.');
  return value;
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim().split(/=(.*)/s)).filter((item) => item[0]));
}

export function createSession(email) {
  const body = encode({ email, expiresAt: Date.now() + SESSION_SECONDS * 1000 });
  return `${body}.${sign(body)}`;
}

export function readSession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = sign(body);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.expiresAt > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

export async function verifyPassword(password, encodedHash) {
  if (!isValidPassword(password) || !encodedHash) return false;
  const [algorithm, nText, rText, pText, salt, expectedText] = encodedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedText) return false;
  const N = Number(nText), r = Number(rText), p = Number(pText);
  if (!Number.isInteger(N) || N < 2 || (N & (N - 1)) !== 0 || !Number.isInteger(r) || r < 1 || !Number.isInteger(p) || p < 1) return false;
  try {
    const expected = Buffer.from(expectedText, 'base64url');
    const decodedSalt = Buffer.from(salt, 'base64url');
    if (!expected.length || !decodedSalt.length) return false;
    const actual = await scrypt(password, decodedSalt, expected.length, {
      N, r, p, maxmem: 128 * 1024 * 1024,
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function hashPassword(password) {
  if (!isValidPassword(password)) {
    throw new RangeError(`A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  const N = 32768, r = 8, p = 1;
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64, { N, r, p, maxmem: 128 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function requireApiAuth(req, res, next) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: 'Sessão ausente ou expirada.' });
  req.user = session;
  next();
}

export function requirePageAuth(req, res, next) {
  const session = readSession(req);
  if (!session) return res.redirect('/login.html');
  req.user = session;
  next();
}

