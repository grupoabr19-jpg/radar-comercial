import { promises as fs } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

const { Client } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function migrate() {
  const directUrl = process.env.DATABASE_URL_UNPOOLED;
  const directIsValid = (() => {
    try {
      const parsed = new URL(directUrl);
      return parsed.protocol.startsWith('postgres') && parsed.hostname && parsed.hostname !== 'postgresql';
    } catch { return false; }
  })();
  const connectionString = directIsValid ? directUrl : process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL_UNPOOLED ou DATABASE_URL deve ser configurada.');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [761_927_202]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const directory = path.join(root, 'migrations');
    const files = (await fs.readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
    for (const file of files) {
      const version = path.basename(file, '.sql');
      const exists = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
      if (exists.rowCount) continue;
      const sql = await fs.readFile(path.join(directory, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [version]);
        await client.query('COMMIT');
        console.log(`Migration applied: ${version}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [761_927_202]).catch(() => {});
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

