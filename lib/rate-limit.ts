const WINDOW_MS = 60_000;
const PRUNE_SIZE = 5000;
const LOCAL_CLIENT = "local";

type Attempt = { count: number; resetAt: number };

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || LOCAL_CLIENT;
}

function pruneExpired(attempts: Map<string, Attempt>, now: number) {
  attempts.forEach((entry, key) => {
    if (entry.resetAt < now) attempts.delete(key);
  });
}

export function rateLimiter({ limit }: { limit: number }) {
  const attempts = new Map<string, Attempt>();
  return function rateLimited(request: Request) {
    const ip = clientIp(request);
    const now = Date.now();
    if (attempts.size > PRUNE_SIZE) pruneExpired(attempts, now);
    const current = attempts.get(ip);
    if (!current || current.resetAt < now) {
      attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
      return false;
    }
    current.count++;
    return current.count > limit;
  };
}
