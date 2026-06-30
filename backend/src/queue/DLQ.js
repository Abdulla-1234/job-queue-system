const { client } = require('../db/redis');
const { pool }   = require('../db/postgres');

const DLQ_KEY = 'queue:dlq';

async function moveToDLQ(jobId, reason) {
  await client.lPush(DLQ_KEY, jobId);
  await pool.query(
    `UPDATE jobs SET status='dead', error=$2, updated_at=NOW() WHERE id=$1`,
    [jobId, reason]
  );
  console.log(`[DLQ] ${jobId} — ${reason}`);
}

async function list() {
  const ids = await client.lRange(DLQ_KEY, 0, -1);
  if (!ids.length) return [];
  const { rows } = await pool.query(
    `SELECT * FROM jobs WHERE id = ANY($1)`, [ids]
  );
  return rows;
}

async function replay(jobId) {
  await client.lRem(DLQ_KEY, 1, jobId);
  const { enqueue } = require('./JobQueue');
  const { rows } = await pool.query('SELECT * FROM jobs WHERE id=$1', [jobId]);
  if (!rows[0]) throw new Error('Job not found');
  const job = rows[0];
  await pool.query(
    `UPDATE jobs SET status='pending', attempts=0, error=NULL WHERE id=$1`,
    [jobId]
  );
  await enqueue({ type: job.type, payload: job.payload, priority: job.priority });
}

async function count() {
  return client.lLen(DLQ_KEY);
}

module.exports = { moveToDLQ, list, replay, count };