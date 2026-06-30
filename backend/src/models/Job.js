const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/postgres');

class Job {
  constructor({ type, payload, priority = 1, maxRetries = 3, runAt = 0 }) {
    this.id         = uuidv4();
    this.type       = type;
    this.payload    = payload;
    this.priority   = priority;
    this.maxRetries = maxRetries;
    this.runAt      = runAt;
    this.attempts   = 0;
    this.status     = 'pending';
  }

  async save() {
    await pool.query(
      `INSERT INTO jobs (id, type, payload, priority, status, attempts, max_retries, run_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [this.id, this.type, this.payload, this.priority,
       this.status, this.attempts, this.maxRetries, this.runAt]
    );
    return this;
  }

  static async findById(id) {
    const { rows } = await pool.query('SELECT * FROM jobs WHERE id=$1', [id]);
    return rows[0] || null;
  }

  static async updateStatus(id, status, extra = {}) {
    const fields = ['status=$2', 'updated_at=NOW()'];
    const values = [id, status];
    if (extra.result !== undefined) {
      values.push(JSON.stringify(extra.result));
      fields.push(`result=$${values.length}`);
    }
    if (extra.error !== undefined) {
      values.push(extra.error);
      fields.push(`error=$${values.length}`);
    }
    if (extra.attempts !== undefined) {
      values.push(extra.attempts);
      fields.push(`attempts=$${values.length}`);
    }
    await pool.query(
      `UPDATE jobs SET ${fields.join(',')} WHERE id=$1`,
      values
    );
  }
}

module.exports = Job;