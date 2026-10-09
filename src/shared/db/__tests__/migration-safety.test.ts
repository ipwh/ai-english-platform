// ============================================
// Migration safety guard — 2026-10-08 (Sprint 132)
// ============================================
// The deployment pipeline runs `prisma migrate deploy` BEFORE the new image is
// deployed (cloudbuild.yaml step `Migrate`), and Cloud Run shifts traffic
// gradually, so for a short window OLD application code runs against the NEW
// schema. That makes two properties load-bearing:
//
//   1. migrations must be ADDITIVE / BACKWARD COMPATIBLE (expand, not contract)
//      so the previous image keeps working and a rollback stays possible
//   2. a DESTRUCTIVE migration must be a deliberate, reviewed decision
//
// This guard fails when a migration introduces a destructive operation that is
// not on the recorded allowlist. It does not forbid destructive migrations — it
// forbids them *silently*.
//
// To add one: make the change, then add its `<migration-folder>` to
// REVIEWED_DESTRUCTIVE_MIGRATIONS with the reason, in the same PR.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');

/**
 * Migrations that predate this guard and were reviewed individually. Each entry
 * is historical; no new entry should be needed for an additive migration.
 */
const REVIEWED_DESTRUCTIVE_MIGRATIONS: Record<string, string> = {
  '20260719_json_fields_migration':
    'JSON column migration: renames badgeIds_json→badgeIds / subjects_json→subjects and drops the superseded originals (applied long before this guard).',
  '20260813_mistake_unique_question':
    'Deduplicates Mistake rows before adding @@unique([studentId, questionId]); the delete is the dedupe step.',
  '20260819_submission_unique_assignment_student':
    'Deduplicates Submission rows (attempts reassigned first) before adding @@unique([assignmentId, studentId]); the delete + temp-table drop are the dedupe steps.',
  '20260923_user_overall_accuracy_drop_default':
    'Drops the @default(0) on User.overallAccuracy so "no verified evidence" can be NULL instead of a misleading 0.',
  '20260924_listening_question_store':
    'Removes the dormant ListeningSession/ListeningAnswer tables superseded by ListeningQuestion; no rows were in use.',
};

/** Destructive SQL shapes. Deliberately does NOT match `ON DELETE CASCADE`. */
const DESTRUCTIVE_PATTERNS: Array<{ name: string; re: RegExp }> = [
  {
    name: 'DROP TABLE/COLUMN/CONSTRAINT/INDEX/TYPE/DEFAULT',
    re: /\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|SCHEMA|TYPE|DEFAULT|NOT\s+NULL|VIEW|SEQUENCE|FUNCTION|TRIGGER|EXTENSION)\b/i,
  },
  { name: 'DELETE FROM', re: /^\s*DELETE\s+FROM\b/im },
  { name: 'TRUNCATE', re: /\bTRUNCATE\b/i },
  { name: 'RENAME COLUMN', re: /\bRENAME\s+COLUMN\b/i },
  { name: 'ALTER COLUMN … TYPE', re: /ALTER\s+COLUMN\s+\S+\s+TYPE\b/i },
  { name: 'SET NOT NULL', re: /\bSET\s+NOT\s+NULL\b/i },
];

function migrationFolders(): string[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function destructiveOperations(sql: string): string[] {
  return DESTRUCTIVE_PATTERNS.filter((p) => p.re.test(sql)).map((p) => p.name);
}

describe('prisma migration safety', () => {
  it('has a migrations directory with SQL files', () => {
    const folders = migrationFolders();
    expect(folders.length).toBeGreaterThan(0);
    for (const folder of folders) {
      expect(existsSync(join(MIGRATIONS_DIR, folder, 'migration.sql'))).toBe(true);
    }
  });

  it('introduces no UNREVIEWED destructive migration', () => {
    const offenders: string[] = [];
    for (const folder of migrationFolders()) {
      const sql = readFileSync(join(MIGRATIONS_DIR, folder, 'migration.sql'), 'utf-8');
      const ops = destructiveOperations(sql);
      if (ops.length > 0 && !(folder in REVIEWED_DESTRUCTIVE_MIGRATIONS)) {
        offenders.push(`${folder}: ${ops.join(', ')}`);
      }
    }
    expect(
      offenders,
      `Destructive migrations need an explicit, reviewed allowlist entry in\n` +
        `src/shared/db/__tests__/migration-safety.test.ts (deployment safety: the pipeline\n` +
        `migrates BEFORE deploying, and Cloud Run shifts traffic gradually, so the previous\n` +
        `image briefly runs against the new schema).\nOffenders:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('keeps the Sprint 131 concurrency migration purely additive (rollback-safe)', () => {
    const folder = migrationFolders().find((f) => f.includes('ielts_concurrency_guards'));
    expect(folder, 'Sprint 131 concurrency migration is missing').toBeTruthy();

    const sql = readFileSync(join(MIGRATIONS_DIR, folder!, 'migration.sql'), 'utf-8');
    expect(destructiveOperations(sql)).toEqual([]);

    // The two invariants it establishes, spelled out so a future edit cannot
    // quietly weaken either one.
    expect(sql).toMatch(/CREATE TABLE "IeltsGenerationQuota"/);
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "IeltsGenerationQuota_ownerUserId_dayKey_bucket_key"/,
    );
    expect(sql).toMatch(/ALTER TABLE "IeltsAttempt" ADD COLUMN "activeKey" TEXT/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "IeltsAttempt_activeKey_key"/);

    // The unique index is only valid because existing rows keep NULL (a partial
    // key), so there must be NO backfill of activeKey.
    expect(sql).not.toMatch(/UPDATE\s+"IeltsAttempt"/i);
  });

  it('documents every allowlisted destructive migration with a reason', () => {
    for (const [folder, reason] of Object.entries(REVIEWED_DESTRUCTIVE_MIGRATIONS)) {
      expect(reason.length, `${folder} needs a real justification`).toBeGreaterThan(30);
      expect(
        migrationFolders(),
        `${folder} is allowlisted but does not exist`,
      ).toContain(folder);
    }
  });

  it('allowlists only migrations that really are destructive (no stale entries)', () => {
    for (const folder of Object.keys(REVIEWED_DESTRUCTIVE_MIGRATIONS)) {
      const sql = readFileSync(join(MIGRATIONS_DIR, folder, 'migration.sql'), 'utf-8');
      expect(
        destructiveOperations(sql).length,
        `${folder} is allowlisted but contains no destructive operation`,
      ).toBeGreaterThan(0);
    }
  });
});
