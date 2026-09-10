const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

const MIGRATIONS_DIR = __dirname;

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function getAppliedMigrations(client) {
  await ensureMigrationTable(client);
  const res = await client.query('SELECT name FROM schema_migrations ORDER BY id ASC;');
  return res.rows.map(r => r.name);
}

async function migrateUp(closePool = true) {
  const client = await pool.connect();
  try {
    console.log('🚀 Checking PostgreSQL connection...');
    await client.query('SELECT 1;');
    console.log('✅ PostgreSQL connected successfully.');

    const applied = await getAppliedMigrations(client);
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql') && !f.endsWith('_down.sql'))
      .sort();

    const pending = files.filter(f => !applied.includes(f));

    if (pending.length === 0) {
      console.log('✨ No pending migrations. Database schema is up to date.');
      return;
    }

    console.log(`📦 Found ${pending.length} pending migration(s):`, pending);

    for (const file of pending) {
      console.log(`⏳ Applying migration: ${file}...`);
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1);', [file]);
        await client.query('COMMIT');
        console.log(`✅ Applied migration: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Migration failed on ${file}:`, err.message);
        throw err;
      }
    }
    console.log('🎉 All migrations completed successfully.');
  } finally {
    client.release();
    if (closePool) {
      await pool.end();
    }
  }
}

async function migrateDown() {
  const client = await pool.connect();
  try {
    const applied = await getAppliedMigrations(client);
    if (applied.length === 0) {
      console.log('✨ No migrations to revert.');
      return;
    }

    const lastMigration = applied[applied.length - 1];
    const baseName = lastMigration.replace('.sql', '');
    const downFile = `${baseName}_down.sql`;
    const downPath = path.join(MIGRATIONS_DIR, downFile);

    if (!fs.existsSync(downPath)) {
      throw new Error(`Down migration file not found: ${downFile}`);
    }

    console.log(`⏳ Reverting migration: ${lastMigration} using ${downFile}...`);
    const sql = fs.readFileSync(downPath, 'utf-8');

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('DELETE FROM schema_migrations WHERE name = $1;', [lastMigration]);
      await client.query('COMMIT');
      console.log(`✅ Successfully reverted migration: ${lastMigration}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`❌ Rollback failed:`, err.message);
      throw err;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

async function migrateStatus() {
  const client = await pool.connect();
  try {
    const applied = await getAppliedMigrations(client);
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql') && !f.endsWith('_down.sql'))
      .sort();

    console.log('\n=== Database Migration Status ===');
    for (const file of files) {
      const isApplied = applied.includes(file);
      console.log(`  [${isApplied ? '✔ APPLIED' : '  PENDING'}] ${file}`);
    }
    console.log('');
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  const command = process.argv[2] || 'up';

  switch (command) {
    case 'up':
      migrateUp(true).catch(err => {
        console.error('Fatal migration error:', err);
        process.exit(1);
      });
      break;
    case 'down':
      migrateDown().catch(err => {
        console.error('Fatal rollback error:', err);
        process.exit(1);
      });
      break;
    case 'status':
      migrateStatus().catch(err => {
        console.error('Fatal status error:', err);
        process.exit(1);
      });
      break;
    default:
      console.error(`Unknown command "${command}". Available commands: up, down, status.`);
      process.exit(1);
  }
}

module.exports = {
  migrateUp,
  migrateDown,
  migrateStatus,
};
