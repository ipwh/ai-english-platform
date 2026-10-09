// ============================================
// Production artifact rules (2026-10-09, Sprint 133)
// ============================================
// The runtime image is `.next/standalone` (+ `.next/static`, `public`,
// `node_modules/.prisma`). The Dockerfile copies NOTHING else — there is no full
// `node_modules` in the runner stage — so a package is "in production" if and
// only if it appears under `.next/standalone/node_modules`, or is inlined into a
// traced server chunk.
//
// Sprint 132 classified the surviving advisories as "development / build only" by
// reading the dependency graph. That is a human judgement. This module turns it
// into an automated, falsifiable invariant:
//
//   * a package that is tooling-only (and, for several of them, carries an open
//     advisory) must NEVER appear in the shipped artifact;
//   * the packages the server externalises MUST be present, or the routes that
//     require them break in production (a missing native/heavy dependency cannot
//     be caught by any unit test).
//
// Pure data + a pure evaluator, so it is unit-testable without running a build.
// ============================================

export interface DeniedPackage {
  name: string;
  why: string;
}

/**
 * Tooling / build-only packages. Each entry is either a known-vulnerable package
 * whose advisory can only be "fixed" by a downgrade, or a build-time tool that has
 * no business in the runtime image.
 */
export const PRODUCTION_DENY_PACKAGES: ReadonlyArray<DeniedPackage> = [
  { name: 'eslint', why: 'lint tooling' },
  { name: 'eslint-config-next', why: 'lint tooling' },
  { name: '@next/eslint-plugin-next', why: 'lint tooling' },
  { name: '@typescript-eslint', why: 'lint tooling' },
  { name: 'vitest', why: 'test runner' },
  { name: '@vitest', why: 'test runner internals' },
  { name: 'typescript', why: 'compile-time only' },
  { name: 'tailwindcss', why: 'compile-time CSS' },
  { name: '@tailwindcss', why: 'compile-time CSS' },
  { name: '@playwright/test', why: 'e2e tooling' },
  { name: 'playwright', why: 'e2e tooling' },
  { name: 'tsx', why: 'script runner' },
  { name: 'prisma', why: 'CLI only; the runtime uses @prisma/client' },
  { name: '@prisma/config', why: 'CLI-only chain (advisory, downgrade-only fix)' },
  { name: '@prisma/dev', why: 'CLI-only chain (advisory, downgrade-only fix)' },
  { name: 'deepmerge-ts', why: 'reached only through @prisma/config' },
  { name: 'mysql2', why: 'reached only through the Prisma CLI' },
  { name: '@hono/node-server', why: 'reached only through the Prisma CLI' },
  { name: 'valibot', why: 'reached only through the Prisma CLI' },
  { name: 'argparse', why: 'reached only through mammoth (inlined, not externalised)' },
  { name: 'sprintf-js', why: 'advisory (GHSA-hp3w-g68c-fv3c); build-only in practice' },
  { name: 'braces', why: 'advisory with no upstream patch; lint chain only' },
  { name: 'micromatch', why: 'advisory via braces; lint chain only' },
  { name: 'fast-glob', why: 'advisory via micromatch; lint chain only' },
  { name: 'glob', why: 'build-time file walking' },
  { name: 'minimatch', why: 'build-time pattern matching' },
];

/**
 * Packages the runtime server requires from `node_modules` (they are externalised
 * rather than inlined: native bindings, heavy trees, or dynamic layout lookups).
 * If any of these is missing from the artifact, the corresponding route fails at
 * runtime in production only — never in tests.
 */
export const REQUIRED_RUNTIME_PACKAGES: ReadonlyArray<string> = [
  'next',
  'react',
  'react-dom',
  'pg',
  '@prisma/client',
  'sharp',
  'google-auth-library',
  'pdfkit',
];

export interface ArtifactEvaluation {
  /** Number of packages found in the artifact. */
  present: number;
  /** Denied packages that are present — each one fails the check. */
  violations: DeniedPackage[];
  /** Required runtime packages that are absent. */
  missingRequired: string[];
}

/** Pure evaluator: `packages` = top-level names under `.next/standalone/node_modules`. */
export function evaluateProductionArtifact(packages: readonly string[]): ArtifactEvaluation {
  const present = new Set(packages);
  return {
    present: packages.length,
    violations: PRODUCTION_DENY_PACKAGES.filter((entry) => present.has(entry.name)),
    missingRequired: REQUIRED_RUNTIME_PACKAGES.filter((name) => !present.has(name)),
  };
}

// ============================================
// Safari 15.4 syntax gate (2026-10-09, Sprint 133)
// ============================================
// The school iPads cap out at iPadOS 15.8 / Safari 15.6. A parse error in ANY
// client chunk means React never hydrates — every button on every page stops
// working (the 2026-09-23 incident). The repo's original gate was `static {`
// (class static block, Safari 16.4+); `browserslist` cannot catch syntax that a
// dependency ships pre-compiled, so the emitted bundles are scanned directly.
//
// Only features that DEFINITELY post-date 15.4 are listed — a noisy gate gets
// disabled, so precision matters more than coverage here. Browser support data:
// MDN / caniuse, per the versions noted.

export interface UnsupportedSyntaxPattern {
  match: RegExp;
  feature: string;
  /** First Safari version that supports it. */
  since: string;
}

export const POST_SAFARI_154_PATTERNS: ReadonlyArray<UnsupportedSyntaxPattern> = [
  { match: /\bstatic\s*\{/, feature: 'class static block', since: '16.4' },
  { match: /\bObject\.groupBy\s*\(/, feature: 'Object.groupBy', since: '17.4' },
  { match: /\bMap\.groupBy\s*\(/, feature: 'Map.groupBy', since: '17.4' },
  { match: /\bPromise\.withResolvers\s*\(/, feature: 'Promise.withResolvers', since: '17.4' },
  { match: /\bArray\.fromAsync\s*\(/, feature: 'Array.fromAsync', since: '16.4' },
  { match: /\.toSorted\s*\(/, feature: 'Array.prototype.toSorted', since: '16.4' },
  { match: /\.toReversed\s*\(/, feature: 'Array.prototype.toReversed', since: '16.4' },
  { match: /\.toSpliced\s*\(/, feature: 'Array.prototype.toSpliced', since: '16.4' },
  { match: /\(\?<[=!]/, feature: 'RegExp lookbehind', since: '16.4' },
];

export interface JsFile {
  path: string;
  content: string;
}

export interface SyntaxViolation {
  path: string;
  feature: string;
  since: string;
}

/**
 * Scans emitted JavaScript for syntax/APIs the school iPads cannot run.
 * Pure (contents are passed in) so it can be unit-tested against fixtures.
 */
export function scanJavaScriptForUnsupportedSyntax(
  files: readonly JsFile[],
): SyntaxViolation[] {
  const violations: SyntaxViolation[] = [];
  for (const file of files) {
    for (const pattern of POST_SAFARI_154_PATTERNS) {
      if (pattern.match.test(file.content)) {
        violations.push({ path: file.path, feature: pattern.feature, since: pattern.since });
      }
    }
  }
  return violations;
}
