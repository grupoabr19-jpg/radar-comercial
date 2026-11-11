import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupCep, lookupCnpj } from '../server/brasil-api.js';

test('recusa CEP inválido sem chamar serviço externo', async () => {
  await assert.rejects(lookupCep('123'), /8 dígitos/);
});

test('recusa CNPJ inválido sem chamar serviço externo', async () => {
  await assert.rejects(lookupCnpj('123'), /14 dígitos/);
});

test('normaliza CNAEs secundários da BrasilAPI', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      cnpj: '11222333000181',
      razao_social: 'Empresa de teste',
      cnae_fiscal: 111301,
      cnaes_secundarios: [
        { codigo: 4321500, descricao: 'Instalação elétrica' },
        { codigo: 123, descricao: 'Código inválido' },
      ],
    }),
  });
  try {
    const result = await lookupCnpj('11222333000181');
    assert.equal(result.cnae, '0111301');
    assert.deepEqual(result.secondaryCnaes, [
      { code: '4321500', description: 'Instalação elétrica' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
