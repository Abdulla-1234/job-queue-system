# Job Queue System

A distributed job queue built from scratch with priority scheduling, retry logic, dead-letter queue, and a real-time monitoring dashboard.

## Architecture

```
Producer API → Priority Queue (Redis) → Worker Pool → PostgreSQL
                     ↓ retry                              ↓
               Dead-Letter Queue ←── max retries exceeded
```

## Features

- **Priority scheduling** — HIGH / MED / LOW queues using Redis sorted sets (O log N)
- **Concurrent workers** — configurable worker pool with atomic BRPOPLPUSH dequeue
- **Exponential backoff retry** — delay = min(2ⁿ × 500ms, 30 min) per job type
- **Dead-letter queue** — inspect and replay failed jobs via REST API
- **Live dashboard** — WebSocket-fed real-time chart, activity log, worker pool status
- **REST API** — enqueue, inspect, stats, DLQ list and replay endpoints
- **Load tested** — 1,161 req/sec at 16.74ms avg latency (autocannon, 20 connections)

## Tech Stack

Node.js · Redis · PostgreSQL · Express · WebSocket · Docker · Chart.js · Jest

## Quick Start

```bash
# Start Redis + PostgreSQL
docker compose up -d

# Install dependencies
npm install

# Start server + workers
npm run dev
```

Open `http://localhost:3000` for the live dashboard.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/jobs` | Enqueue a job |
| GET | `/api/jobs/:id` | Get job by ID |
| GET | `/api/queues/stats` | Live queue stats |
| GET | `/api/dlq` | List dead jobs |
| POST | `/api/dlq/:id/replay` | Replay a dead job |

### Enqueue a job

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"type":"email","payload":{"to":"user@example.com"},"priority":3}'
```

Priority: `3` = HIGH, `2` = MED, `1` = LOW

## Run Tests

```bash
npm test
```

15 tests covering enqueue, dequeue priority ordering, retry logic, DLQ, and stats.

## Load Test

```bash
npx autocannon -c 20 -d 15 \
  -m POST \
  -H "Content-Type: application/json" \
  -b '{"type":"email","payload":{},"priority":3}' \
  http://localhost:3000/api/jobs
```

## Project Structure

```
src/
├── queue/        JobQueue.js, DLQ.js
├── workers/      Worker.js, WorkerPool.js
├── api/          server.js, routes.js
├── models/       Job.js
├── db/           redis.js, postgres.js
└── utils/        backoff.js
dashboard/        index.html (live monitor)
tests/            queue.test.js
```