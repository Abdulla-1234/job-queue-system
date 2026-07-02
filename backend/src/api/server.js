const express    = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const { connect: redisConnect } = require('../db/redis');
const { init: pgInit }          = require('../db/postgres');
const WorkerPool = require('../workers/WorkerPool');
const routes     = require('./routes');
const { getStats }  = require('../queue/JobQueue');
const { count }     = require('../queue/DLQ');

const app    = express();
const server = createServer(app);
const wss    = new WebSocketServer({ 
  server,
  perMessageDeflate: false
});

app.use(express.json());
app.set('trust proxy', 1);
const path = require('path');
app.use(express.static(path.join(__dirname, '../../../frontend/dashboard')));
app.use('/api', routes);

// Broadcast stats every 2s
setInterval(async () => {
  try {
    const stats = await getStats();
    const dlq   = await count();
    const payload = JSON.stringify({ ...stats, dlq, ts: Date.now() });
    wss.clients.forEach(c => { if (c.readyState === 1) c.send(payload); });
  } catch (e) {}
}, 2000);

// Export broadcaster so workers can send job events
function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(payload); });
}

module.exports = { broadcast };

// Job handlers
const handlers = {
  'email':  async (p) => {
    await new Promise(r => setTimeout(r, 200));
    console.log(`  → email sent to ${p.to}`);
    return { sent: true };
  },
  'resize': async (p) => {
    await new Promise(r => setTimeout(r, 500));
    console.log(`  → resized ${p.file}`);
    return { resized: true };
  },
  'report': async (p) => {
    await new Promise(r => setTimeout(r, 1000));
    console.log(`  → report generated for id ${p.id}`);
    return { generated: true };
  },
};

async function main() {
  await redisConnect();
  await pgInit();

  const pool = new WorkerPool(5, handlers);
  pool.start();

  process.on('SIGTERM', () => { pool.stop(); server.close(); });
  process.on('SIGINT',  () => { pool.stop(); server.close(); process.exit(0); });

  server.listen(process.env.PORT || 3000, () => {
    console.log('🚀 Server running on http://localhost:3000');
  });
}

main().catch(console.error);