// ============================================
// Validator — Reusable validation utilities
// with validate, assert, and collectErrors.
//
// Provides a consistent validation pattern
// across all PromptOps modules.
// ============================================

import type { ValidationResult, ValidationError } from '../types';

/**
 * A validation rule: takes a value and returns an
 * error message, or null if the value is valid.
 */
export type ValidationRule<T> = (value: T) => string | null;

/**
 * A named validation rule with a field identifier.
 */
export interface NamedRule<T> {
  /** Field name (used in error messages) */
  field: string;
  /** The validation rule */
  rule: ValidationRule<T>;
  /** Optional error code */
  code?: string;
}

// ── Core Validation ──

/**
 * Validate a value against a set of rules.
 *
 * @param value — The value to validate
 * @param rules — Validation rules to apply
 * @returns ValidationResult with errors and warnings
 */
export function validate<T>(value: T, rules: NamedRule<T>[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const { field, rule, code } of rules) {
    const result = rule(value);
    if (result !== null) {
      const prefix = code ? `[${code}] ` : '';
      errors.push(`${prefix}${field}: ${result}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate and collect structured error objects.
 *
 * @param value — The value to validate
 * @param rules — Validation rules
 * @returns Array of ValidationError objects
 */
export function collectErrors<T>(value: T, rules: NamedRule<T>[]): ValidationError[] {
  const result: ValidationError[] = [];

  for (const { field, rule, code } of rules) {
    const message = rule(value);
    if (message !== null) {
      result.push({ field, message, code });
    }
  }

  return result;
}

/**
 * Assert that a value passes all validation rules.
 * Throws an AggregateError if validation fails.
 *
 * @param value — The value to validate
 * @param rules — Validation rules
 * @throws {AggregateError} If any rules fail
 */
export function assert<T>(value: T, rules: NamedRule<T>[]): void {
  const errors = collectErrors(value, rules);
  if (errors.length > 0) {
    throw new AggregateError(
      errors.map(e => `${e.field}: ${e.message}`),
      `Validation failed: ${errors.length} error(s)`,
    );
  }
}

// ── Common Validation Rules ──

/**
 * Create a required-field rule.
 *
 * @param field — Field name
 * @param message — Custom error message
 */
export function required<T>(
  field: string,
  message = 'is required',
): NamedRule<T> {
  return {
    field,
    code: 'REQUIRED',
    rule: (value: T) => {
      const val = (value as Record<string, unknown>)[field];
      if (val === undefined || val === null || val === '') {
        return message;
      }
      return null;
    },
  };
}

/**
 * Create a min-length rule for string fields.
 */
export function minLength<T>(
  field: string,
  min: number,
  message?: string,
): NamedRule<T> {
  return {
    field,
    code: 'MIN_LENGTH',
    rule: (value: T) => {
      const val = (value as Record<string, unknown>)[field];
      if (typeof val === 'string' && val.length < min) {
        return message ?? `must be at least ${min} characters`;
      }
      return null;
    },
  };
}

/**
 * Create a max-length rule for string fields.
 */
export function maxLength<T>(
  field: string,
  max: number,
  message?: string,
): NamedRule<T> {
  return {
    field,
    code: 'MAX_LENGTH',
    rule: (value: T) => {
      const val = (value as Record<string, unknown>)[field];
      if (typeof val === 'string' && val.length > max) {
        return message ?? `must be at most ${max} characters`;
      }
      return null;
    },
  };
}

/**
 * Create a pattern (regex) rule.
 */
export function pattern<T>(
  field: string,
  regex: RegExp,
  message: string,
): NamedRule<T> {
  return {
    field,
    code: 'PATTERN',
    rule: (value: T) => {
      const val = (value as Record<string, unknown>)[field];
      if (typeof val === 'string' && !regex.test(val)) {
        return message;
      }
      return null;
    },
  };
}

/**
 * Create a custom rule for a specific field.
 *
 * @param field — The field name
 * @param fn — Custom validation function
 * @param message — Error message
 * @param code — Optional error code
 */
export function custom<T>(
  field: string,
  fn: (value: T) => boolean,
  message: string,
  code?: string,
): NamedRule<T> {
  return {
    field,
    code: code ?? 'CUSTOM',
    rule: (value: T) => {
      if (!fn(value)) return message;
      return null;
    },
  };
}

/**
 * Validate that a value is one of an allowed set.
 */
export function oneOf<T>(
  field: string,
  allowed: unknown[],
  message?: string,
): NamedRule<T> {
  return {
    field,
    code: 'ONE_OF',
    rule: (value: T) => {
      const val = (value as Record<string, unknown>)[field];
      if (!allowed.includes(val)) {
        return message ?? `must be one of: [${allowed.join(', ')}]`;
      }
      return null;
    },
  };
}

/**
 * Validate that a number field is within a range.
 */
export function range<T>(
  field: string,
  min: number,
  max: number,
  message?: string,
): NamedRule<T> {
  return {
    field,
    code: 'RANGE',
    rule: (value: T) => {
      const val = (value as Record<string, unknown>)[field];
      if (typeof val === 'number' && (val < min || val > max)) {
        return message ?? `must be between ${min} and ${max}`;
      }
      return null;
    },
  };
}

/**
 * Combine multiple validation results into one.
 */
export function combineResults(...results: ValidationResult[]): ValidationResult {
  return {
    valid: results.every(r => r.valid),
    errors: results.flatMap(r => r.errors),
    warnings: results.flatMap(r => r.warnings),
  };
}
