import { closePool } from '../server/db.js';
import { enrichCustomersCnae } from '../server/cnae-enrichment.js';

function optionValue(name) {
  const prefix = `--${name}=`;
  const entry = process.argv.find((argument) => argument.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : null;
}

const runAll = process.argv.includes('--all');
const retryErrors = process.argv.includes('--retry-errors');
const requestedLimit = runAll ? Number.POSITIVE_INFINITY : Number(optionValue('limit') || 100);
if ((!runAll && (!Number.isInteger(requestedLimit) || requestedLimit < 1))
  || (retryErrors && runAll)) {
  console.error('Uso: npm run enrich:cnae -- [--limit=100 | --all] [--retry-errors]. Não combine --all com --retry-errors.');
  process.exitCode = 2;
} else {
  let attempted = 0;
  try {
    while (attempted < requestedLimit) {
      const batchSize = Math.min(20, requestedLimit - attempted);
      const result = await enrichCustomersCnae({
        limit: batchSize,
        retryErrors,
        actorEmail: 'script-enriquecimento@radar.local',
      });
      attempted += result.processed + result.failed;
      console.log(JSON.stringify({
        attempted,
        enriched: result.processed,
        failed: result.failed,
        remaining: result.remaining,
        failedTotal: result.failedTotal,
        missingCnpj: result.missingCnpj,
      }));
      if (!runAll || !result.remaining || (!result.processed && !result.failed)) break;
    }
  } catch (error) {
    console.error(`Falha no enriquecimento de CNAE: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
