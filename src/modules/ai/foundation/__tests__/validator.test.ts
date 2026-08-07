// ============================================
// Validator Contract Tests
// ============================================

import { describe, it, expect } from 'vitest';
import {
  validate, assert, collectErrors, required, minLength, maxLength,
  pattern, custom, oneOf, range, combineResults,
} from '../validation/validator';

interface TestObject {
  name: string;
  age: number;
  email: string;
  role: string;
}

describe('validate', () => {
  it('should pass when all rules pass', () => {
    const obj: TestObject = { name: 'Alice', age: 25, email: 'a@b.com', role: 'admin' };
    const result = validate(obj, [
      required<TestObject>('name'),
      required<TestObject>('age'),
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should collect multiple errors', () => {
    const obj: TestObject = { name: '', age: 0, email: '', role: '' };
    const result = validate(obj, [
      required<TestObject>('name'),
      required<TestObject>('email'),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('should include error codes in messages', () => {
    const obj: TestObject = { name: '', age: 0, email: '', role: '' };
    const result = validate(obj, [
      required<TestObject>('name'),
    ]);
    expect(result.errors[0]).toContain('[REQUIRED]');
  });
});

describe('collectErrors', () => {
  it('should return structured errors', () => {
    const obj: TestObject = { name: '', age: 0, email: '', role: '' };
    const errors = collectErrors(obj, [
      required<TestObject>('name'),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('name');
    expect(errors[0].code).toBe('REQUIRED');
  });

  it('should return all errors, not just the first', () => {
    const obj: TestObject = { name: '', age: 0, email: '', role: '' };
    const errors = collectErrors(obj, [
      required<TestObject>('name'),
      required<TestObject>('email'),
    ]);
    expect(errors).toHaveLength(2);
  });
});

describe('assert', () => {
  it('should not throw when rules pass', () => {
    const obj: TestObject = { name: 'Alice', age: 25, email: 'a@b.com', role: 'admin' };
    expect(() => assert(obj, [required<TestObject>('name')])).not.toThrow();
  });

  it('should throw AggregateError when rules fail', () => {
    const obj: TestObject = { name: '', age: 0, email: '', role: '' };
    expect(() => assert(obj, [required<TestObject>('name')]))
      .toThrow(/Validation failed/);
  });

  it('should throw AggregateError with error count', () => {
    const obj: TestObject = { name: '', age: 0, email: '', role: '' };
    try {
      assert(obj, [
        required<TestObject>('name'),
        required<TestObject>('email'),
      ]);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AggregateError);
      expect((err as AggregateError).message).toContain('2 error');
    }
  });
});

describe('required', () => {
  it('should fail on empty string', () => {
    const rule = required<TestObject>('name');
    expect(rule.rule({ name: '' } as TestObject)).not.toBeNull();
  });

  it('should fail on undefined', () => {
    const rule = required<TestObject>('name');
    expect(rule.rule({ name: undefined } as unknown as TestObject)).not.toBeNull();
  });

  it('should fail on null', () => {
    const rule = required<TestObject>('name');
    expect(rule.rule({ name: null } as unknown as TestObject)).not.toBeNull();
  });

  it('should pass on non-empty value', () => {
    const rule = required<TestObject>('name');
    expect(rule.rule({ name: 'Alice' } as TestObject)).toBeNull();
  });
});

describe('minLength', () => {
  it('should fail when below minimum', () => {
    const rule = minLength<TestObject>('name', 5);
    expect(rule.rule({ name: 'Abc' } as TestObject)).not.toBeNull();
  });

  it('should pass when at minimum', () => {
    const rule = minLength<TestObject>('name', 3);
    expect(rule.rule({ name: 'Abc' } as TestObject)).toBeNull();
  });

  it('should pass when above minimum', () => {
    const rule = minLength<TestObject>('name', 3);
    expect(rule.rule({ name: 'Abcde' } as TestObject)).toBeNull();
  });
});

describe('maxLength', () => {
  it('should fail when above maximum', () => {
    const rule = maxLength<TestObject>('name', 5);
    expect(rule.rule({ name: 'Abcdef' } as TestObject)).not.toBeNull();
  });

  it('should pass when at maximum', () => {
    const rule = maxLength<TestObject>('name', 5);
    expect(rule.rule({ name: 'Abcde' } as TestObject)).toBeNull();
  });
});

describe('pattern', () => {
  it('should fail when pattern does not match', () => {
    const rule = pattern<TestObject>('email', /^.+@.+$/, 'Invalid email');
    expect(rule.rule({ email: 'not-an-email' } as TestObject)).not.toBeNull();
  });

  it('should pass when pattern matches', () => {
    const rule = pattern<TestObject>('email', /^.+@.+$/, 'Invalid email');
    expect(rule.rule({ email: 'a@b.com' } as TestObject)).toBeNull();
  });
});

describe('custom', () => {
  it('should pass when custom function returns true', () => {
    const rule = custom<TestObject>('age', (obj) => obj.age >= 18, 'Too young');
    expect(rule.rule({ age: 25 } as TestObject)).toBeNull();
  });

  it('should fail when custom function returns false', () => {
    const rule = custom<TestObject>('age', (obj) => obj.age >= 18, 'Too young');
    expect(rule.rule({ age: 15 } as TestObject)).not.toBeNull();
  });
});

describe('oneOf', () => {
  it('should pass when value is in allowed set', () => {
    const rule = oneOf<TestObject>('role', ['admin', 'user']);
    expect(rule.rule({ role: 'admin' } as TestObject)).toBeNull();
  });

  it('should fail when value is not in allowed set', () => {
    const rule = oneOf<TestObject>('role', ['admin', 'user']);
    expect(rule.rule({ role: 'superuser' } as TestObject)).not.toBeNull();
  });
});

describe('range', () => {
  it('should pass when within range', () => {
    const rule = range<TestObject>('age', 0, 120);
    expect(rule.rule({ age: 25 } as TestObject)).toBeNull();
  });

  it('should fail when below range', () => {
    const rule = range<TestObject>('age', 0, 120);
    expect(rule.rule({ age: -5 } as TestObject)).not.toBeNull();
  });

  it('should fail when above range', () => {
    const rule = range<TestObject>('age', 0, 120);
    expect(rule.rule({ age: 200 } as TestObject)).not.toBeNull();
  });

  it('should pass at boundary', () => {
    const rule = range<TestObject>('age', 0, 120);
    expect(rule.rule({ age: 0 } as TestObject)).toBeNull();
    expect(rule.rule({ age: 120 } as TestObject)).toBeNull();
  });
});

describe('combineResults', () => {
  it('should combine valid results', () => {
    const r1 = validate({ name: 'A' } as TestObject, [required<TestObject>('name')]);
    const r2 = validate({ name: 'B' } as TestObject, [required<TestObject>('name')]);
    const combined = combineResults(r1, r2);
    expect(combined.valid).toBe(true);
    expect(combined.errors).toHaveLength(0);
  });

  it('should combine mix of valid and invalid', () => {
    const r1 = validate({ name: 'A' } as TestObject, [required<TestObject>('name')]);
    const r2 = validate({ name: '' } as TestObject, [required<TestObject>('name')]);
    const combined = combineResults(r1, r2);
    expect(combined.valid).toBe(false);
    expect(combined.errors).toHaveLength(1);
  });
});
