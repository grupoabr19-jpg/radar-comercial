import test from 'node:test';
import assert from 'node:assert/strict';
import { googleSpreadsheetId } from '../server/google-sheet.js';

test('extrai o ID de um link compartilhado do Google Sheets', () => {
  assert.equal(
    googleSpreadsheetId('https://docs.google.com/spreadsheets/d/18WarJapxqvW4s61k5rjE4qTGsDorr29rJ9QkOG0IO2M/edit?usp=sharing'),
    '18WarJapxqvW4s61k5rjE4qTGsDorr29rJ9QkOG0IO2M',
  );
});

test('recusa hosts externos na importação por URL', () => {
  assert.throws(() => googleSpreadsheetId('https://example.com/spreadsheets/d/abc/edit'), /docs\.google\.com/);
});
