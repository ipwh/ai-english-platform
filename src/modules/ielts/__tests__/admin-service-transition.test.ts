// ============================================
// IELTS Test status transition — publish-path guards (2026-10-03 XII)
// ============================================
// Production incident: the teacher console publishes with ONE human action
// (POST { to: 'PUBLISHED' }), but tests were created at DRAFT and the state
// machine only allowed single steps — so every publish attempt returned
// ILLEGAL_TRANSITION and NO test could ever reach the catalogue. These tests
// pin the walk (each intermediate step still validated through applyTransition,
// same human reviewer) and the unchanged final gates.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTestById: vi.fn(),
  listQuestionsForAdmin: vi.fn(),
  updateTestStatus: vi.fn(),
}));

vi.mock('@/modules/ielts/repositories/ielts-repo', () => ({
  getTestById: mocks.getTestById,
  listQuestionsForAdmin: mocks.listQuestionsForAdmin,
  updateTestStatus: mocks.updateTestStatus,
}));

import { transitionIeltsTestStatus } from '../services/admin-service';

const REVIEWER = 'teacher-1';
const published = { validationStatus: 'PUBLISHED' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateTestStatus.mockResolvedValue({});
});

describe('transitionIeltsTestStatus — publish from any pre-published state', () => {
  it('walks DRAFT → AI_VALIDATED → QA_REQUIRED → HUMAN_APPROVED → PUBLISHED in one human action', async () => {
    mocks.getTestById.mockResolvedValue({ id: 't1', status: 'DRAFT', origin: 'CATALOGUE' });
    mocks.listQuestionsForAdmin.mockResolvedValue([published, published]);

    const result = await transitionIeltsTestStatus({ testId: 't1', to: 'PUBLISHED', reviewerId: REVIEWER });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe('PUBLISHED');
    expect(mocks.updateTestStatus).toHaveBeenCalledWith('t1', 'PUBLISHED');
  });

  it('walks from QA_REQUIRED (the state right after AI generation review)', async () => {
    mocks.getTestById.mockResolvedValue({ id: 't2', status: 'QA_REQUIRED', origin: 'CATALOGUE' });
    mocks.listQuestionsForAdmin.mockResolvedValue([published]);

    const result = await transitionIeltsTestStatus({ testId: 't2', to: 'PUBLISHED', reviewerId: REVIEWER });

    expect(result.ok).toBe(true);
    expect(mocks.updateTestStatus).toHaveBeenCalledWith('t2', 'PUBLISHED');
  });

  it('still refuses publication while any question is not PUBLISHED (TEST_NOT_READY)', async () => {
    mocks.getTestById.mockResolvedValue({ id: 't3', status: 'DRAFT', origin: 'CATALOGUE' });
    mocks.listQuestionsForAdmin.mockResolvedValue([published, { validationStatus: 'QA_REQUIRED' }]);

    const result = await transitionIeltsTestStatus({ testId: 't3', to: 'PUBLISHED', reviewerId: REVIEWER });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toContain('TEST_NOT_READY');
    }
    expect(mocks.updateTestStatus).not.toHaveBeenCalled();
  });

  it('still refuses an objective test with no questions (TEST_EMPTY)', async () => {
    mocks.getTestById.mockResolvedValue({ id: 't4', status: 'DRAFT', origin: 'CATALOGUE' });
    mocks.listQuestionsForAdmin.mockResolvedValue([]);

    const result = await transitionIeltsTestStatus({ testId: 't4', to: 'PUBLISHED', reviewerId: REVIEWER });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('TEST_EMPTY');
    expect(mocks.updateTestStatus).not.toHaveBeenCalled();
  });

  it('graduates an INSTANT self-study set into the catalogue on publish', async () => {
    mocks.getTestById.mockResolvedValue({ id: 't5', status: 'QA_REQUIRED', origin: 'INSTANT' });
    mocks.listQuestionsForAdmin.mockResolvedValue([published]);

    const result = await transitionIeltsTestStatus({ testId: 't5', to: 'PUBLISHED', reviewerId: REVIEWER });

    expect(result.ok).toBe(true);
    expect(mocks.updateTestStatus).toHaveBeenCalledWith('t5', 'PUBLISHED', { origin: 'CATALOGUE' });
  });

  it('keeps one-step semantics for rejection (no walk, direct transition)', async () => {
    mocks.getTestById.mockResolvedValue({ id: 't6', status: 'DRAFT', origin: 'CATALOGUE' });

    const result = await transitionIeltsTestStatus({ testId: 't6', to: 'REJECTED', reviewerId: REVIEWER });

    expect(result.ok).toBe(true);
    expect(mocks.updateTestStatus).toHaveBeenCalledWith('t6', 'REJECTED');
  });

  it('never revives a REJECTED test (terminal state)', async () => {
    mocks.getTestById.mockResolvedValue({ id: 't7', status: 'REJECTED', origin: 'CATALOGUE' });

    const result = await transitionIeltsTestStatus({ testId: 't7', to: 'PUBLISHED', reviewerId: REVIEWER });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(mocks.updateTestStatus).not.toHaveBeenCalled();
  });
});
