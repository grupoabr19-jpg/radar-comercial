import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, isValidPassword, readSession, verifyPassword } from '../server/auth.js';

test('exige 12 caracteres, maiúscula, minúscula, número e símbolo', () => {
  assert.equal(isValidPassword('MinhaSenha@2027'), true);
  assert.equal(isValidPassword('minhasenha@2027'), false);
  assert.equal(isValidPassword('MINHASENHA@2027'), false);
  assert.equal(isValidPassword('MinhaSenha@abc'), false);
  assert.equal(isValidPassword('MinhaSenha2027'), false);
  assert.equal(isValidPassword('Senha@2027'), false);
});

test('compara diretamente a senha configurada', () => {
  assert.equal(verifyPassword('MinhaSenha@2027', 'MinhaSenha@2027'), true);
  assert.equal(verifyPassword('SenhaErrada@2027', 'MinhaSenha@2027'), false);
  assert.equal(verifyPassword('MinhaSenha@2027', ''), false);
});

test('assina e lê sessão', () => {
  process.env.SESSION_SECRET = 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';
  const token = createSession('thiago@example.com');
  const session = readSession({ headers: { cookie: `radar_session=${token}` } });
  assert.equal(session.email, 'thiago@example.com');
});

