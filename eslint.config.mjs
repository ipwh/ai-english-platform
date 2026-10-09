import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build scripts — not application code
    "scripts/**",
    // Prisma seed — not application code
    "prisma/seed.ts",
    // E2E test files
    "e2e/**",
    // Virtual env
    ".venv/**",
  ]),
  // Downgrade non-critical rules to warnings during codebase transition.
  // These will be re-upgraded to errors once the codebase is fully cleaned.
  //
  // 2026-10-08 (Sprint 132): the burn-down removed every warning from
  // `prefer-const`, `@next/next/no-img-element` and
  // `@typescript-eslint/no-unused-expressions`, so those three are now ERRORS —
  // the gate got stricter, not weaker. The remaining rules keep budgets instead
  // of a global allowance (see scripts/check-lint-budget.js, which fails the
  // build if any single rule exceeds its recorded budget).
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        // The OMIT idiom: `const { key, ...rest } = obj` binds `key` ONLY so it stays
        // out of `rest` — it is never read by design (used heavily by the schema
        // validation tests, e.g. `const { feedbackZh, ...invalid } = validAnswer`).
        // This is the documented option for that pattern; a genuinely dead variable
        // that is not a rest-sibling is still reported.
        ignoreRestSiblings: true,
      }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "react-hooks/exhaustive-deps": "warn",
      // React 19 new rules — downgrade to warnings during transition
      "react-hooks/set-state-in-effect": "warn",
      // Cleaned in Sprint 132 — promoted to errors so they can never come back.
      "@next/next/no-img-element": "error",
      "prefer-const": "error",
      "@typescript-eslint/no-unused-expressions": "error",
      // Enforce structured logging — forbid console.log/error/warn
      // Use logger.info/error/warn from '@/shared/logger/logger' instead
      "no-console": ["error", {
        allow: ["warn", "error"],
      }],
    },
  },
]);

export default eslintConfig;
