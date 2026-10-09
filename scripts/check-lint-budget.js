#!/usr/bin/env node
/**
 * ESLint per-rule warning budget (ratchet) — 2026-10-08 (Sprint 132)
 * ==================================================================
 * `eslint . --max-warnings N` only bounds the TOTAL. A total lets debt move
 * around: fix 10 warnings of one rule and introduce 10 of another, and the gate
 * still passes. This script records a budget PER RULE, so:
 *
 *   * any rule that exceeds its recorded budget FAILS the build
 *   * any rule that hits ZERO is reported as promotable to `error`
 *   * the budgets are the single, reviewable record of the remaining lint debt
 *
 * Burn-down policy: budgets may only be LOWERED. Raising one requires an
 * explicit, reviewed commit that changes the number here.
 *
 * Usage: node scripts/check-lint-budget.js [--json]
 */
'use strict';

const { execSync } = require('child_process');

/**
 * Recorded warning budgets. Baseline before the burn-down: 471 total (AGENTS.md;
 * the `--max-warnings` gate itself sat at 480 from 2026-10-08, ADR-050).
 * Sprint 132 measured 262 and removed 3 more → 259. Sprint 133 removed a further
 * 13 with no rule suppression: the `const { omitted, ...rest }` OMIT idiom is now
 * covered by the documented `ignoreRestSiblings` option (the binding exists only
 * to keep the key out of `rest`), plus genuinely dead query bindings were dropped.
 * 246 is the exact measured state, verified 2026-10-09 (0 errors).
 */
const BUDGETS = {
  '@typescript-eslint/no-unused-vars': 134, // unused locals/params (case-by-case; auto-removal proved unsafe)
  '@typescript-eslint/no-explicit-any': 50, // dynamic admin façade + legacy components
  'react-hooks/set-state-in-effect': 35, // React 19 rule; needs component restructuring
  'react-hooks/exhaustive-deps': 15, // remaining deps are component-local fns / props
  '@typescript-eslint/no-require-imports': 12, // deliberate: dual SQLite/Postgres driver loading
};

/** Total allowance (must equal the sum of the budgets above). */
const TOTAL_BUDGET = Object.values(BUDGETS).reduce((a, b) => a + b, 0);

function runEslint() {
  try {
    return execSync('npx eslint . -f json', {
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  } catch (err) {
    // ESLint exits non-zero when it reports ERRORS; we still want the JSON.
    return err.stdout || '';
  }
}

function main() {
  const raw = runEslint();
  let results;
  try {
    results = JSON.parse(raw);
  } catch {
    console.error('lint-budget: could not parse ESLint JSON output.');
    process.exit(2);
  }

  const warnings = {};
  const errors = {};
  for (const file of results) {
    for (const msg of file.messages) {
      const rule = msg.ruleId || '(no-rule)';
      if (msg.severity === 2) errors[rule] = (errors[rule] || 0) + 1;
      else warnings[rule] = (warnings[rule] || 0) + 1;
    }
  }

  const total = Object.values(warnings).reduce((a, b) => a + b, 0);
  const errorTotal = Object.values(errors).reduce((a, b) => a + b, 0);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ warnings, errors, total, errorTotal, budgets: BUDGETS }, null, 2));
  } else {
    console.log('ESLint budget check');
    console.log(`  errors:   ${errorTotal} (must be 0)`);
    console.log(`  warnings: ${total} (allowance ${TOTAL_BUDGET})`);
    console.log('  per-rule:');
    const rules = [...new Set([...Object.keys(BUDGETS), ...Object.keys(warnings)])].sort();
    for (const rule of rules) {
      const actual = warnings[rule] || 0;
      const budget = BUDGETS[rule];
      const mark = budget === undefined ? (actual > 0 ? '❌ NEW RULE' : '·') : actual > budget ? '❌ OVER' : actual < budget ? '✅ under' : '✅ at budget';
      console.log(`    ${String(actual).padStart(4)} / ${String(budget ?? '-').padStart(4)}  ${mark}  ${rule}`);
    }
  }

  const failures = [];
  if (errorTotal > 0) failures.push(`${errorTotal} ESLint error(s) — errors are never allowed.`);
  if (total > TOTAL_BUDGET) {
    failures.push(`total warnings ${total} exceed the allowance ${TOTAL_BUDGET}.`);
  }
  for (const [rule, budget] of Object.entries(BUDGETS)) {
    const actual = warnings[rule] || 0;
    if (actual > budget) failures.push(`'${rule}' rose to ${actual} (budget ${budget}).`);
  }
  for (const [rule, actual] of Object.entries(warnings)) {
    if (!(rule in BUDGETS) && actual > 0) {
      failures.push(`new warning source '${rule}' (${actual}) — add a budget only after fixing it or justifying it.`);
    }
  }

  if (failures.length) {
    console.error('\nlint-budget: FAILED');
    for (const f of failures) console.error(`  - ${f}`);
    console.error('  Budgets may only be lowered. Fix the warnings instead of raising a budget.');
    process.exit(1);
  }

  console.log('\nlint-budget: OK (no rule exceeds its budget).');
  const zero = Object.keys(BUDGETS).filter((r) => (warnings[r] || 0) === 0);
  if (zero.length) console.log(`  Promotable to \`error\` (zero warnings): ${zero.join(', ')}`);
}

main();
