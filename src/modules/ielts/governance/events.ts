// ============================================
// IELTS Observability — structured events
// ============================================
// Event names follow the governance spec. Events carry ids, counts, durations
// and codes only — never raw student content, JWTs, cookies or keys.
// ============================================

import { logger } from '@/shared/logger/logger';

export const IELTS_EVENTS = [
  'ielts.practice.started',
  'ielts.practice.completed',
  'ielts.question.answered',
  'ielts.question.invalid',
  'ielts.writing.assessment.started',
  'ielts.writing.assessment.completed',
  'ielts.writing.assessment.failed',
  'ielts.speaking.prep.started',
  'ielts.speaking.prep.completed',
  'ielts.speaking.prep.failed',
  'ielts.generation.started',
  'ielts.generation.completed',
  'ielts.generation.failed',
  'ielts.instant.delivered',
  'ielts.mistake.explained',
  'ielts.quota.retention.completed',
  'ielts.quota.retention.failed',
  'ielts.ai.provider_error',
  'ielts.ai.timeout',
  'ielts.ai.invalid_output',
] as const;

export type IeltsEventName = (typeof IELTS_EVENTS)[number];

export interface IeltsEventFields {
  userId?: string;
  attemptId?: string;
  questionId?: string;
  assessmentId?: string;
  skill?: string;
  taskType?: string;
  promptVersion?: string;
  durationMs?: number;
  itemCount?: number;
  correctCount?: number;
  rawScore?: number;
  provider?: string;
  model?: string;
  code?: string;
  /** Short machine reason — never raw content. */
  reason?: string;
  /** Quota-retention fields (counts + a day key only, never row contents). */
  dayKey?: string;
  deletedRows?: number;
  batches?: number;
  moreRemaining?: boolean;
  dryRun?: boolean;
  retentionDays?: number;
}

const FAILURE_EVENTS: ReadonlySet<IeltsEventName> = new Set([
  'ielts.writing.assessment.failed',
  'ielts.speaking.prep.failed',
  'ielts.generation.failed',
  'ielts.quota.retention.failed',
  'ielts.ai.provider_error',
  'ielts.ai.timeout',
  'ielts.ai.invalid_output',
  'ielts.question.invalid',
]);

export function emitIeltsEvent(event: IeltsEventName, fields: IeltsEventFields = {}): void {
  const payload = { module: 'ielts', event, ...fields };
  if (FAILURE_EVENTS.has(event)) {
    logger.warn(payload, event);
  } else {
    logger.info(payload, event);
  }
}

/** Convenience mapping from AI failure codes to observability events. */
export function eventForAiFailure(code: string): IeltsEventName {
  switch (code) {
    case 'AI_PROVIDER_TIMEOUT':
      return 'ielts.ai.timeout';
    case 'AI_INVALID_JSON':
    case 'AI_MISSING_CRITERION':
    case 'AI_MISSING_EVIDENCE':
    case 'AI_UNSUPPORTED_BAND':
    case 'AI_EVIDENCE_MISMATCH':
      return 'ielts.ai.invalid_output';
    default:
      return 'ielts.ai.provider_error';
  }
}
