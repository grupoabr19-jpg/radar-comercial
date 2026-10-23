import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRouteShare, buildWazeUrl, haversineKm } from '../server/navigation.js';

test('gera deep link do Waze por coordenadas', () => {
  const url = new URL(buildWazeUrl({ latitude: -22.9056, longitude: -47.0608 }));
  assert.equal(url.origin, 'https://waze.com');
  assert.equal(url.searchParams.get('ll'), '-22.9056,-47.0608');
  assert.equal(url.searchParams.get('navigate'), 'yes');
});

test('usa endereço quando não há coordenadas', () => {
  const url = new URL(buildWazeUrl({ address: 'Av. Paulista, 1000', city: 'São Paulo', state: 'SP' }));
  assert.equal(url.searchParams.get('q'), 'Av. Paulista, 1000, São Paulo, SP');
});

test('gera mensagem de WhatsApp com um link por trecho', () => {
  const result = buildRouteShare({ name: 'Eixo Norte', route_date: '2026-10-24' }, [
    { company_name: 'Cliente A', latitude: -22.9, longitude: -47.1 },
    { company_name: 'Cliente B', address: 'Rua B, 20', city: 'Sumaré', state: 'SP' },
  ]);
  assert.match(result.message, /1\. Cliente A/);
  assert.match(result.message, /2\. Cliente B/);
  assert.equal((result.message.match(/https:\/\/waze\.com\/ul/g) || []).length, 2);
  assert.match(result.whatsappUrl, /^https:\/\/wa\.me\/\?text=/);
});

test('calcula distância geográfica aproximada', () => {
  const distance = haversineKm(-22.9056, -47.0608, -22.8219, -47.2668);
  assert.ok(distance > 20 && distance < 30);
});

