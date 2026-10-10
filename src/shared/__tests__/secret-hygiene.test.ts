// ============================================
// Secret hygiene — no database credential may ever be committed (Sprint 138)
// ============================================
// Origin: on 2026-10-10 a production connection string was printed into a local session transcript
// while auditing configuration key names (see docs/production/credential-incident-2026-10-10.md).
// That leak came from an UNTRACKED local file, so the root fix is a process control (never pass a
// secret as a command-line argument) — this test guards the OTHER direction: that no such
// credential ever reaches the repository itself.
//
// Deliberately narrow patterns: the generic `postgresql://user:password@host` shape has legitimate
// local/CI placeholders in this repo (Dockerfile, prisma.config.ts, ci.yml), so matching it would
// produce false positives. The detectors target the production provider's actual credential shapes.
//
// Sample strings are assembled from fragments so that this file never contains a matchable literal
// (a third test asserts exactly that, proving no self-exclusion is needed).
// ============================================

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Provider credential prefix, assembled at runtime. */
const PREFIX = ['n', 'pg', '_'].join('');

const NEON_URL_WITH_CREDENTIALS =
  /postgres(?:ql)?:\/\/[^@\s]+@(?:[a-z0-9-]+\.)+neon\.tech/;

const PREFIX_PATTERN = new RegExp(`${PREFIX}[A-Za-z0-9]{8,}`);

const TEXT_FILE =
  /\.(?:ts|tsx|js|jsx|mjs|cjs|json|ya?ml|md|txt|ps1|sh|sql|prisma|env|example|sample)$/i;

const SELF = 'src/shared/__tests__/secret-hygiene.test.ts';

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

describe('secret hygiene — no committed production database credentials', () => {
  it('control: the detectors fire on synthetic credentials (a silent detector is worthless)', () => {
    const scheme = ['postgres', 'ql://'].join('');
    const host = ['ep-example-123', 'ap-southeast-1', 'aws', 'neon', 'tech'].join('.');
    const syntheticUrl = `${scheme}somebody:${'A1b2C3d4E5F6'}@${host}/neondb`;
    const syntheticSecret = `${PREFIX}${'A1b2C3d4E5F6'}`;

    expect(NEON_URL_WITH_CREDENTIALS.test(syntheticUrl)).toBe(true);
    expect(PREFIX_PATTERN.test(syntheticSecret)).toBe(true);
  });

  it('control: this test file itself contains nothing matchable (no self-exclusion needed)', () => {
    const self = readFileSync(SELF, 'utf8');

    expect(NEON_URL_WITH_CREDENTIALS.test(self)).toBe(false);
    expect(PREFIX_PATTERN.test(self)).toBe(false);
    expect(self).not.toContain(`${PREFIX}` + 'A1b2C3d4E5F6');
  });

  it('no tracked file contains a provider credential URL or secret prefix', () => {
    const offenders: string[] = [];

    for (const file of trackedFiles()) {
      if (!TEXT_FILE.test(file)) continue;

      let content: string;
      try {
        content = readFileSync(file, 'utf8');
      } catch {
        continue; // binary or unreadable — nothing textual to leak
      }

      if (NEON_URL_WITH_CREDENTIALS.test(content)) {
        offenders.push(`${file} :: provider URL carrying inline credentials`);
      } else if (PREFIX_PATTERN.test(content)) {
        offenders.push(`${file} :: provider credential prefix`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
