import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getPool } from '../server/db.js';
import { parseWorkbook, persistImport } from '../server/importer.js';

const filePath = process.argv[2];
const sheetName = process.argv[3] || 'Clientes Inativos';
if (!filePath) throw new Error('Informe o caminho do arquivo Clientes Inativos.xlsx.');

const buffer = await fs.readFile(filePath);
const parsed = await parseWorkbook(buffer, sheetName);
const client = await getPool().connect();
try {
  const summary = await persistImport(client, {
    sourceType: 'erp',
    fileName: path.basename(filePath),
    requestedSheet: sheetName,
    parsed,
    actorEmail: 'importacao-inativos@grupoabr.com.br',
  });
  console.log(JSON.stringify(summary, null, 2));
} finally {
  client.release();
  await getPool().end();
}
