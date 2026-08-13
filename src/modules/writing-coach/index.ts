// Sprint 111: Writing Coach — unified canonical exports
// The ONE service: writingCoachService (AI-powered analysis + revision history)
// Format validators: rule-based (correct approach for structural checking)

import { z } from 'zod';

export const writingCoachV2Schema = z.object({
  essayId: z.string().min(1),
  studentId: z.string().min(1),
  title: z.string().min(1),
  text: z.string().min(10, 'Essay text must be at least 10 characters'),
  wordLimit: z.number().int().min(50).max(2000).optional(),
  textType: z.string().optional(),
});

// === Canonical WritingCoachService (v2 — AI-powered) ===
export { writingCoachService, WritingCoachService } from './services/writing-coach-service';

// === Format validators (rule-based — kept from writing-coach.ts) ===
export {
  validateLetterFormat,
  validateSpeechFormat,
  validateProposalFormat,
  validateArticleFormat,
  validateReportFormat,
  validateFormat,
  analyzePEEL,
  analyzeConnectors,
} from './services/writing-coach';

// === Deprecated: old heuristic-based analysis (use writingCoachService instead) ===
// R3.10-K Phase 3: writing-coach-heuristic.ts + writing-coach-formula.ts
// (legacy 8-dimension 0–10 heuristic scorer with predictBand) were DELETED —
// they had zero runtime consumers and could masquerade as an independent
// authoritative Paper 2 scorer. The canonical scorer is
// `analyzeWriting()` in src/modules/ai/usecases/analyze-writing.ts.

/** @deprecated Use writingCoachService for revision management */
export { reviewEssay, compareRevisions, saveRevision, getRevisionHistory } from './services/writing-coach';
