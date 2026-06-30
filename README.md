[![CI](https://github.com/Abdulla-1234/job-queue/actions/workflows/ci.yml/badge.svg)](https://github.com/Abdulla-1234/job-queue/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)](https://postgresql.org)
[![Tests](https://img.shields.io/badge/tests-15%20passing-success)](#run-tests)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

# Job Queue System

A distributed job queue built from scratch — priority scheduling, atomic worker dequeue, exponential backoff retries, a dead-letter queue, and a real-time WebSocket dashboard. Built to actually understand how systems like BullMQ, Celery, and SQS work under the hood, not just use them.

---

## Architecture

```
                    ┌─────────────────┐
                    │  Producer API    │
                    │  (REST, Express) │
                    └────────┬─────────┘
                             │ enqueue
                             ▼
                ┌────────────────────────┐
                │   Priority Queue        │
                │   (Redis sorted sets)   │
                │   HIGH · MED · LOW      │
                └────────────┬────────────┘
                             │ atomic dequeue
                             ▼
                ┌────────────────────────┐
                │     Worker Pool         │
                │  (5 concurrent workers) │
                └─────┬──────────┬────────┘
            success   │          │  failure
                      ▼          ▼
          ┌────────────────┐  ┌──────────────────┐
          │ Completed store │  │   Retry queue     │
          │  (PostgreSQL)   │  │ exponential backoff│
          └─────────────────┘  └─────────┬──────────┘
                                          │ max retries exceeded
                                          ▼
                                ┌──────────────────────┐
                                │  Dead-Letter Queue     │
                                │  inspect · replay      │
                                └──────────────────────┘

                  All stages stream live to →  Dashboard (WebSocket)
```

---

## Features

- **Priority scheduling** — HIGH / MED / LOW queues using Redis sorted sets, giving O(log N) insert and dequeue
- **Atomic worker dequeue** — `ZREM` + `LPUSH` pattern prevents two workers from ever picking up the same job
- **Exponential backoff retries** — `delay = min(2ⁿ × 500ms, 30 min)`, configurable max retries per job
- **Dead-letter queue** — failed jobs are inspectable and replayable via REST API, not silently dropped
- **Live dashboard** — WebSocket-fed real-time chart, task flow pipeline, worker pool status, and activity log
- **REST API** — enqueue, inspect, stats, DLQ list and replay endpoints
- **Graceful shutdown** — workers drain in-flight jobs before the process exits
- **Tested** — 15 Jest tests covering enqueue, priority dequeue ordering, retries, and DLQ behavior
- **CI/CD** — GitHub Actions runs the full test suite against live Redis + PostgreSQL containers on every push
- **Load tested** — 1,161 req/sec at 16.74ms avg latency (autocannon, 20 concurrent connections, 15s run)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18, Express |
| Queue engine | Redis 7 (sorted sets, lists) |
| Persistence | PostgreSQL 15 |
| Real-time | WebSocket (`ws`) |
| Dashboard | Vanilla JS + Chart.js |
| Testing | Jest |
| Load testing | autocannon |
| Infra | Docker, Docker Compose |
| CI/CD | GitHub Actions |

---

## Quick Start

```bash
git clone https://github.com/Abdulla-1234/job-queue.git
cd job-queue/backend

# Start Redis + PostgreSQL
docker compose up -d

# Install dependencies
npm install

# Start server + worker pool
npm run dev
```

Open **http://localhost:3000** for the live dashboard.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/jobs` | Enqueue a job |
| `GET` | `/api/jobs/:id` | Get job status and result by ID |
| `GET` | `/api/queues/stats` | Live queue depth stats |
| `GET` | `/api/dlq` | List all dead-lettered jobs |
| `POST` | `/api/dlq/:id/replay` | Re-enqueue a dead job |

### Enqueue a job

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"type":"email","payload":{"to":"user@example.com"},"priority":3}'
```

`priority`: `3` = HIGH · `2` = MED · `1` = LOW

### Check job status

```bash
curl http://localhost:3000/api/jobs/<job-id>
```

### Replay a failed job

```bash
curl -X POST http://localhost:3000/api/dlq/<job-id>/replay
```

---

## Run Tests

```bash
cd backend
npm test
```

15 tests covering:
- Exponential backoff delay calculation
- Enqueue routing to correct priority queue
- Dequeue ordering (HIGH before MED before LOW)
- Dead-letter queue insertion, listing, and error capture
- Queue stats accuracy

---

## Load Test

```bash
cd backend
npx autocannon -c 20 -d 15 \
  -m POST \
  -H "Content-Type: application/json" \
  -b '{"type":"email","payload":{},"priority":3}' \
  http://localhost:3000/api/jobs
```

**Results:** 17,000 requests in 15.05s · 1,161 req/sec avg · 16.74ms avg latency · 26ms p97.5

---

## CI/CD Pipeline

Every push and pull request to `master` triggers a GitHub Actions workflow that:

1. Spins up live Redis and PostgreSQL containers
2. Installs dependencies
3. Runs the full Jest test suite against the real services
4. Runs a quick load test sanity check

See [`.github/workflows/ci.yml`](.github/workflows/ci.yml) and the **Actions** tab for run history.

---

## Project Structure

```
job-queue/
├── backend/
│   ├── src/
│   │   ├── queue/
│   │   │   ├── JobQueue.js      enqueue / dequeue / stats
│   │   │   └── DLQ.js           dead-letter queue logic
│   │   ├── workers/
│   │   │   ├── Worker.js        single worker processing loop
│   │   │   └── WorkerPool.js    spawns N concurrent workers
│   │   ├── api/
│   │   │   ├── server.js        Express + WebSocket server
│   │   │   └── routes.js        REST endpoints
│   │   ├── models/
│   │   │   └── Job.js           job schema + PostgreSQL queries
│   │   ├── db/
│   │   │   ├── redis.js
│   │   │   └── postgres.js
│   │   └── utils/
│   │       └── backoff.js       exponential backoff calculation
│   ├── tests/
│   │   └── queue.test.js
│   ├── docker-compose.yml
│   ├── .env
│   └── package.json
│
├── frontend/
│   └── dashboard/
│       └── index.html           live WebSocket dashboard
│
├── .github/
│   └── workflows/
│       └── ci.yml
│
├── LICENSE
└── README.md
```

---

## Design Decisions

**Why Redis sorted sets instead of a simple list for the queue?**
Sorted sets give O(log N) insertion and range queries by score. Using the enqueue timestamp (or scheduled `run_at`) as the score means delayed/scheduled jobs and priority ordering both fall out naturally, without needing a separate delay mechanism.

**Why three separate queues instead of one queue with a priority field?**
Checking three small sorted sets (HIGH → MED → LOW) in order is simpler and faster than scanning one large sorted set with a priority field included in the score calculation, and it makes the dashboard's per-priority metrics trivial to compute.

**How is job loss prevented if a worker crashes mid-processing?**
Dequeue moves a job from the priority queue into a `processing` list atomically (`ZREM` + `LPUSH`). If a worker dies before acknowledging, the job remains visible in `processing` rather than disappearing, allowing a recovery sweep to detect and re-enqueue orphaned jobs.

**Why exponential backoff instead of fixed-interval retries?**
Fixed retries hammer a failing downstream dependency repeatedly. Backoff (`2ⁿ × 500ms`, capped at 30 minutes) gives transient failures time to resolve while still retrying quickly for fast-recovering issues.

---

## License

MIT — see [LICENSE](LICENSE)

---
## Contact

- **Developer**: D Mohammad Abdulla
- **Email**: mohammadabdulla20march@gmail.com
- **LinkedIn**: [Your LinkedIn Profile](https://www.linkedin.com/in/mohammad-abdulla-doodakula-8a3307258/)
- **GitHub**: [Your GitHub Profile](https://github.com/Abdulla-1234)
