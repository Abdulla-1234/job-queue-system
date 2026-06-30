// delay = min(2^attempt * 500ms, 30 minutes)
function getBackoffDelay(attempt) {
  const base = 500;
  const cap  = 30 * 60 * 1000;
  return Math.min(Math.pow(2, attempt) * base, cap);
}

module.exports = { getBackoffDelay };