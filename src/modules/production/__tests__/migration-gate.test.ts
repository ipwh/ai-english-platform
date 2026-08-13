// ============================================
// R3.10-E.2 P0-1: Migration gate policy tests
// Pure policy — no live production DB required.
// ============================================
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { decideMigrationOutcome } = require('../../../../scripts/migration-gate.cjs') as {
  decideMigrationOutcome: (input: {
    isProd: boolean;
    migrateDeploy: { ok: boolean; output: string };
    migrateStatus: { ok: boolean; output: string };
  }) => { action: 'continue' | 'abort' | 'dev-fallback'; reason: string };
};

describe('R3.10-E.2 migration gate policy', () => {
  it('production continues only when deploy AND status both succeed', () => {
    expect(decideMigrationOutcome({
      isProd: true,
      migrateDeploy: { ok: true, output: '' },
      migrateStatus: { ok: true, output: '' },
    }).action).toBe('continue');
  });

  it('production FAILS CLOSED on database connection error (P1001) during deploy', () => {
    const result = decideMigrationOutcome({
      isProd: true,
      migrateDeploy: { ok: false, output: 'P1001: Can\'t reach database server' },
      migrateStatus: { ok: true, output: '' },
    });
    expect(result.action).toBe('abort');
    expect(result.reason).toContain('UNVERIFIED');
  });

  it('production FAILS CLOSED when migrate status cannot be verified (P1002)', () => {
    const result = decideMigrationOutcome({
      isProd: true,
      migrateDeploy: { ok: true, output: '' },
      migrateStatus: { ok: false, output: 'P1002: timed out' },
    });
    expect(result.action).toBe('abort');
  });

  it('production FAILS CLOSED on any unknown deploy failure — no silent skip', () => {
    const result = decideMigrationOutcome({
      isProd: true,
      migrateDeploy: { ok: false, output: 'P3005: database is not empty' },
      migrateStatus: { ok: true, output: '' },
    });
    expect(result.action).toBe('abort');
  });

  it('non-production may fall back (db push / no-DB build allowed)', () => {
    expect(decideMigrationOutcome({
      isProd: false,
      migrateDeploy: { ok: false, output: 'P1001 unreachable' },
      migrateStatus: { ok: false, output: 'P1001 unreachable' },
    }).action).toBe('dev-fallback');
  });

  it('build script uses the gate and never db push in production (contract)', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { resolve } = require('node:path') as typeof import('node:path');
    const script = readFileSync(resolve(import.meta.dirname, '../../../../scripts/vercel-build.js'), 'utf-8');
    expect(script).toContain("require('./migration-gate.cjs')");
    expect(script).toContain("run('npx --yes prisma migrate status'");
    expect(script).toContain('decision.action === \'abort\'');
    expect(script).toContain('DEV ONLY: falling back to prisma db push (NEVER in production)');
    // the old silent production skip must be gone:
    expect(script).not.toContain('Database unreachable — skipping migration. Build will succeed');
  });
});
