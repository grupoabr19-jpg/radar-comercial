import crypto from 'node:crypto';

const COOKIE_NAME = 'radar_session';
const SESSION_SECONDS = 12 * 60 * 60;
export const MIN_PASSWORD_LENGTH = 12;

export function isValidPassword(password) {
  return typeof password === 'string'
    && password.length >= MIN_PASSWORD_LENGTH
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /[0-9]/.test(password)
    && /[^A-Za-z0-9\s]/.test(password);
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

export function verifyPassword(password, expectedPassword) {
  if (!isValidPassword(password) || !isValidPassword(expectedPassword)) return false;
  const actual = Buffer.from(password, 'utf8');
  const expected = Buffer.from(expectedPassword, 'utf8');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
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

