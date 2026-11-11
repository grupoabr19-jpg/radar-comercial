import test from 'node:test';
import assert from 'node:assert/strict';
import { detectVisitPhotoContentType } from '../server/visit-media.js';

test('detects supported JPEG, PNG, and WebP photo signatures', () => {
  assert.equal(detectVisitPhotoContentType(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg');
  assert.equal(
    detectVisitPhotoContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/png',
  );
  assert.equal(detectVisitPhotoContentType(Buffer.from('RIFF0000WEBP')), 'image/webp');
});

test('rejects unknown and incomplete photo data', () => {
  assert.equal(detectVisitPhotoContentType(Buffer.from('not an image')), null);
  assert.equal(detectVisitPhotoContentType(Buffer.from([0xff, 0xd8])), null);
  assert.equal(detectVisitPhotoContentType(null), null);
});
