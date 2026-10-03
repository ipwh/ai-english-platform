// ============================================
// IELTS Question Lifecycle — status machine
// ============================================
//   DRAFT → AI_VALIDATED → QA_REQUIRED → HUMAN_APPROVED → PUBLISHED
//                                                            ↓
//                                                        REJECTED (retire)
//
// Invariants (docs/ielts/IELTS_SPECIFICATION.md §5):
//   * AI may only move DRAFT → AI_VALIDATED (or → REJECTED). It can NEVER
//     publish.
//   * HUMAN_APPROVED and PUBLISHED require a human reviewer id + timestamp.
//   * Scoring-critical content (all IELTS items) defaults to QA_REQUIRED after
//     AI validation.
// ============================================

import type { IeltsValidationStatus } from '../domain/types';

export const IELTS_STATUS_TRANSITIONS: Readonly<Record<IeltsValidationStatus, readonly IeltsValidationStatus[]>> = {
  DRAFT: ['AI_VALIDATED', 'REJECTED'],
  AI_VALIDATED: ['QA_REQUIRED', 'REJECTED'],
  QA_REQUIRED: ['HUMAN_APPROVED', 'REJECTED'],
  HUMAN_APPROVED: ['PUBLISHED', 'REJECTED'],
  PUBLISHED: ['REJECTED'],
  REJECTED: [],
};

export type IeltsTransitionActor = 'AI' | 'HUMAN' | 'SYSTEM';

export interface IeltsTransitionRequest {
  from: IeltsValidationStatus;
  to: IeltsValidationStatus;
  actor: IeltsTransitionActor;
  reviewerId?: string | null;
  validatorOk?: boolean;
  reason?: string;
}

export interface IeltsTransitionResult {
  allowed: boolean;
  error?: string;
  /** Status actually written (equals `to` when allowed). */
  status?: IeltsValidationStatus;
  requiresReviewer: boolean;
}

export function canTransition(from: IeltsValidationStatus, to: IeltsValidationStatus): boolean {
  return IELTS_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Guarded transition application.
 * - AI actor: only DRAFT → AI_VALIDATED / REJECTED.
 * - HUMAN actor: per transition table; HUMAN_APPROVED/PUBLISHED require reviewer.
 * - A validator rejection (validatorOk === false) can never lead to a
 *   forward path that ends in publication; the item must be REJECTED or DRAFT.
 */
export function applyTransition(request: IeltsTransitionRequest): IeltsTransitionResult {
  const { from, to, actor } = request;
  const requiresReviewer = to === 'HUMAN_APPROVED' || to === 'PUBLISHED';

  if (!canTransition(from, to)) {
    return {
      allowed: false,
      error: `ILLEGAL_TRANSITION: ${from} → ${to} is not permitted.`,
      requiresReviewer,
    };
  }

  if (actor === 'AI') {
    if (to !== 'AI_VALIDATED' && to !== 'REJECTED') {
      return {
        allowed: false,
        error: `AI_CANNOT_TRANSITION: AI may only set AI_VALIDATED or REJECTED (requested ${to}).`,
        requiresReviewer,
      };
    }
  }

  if (actor === 'SYSTEM') {
    // The only system-automated transitions: validating an item and defaulting
    // it to QA_REQUIRED. Everything beyond QA_REQUIRED is a human decision.
    const systemAllowed =
      (from === 'DRAFT' && (to === 'AI_VALIDATED' || to === 'REJECTED')) ||
      (from === 'AI_VALIDATED' && (to === 'QA_REQUIRED' || to === 'REJECTED'));
    if (!systemAllowed) {
      return {
        allowed: false,
        error: `SYSTEM_CANNOT_TRANSITION: ${from} → ${to} requires a human actor.`,
        requiresReviewer,
      };
    }
  }

  if (requiresReviewer && !request.reviewerId) {
    return {
      allowed: false,
      error: `REVIEWER_REQUIRED: ${to} requires a human reviewer id.`,
      requiresReviewer,
    };
  }

  if (request.validatorOk === false && (to === 'HUMAN_APPROVED' || to === 'PUBLISHED')) {
    return {
      allowed: false,
      error: 'VALIDATOR_REJECTED: fix outstanding validator issues before approval/publication.',
      requiresReviewer,
    };
  }

  return { allowed: true, status: to, requiresReviewer };
}

/**
 * The status an item gets AFTER AI validation passes.
 * All IELTS items are scoring-critical → QA_REQUIRED (never auto-advance).
 */
export function statusAfterAiValidation(validatorOk: boolean): IeltsValidationStatus {
  return validatorOk ? 'QA_REQUIRED' : 'REJECTED';
}
