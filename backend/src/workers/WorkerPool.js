const Worker = require('./Worker');

class WorkerPool {
  constructor(concurrency, handlers) {
    this.workers = Array.from(
      { length: concurrency },
      () => new Worker(handlers)
    );
  }

  start() {
    this.workers.forEach(w => w.start());
    console.log(`[POOL] ${this.workers.length} workers running`);
  }

  stop() {
    this.workers.forEach(w => w.stop());
    console.log('[POOL] shutting down');
  }
}

module.exports = WorkerPool;