// ============================================
// SemVer Contract Tests
// ============================================

import { describe, it, expect } from 'vitest';
import { parseSemVer, compareSemVer } from '../types';

describe('parseSemVer', () => {
  it('should parse a simple version', () => {
    const result = parseSemVer('1.2.3');
    expect(result).toEqual({ major: 1, minor: 2, patch: 3, prerelease: undefined });
  });

  it('should parse a version with prerelease', () => {
    const result = parseSemVer('1.0.0-alpha');
    expect(result).toEqual({ major: 1, minor: 0, patch: 0, prerelease: 'alpha' });
  });

  it('should parse a version with dotted prerelease', () => {
    const result = parseSemVer('2.1.0-beta.1');
    expect(result).toEqual({ major: 2, minor: 1, patch: 0, prerelease: 'beta.1' });
  });

  it('should return null for invalid version', () => {
    expect(parseSemVer('not-a-version')).toBeNull();
    expect(parseSemVer('1.0')).toBeNull();
    expect(parseSemVer('v1.0.0')).toBeNull();
    expect(parseSemVer('')).toBeNull();
    expect(parseSemVer('1.0.0.0')).toBeNull();
  });

  it('should parse zero versions', () => {
    expect(parseSemVer('0.0.0')).toEqual({ major: 0, minor: 0, patch: 0, prerelease: undefined });
  });

  it('should parse large versions', () => {
    const result = parseSemVer('999.888.777');
    expect(result).toEqual({ major: 999, minor: 888, patch: 777, prerelease: undefined });
  });
});

describe('compareSemVer', () => {
  it('should return 0 for equal versions', () => {
    expect(compareSemVer('1.0.0', '1.0.0')).toBe(0);
  });

  it('should compare major versions', () => {
    expect(compareSemVer('2.0.0', '1.0.0')).toBeGreaterThan(0);
    expect(compareSemVer('1.0.0', '2.0.0')).toBeLessThan(0);
  });

  it('should compare minor versions when major equal', () => {
    expect(compareSemVer('1.2.0', '1.1.0')).toBeGreaterThan(0);
    expect(compareSemVer('1.0.0', '1.5.0')).toBeLessThan(0);
  });

  it('should compare patch versions when major and minor equal', () => {
    expect(compareSemVer('1.0.3', '1.0.2')).toBeGreaterThan(0);
    expect(compareSemVer('1.0.0', '1.0.9')).toBeLessThan(0);
  });

  it('should sort prerelease before release', () => {
    expect(compareSemVer('1.0.0-alpha', '1.0.0')).toBeLessThan(0);
    expect(compareSemVer('1.0.0', '1.0.0-alpha')).toBeGreaterThan(0);
  });

  it('should compare prerelease tags lexicographically', () => {
    expect(compareSemVer('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0);
    expect(compareSemVer('1.0.0-beta', '1.0.0-alpha')).toBeGreaterThan(0);
  });

  it('should return 0 for both invalid', () => {
    expect(compareSemVer('invalid', 'also-invalid')).toBe(0);
  });

  it('should sort versions correctly in an array', () => {
    const versions = ['2.0.0', '1.0.0', '1.2.0', '1.1.0', '1.0.1'];
    const sorted = [...versions].sort(compareSemVer);
    expect(sorted).toEqual(['1.0.0', '1.0.1', '1.1.0', '1.2.0', '2.0.0']);
  });

  it('should handle prerelease in array sort', () => {
    const versions = ['1.0.0', '1.0.0-beta', '1.0.0-alpha', '1.0.0'];
    const sorted = [...versions].sort(compareSemVer);
    // Prerelease should sort before release
    expect(sorted[0]).toBe('1.0.0-alpha');
    expect(sorted[1]).toBe('1.0.0-beta');
  });
});
