#!/usr/bin/env node

/**
 * Minimal Postgres migration runner.
 * Reads SQL files from infra/migrations/ in lexicographic order,
 * tracks applied migrations in a `schema_migrations` table,
 * and applies any that haven't run yet.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://ual:ual_dev@localhost:5432/ual';

const ensureTrackingTable = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

const listApplied = `SELECT version FROM schema_migrations ORDER BY version;`;

const recordMigration = `INSERT INTO schema_migrations (version) VALUES ($1);`;

const isMigrationFile = (f) => /^\d{3}_.+\.sql$/.test(f);

async function main() {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(ensureTrackingTable);

    const { rows } = await client.query(listApplied);
    const applied = new Set(rows.map((r) => r.version));

    const files = (await readdir(__dirname))
      .filter(isMigrationFile)
      .sort();

    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log('All migrations already applied.');
      return;
    }

    for (const file of pending) {
      const sql = await readFile(join(__dirname, file), 'utf-8');
      console.log(`Applying ${file}...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(recordMigration, [file]);
        await client.query('COMMIT');
        console.log(`  Applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }

    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
