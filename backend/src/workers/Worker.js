const { dequeue, ack }    = require('../queue/JobQueue');
const { moveToDLQ }       = require('../queue/DLQ');
const Job                 = require('../models/Job');
const { getBackoffDelay } = require('../utils/backoff');
const { client }          = require('../db/redis');
const { getStats } = require('../queue/JobQueue');
const { count }    = require('../queue/DLQ');

class Worker {
  constructor(handlers) {
    this.handlers = handlers;
    this.running  = false;
  }

  async start() {
    this.running = true;
    console.log('[WORKER] started');
    while (this.running) {
      const jobId = await dequeue();
      if (!jobId) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      await this.process(jobId);
    }
  }

  async process(jobId) {
    const job = await Job.findById(jobId);
    if (!job) { await ack(jobId); return; }

    const handler = this.handlers[job.type];
    if (!handler) {
      await ack(jobId);
      await moveToDLQ(jobId, `No handler for type: ${job.type}`);
      return;
    }

    try {
      await Job.updateStatus(jobId, 'processing', { attempts: job.attempts + 1 });

      const result = await handler(job.payload);
      await Job.updateStatus(jobId, 'completed', { result });
      await ack(jobId);
      console.log(`[DONE] ${jobId} (${job.type})`);
      // Broadcast job event to dashboard
      try {
        const { broadcast } = require('../api/server');
        const stats = await getStats();
        const dlq   = await count();
        broadcast({ ...stats, dlq, ts: Date.now(), job: { id: jobId, type: job.type, status: 'completed' } });
      } catch (e) {}

    } catch (err) {
      const attempts = job.attempts + 1;
      if (attempts >= job.max_retries) {
        await ack(jobId);
        await moveToDLQ(jobId, err.message);
      } else {
        const delay = getBackoffDelay(attempts);
        await ack(jobId);
        await client.zAdd('queue:med', [{
          score: Date.now() + delay,
          value: jobId
        }]);
        await Job.updateStatus(jobId, 'retrying', { attempts, error: err.message });
        console.log(`[RETRY] ${jobId} attempt ${attempts} — retry in ${delay}ms`);
      }
    }
  }

  stop() { this.running = false; }
}

module.exports = Worker;