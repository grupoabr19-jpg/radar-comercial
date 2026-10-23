import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, hashPassword, isValidPassword, readSession, verifyPassword } from '../server/auth.js';

test('aceita qualquer composição com no mínimo 12 caracteres', () => {
  assert.equal(isValidPassword('abcdefghijkl'), true);
  assert.equal(isValidPassword('!!!!!!!!!!!!'), true);
  assert.equal(isValidPassword('abcdefghijk'), false);
});

test('gera e valida hash de senha', async () => {
  const hash = await hashPassword('uma-senha-de-teste-segura');
  assert.equal(await verifyPassword('uma-senha-de-teste-segura', hash), true);
  assert.equal(await verifyPassword('senha-incorreta', hash), false);
});

test('assina e lê sessão', () => {
  process.env.SESSION_SECRET = 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';
  const token = createSession('thiago@example.com');
  const session = readSession({ headers: { cookie: `radar_session=${token}` } });
  assert.equal(session.email, 'thiago@example.com');
});

