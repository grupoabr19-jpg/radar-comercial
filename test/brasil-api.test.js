import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupCep, lookupCnpj } from '../server/brasil-api.js';

test('recusa CEP inválido sem chamar serviço externo', async () => {
  await assert.rejects(lookupCep('123'), /8 dígitos/);
});

test('recusa CNPJ inválido sem chamar serviço externo', async () => {
  await assert.rejects(lookupCnpj('123'), /14 dígitos/);
});

