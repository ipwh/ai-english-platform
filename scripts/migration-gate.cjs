// ============================================
// R3.10-E.2 P0-1: Migration Gate Policy (single source of truth)
// ============================================
// Pure decision policy for schema deployment. Used by scripts/vercel-build.js
// and unit-tested by src/modules/production/__tests__/migration-gate.test.ts.
//
// Policy:
//  - Production FAILS CLOSED: if `prisma migrate deploy` or
//    `prisma migrate status` cannot be verified (connection error or
//    unknown failure), the build MUST abort. No silent skip.
//  - `prisma db push` is NEVER a production fallback.
//  - Dev may fall back to `db push` and may continue without a DB.
// ============================================

/**
 * @param {object} input
 * @param {boolean} input.isProd
 * @param {{ ok: boolean, output: string }} input.migrateDeploy
 * @param {{ ok: boolean, output: string }} input.migrateStatus
 * @returns {{ action: 'continue' | 'abort' | 'dev-fallback', reason: string }}
 */
function decideMigrationOutcome(input) {
  const { isProd, migrateDeploy, migrateStatus } = input;

  if (migrateDeploy.ok && migrateStatus.ok) {
    return { action: 'continue', reason: 'migrations applied and status verified' };
  }

  if (isProd) {
    // Production fails closed on ANY failure of deploy or status verification.
    const failingStep = !migrateDeploy.ok ? 'prisma migrate deploy' : 'prisma migrate status';
    const output = (!migrateDeploy.ok ? migrateDeploy.output : migrateStatus.output) || '';
    const isConnectionError =
      output.includes('P1001') || output.includes('P1002') || output.includes('Timed out') ||
      output.includes('advisory lock') || output.includes('ECONNREFUSED');
    if (isConnectionError) {
      return {
        action: 'abort',
        reason: `${failingStep} could not reach the database in production — schema migration status is UNVERIFIED. Failing closed.`,
      };
    }
    return {
      action: 'abort',
      reason: `${failingStep} failed in production (${output.slice(0, 240)}). Failing closed.`,
    };
  }

  // Dev: fall back to db push; continue even without DB.
  return {
    action: 'dev-fallback',
    reason: 'non-production environment — db push fallback / no-DB build allowed',
  };
}

/** @param {string} output prisma CLI combined output */
function isPgvectorMissing(output) {
  return output.includes('vector') && output.includes('does not exist');
}

module.exports = { decideMigrationOutcome, isPgvectorMissing };
