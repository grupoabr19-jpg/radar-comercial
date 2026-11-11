import { getPool, query } from './db.js';

function normalizedCompanyName(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/&/g, ' E ')
    .replace(/\b(SOCIEDADE|COMERCIAL|INDUSTRIA|INDUSTRIAL|LTDA|LIMITADA|EIRELI|ME|EPP|S\s*A|SA)\b/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function companyMatchesReference(companyName, referenceName) {
  const company = normalizedCompanyName(companyName);
  const reference = normalizedCompanyName(referenceName);
  return Boolean(company && reference && (
    company === reference || company.startsWith(`${reference} `)
  ));
}

let referenceCompaniesCache;

async function referenceCompanies() {
  if (!referenceCompaniesCache) {
    referenceCompaniesCache = query(`SELECT reference.id,reference.reference_name,
        micro.id AS micro_segment_id,micro.name AS micro_segment,
        macro.id AS macro_segment_id,macro.name AS macro_segment
      FROM segment_reference_companies reference
      JOIN micro_segments micro ON micro.id=reference.micro_segment_id
      JOIN macro_segments macro ON macro.id=micro.macro_segment_id`)
      .then((result) => result.rows)
      .catch((error) => {
        referenceCompaniesCache = undefined;
        throw error;
      });
  }
  return referenceCompaniesCache;
}

export async function refreshCnaeClassifications(cnae, executor = query) {
  await executor(`WITH unambiguous_mappings AS (
      SELECT cnae_fiscal,min(macro_segment_id)::bigint AS macro_segment_id,
        min(micro_segment_id)::bigint AS micro_segment_id
      FROM cnae_segment_mappings
      WHERE review_status='approved'
      GROUP BY cnae_fiscal
      HAVING count(DISTINCT (macro_segment_id,micro_segment_id))=1
    ), customer_segments AS (
      SELECT company.company_id,
        count(DISTINCT (mapping.macro_segment_id,mapping.micro_segment_id))
          FILTER (WHERE mapping.cnae_fiscal IS NOT NULL)::int AS segment_count,
        min(mapping.macro_segment_id)::bigint AS macro_segment_id,
        min(mapping.micro_segment_id)::bigint AS micro_segment_id
      FROM company_cnaes company
      CROSS JOIN LATERAL unnest(ARRAY[company.primary_cnae] || company.secondary_cnaes) AS code(cnae)
      LEFT JOIN unambiguous_mappings mapping ON mapping.cnae_fiscal=code.cnae
      WHERE $1=code.cnae
      GROUP BY company.company_id
    )
    UPDATE erp_customers customer
    SET macro_segment_id=CASE WHEN resolved.segment_count=1 THEN resolved.macro_segment_id ELSE NULL END,
        micro_segment_id=CASE WHEN resolved.segment_count=1 THEN resolved.micro_segment_id ELSE NULL END,
        segment_source=CASE WHEN resolved.segment_count=1 THEN 'cnae_mapping' ELSE NULL END,
        updated_at=now()
    FROM customer_segments resolved
    WHERE customer.id=resolved.company_id
      AND (customer.segment_source IS NULL OR customer.segment_source='cnae_mapping')`, [cnae]);
  await executor(`UPDATE prospects prospect
    SET macro_segment_id=seed.macro_segment_id,
        micro_segment_id=seed.micro_segment_id,updated_at=now()
    FROM erp_customers seed
    WHERE prospect.matched_seed_cnae=$1
      AND prospect.matched_seed_customer_id=seed.id`, [
    cnae,
  ]);
}

export async function matchReferenceCompanies(names) {
  const candidates = names.filter(Boolean);
  if (!candidates.length) return [];
  const rows = await referenceCompanies();
  return rows.filter((row) =>
    candidates.some((name) => companyMatchesReference(name, row.reference_name)));
}

export async function reconcileReferenceSegmentMappings() {
  const [references, customers] = await Promise.all([
    referenceCompanies(),
    query(`SELECT customer.id,customer.primary_cnae,customer.company_name,customer.trade_name,
        company.primary_cnae AS reference_primary_cnae,
        company.secondary_cnaes AS reference_secondary_cnaes
      FROM erp_customers customer
      LEFT JOIN company_cnaes company ON company.company_id=customer.id`),
  ]);
  const inserted = new Set();
  const matchedCustomers = new Set();

  for (const customer of customers.rows) {
    const names = [customer.trade_name, customer.company_name].filter(Boolean);
    const matches = references.filter((reference) =>
      names.some((name) => companyMatchesReference(name, reference.reference_name)));
    if (!matches.length) continue;
    matchedCustomers.add(customer.id);

    const distinctSegments = new Map(matches.map((reference) => [
      `${reference.macro_segment_id}:${reference.micro_segment_id}`,
      reference,
    ]));
    if (distinctSegments.size === 1) {
      const reference = distinctSegments.values().next().value;
      await query(`UPDATE erp_customers
        SET macro_segment_id=$2,micro_segment_id=$3,segment_source='reference_name',updated_at=now()
        WHERE id=$1`, [customer.id, reference.macro_segment_id, reference.micro_segment_id]);
    } else {
      await query(`UPDATE erp_customers
        SET macro_segment_id=NULL,micro_segment_id=NULL,segment_source=NULL,updated_at=now()
        WHERE id=$1`, [customer.id]);
    }

    const cnaes = new Set([
      customer.reference_primary_cnae,
      ...(customer.reference_secondary_cnaes || []),
    ].filter((cnae) => /^\d{7}$/.test(cnae || '')));
    for (const cnae of cnaes) {
      for (const reference of matches) {
        const result = await query(`INSERT INTO cnae_segment_mappings
            (cnae_fiscal,macro_segment_id,micro_segment_id,reference_company_id,
             source_customer_id,review_status,source_name)
          VALUES ($1,$2,$3,$4,$5,'approved','reference_customer_cnae')
          ON CONFLICT(cnae_fiscal,micro_segment_id) DO UPDATE SET
            reference_company_id=coalesce(cnae_segment_mappings.reference_company_id,excluded.reference_company_id),
            source_customer_id=coalesce(cnae_segment_mappings.source_customer_id,excluded.source_customer_id),
            updated_at=now()
          RETURNING cnae_fiscal`,
        [cnae, reference.macro_segment_id, reference.micro_segment_id, reference.id, customer.id]);
        if (result.rowCount) inserted.add(cnae);
      }
    }
  }

  for (const cnae of inserted) await refreshCnaeClassifications(cnae);
  return {
    mappedCnaes: inserted.size,
    referenceCustomers: matchedCustomers.size,
    unambiguousCustomers: customers.rows.filter((customer) => {
      const names = [customer.trade_name, customer.company_name].filter(Boolean);
      const pairs = new Set(references.filter((reference) =>
        names.some((name) => companyMatchesReference(name, reference.reference_name)))
        .map((reference) => `${reference.macro_segment_id}:${reference.micro_segment_id}`));
      return pairs.size === 1;
    }).length,
  };
}

export async function listSegments() {
  const [taxonomy, mappings] = await Promise.all([
    query(`SELECT macro.id AS macro_segment_id,macro.name AS macro_segment,
        micro.id AS micro_segment_id,micro.name AS micro_segment,
        count(reference.id)::int AS reference_company_count
      FROM macro_segments macro
      JOIN micro_segments micro ON micro.macro_segment_id=macro.id
      LEFT JOIN segment_reference_companies reference ON reference.micro_segment_id=micro.id
      GROUP BY macro.id,macro.name,micro.id,micro.name
      ORDER BY macro.name,micro.name`),
    query(`SELECT mapping.cnae_fiscal,mapping.review_status,mapping.source_name,
        mapping.updated_at,macro.name AS macro_segment,micro.name AS micro_segment,
        reference.reference_name,customer.company_name AS source_customer
      FROM cnae_segment_mappings mapping
      JOIN macro_segments macro ON macro.id=mapping.macro_segment_id
      JOIN micro_segments micro ON micro.id=mapping.micro_segment_id
      LEFT JOIN segment_reference_companies reference ON reference.id=mapping.reference_company_id
      LEFT JOIN erp_customers customer ON customer.id=mapping.source_customer_id
      ORDER BY mapping.cnae_fiscal,mapping.review_status,micro.name`),
  ]);
  return { taxonomy: taxonomy.rows, mappings: mappings.rows };
}

export async function reviewCnaeSegment({ cnae, microSegmentId, actorEmail }) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const micro = await client.query(`SELECT macro_segment_id FROM micro_segments WHERE id=$1`, [microSegmentId]);
    if (!micro.rowCount) {
      const error = new Error('Microssegmento não encontrado.');
      error.status = 404;
      throw error;
    }
    const macroSegmentId = micro.rows[0].macro_segment_id;
    await client.query(`UPDATE cnae_segment_mappings SET review_status='rejected',
      reviewed_by=$2,reviewed_at=now(),updated_at=now()
      WHERE cnae_fiscal=$1`, [cnae, actorEmail]);
    const result = await client.query(`INSERT INTO cnae_segment_mappings
        (cnae_fiscal,macro_segment_id,micro_segment_id,review_status,source_name,reviewed_by,reviewed_at)
      VALUES ($1,$2,$3,'approved','manual',$4,now())
      ON CONFLICT(cnae_fiscal,micro_segment_id) DO UPDATE SET
        macro_segment_id=excluded.macro_segment_id,review_status='approved',
        source_name='manual',reviewed_by=excluded.reviewed_by,reviewed_at=now(),updated_at=now()
      RETURNING cnae_fiscal,macro_segment_id,micro_segment_id,review_status`,
    [cnae, macroSegmentId, microSegmentId, actorEmail]);
    await client.query(`INSERT INTO audit_events(actor_email,action,entity_type,entity_id,metadata)
      VALUES ($1,'review_cnae_segment','cnae_segment_mapping',$2,$3)`,
    [actorEmail, cnae, { microSegmentId, macroSegmentId }]);
    await refreshCnaeClassifications(cnae, client.query.bind(client));
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Falha ao reverter a curadoria de CNAE:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

export { normalizedCompanyName };
