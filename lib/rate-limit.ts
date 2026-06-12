type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

const store = getRateLimitStore();

export function checkRateLimit({
  key,
  limit,
  windowMs,
}: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    store.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { ok: true };
  }

  if (bucket.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { ok: true };
}

export function clearRateLimit(key: string) {
  store.delete(key);
}

export function formatRateLimitMessage(retryAfterSeconds: number) {
  if (retryAfterSeconds < 60) {
    return `Too many attempts. Try again in ${retryAfterSeconds} seconds.`;
  }

  return `Too many attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`;
}

function getRateLimitStore() {
  const globalForRateLimit = globalThis as typeof globalThis & {
    __iaSupervisorRateLimitStore?: Map<string, RateLimitBucket>;
  };

  if (!globalForRateLimit.__iaSupervisorRateLimitStore) {
    globalForRateLimit.__iaSupervisorRateLimitStore = new Map();
  }

  return globalForRateLimit.__iaSupervisorRateLimitStore;
}
