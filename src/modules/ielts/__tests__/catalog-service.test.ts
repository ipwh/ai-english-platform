// ============================================
// IELTS Catalogue Service — delivery-gate tests (2026-10-03 audit)
// ============================================
// Only PUBLISHED tests may deliver content. The audit fixed a gap where a
// listening section's transcript could be synthesised even when its owning
// test was still DRAFT — these tests pin the gate.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSectionById: vi.fn(),
  getTestById: vi.fn(),
  getTestForAttempt: vi.fn(),
  listPublishedTests: vi.fn(),
}));

vi.mock('@/modules/ielts/repositories/ielts-repo', () => ({
  getSectionById: mocks.getSectionById,
  getTestById: mocks.getTestById,
  getTestForAttempt: mocks.getTestForAttempt,
  listPublishedTests: mocks.listPublishedTests,
}));

import {
  getSectionTranscriptForDelivery,
  getTestForStudentAttempt,
  listPublishedIeltsTests,
} from '../services/catalog-service';

function deliveryTest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-1',
    slug: 's',
    title: 't',
    testType: 'ACADEMIC',
    skill: 'READING',
    description: null,
    durationMinutes: null,
    status: 'PUBLISHED',
    origin: 'CATALOGUE',
    sections: [],
    questions: [],
    ...overrides,
  };
}

describe('getSectionTranscriptForDelivery — publication gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delivers the transcript when the owning test is PUBLISHED', async () => {
    mocks.getSectionById.mockResolvedValue({ id: 'sec-1', testId: 'test-1', transcriptText: 'Hello.' });
    mocks.getTestById.mockResolvedValue({ id: 'test-1', status: 'PUBLISHED' });
    const result = await getSectionTranscriptForDelivery('sec-1', 'student-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.transcript).toBe('Hello.');
      expect(result.data.provenance).toBe('PLATFORM_TTS_GENERATED_FROM_ORIGINAL_TRANSCRIPT');
    }
  });

  it('refuses a section whose test is NOT published (403, never audio)', async () => {
    mocks.getSectionById.mockResolvedValue({ id: 'sec-1', testId: 'test-1', transcriptText: 'Secret draft.' });
    mocks.getTestById.mockResolvedValue({ id: 'test-1', status: 'DRAFT' });
    const result = await getSectionTranscriptForDelivery('sec-1', 'student-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it('refuses a missing section (404)', async () => {
    mocks.getSectionById.mockResolvedValue(null);
    const result = await getSectionTranscriptForDelivery('sec-none', 'student-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
    expect(mocks.getTestById).not.toHaveBeenCalled();
  });

  it('refuses when the owning test cannot be resolved (404, fail-closed)', async () => {
    mocks.getSectionById.mockResolvedValue({ id: 'sec-1', testId: 'gone', transcriptText: 'x' });
    mocks.getTestById.mockResolvedValue(null);
    const result = await getSectionTranscriptForDelivery('sec-1', 'student-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it('delivers audio for an INSTANT section owned by the requesting student (2026-10-03 VII)', async () => {
    mocks.getSectionById.mockResolvedValue({ id: 'sec-1', testId: 'i1', transcriptText: 'Hello.' });
    mocks.getTestById.mockResolvedValue({ id: 'i1', status: 'DRAFT', origin: 'INSTANT', ownerUserId: 'student-1' });
    const result = await getSectionTranscriptForDelivery('sec-1', 'student-1');
    expect(result.ok).toBe(true);
  });

  it('refuses INSTANT audio to a non-owner (403)', async () => {
    mocks.getSectionById.mockResolvedValue({ id: 'sec-1', testId: 'i1', transcriptText: 'Hello.' });
    mocks.getTestById.mockResolvedValue({ id: 'i1', status: 'DRAFT', origin: 'INSTANT', ownerUserId: 'student-1' });
    const result = await getSectionTranscriptForDelivery('sec-1', 'student-2');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
});

describe('getTestForStudentAttempt — INSTANT self-study gate (2026-10-03 VII)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serves a PUBLISHED catalogue test (PUBLISHED items only)', async () => {
    mocks.getTestById.mockResolvedValue({ id: 't1', status: 'PUBLISHED', origin: 'CATALOGUE', ownerUserId: null });
    mocks.getTestForAttempt.mockResolvedValue(deliveryTest({ id: 't1' }));
    const result = await getTestForStudentAttempt('t1', 'student-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.origin).toBe('CATALOGUE');
    expect(mocks.getTestForAttempt).toHaveBeenCalledWith('t1', { questionStatuses: ['PUBLISHED'] });
  });

  it('refuses an unpublished catalogue test (403)', async () => {
    mocks.getTestById.mockResolvedValue({ id: 't1', status: 'QA_REQUIRED', origin: 'CATALOGUE', ownerUserId: null });
    const result = await getTestForStudentAttempt('t1', 'student-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    expect(mocks.getTestForAttempt).not.toHaveBeenCalled();
  });

  it('serves an INSTANT set to its owner with the unreviewed-item allow-list', async () => {
    mocks.getTestById.mockResolvedValue({ id: 'i1', status: 'DRAFT', origin: 'INSTANT', ownerUserId: 'student-1' });
    mocks.getTestForAttempt.mockResolvedValue(deliveryTest({ id: 'i1', status: 'DRAFT', origin: 'INSTANT' }));
    const result = await getTestForStudentAttempt('i1', 'student-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.origin).toBe('INSTANT');
    expect(mocks.getTestForAttempt).toHaveBeenCalledWith('i1', {
      questionStatuses: ['QA_REQUIRED', 'HUMAN_APPROVED', 'PUBLISHED'],
    });
  });

  it('refuses an INSTANT set to any other student (403 — never listed)', async () => {
    mocks.getTestById.mockResolvedValue({ id: 'i1', status: 'DRAFT', origin: 'INSTANT', ownerUserId: 'student-1' });
    const result = await getTestForStudentAttempt('i1', 'student-2');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    expect(mocks.getTestForAttempt).not.toHaveBeenCalled();
  });

  it('refuses a withdrawn (REJECTED) INSTANT set even for the owner (403)', async () => {
    mocks.getTestById.mockResolvedValue({ id: 'i1', status: 'REJECTED', origin: 'INSTANT', ownerUserId: 'student-1' });
    const result = await getTestForStudentAttempt('i1', 'student-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
});

describe('listPublishedIeltsTests — count parity with delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps the PUBLISHED-only question count (delivery parity)', async () => {
    mocks.listPublishedTests.mockResolvedValue([
      {
        id: 't1',
        slug: 'reading-1',
        title: 'Reading practice',
        testType: 'ACADEMIC',
        skill: 'READING',
        description: null,
        durationMinutes: 60,
        _count: { sections: 1, questions: 40 },
      },
    ]);
    const rows = await listPublishedIeltsTests({});
    expect(rows).toHaveLength(1);
    expect(rows[0].questionCount).toBe(40);
    expect(rows[0].sectionCount).toBe(1);
  });
});
