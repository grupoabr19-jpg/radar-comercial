import pg from 'pg';

const { Pool } = pg;

let pool;

export function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL não foi configurada.');
  pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (error) => console.error('Postgres pool error', error));
  return pool;
}

export function query(text, params) {
  return getPool().query(text, params);
}

export async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = undefined;
}

