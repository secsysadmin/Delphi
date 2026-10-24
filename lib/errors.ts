// Validation errors are written for people, so they're shown as-is. Database and driver errors
// (they carry a `code`, e.g. Postgres "23505") are logged and replaced with a plain message.
export function publicError(error: unknown, fallback: string) {
  if (error instanceof Error && !("code" in error)) return error.message;
  console.error(fallback, error);
  return fallback;
}
