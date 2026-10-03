// ============================================
// IELTS Starter Content Service — provisioning gates (2026-10-03 V)
// ============================================
// The repository is mocked: these tests pin WHEN provisioning runs, WHAT it
// writes (PUBLISHED + provenance stamp), and that it is race-safe.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  countTests: vi.fn(),
  createTest: vi.fn(),
  createSection: vi.fn(),
  createQuestions: vi.fn(),
}));

vi.mock('@/modules/ielts/repositories/ielts-repo', () => ({
  countTests: mocks.countTests,
  createTest: mocks.createTest,
  createSection: mocks.createSection,
  createQuestions: mocks.createQuestions,
}));

import {
  ensureStarterContent,
  STARTER_CONTENT_REVIEWER,
} from '../services/starter-content-service';
import { IELTS_STARTER_SETS } from '../content/starter-sets';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createTest.mockImplementation(async (data: { slug: string }) => ({ id: `test-${data.slug}` }));
  mocks.createSection.mockResolvedValue({ id: 'section-1' });
  mocks.createQuestions.mockResolvedValue({ count: 1 });
});

describe('ensureStarterContent', () => {
  it('does nothing when the subsystem already has any test (idempotent)', async () => {
    mocks.countTests.mockResolvedValue(3);
    const result = await ensureStarterContent();
    expect(result.provisioned).toBe(false);
    expect(mocks.createTest).not.toHaveBeenCalled();
    expect(mocks.createQuestions).not.toHaveBeenCalled();
  });

  it('provisions every starter set as PUBLISHED with the platform provenance stamp', async () => {
    mocks.countTests.mockResolvedValue(0);
    const result = await ensureStarterContent();

    expect(result.provisioned).toBe(true);
    expect(result.createdSlugs).toEqual(IELTS_STARTER_SETS.map((s) => s.slug));
    expect(result.skipped).toEqual([]);

    expect(mocks.createTest).toHaveBeenCalledTimes(IELTS_STARTER_SETS.length);
    for (const call of mocks.createTest.mock.calls) {
      expect(call[0].status).toBe('PUBLISHED');
    }

    for (const call of mocks.createQuestions.mock.calls) {
      const rows = call[0] as Array<{ validationStatus: string; reviewedBy: string; reviewedAt: Date }>;
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.validationStatus).toBe('PUBLISHED');
        expect(row.reviewedBy).toBe(STARTER_CONTENT_REVIEWER);
        expect(row.reviewedAt).toBeInstanceOf(Date);
      }
    }
  });

  it('tolerates the concurrent-provisioning race (unique slug / P2002)', async () => {
    mocks.countTests.mockResolvedValue(0);
    const first = IELTS_STARTER_SETS[0].slug;
    mocks.createTest.mockImplementation(async (data: { slug: string }) => {
      if (data.slug === first) {
        const err = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        throw err;
      }
      return { id: `test-${data.slug}` };
    });

    const result = await ensureStarterContent();
    expect(result.createdSlugs).toEqual(IELTS_STARTER_SETS.slice(1).map((s) => s.slug));
    expect(result.skipped).toEqual([]);
  });
});
