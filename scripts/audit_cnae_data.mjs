import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL não configurada.');

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  const profile = await client.query(`SELECT
    count(*)::int AS customers,
    count(*) FILTER (WHERE cnpj ~ '^[0-9]{14}$')::int AS valid_cnpjs,
    count(DISTINCT cnpj) FILTER (WHERE cnpj ~ '^[0-9]{14}$')::int AS distinct_valid_cnpjs,
    count(*) FILTER (WHERE primary_cnae IS NOT NULL)::int AS customers_with_cnae,
    count(*) FILTER (WHERE city IS NOT NULL AND state IS NOT NULL)::int AS customers_with_city_state,
    count(*) FILTER (WHERE company_name IS NOT NULL AND btrim(company_name) <> '')::int AS customers_with_name,
    (SELECT count(*)::int FROM route_regions) AS regions,
    (SELECT count(*)::int FROM region_cities) AS route_cities,
    (SELECT count(*)::int FROM prospecting_cnaes) AS curated_cnaes,
    (SELECT count(*)::int FROM prospects) AS prospects,
    (SELECT count(*)::int FROM discovery_runs) AS discovery_runs
    FROM erp_customers`);
  const topCnaes = await client.query(`SELECT primary_cnae AS cnae, count(*)::int AS customers
    FROM erp_customers WHERE primary_cnae IS NOT NULL
    GROUP BY primary_cnae ORDER BY count(*) DESC, primary_cnae LIMIT 30`);
  const duplicateCnpjs = await client.query(`SELECT count(*)::int AS duplicated_cnpjs,
      coalesce(sum(records - 1), 0)::int AS duplicate_rows
    FROM (SELECT cnpj, count(*) AS records FROM erp_customers
      WHERE cnpj ~ '^[0-9]{14}$' GROUP BY cnpj HAVING count(*) > 1) duplicates`);
  console.log(JSON.stringify({ ...profile.rows[0], ...duplicateCnpjs.rows[0], top_cnaes: topCnaes.rows }, null, 2));
} finally {
  await client.end();
}
