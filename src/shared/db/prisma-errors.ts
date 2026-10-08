// ============================================
// Prisma error helpers — SINGLE OWNER for unique-constraint inspection
// ============================================
// Prisma reports a unique violation (P2002) with DIFFERENT metadata depending on
// the runtime:
//
//   * classic engine (Prisma <= 6):
//       error.meta.target = ['assignmentId', 'studentId']   (or a string)
//
//   * Prisma 7 + driver adapters / query compiler (this project):
//       error.meta.target = undefined
//       error.meta.driverAdapterError.cause.constraint.fields =
//         ['"assignmentId"', '"studentId"']      <-- note the SQL quoting
//
// (MEASURED 2026-10-08 against @prisma/client 7.8.0 + @prisma/adapter-pg.)
//
// Code that inspects `meta.target` therefore silently stops matching on Prisma 7
// — `isSubmissionUniqueViolation()` in the assessment module did exactly that,
// so the DB-001 concurrent-first-submission retry never fired and the losing
// request failed instead of attaching to the winner's row.
//
// Parse the shape HERE, once, and never inline the field checks again.
// ============================================

/** Structural P2002 detection (no Prisma runtime class import required). */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/** Strip the SQL identifier decoration Prisma 7 keeps (`"assignmentId"`, backticks). */
function normalizeIdentifier(name: string): string {
  return name.replace(/["`[\]]/g, '').trim();
}

/**
 * Constraint FIELDS involved in a P2002, normalized to bare column names.
 * Handles both the classic `meta.target` and the Prisma 7 driver-adapter shape.
 * Returns [] when the error is not a P2002 or carries no usable field metadata.
 */
export function uniqueViolationFields(error: unknown): string[] {
  if (!isUniqueViolation(error)) return [];
  const meta = (error as { meta?: unknown }).meta;
  if (!meta || typeof meta !== 'object') return [];

  const bag = meta as Record<string, unknown>;
  const fields = new Set<string>();

  // Classic engine: meta.target
  const target = bag.target;
  if (Array.isArray(target)) {
    for (const entry of target) {
      if (typeof entry === 'string') fields.add(normalizeIdentifier(entry));
    }
  } else if (typeof target === 'string') {
    fields.add(normalizeIdentifier(target));
  }

  // Prisma 7 driver adapters: meta.driverAdapterError.cause.constraint.fields
  const cause = (bag.driverAdapterError as { cause?: unknown } | undefined)?.cause;
  const constraint = (cause as { constraint?: { fields?: unknown } } | undefined)?.constraint;
  const adapterFields = constraint?.fields;
  if (Array.isArray(adapterFields)) {
    for (const entry of adapterFields) {
      if (typeof entry === 'string') fields.add(normalizeIdentifier(entry));
    }
  }

  return [...fields];
}

/**
 * True ONLY when the P2002 was raised by a unique constraint over EXACTLY the
 * given fields (order-insensitive). An unrelated unique violation must not be
 * mistaken for the expected one.
 */
export function isUniqueViolationOn(error: unknown, expected: string[]): boolean {
  const fields = uniqueViolationFields(error);
  if (fields.length === 0) return false;
  return expected.every((name) => fields.includes(name));
}
