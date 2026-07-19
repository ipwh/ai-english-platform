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
    // E2E test files
    "e2e/**",
    // Virtual env
    ".venv/**",
  ]),
  // Downgrade non-critical rules to warnings during codebase transition.
  // These will be re-upgraded to errors once the codebase is fully cleaned.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "react-hooks/exhaustive-deps": "warn",
      // React 19 new rules — downgrade to warnings during transition
      "react-hooks/set-state-in-effect": "warn",
      "@next/next/no-img-element": "warn",
      "prefer-const": "warn",
      // Enforce structured logging — forbid console.log/error/warn
      // Use logger.info/error/warn from '@/shared/logger/logger' instead
      "no-console": ["error", {
        allow: ["warn", "error"],
      }],
    },
  },
]);

export default eslintConfig;
