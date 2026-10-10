#!/usr/bin/env node
// ============================================
// Production artifact check (2026-10-09, Sprint 133)
// ============================================
// Verifies the SHIPPED runtime artifact, not the dependency graph:
//
//   1. `.next/standalone/node_modules` must not contain any tooling-only package
//      (several of which carry advisories whose only "fix" is a downgrade);
//   2. the packages the server externalises must be present — a missing one is a
//      production-only failure that no unit test can catch;
//   3. every emitted client bundle must be parseable by Safari 15.4 (the school
//      iPad baseline);
//   4. prints the artifact package inventory as evidence.
//
// Usage:
//   npm run check:artifact                                  (via tsx)
//   npm run check:artifact -- --json                        (machine-readable)
//   npm run check:artifact -- --artifact <dir> [--static <dir>]   (explicit build output)
//
// Requires a completed `npm run build` (the same command CI and the Docker image
// run). Fails loudly when the artifact is missing rather than silently passing.
// ============================================

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import {
  evaluateProductionArtifact,
  REQUIRED_RUNTIME_PACKAGES,
  scanJavaScriptForUnsupportedSyntax,
} from '../src/shared/deployment/production-artifact-rules';

/**
 * `--artifact <dir>` / `--static <dir>` point the gate at a specific build output
 * instead of the repository default (used by operators and by the CLI test that
 * proves the missing-artifact path fails loudly).
 */
function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}

const STANDALONE = argValue('--artifact') ?? join(process.cwd(), '.next', 'standalone');
const ARTIFACT_NODE_MODULES = join(STANDALONE, 'node_modules');
const STATIC_DIR = argValue('--static') ?? join(process.cwd(), '.next', 'static');
const json = process.argv.includes('--json');

function fail(message: string): never {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  } else {
    console.error(`artifact-check: FAILED — ${message}`);
    console.error('  Build first: npm run build');
  }
  process.exit(1);
}

if (!existsSync(ARTIFACT_NODE_MODULES)) {
  fail(`no production artifact at ${ARTIFACT_NODE_MODULES}`);
}

/** Top-level package names, including scoped ones (`@scope/name`). */
function listPackages(): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(ARTIFACT_NODE_MODULES)) {
    if (entry.startsWith('.')) continue; // .prisma, .bin …
    const full = join(ARTIFACT_NODE_MODULES, entry);
    if (!statSync(full).isDirectory()) continue;
    if (entry.startsWith('@')) {
      for (const scoped of readdirSync(full)) {
        names.push(`${entry}/${scoped}`);
      }
    } else {
      names.push(entry);
    }
  }
  return names.sort();
}

const packages = listPackages();
const evaluation = evaluateProductionArtifact(packages);

if (json) {
  console.log(
    JSON.stringify({ ok: evaluation.violations.length === 0, ...evaluation, packages }, null, 2),
  );
} else {
  console.log('production artifact check (Next standalone = what the Docker image ships)');
  console.log(`  artifact:        ${ARTIFACT_NODE_MODULES}`);
  console.log(`  packages:        ${evaluation.present}`);
  console.log(`  required:        ${REQUIRED_RUNTIME_PACKAGES.join(', ')}`);
}

let failed = false;

if (evaluation.violations.length > 0) {
  failed = true;
  if (!json) {
    console.error(`  DENIED PACKAGES IN ARTIFACT: ${evaluation.violations.length}`);
    for (const v of evaluation.violations) {
      console.error(`    - ${v.name} (${v.why})`);
    }
  }
}

if (evaluation.missingRequired.length > 0) {
  failed = true;
  if (!json) {
    console.error(`  MISSING REQUIRED RUNTIME PACKAGES: ${evaluation.missingRequired.join(', ')}`);
    console.error('    the routes using them fail in production only — check file tracing');
  }
}

if (failed) {
  process.exit(1);
}

// ---------------------------------------------------------------
// Safari 15.4 client-bundle gate
// ---------------------------------------------------------------
// Safari 15.4 / iPadOS 15.x must be able to PARSE every client chunk: a parse
// error means React never hydrates and every button on every page dies.
// `browserslist` cannot protect against syntax shipped pre-compiled by a
// dependency, so the emitted bundles are scanned directly.
function walkJs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkJs(full));
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

if (!existsSync(STATIC_DIR)) {
  fail('no client bundles found at .next/static — build first');
}

const bundlePaths = walkJs(STATIC_DIR);
const bundles = bundlePaths.map((path) => ({
  path: path.replace(`${process.cwd()}${sep}`, ''),
  content: readFileSync(path, 'utf8'),
}));
const syntaxViolations = scanJavaScriptForUnsupportedSyntax(bundles);

if (json) {
  console.log(
    JSON.stringify(
      {
        bundles: bundles.length,
        safari154: { ok: syntaxViolations.length === 0, violations: syntaxViolations },
      },
      null,
      2,
    ),
  );
} else {
  console.log(`  client bundles:  ${bundles.length} scanned for post-Safari-15.4 syntax`);
}

if (syntaxViolations.length > 0) {
  if (!json) {
    console.error(`  SAFARI 15.4 VIOLATIONS: ${syntaxViolations.length}`);
    for (const v of syntaxViolations) {
      console.error(`    - ${v.path}: ${v.feature} (needs Safari ${v.since}+)`);
    }
  }
  process.exit(1);
}

if (!json) {
  console.log('artifact-check: OK (no tooling-only package ships; every required runtime package present)');
  console.log('safari-check:   OK (no post-15.4 syntax in the client bundles)');
}
