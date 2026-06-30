const { client } = require('../db/redis');
const Job        = require('../models/Job');

const QUEUE_KEYS = {
  HIGH: 'queue:high',
  MED:  'queue:med',
  LOW:  'queue:low',
};
const PROCESSING_KEY = 'queue:processing';

async function enqueue(jobData) {
  const job = new Job(jobData);
  await job.save();

  const queueKey = jobData.priority >= 3 ? QUEUE_KEYS.HIGH
                 : jobData.priority === 2 ? QUEUE_KEYS.MED
                 : QUEUE_KEYS.LOW;

  const score = job.runAt || Date.now();
  await client.zAdd(queueKey, [{ score, value: job.id }]);
  console.log(`[ENQUEUE] ${job.id} → ${queueKey}`);
  return job;
}

async function dequeue() {
  const now = Date.now();
  for (const key of [QUEUE_KEYS.HIGH, QUEUE_KEYS.MED, QUEUE_KEYS.LOW]) {
    // Atomic pop using ZPOPMIN — removes and returns in one operation
    const results = await client.zRangeByScore(key, '-inf', now, { LIMIT: { offset: 0, count: 1 } });
    if (results.length > 0) {
      const jobId = results[0];
      // Atomically remove — if removed count is 0, another worker got it first
      const removed = await client.zRem(key, jobId);
      if (removed === 0) continue; // another worker grabbed it, try next
      await client.lPush(PROCESSING_KEY, jobId);
      return jobId;
    }
  }
  return null;
}

async function ack(jobId) {
  await client.lRem(PROCESSING_KEY, 1, jobId);
}

async function getStats() {
  const [high, med, low, processing] = await Promise.all([
    client.zCard(QUEUE_KEYS.HIGH),
    client.zCard(QUEUE_KEYS.MED),
    client.zCard(QUEUE_KEYS.LOW),
    client.lLen(PROCESSING_KEY),
  ]);
  return { high, med, low, processing, total: high + med + low };
}

module.exports = { enqueue, dequeue, ack, getStats, PROCESSING_KEY };