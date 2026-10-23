import { getPool } from './db.js';
import { downloadGoogleSpreadsheet } from './google-sheet.js';
import { parseRetailRouteMatrix, parseWorkbook, persistImport } from './importer.js';

let activeSync = null;

async function runSync({ googleSheetUrl, actorEmail, includeCustomers }) {
  const source = await downloadGoogleSpreadsheet(googleSheetUrl);
  const jobs = [
    { sourceType: 'routes', parsed: await parseRetailRouteMatrix(source.buffer, 'Varejo') },
  ];
  if (includeCustomers) jobs.push({ sourceType: 'erp', parsed: await parseWorkbook(source.buffer, 'Base de clientes') });
  const results = [];
  for (const job of jobs) {
    const client = await getPool().connect();
    try {
      results.push(await persistImport(client, {
        sourceType: job.sourceType,
        fileName: source.fileName,
        requestedSheet: job.parsed.sheetName,
        parsed: job.parsed,
        actorEmail,
      }));
    } finally {
      client.release();
    }
  }
  return results;
}

export function syncGoogleSheet(options) {
  if (!activeSync) activeSync = runSync(options).finally(() => { activeSync = null; });
  return activeSync;
}

