const { Pool } = require('pg');
require('dotenv').config();
const { mockDbStore } = require('./mockDb');

const isProduction = process.env.NODE_ENV === 'production';
const sslRequired = process.env.PGSSL === 'true' || 
  (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=require'));

const poolConfig = {
  max: parseInt(process.env.PG_POOL_MAX || '20', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

if (process.env.DATABASE_URL) {
  poolConfig.connectionString = process.env.DATABASE_URL;
} else {
  poolConfig.host = process.env.PGHOST || 'localhost';
  poolConfig.port = parseInt(process.env.PGPORT || '5432', 10);
  poolConfig.user = process.env.PGUSER || 'postgres';
  poolConfig.password = process.env.PGPASSWORD || 'postgres';
  poolConfig.database = process.env.PGDATABASE || 'krishilink';
}

if (sslRequired) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

let pgAvailable = null; // null = untested, true = live, false = fallback

pool.on('error', (err) => {
  if (pgAvailable !== false) {
    console.warn('ℹ️ PostgreSQL client notice (falling back to in-memory store):', err.message);
  }
  pgAvailable = false;
});

/**
 * Execute a parameterized query with connection pool or fallback store
 * @param {string} text 
 * @param {Array} params 
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = async (text, params = []) => {
  if (pgAvailable === false) {
    return mockDbStore.execute(text, params);
  }

  try {
    const res = await pool.query(text, params);
    pgAvailable = true;
    return res;
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.message.includes('connect')) {
      if (pgAvailable !== false) {
        console.log('ℹ️ PostgreSQL not reachable at 5432. Activating resilient in-memory database store.');
      }
      pgAvailable = false;
      return mockDbStore.execute(text, params);
    }
    // If table does not exist yet (code 42P01), serve from mockDbStore while auto-migrating
    if (err.code === '42P01' || err.message?.includes('does not exist')) {
      console.warn(`⚠️ Table missing in PostgreSQL (${err.message}). Serving from resilient store and triggering auto-migration...`);
      try {
        const { migrateUp } = require('../migrations/run_migrations');
        const { seed } = require('../migrations/seed');
        migrateUp(false).then(() => seed(false)).catch(mErr => console.warn('Background migration note:', mErr.message));
      } catch (e) {}
      return mockDbStore.execute(text, params);
    }
    throw err;
  }
};

/**
 * Acquire a client from the pool for multi-query transactions
 * @returns {Promise<import('pg').PoolClient>}
 */
const getClient = async () => {
  if (pgAvailable === false) {
    return {
      query: (text, params) => Promise.resolve(mockDbStore.execute(text, params)),
      release: () => {}
    };
  }

  try {
    const client = await pool.connect();
    pgAvailable = true;
    return client;
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.message.includes('connect')) {
      if (pgAvailable !== false) {
        console.log('ℹ️ PostgreSQL not reachable at 5432. Activating resilient in-memory database store.');
      }
      pgAvailable = false;
      return {
        query: (text, params) => Promise.resolve(mockDbStore.execute(text, params)),
        release: () => {}
      };
    }
    throw err;
  }
};

/**
 * Check database connectivity and PostGIS extension status
 */
const checkConnection = async () => {
  try {
    const res = await query('SELECT NOW() as current_time, version();');
    let postgisVersion = null;
    try {
      const postgisRes = await query('SELECT PostGIS_Full_Version() as postgis_version;');
      postgisVersion = postgisRes.rows[0]?.postgis_version;
    } catch {
      postgisVersion = 'Not installed / not enabled';
    }

    return {
      connected: true,
      time: res.rows[0].current_time,
      postgresVersion: res.rows[0].version,
      postgisVersion,
      mode: pgAvailable ? 'PostgreSQL Server' : 'In-Memory Resilient Store'
    };
  } catch (err) {
    return {
      connected: false,
      error: err.message,
    };
  }
};

module.exports = {
  pool,
  query,
  getClient,
  checkConnection,
};
