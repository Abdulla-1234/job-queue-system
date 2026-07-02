const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool({
      host: 'localhost',
      port: 5432,
      user: 'admin',
      password: 'password',
      database: 'jobqueue',
    });

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id          TEXT PRIMARY KEY,
      type        TEXT NOT NULL,
      payload     JSONB,
      priority    INTEGER DEFAULT 1,
      status      TEXT DEFAULT 'pending',
      attempts    INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      run_at      BIGINT DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      result      JSONB,
      error       TEXT
    );
  `);
  console.log('✅ PostgreSQL ready — jobs table created');
}

module.exports = { pool, init };