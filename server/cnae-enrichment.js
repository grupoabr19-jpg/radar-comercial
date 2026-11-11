import { getPool, query } from './db.js';
import { lookupCnpj } from './brasil-api.js';
import { matchReferenceCompanies, refreshCnaeClassifications } from './segments.js';

const MAX_BATCH_SIZE = 20;
const REQUEST_DELAY_MS = 350;

function cnaeCode(value) {
  const code = String(value ?? '').replace(/\D/g, '');
  const normalized = code.length === 6 ? `0${code}` : code;
  return /^\d{7}$/.test(normalized) ? normalized : null;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function enrichCustomersCnae({ limit = 5, retryErrors = false, actorEmail = 'enriquecimento@radar.local' } = {}) {
  const batchSize = Number(limit);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    const error = new Error(`O lote deve conter entre 1 e ${MAX_BATCH_SIZE} clientes.`);
    error.status = 400;
    throw error;
  }

  const pendingClause = retryErrors
    ? 'AND customer.cnae_enrichment_error IS NOT NULL'
    : 'AND customer.cnae_enrichment_error IS NULL';
  const customers = await query(`SELECT customer.id,customer.cnpj,customer.company_name,customer.trade_name
    FROM erp_customers customer
    LEFT JOIN company_cnaes company ON company.company_id=customer.id
    WHERE (company.company_id IS NULL OR company.source_name='erp_existing')
      AND customer.cnpj IS NOT NULL
      AND length(regexp_replace(customer.cnpj,'\\D','','g'))=14
      ${pendingClause}
    ORDER BY customer.customer_code
    LIMIT $1`, [batchSize]);
  const results = [];

  for (const [index, customer] of customers.rows.entries()) {
    if (index) await delay(REQUEST_DELAY_MS);
    try {
      const details = await lookupCnpj(customer.cnpj);
      const cnae = cnaeCode(details.cnae);
      if (!cnae) throw new Error('BrasilAPI não retornou um CNAE principal válido.');
      const secondaryCnaes = [...new Set((details.secondaryCnaes || [])
        .map((item) => cnaeCode(item.code))
        .filter((code) => code && code !== cnae))];
      const names = [details.tradeName, details.companyName, customer.trade_name, customer.company_name].filter(Boolean);
      const references = await matchReferenceCompanies(names);
      const uniqueReferences = new Map(references.map((reference) => [
        `${reference.micro_segment_id}:${reference.reference_name}`,
        reference,
      ]));
      const allCnaes = [...new Set([cnae, ...secondaryCnaes])];
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        const normalizedCnpj = String(customer.cnpj).replace(/\D/g, '');
        await client.query(`INSERT INTO company_cnaes
            (company_id,cnpj,primary_cnae,secondary_cnaes,primary_description,source_name,source_updated_at,updated_at)
          VALUES ($1,$2,$3,$4,$5,'BrasilAPI/CNPJ',now(),now())
          ON CONFLICT(company_id) DO UPDATE SET
            cnpj=excluded.cnpj,primary_cnae=excluded.primary_cnae,
            secondary_cnaes=excluded.secondary_cnaes,primary_description=excluded.primary_description,
            source_name=excluded.source_name,source_updated_at=now(),updated_at=now()`,
        [customer.id, normalizedCnpj, cnae, secondaryCnaes, details.activity]);
        await client.query(`UPDATE erp_customers SET trade_name=$2,primary_cnae=$3,
            primary_cnae_description=$4,cnae_source_date=current_date,cnae_enriched_at=now(),
            cnae_enrichment_error=NULL,updated_at=now()
          WHERE id=$1`, [customer.id, details.tradeName, cnae, details.activity]);
        for (const code of allCnaes) {
          for (const reference of uniqueReferences.values()) {
            await client.query(`INSERT INTO cnae_segment_mappings
                (cnae_fiscal,macro_segment_id,micro_segment_id,reference_company_id,
                 source_customer_id,review_status,source_name)
              VALUES ($1,$2,$3,$4,$5,'approved','reference_customer_cnae')
              ON CONFLICT(cnae_fiscal,micro_segment_id) DO UPDATE SET
                reference_company_id=coalesce(cnae_segment_mappings.reference_company_id,excluded.reference_company_id),
                source_customer_id=coalesce(cnae_segment_mappings.source_customer_id,excluded.source_customer_id),
                updated_at=now()`,
            [code, reference.macro_segment_id, reference.micro_segment_id, reference.id, customer.id]);
          }
          await refreshCnaeClassifications(code, client.query.bind(client));
        }
        await client.query('COMMIT');
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error(`Falha ao reverter o enriquecimento do cliente ${customer.id}:`, rollbackError);
        }
        throw error;
      } finally {
        client.release();
      }
      results.push({
        customerId: customer.id,
        status: 'enriched',
        cnae,
        secondaryCnaes: secondaryCnaes.length,
        matchedReferences: uniqueReferences.size,
      });
    } catch (error) {
      const message = String(error?.message || 'Falha ao consultar CNAE.').slice(0, 500);
      await query(`UPDATE erp_customers
        SET cnae_enriched_at=now(),cnae_enrichment_error=$2,updated_at=now()
        WHERE id=$1`, [customer.id, message]);
      results.push({ customerId: customer.id, status: 'failed', error: message });
    }
  }

  const remaining = await query(`SELECT count(*)::int AS count
    FROM erp_customers customer
    LEFT JOIN company_cnaes company ON company.company_id=customer.id
    WHERE (company.company_id IS NULL OR company.source_name='erp_existing')
      AND customer.cnpj IS NOT NULL
      AND length(regexp_replace(customer.cnpj,'\\D','','g'))=14
      ${pendingClause}`);
  const failed = await query(`SELECT count(*)::int AS count FROM erp_customers customer
    LEFT JOIN company_cnaes company ON company.company_id=customer.id
    WHERE (company.company_id IS NULL OR company.source_name='erp_existing')
      AND customer.cnae_enrichment_error IS NOT NULL`);
  const missingCnpj = await query(`SELECT count(*)::int AS count FROM erp_customers
    WHERE (id NOT IN (SELECT company_id FROM company_cnaes)
      OR EXISTS (SELECT 1 FROM company_cnaes WHERE company_id=erp_customers.id AND source_name='erp_existing'))
      AND (cnpj IS NULL OR length(regexp_replace(cnpj,'\\D','','g'))<>14)`);
  await query(`INSERT INTO audit_events(actor_email,action,entity_type,metadata)
    VALUES ($1,'enrich_customer_cnaes','erp_customers',$2)`, [
    actorEmail,
    { requested: batchSize, processed: results.filter((item) => item.status === 'enriched').length,
      failed: results.filter((item) => item.status === 'failed').length,
      secondaryCnaes: results.reduce((count, item) => count + (item.secondaryCnaes || 0), 0) },
  ]);
  return {
    requested: batchSize,
    processed: results.filter((item) => item.status === 'enriched').length,
    failed: results.filter((item) => item.status === 'failed').length,
    remaining: remaining.rows[0].count,
    failedTotal: failed.rows[0].count,
    missingCnpj: missingCnpj.rows[0].count,
    results,
  };
}

export const MAX_CNAE_ENRICHMENT_BATCH_SIZE = MAX_BATCH_SIZE;
