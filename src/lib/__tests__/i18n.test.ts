// ============================================
// Tests: i18n — Translation System
// ============================================

import { describe, it, expect } from 'vitest';
import { t } from '@/lib/i18n';

// ============================================
// Translation Function Tests
// ============================================

describe('t (translation)', () => {
  it('should return Traditional Chinese by default (no lang param)', () => {
    const result = t('nav.dashboard');
    expect(result).toBe('學習主頁');
  });

  it('should return English when lang=en', () => {
    const result = t('nav.dashboard', 'en');
    expect(result).toBe('Dashboard');
  });

  it('should return key itself for missing translation', () => {
    const result = t('nonexistent.key.12345');
    expect(result).toBe('nonexistent.key.12345');
  });

  it('should support variable interpolation with {n}', () => {
    const result = t('groups.members', 'zh', { n: 5 });
    expect(result).toBe('5 人');
  });

  it('should support variable interpolation in English', () => {
    const result = t('groups.members', 'en', { n: 3 });
    expect(result).toBe('3 members');
  });

  it('should handle multiple variables', () => {
    const result = t('groups.assignments', 'zh', { n: 7 });
    expect(result).toBe('7 作業');
  });

  it('should return empty string for empty key', () => {
    const result = t('');
    expect(result).toBe('');
  });
});

// ============================================
// Translation Coverage Tests
// ============================================

describe('Translation coverage', () => {
  it('should have navigation keys', () => {
    const navKeys = [
      'nav.dashboard', 'nav.practice', 'nav.mistakes', 'nav.vocabulary',
      'nav.progress', 'nav.writing', 'nav.integratedSkills', 'nav.dailyChallenge',
      'nav.reading', 'nav.speaking', 'nav.assignments',
    ];
    for (const key of navKeys) {
      const zh = t(key);
      const en = t(key, 'en');
      expect(zh).not.toBe(key);
      expect(en).not.toBe(key);
    }
  });

  it('should have common keys', () => {
    const commonKeys = [
      'common.welcome', 'common.practice', 'common.logout', 'common.save',
      'common.cancel', 'common.edit', 'common.loading', 'common.error',
      'common.success', 'common.search', 'common.submit', 'common.back',
    ];
    for (const key of commonKeys) {
      const zh = t(key);
      expect(zh).not.toBe(key);
    }
  });

  it('should have login keys', () => {
    const loginKeys = [
      'login.title', 'login.subtitle', 'login.email', 'login.password',
      'login.signIn', 'login.googleSignIn',
    ];
    for (const key of loginKeys) {
      const zh = t(key);
      expect(zh).not.toBe(key);
    }
  });

  it('should have teacher navigation keys', () => {
    const teacherKeys = [
      'teacher.overview', 'teacher.dashboard', 'teacher.assignments',
      'teacher.classes', 'teacher.students', 'teacher.review',
      'teacher.materials', 'teacher.import', 'teacher.reports',
      'teacher.settings',
    ];
    for (const key of teacherKeys) {
      const zh = t(key);
      expect(zh).not.toBe(key);
    }
  });
});
