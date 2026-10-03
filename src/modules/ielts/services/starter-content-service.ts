// ============================================
// 2026-10-03 PHASE IELTS-01 (V): Starter Content Provisioning
// ============================================
// Guarantees students have platform-authored practice available immediately
// after login, WITHOUT weakening the AI gate:
//
//   * Only runs when the IELTS subsystem has NO CATALOGUE tests at all
//     (idempotent). INSTANT self-study sets created by students never count
//     and never block provisioning.
//   * Only provisions `content/starter-sets.ts` — hand-authored, repo-reviewed
//     platform content. Every question still passes the DETERMINISTIC machine
//     screen before it is stored.
//   * Stored as PUBLISHED with an explicit provenance stamp
//     (`reviewedBy: 'platform-starter-content'`) — this carve-out never applies
//     to AI-generated content, which remains QA_REQUIRED until a human
//     approves it (AI can never publish).
//   * Unique slugs + P2002 tolerance make concurrent provisioning safe across
//     Cloud Run instances.
// ============================================

import { IELTS_STARTER_SETS } from '../content/starter-sets';
import { IELTS_DIFFICULTY_MODEL_VERSION } from '../domain/types';
import { countIeltsWords } from '../domain/word-count';
import { emitIeltsEvent } from '../governance/events';
import * as ieltsRepo from '../repositories/ielts-repo';
import { emptyBatchContext, validateIeltsQuestion } from '../validation/question-validator';

export const STARTER_CONTENT_VERSION = 'starter-content-v1';
/** Provenance stamp recorded in `reviewedBy` — NOT a user account. */
export const STARTER_CONTENT_REVIEWER = 'platform-starter-content';

export interface IeltsStarterProvisionResult {
  provisioned: boolean;
  createdSlugs: string[];
  skipped: Array<{ slug: string; reason: string }>;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}

/**
 * Provision the platform starter sets when (and only when) the IELTS subsystem
 * has no CATALOGUE tests. Safe to call on every catalogue load: after the first
 * call it is a single COUNT query that returns early.
 */
export async function ensureStarterContent(): Promise<IeltsStarterProvisionResult> {
  const total = await ieltsRepo.countTests();
  if (total > 0) return { provisioned: false, createdSlugs: [], skipped: [] };

  const createdSlugs: string[] = [];
  const skipped: Array<{ slug: string; reason: string }> = [];

  for (const set of IELTS_STARTER_SETS) {
    try {
      // ---- Deterministic machine screen BEFORE persisting (no AI) ----------
      const batch = emptyBatchContext();
      const rejected: string[] = [];
      for (let i = 0; i < set.questions.length; i++) {
        const q = set.questions[i];
        const report = validateIeltsQuestion(
          {
            id: `${set.slug}-q${i + 1}`,
            testId: set.slug,
            orderIndex: i,
            questionType: q.questionType,
            skill: set.skill,
            prompt: q.prompt,
            options: q.options,
            answerKey: q.answerKey,
            acceptedAnswers: q.acceptedAnswers,
            wordLimit: q.wordLimit,
            evidence: q.evidence,
            explanation: q.explanation,
            difficulty: q.difficulty,
            difficultyModel: IELTS_DIFFICULTY_MODEL_VERSION,
            contentSource: { type: 'ORIGINAL_GENERATED' },
            generatorVersion: STARTER_CONTENT_VERSION,
            validationStatus: 'DRAFT',
          },
          { passageText: set.passageText ?? null, transcriptText: set.transcriptText ?? null },
          batch,
        );
        if (!report.ok) rejected.push(report.issues.find((x) => x.severity === 'reject')?.code ?? 'REJECTED');
      }
      if (rejected.length > 0) {
        // Fixed, tested content failing its own screen is a bug — never persist a partial set.
        skipped.push({ slug: set.slug, reason: `MACHINE_SCREEN_REJECTED:${rejected.join(',')}` });
        continue;
      }

      const contentSource = {
        type: 'ORIGINAL_GENERATED' as const,
        notes:
          'Platform-authored starter content (repo-reviewed). Not AI-generated; not official IELTS material.',
      };
      const test = await ieltsRepo.createTest({
        slug: set.slug,
        title: set.title,
        testType: set.testType,
        skill: set.skill,
        description: set.description,
        status: 'PUBLISHED',
        contentSource: JSON.stringify(contentSource),
      });
      const section = await ieltsRepo.createSection({
        test: { connect: { id: test.id } },
        orderIndex: 0,
        label: set.sectionLabel,
        passageText: set.passageText ?? null,
        transcriptText: set.transcriptText ?? null,
        wordCount: countIeltsWords(set.passageText ?? set.transcriptText),
      });
      await ieltsRepo.createQuestions(
        set.questions.map((q, i) => ({
          testId: test.id,
          sectionId: section.id,
          orderIndex: i,
          questionType: q.questionType,
          skill: set.skill,
          prompt: q.prompt,
          options: q.options ? JSON.stringify(q.options) : null,
          answerKey: JSON.stringify(q.answerKey),
          acceptedAnswers: q.acceptedAnswers ? JSON.stringify(q.acceptedAnswers) : null,
          wordLimit: q.wordLimit ? JSON.stringify(q.wordLimit) : null,
          evidence: JSON.stringify(q.evidence),
          explanation: q.explanation,
          difficulty: q.difficulty,
          difficultyModel: IELTS_DIFFICULTY_MODEL_VERSION,
          contentSource: JSON.stringify(contentSource),
          generatorVersion: STARTER_CONTENT_VERSION,
          validationStatus: 'PUBLISHED',
          reviewedBy: STARTER_CONTENT_REVIEWER,
          reviewedAt: new Date(),
          validationNotes: JSON.stringify({ machineScreen: 'PASS', source: STARTER_CONTENT_REVIEWER }),
        })),
      );
      createdSlugs.push(set.slug);
    } catch (error) {
      // Another instance won the provisioning race (unique slug) — fine.
      if (isUniqueViolation(error)) continue;
      skipped.push({ slug: set.slug, reason: error instanceof Error ? error.message : 'UNKNOWN_ERROR' });
    }
  }

  if (createdSlugs.length > 0) {
    emitIeltsEvent('ielts.generation.completed', {
      code: 'STARTER_CONTENT_PROVISIONED',
      itemCount: createdSlugs.length,
    });
  }
  return { provisioned: createdSlugs.length > 0, createdSlugs, skipped };
}
