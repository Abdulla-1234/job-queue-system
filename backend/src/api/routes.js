const router  = require('express').Router();
const { enqueue, getStats } = require('../queue/JobQueue');
const { list, replay, count } = require('../queue/DLQ');
const Job     = require('../models/Job');

// Enqueue a job
router.post('/jobs', async (req, res) => {
  try {
    const job = await enqueue(req.body);
    res.status(201).json({ id: job.id, status: job.status });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Get job by ID
router.get('/jobs/:id', async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json(job);
});

// Queue stats
router.get('/queues/stats', async (req, res) => {
  const stats = await getStats();
  const dlq   = await count();
  res.json({ ...stats, dlq });
});

// List DLQ jobs
router.get('/dlq', async (req, res) => {
  res.json(await list());
});

// Replay a dead job
router.post('/dlq/:id/replay', async (req, res) => {
  try {
    await replay(req.params.id);
    res.json({ replayed: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;