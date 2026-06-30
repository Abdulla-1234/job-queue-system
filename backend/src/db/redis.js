const { createClient } = require('redis');

const client = createClient({ url: 'redis://localhost:6379' });

client.on('error', (err) => console.error('Redis error:', err));

async function connect() {
  await client.connect();
  console.log('✅ Redis connected');
}

module.exports = { client, connect };