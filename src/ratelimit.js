// In-memory request limits per visitor address. Good for one server process,
// which is all this site needs. Addresses are kept only in memory and only
// until their window ends.

export function createLimiter({ now = () => Date.now(), maxKeys = 20000 } = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  function sweep(t) {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= t) hits.delete(key);
    }
  }

  // -> { ok, retryAfter } (retryAfter in whole seconds)
  function hit(key, limit, windowMs) {
    const t = now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      if (hits.size >= maxKeys) sweep(t);
      if (hits.size >= maxKeys) hits.clear(); // under flood: forget rather than grow
      entry = { count: 0, resetAt: t + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((entry.resetAt - t) / 1000)) };
    return { ok: true, retryAfter: 0 };
  }

  return { hit, sweep: () => sweep(now()), size: () => hits.size };
}
