require('dotenv').config();
const { connect, client } = require('../src/db/redis');
const { init, pool }      = require('../src/db/postgres');
const { enqueue, dequeue, getStats, ack } = require('../src/queue/JobQueue');
const { moveToDLQ, list, count }          = require('../src/queue/DLQ');
const { getBackoffDelay }                 = require('../src/utils/backoff');

beforeAll(async () => {
  await connect();
  await init();
  // Clean slate for tests
  await client.flushAll();
});

afterAll(async () => {
  await client.quit();
  await pool.end();
});

// ---- Backoff ----
describe('Exponential backoff', () => {
  test('attempt 1 → 1000ms', () => expect(getBackoffDelay(1)).toBe(1000));
  test('attempt 2 → 2000ms', () => expect(getBackoffDelay(2)).toBe(2000));
  test('attempt 3 → 4000ms', () => expect(getBackoffDelay(3)).toBe(4000));
  test('caps at 30 minutes',  () => expect(getBackoffDelay(99)).toBe(1800000));
});

// ---- Enqueue ----
describe('Enqueue', () => {
  test('enqueues job and returns id', async () => {
    const job = await enqueue({ type: 'email', payload: { to: 'a@test.com' }, priority: 2 });
    expect(job.id).toBeDefined();
    expect(job.status).toBe('pending');
  });

  test('HIGH priority goes to queue:high', async () => {
    await client.flushAll();
    await enqueue({ type: 'email', payload: {}, priority: 3 });
    const stats = await getStats();
    expect(stats.high).toBe(1);
    expect(stats.med).toBe(0);
  });

  test('MED priority goes to queue:med', async () => {
    await client.flushAll();
    await enqueue({ type: 'email', payload: {}, priority: 2 });
    const stats = await getStats();
    expect(stats.med).toBe(1);
  });

  test('LOW priority goes to queue:low', async () => {
    await client.flushAll();
    await enqueue({ type: 'email', payload: {}, priority: 1 });
    const stats = await getStats();
    expect(stats.low).toBe(1);
  });
});

// ---- Dequeue priority ordering ----
describe('Dequeue priority ordering', () => {
  test('HIGH is dequeued before MED and LOW', async () => {
    await client.flushAll();
    await enqueue({ type: 'low',  payload: {}, priority: 1 });
    await enqueue({ type: 'med',  payload: {}, priority: 2 });
    await enqueue({ type: 'high', payload: {}, priority: 3 });

    const jobId = await dequeue();
    expect(jobId).toBeDefined();

    const { pool: pg } = require('../src/db/postgres');
    const { rows } = await pg.query('SELECT type FROM jobs WHERE id=$1', [jobId]);
    expect(rows[0].type).toBe('high');
    await ack(jobId);
  });

  test('stats reflect dequeue correctly', async () => {
    await client.flushAll();
    await enqueue({ type: 'email', payload: {}, priority: 3 });
    await enqueue({ type: 'email', payload: {}, priority: 2 });
    const before = await getStats();
    expect(before.total).toBe(2);

    const id = await dequeue();
    await ack(id);
    const after = await getStats();
    expect(after.total).toBe(1);
  });
});

// ---- Dead letter queue ----
describe('Dead letter queue', () => {
  test('moveToDLQ adds job to DLQ', async () => {
    await client.flushAll();
    const job = await enqueue({ type: 'email', payload: {}, priority: 1 });
    await moveToDLQ(job.id, 'Test failure');
    const c = await count();
    expect(c).toBeGreaterThan(0);
  });

  test('list returns dead jobs', async () => {
    const jobs = await list();
    expect(Array.isArray(jobs)).toBe(true);
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0].status).toBe('dead');
  });

  test('dead job has error message', async () => {
    const jobs = await list();
    expect(jobs[0].error).toBe('Test failure');
  });
});

// ---- Stats ----
describe('Queue stats', () => {
  test('returns all required fields', async () => {
    const stats = await getStats();
    expect(stats).toHaveProperty('high');
    expect(stats).toHaveProperty('med');
    expect(stats).toHaveProperty('low');
    expect(stats).toHaveProperty('processing');
    expect(stats).toHaveProperty('total');
  });

  test('total = high + med + low', async () => {
    await client.flushAll();
    await enqueue({ type: 'e', payload: {}, priority: 3 });
    await enqueue({ type: 'e', payload: {}, priority: 2 });
    await enqueue({ type: 'e', payload: {}, priority: 1 });
    const s = await getStats();
    expect(s.total).toBe(s.high + s.med + s.low);
  });
});