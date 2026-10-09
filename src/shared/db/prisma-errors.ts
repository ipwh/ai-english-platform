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
//   * @prisma/client 7.10 + driver adapters (MEASURED 2026-10-09, Postgres 18):
//       `constraint.fields` is GONE. The payload carries only the constraint
//       INDEX NAME:
//         constraint = { index: 'Submission_assignmentId_studentId_key' }
//       cause = { originalCode: '23505', kind: 'UniqueConstraintViolation',
//                 constraint, table: 'Submission' }
//     So a parser that only reads `fields` goes dead AGAIN on 7.10 — measured:
//     the DB-001 real-Postgres concurrency suite failed (the losing request was
//     rejected) while every mocked unit test still passed, because the fixtures
//     encoded the 7.8 shape. The constraint NAME is therefore parsed as a second
//     source, and BOTH shapes are pinned by fixtures.
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
 * The constraint NAME reported by the driver adapter, if any (Prisma >= 7.10
 * reports the index name instead of the field list).
 */
export function uniqueViolationConstraintName(error: unknown): string | null {
  if (!isUniqueViolation(error)) return null;
  const meta = (error as { meta?: unknown }).meta;
  if (!meta || typeof meta !== 'object') return null;

  const bag = meta as Record<string, unknown>;
  const cause = (bag.driverAdapterError as { cause?: unknown } | undefined)?.cause;
  const constraint = (cause as { constraint?: Record<string, unknown> } | undefined)?.constraint;
  const name = constraint?.index ?? constraint?.name;
  return typeof name === 'string' && name.length > 0 ? name : null;
}

/**
 * Field names encoded in a Prisma constraint name. Prisma names unique indexes
 * `<Model>_<field…>_key`, so drop the trailing `key` and the leading model token.
 *
 * LIMITATION: a model name containing an underscore shifts only its first
 * segment. That is acceptable because this is only a FALLBACK used to recognise
 * one specific composite key — never to enumerate real column names.
 */
function constraintNameFields(name: string): string[] {
  const tokens = name.split('_');
  if (tokens.length > 1 && tokens[tokens.length - 1] === 'key') tokens.pop();
  tokens.shift();
  return tokens;
}

/**
 * True ONLY when the P2002 was raised by a unique constraint over EXACTLY the
 * given fields (order-insensitive). An unrelated unique violation must not be
 * mistaken for the expected one.
 */
export function isUniqueViolationOn(error: unknown, expected: string[]): boolean {
  const fields = uniqueViolationFields(error);
  if (fields.length > 0) {
    return expected.every((name) => fields.includes(name));
  }

  // Prisma >= 7.10 reports no field list — fall back to the constraint NAME.
  const constraint = uniqueViolationConstraintName(error);
  if (constraint) {
    const named = constraintNameFields(constraint);
    return named.length === expected.length && expected.every((name) => named.includes(name));
  }
  return false;
}
