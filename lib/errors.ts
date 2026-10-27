const UNIQUE_VIOLATION = "23505";

type DatabaseError = Error & { code: string; constraint_name?: string };

export function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof Error && "code" in error;
}

export function isUniqueViolation(error: unknown, constraint = "") {
  return isDatabaseError(error) && error.code === UNIQUE_VIOLATION && (error.constraint_name ?? "").includes(constraint);
}

export function publicError(error: unknown, fallback: string) {
  if (error instanceof Error && !isDatabaseError(error)) return error.message;
  console.error(fallback, error);
  return fallback;
}
