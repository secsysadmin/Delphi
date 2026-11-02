// Per-IP request limits for public endpoints. In-memory, so each server instance counts separately.
export function rateLimiter(limit: number, windowMs = 60_000) {
  const attempts = new Map<string, { count: number; resetAt: number }>();
  return function rateLimited(request: Request) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const now = Date.now();
    if (attempts.size > 5000) attempts.forEach((entry, key) => { if (entry.resetAt < now) attempts.delete(key); });
    const current = attempts.get(ip);
    if (!current || current.resetAt < now) {
      attempts.set(ip, { count: 1, resetAt: now + windowMs });
      return false;
    }
    current.count++;
    return current.count > limit;
  };
}
