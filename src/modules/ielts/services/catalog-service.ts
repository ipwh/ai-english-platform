// ============================================
// IELTS Catalogue Service — delivery surface
// ============================================
// Only PUBLISHED tests and questions are ever served. Attempt-time payloads
// NEVER contain answer keys, accepted answers, evidence or explanations.
// ============================================

import * as ieltsRepo from '../repositories/ielts-repo';
import { rowToClientQuestion } from './row-mappers';

export interface IeltsTestSummary {
  id: string;
  slug: string;
  title: string;
  testType: string;
  skill: string;
  description: string | null;
  durationMinutes: number | null;
  sectionCount: number;
  questionCount: number;
}

export async function listPublishedIeltsTests(filter: {
  testType?: string;
  skill?: string;
}): Promise<IeltsTestSummary[]> {
  const rows = await ieltsRepo.listPublishedTests(filter);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    testType: row.testType,
    skill: row.skill,
    description: row.description,
    durationMinutes: row.durationMinutes,
    sectionCount: row._count.sections,
    questionCount: row._count.questions,
  }));
}

// ============================================
// Writing prompt bank (2026-10-03 IV)
// ============================================

export interface IeltsWritingPromptSummary {
  testId: string;
  title: string;
  testType: string;
  taskType: string;
  prompt: string;
}

const WRITING_TASK_TYPES = new Set([
  'academic_task1',
  'academic_task2',
  'general_task1',
  'general_task2',
]);

/**
 * Published Writing task prompts (generated or authored): the section label
 * carries the machine task type; the section instructions carry the full
 * official-style task text shown to the writer.
 */
export async function listPublishedWritingPrompts(
  testType?: string,
): Promise<IeltsWritingPromptSummary[]> {
  const rows = await ieltsRepo.listPublishedWritingTests(testType);
  const out: IeltsWritingPromptSummary[] = [];
  for (const row of rows) {
    const section = row.sections.find(
      (s) => WRITING_TASK_TYPES.has(s.label) && (s.instructions ?? '').trim().length > 0,
    );
    if (!section) continue; // malformed writing test — never serve a blank prompt
    out.push({
      testId: row.id,
      title: row.title,
      testType: row.testType,
      taskType: section.label,
      prompt: section.instructions ?? '',
    });
  }
  return out;
}

export interface IeltsAttemptTimeTest {
  id: string;
  slug: string;
  title: string;
  testType: string;
  skill: string;
  description: string | null;
  durationMinutes: number | null;
  /** 'CATALOGUE' | 'INSTANT' — INSTANT must render the unreviewed-practice label. */
  origin: string;
  sections: Array<{
    id: string;
    orderIndex: number;
    label: string;
    instructions: string | null;
    /** Reading passages are delivered to the candidate. */
    passageText: string | null;
    /** Listening: transcript is NOT delivered before submission; audio is generated via TTS. */
    hasTranscript: boolean;
    wordCount: number | null;
  }>;
  questions: ReturnType<typeof rowToClientQuestion>[];
}

export type CatalogResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/** Question statuses deliverable inside an INSTANT set — only automated-gate
 * survivors. DRAFT (never screened) and REJECTED items are never delivered. */
const INSTANT_DELIVERABLE_QUESTION_STATUSES = ['QA_REQUIRED', 'HUMAN_APPROVED', 'PUBLISHED'];

/**
 * Student delivery gate (2026-10-03 VII):
 *   * CATALOGUE test → must be PUBLISHED (unchanged; only PUBLISHED items leak).
 *   * INSTANT test   → owner-only, any status except REJECTED.
 *
 * Instant delivery is NOT publication: the set is never listed, a non-owner
 * can never load it, and the questions are still QA_REQUIRED (AI never
 * publishes; graduation requires the normal human review path).
 */
export async function getTestForStudentAttempt(
  testId: string,
  studentId: string,
): Promise<CatalogResult<IeltsAttemptTimeTest>> {
  const row = await ieltsRepo.getTestById(testId);
  if (!row) return { ok: false, status: 404, error: 'Test not found' };

  const isInstant = row.origin === 'INSTANT';
  if (isInstant) {
    if (row.ownerUserId !== studentId) {
      return { ok: false, status: 403, error: 'This self-study practice belongs to another student.' };
    }
    if (row.status === 'REJECTED') {
      return { ok: false, status: 403, error: 'This practice set was withdrawn.' };
    }
  } else if (row.status !== 'PUBLISHED') {
    return { ok: false, status: 403, error: 'Test is not published' };
  }

  const test = await ieltsRepo.getTestForAttempt(testId, {
    questionStatuses: isInstant ? INSTANT_DELIVERABLE_QUESTION_STATUSES : ['PUBLISHED'],
  });
  if (!test) return { ok: false, status: 404, error: 'Test not found' };

  return {
    ok: true,
    data: {
      id: test.id,
      slug: test.slug,
      title: test.title,
      testType: test.testType,
      skill: test.skill,
      description: test.description,
      durationMinutes: test.durationMinutes,
      origin: test.origin,
      sections: test.sections.map((s) => ({
        id: s.id,
        orderIndex: s.orderIndex,
        label: s.label,
        instructions: s.instructions,
        passageText: s.passageText,
        hasTranscript: Boolean(s.transcriptText),
        wordCount: s.wordCount,
      })),
      questions: test.questions.map((q) => rowToClientQuestion(q as never)),
    },
  };
}

/**
 * Listening delivery: transcript is only exposed AFTER submission. Before
 * submission, clients may request platform TTS audio built from the transcript
 * server-side (AI voice, clearly labelled — never an official recording).
 *
 * Authorization (2026-10-03 audit; extended 2026-10-03 VII): a section is only
 * deliverable while its owning test is PUBLISHED, OR while it belongs to an
 * INSTANT self-study set owned by the requesting student (never DRAFT/archived
 * catalogue tests — ids are guessable across surfaces, so the owner check is
 * mandatory).
 */
export async function getSectionTranscriptForDelivery(
  sectionId: string,
  studentId: string,
): Promise<CatalogResult<{ transcript: string | null; provenance: string }>> {
  const section = await ieltsRepo.getSectionById(sectionId);
  if (!section) return { ok: false, status: 404, error: 'Section not found' };
  const test = await ieltsRepo.getTestById(section.testId);
  if (!test) return { ok: false, status: 404, error: 'Section not found' };
  const isInstant = test.origin === 'INSTANT';
  if (isInstant) {
    if (test.ownerUserId !== studentId) {
      return { ok: false, status: 403, error: 'This self-study practice belongs to another student.' };
    }
    if (test.status === 'REJECTED') {
      return { ok: false, status: 403, error: 'This practice set was withdrawn.' };
    }
  } else if (test.status !== 'PUBLISHED') {
    return { ok: false, status: 403, error: 'Test is not published' };
  }
  return {
    ok: true,
    data: {
      transcript: section.transcriptText,
      provenance: 'PLATFORM_TTS_GENERATED_FROM_ORIGINAL_TRANSCRIPT', // never official audio
    },
  };
}
