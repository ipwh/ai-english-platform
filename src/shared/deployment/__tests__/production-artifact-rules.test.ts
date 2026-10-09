// ============================================
// Production artifact rules — contract (2026-10-09, Sprint 133)
// ============================================
// Sprint 132 called the remaining advisories "development / build only" by reading
// the dependency graph. These tests make that claim falsifiable: the deny list must
// catch a tooling package inside the runtime artifact, the required list must catch
// a missing externalised dependency, and (when a build output exists locally) the
// REAL artifact must satisfy both.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  evaluateProductionArtifact,
  POST_SAFARI_154_PATTERNS,
  PRODUCTION_DENY_PACKAGES,
  REQUIRED_RUNTIME_PACKAGES,
  scanJavaScriptForUnsupportedSyntax,
} from '../production-artifact-rules';

/** A clean artifact: exactly the packages the server externalises. */
const CLEAN = [...REQUIRED_RUNTIME_PACKAGES, 'ws', 'semver', 'styled-jsx'];

describe('evaluateProductionArtifact', () => {
  it('passes a clean artifact', () => {
    const result = evaluateProductionArtifact(CLEAN);
    expect(result.violations).toEqual([]);
    expect(result.missingRequired).toEqual([]);
    expect(result.present).toBe(CLEAN.length);
  });

  it('FAILS when a tooling-only package ships', () => {
    const result = evaluateProductionArtifact([...CLEAN, 'braces', 'vitest']);
    expect(result.violations.map((v) => v.name).sort()).toEqual(['braces', 'vitest']);
    // Every violation carries a human reason, so the failure is actionable.
    for (const v of result.violations) expect(v.why.length).toBeGreaterThan(0);
  });

  it('FAILS when an externalised runtime package is missing', () => {
    const result = evaluateProductionArtifact(CLEAN.filter((p) => p !== 'sharp'));
    expect(result.missingRequired).toEqual(['sharp']);
    expect(result.violations).toEqual([]);
  });

  it('catches the whole advisories-only chain from Sprint 132', () => {
    // These were reported as "development/CLI only" — this is the automated proof.
    const tooling = [
      'prisma',
      '@prisma/config',
      'deepmerge-ts',
      'mysql2',
      '@hono/node-server',
      'valibot',
      'argparse',
      'sprintf-js',
      'braces',
      'micromatch',
      'fast-glob',
      'eslint-config-next',
      '@next/eslint-plugin-next',
    ];
    const result = evaluateProductionArtifact([...CLEAN, ...tooling]);
    expect(result.violations.map((v) => v.name).sort()).toEqual([...tooling].sort());
  });

  it('treats an empty artifact as missing everything, never as passing', () => {
    const result = evaluateProductionArtifact([]);
    expect(result.violations).toEqual([]); // nothing denied ships…
    expect(result.missingRequired).toEqual([...REQUIRED_RUNTIME_PACKAGES]); // …but nothing required is there either
  });
});

describe('rule bookkeeping', () => {
  it('has no duplicate deny entries and no empty reasons', () => {
    const names = PRODUCTION_DENY_PACKAGES.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    for (const entry of PRODUCTION_DENY_PACKAGES) {
      expect(entry.why.trim().length, `${entry.name} needs a reason`).toBeGreaterThan(0);
    }
  });

  it('requires the packages the routes genuinely need at runtime', () => {
    for (const name of ['pg', '@prisma/client', 'sharp', 'google-auth-library']) {
      expect(REQUIRED_RUNTIME_PACKAGES).toContain(name);
    }
  });
});

// ============================================
// Safari 15.4 syntax gate
// ============================================
// Safari 15.4 cannot parse any of these: a single hit in a client chunk means the
// page never hydrates, so the gate must be precise and must actually fire.
describe('scanJavaScriptForUnsupportedSyntax — Safari 15.4 gate', () => {
  it('accepts bundles that stay inside the 15.4 baseline', () => {
    const clean = [
      {
        path: 'chunk.js',
        content:
          'const a=[1,2,3].map(x=>x+1);const b=a?.length??0;const c=structuredClone(b);const d=Object.hasOwn({},"x");',
      },
    ];
    expect(scanJavaScriptForUnsupportedSyntax(clean)).toEqual([]);
  });

  const SAMPLES: ReadonlyArray<[string, string, string]> = [
    ['class A { static { this.x = 1 } }', 'class static block', '16.4'],
    ['Object.groupBy(xs, f)', 'Object.groupBy', '17.4'],
    ['Map.groupBy(xs, f)', 'Map.groupBy', '17.4'],
    ['Promise.withResolvers()', 'Promise.withResolvers', '17.4'],
    ['Array.fromAsync(xs)', 'Array.fromAsync', '16.4'],
    ['xs.toSorted()', 'Array.prototype.toSorted', '16.4'],
    ['xs.toReversed()', 'Array.prototype.toReversed', '16.4'],
    ['xs.toSpliced(0, 1)', 'Array.prototype.toSpliced', '16.4'],
    ['new RegExp("(?<=a)b")', 'RegExp lookbehind', '16.4'],
  ];

  it.each(SAMPLES)('flags %s as %s (Safari %s+)', (snippet, feature, since) => {
    expect(scanJavaScriptForUnsupportedSyntax([{ path: 'bad.js', content: snippet }])).toEqual([
      { path: 'bad.js', feature, since },
    ]);
  });

  it('covers every documented pattern (the list cannot silently shrink)', () => {
    expect(POST_SAFARI_154_PATTERNS).toHaveLength(SAMPLES.length);
    expect(POST_SAFARI_154_PATTERNS.map((p) => p.feature).sort()).toEqual(
      SAMPLES.map(([, feature]) => feature).sort(),
    );
  });

  it('reports the offending file for each violation', () => {
    const violations = scanJavaScriptForUnsupportedSyntax([
      { path: 'a.js', content: 'xs.toSorted()' },
      { path: 'b.js', content: 'ok' },
      { path: 'c.js', content: 'Object.groupBy(x, f)' },
    ]);
    expect(violations.map((v) => v.path)).toEqual(['a.js', 'c.js']);
  });
});

// ============================================
// Real artifact (local only — CI runs the tests BEFORE the build, and the
// dedicated `npm run check:artifact` step covers it there afterwards).
// ============================================
const ARTIFACT = join(process.cwd(), '.next', 'standalone', 'node_modules');

describe.skipIf(!existsSync(ARTIFACT))('real production artifact', () => {
  function artifactPackages(): string[] {
    const names: string[] = [];
    for (const entry of readdirSync(ARTIFACT)) {
      if (entry.startsWith('.')) continue;
      const full = join(ARTIFACT, entry);
      if (!statSync(full).isDirectory()) continue;
      if (entry.startsWith('@')) {
        for (const scoped of readdirSync(full)) names.push(`${entry}/${scoped}`);
      } else {
        names.push(entry);
      }
    }
    return names.sort();
  }

  it('ships no tooling-only package and no missing runtime package', () => {
    const evaluation = evaluateProductionArtifact(artifactPackages());
    expect(evaluation.violations.map((v) => v.name)).toEqual([]);
    expect(evaluation.missingRequired).toEqual([]);
  });
});
