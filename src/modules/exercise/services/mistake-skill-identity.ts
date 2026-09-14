// ============================================
// Mistake Skill Identity — canonical skill attribution for a mistake
// ============================================
// 2026-09-14: 錯題的可複習單位是「技能／題型」，不是該條題目本身。
// comprehension / listening 錯題依附在一篇 passage 上，不可能重考同一題；
// 只有把錯題歸屬到技能／題型，才能聚合弱項並生成同題型新題。
//
// 權威來源（單一擁有者）：
// - 閱讀：ReadingQuestion.dseType / questionType（server-owned definition）
// - 文法：GrammarQuestion.grammarItem / questionType / languageSkill
//
// 客戶端自報的技能值永遠不是權威。只有當 questionId 無法解析到正典定義時
// （例如 AI 即時生成、未持久化的 listening 題目），才採用白名單內的自報值，
// 並標記 skillSource = 'client-claimed'，令下游可區分來源。
// ============================================

import {
  resolveGrammarQuestionDefinitions,
  type GrammarQuestionDefinition,
} from './grammar-question-service';
import {
  resolveReadingQuestionDefinitions,
  type ReadingQuestionDefinition,
} from '@/modules/reading/services/reading-question-service';
import { DSE_SKILL_LABELS } from '@/modules/reading/feedback/reading-feedback-types';
import type { LanguageSkill } from '@/shared/types/types';

/** Where the skill attribution came from — evidence, not speculation. */
export type MistakeSkillSource = 'canonical' | 'client-claimed' | 'unresolved';

export interface MistakeSkillIdentity {
  languageSkill: string | null;
  grammarItem: string | null;
  questionType: string | null;
  skillSource: MistakeSkillSource;
  /** Server-held question text — used as the display summary (preferred over client text). */
  questionSummary: string | null;
}

export const EMPTY_SKILL_IDENTITY: MistakeSkillIdentity = {
  languageSkill: null,
  grammarItem: null,
  questionType: null,
  skillSource: 'unresolved',
  questionSummary: null,
};

const LANGUAGE_SKILLS: ReadonlySet<string> = new Set<LanguageSkill>([
  'listening', 'speaking', 'reading', 'writing',
]);

/** Whitelist for client-claimed question types (reading DSE taxonomy). */
const CLAIMABLE_READING_TYPES: ReadonlySet<string> = new Set(
  Object.keys(DSE_SKILL_LABELS),
);

/**
 * 聆聽題型（沒有伺服器題目庫，題目由 AI 即時生成 → 只能靠自報值）。
 * 必須與 mistake-strategy 的 listening 策略卡同步；由
 * mistake-skill-breakdown.test.ts 交叉驗證。
 */
const CLAIMABLE_LISTENING_TYPES: ReadonlySet<string> = new Set(['detail', 'gist', 'inference']);

const CLAIMABLE_QUESTION_TYPES: ReadonlySet<string> = new Set([
  ...CLAIMABLE_READING_TYPES,
  ...CLAIMABLE_LISTENING_TYPES,
]);

/** 摘要為顯示用途，截短避免客戶端注入超長字串。 */
const SUMMARY_MAX = 200;

export function identityFromReadingDefinition(d: ReadingQuestionDefinition): MistakeSkillIdentity {
  return {
    // 閱讀題目定義不含 languageSkill（題材本身即閱讀），由 submission class 決定，
    // 故此處只提供題型；呼叫方負責補上 languageSkill。
    languageSkill: null,
    grammarItem: null,
    questionType: d.dseType || d.questionType || null,
    skillSource: 'canonical',
    questionSummary: d.questionText ? d.questionText.slice(0, SUMMARY_MAX) : null,
  };
}

export function identityFromGrammarDefinition(d: GrammarQuestionDefinition): MistakeSkillIdentity {
  return {
    languageSkill: LANGUAGE_SKILLS.has(String(d.languageSkill)) ? String(d.languageSkill) : null,
    grammarItem: d.grammarItem || null,
    questionType: d.questionType || null,
    skillSource: 'canonical',
    questionSummary: d.prompt ? d.prompt.slice(0, SUMMARY_MAX) : null,
  };
}

/**
 * Resolve skill identity for a batch of question ids against the canonical
 * stores. Unresolvable ids are absent from the map (never reconstructed).
 */
export async function resolveMistakeSkillIdentities(
  questionIds: string[],
): Promise<Map<string, MistakeSkillIdentity>> {
  const ids = Array.from(new Set(questionIds.filter(id => typeof id === 'string' && id.length > 0)));
  const result = new Map<string, MistakeSkillIdentity>();
  if (ids.length === 0) return result;

  const [reading, grammar] = await Promise.all([
    resolveReadingQuestionDefinitions(ids),
    resolveGrammarQuestionDefinitions(ids),
  ]);

  for (const id of ids) {
    const readingDef = reading.get(id);
    if (readingDef) {
      result.set(id, { ...identityFromReadingDefinition(readingDef), languageSkill: 'reading' });
      continue;
    }
    const grammarDef = grammar.get(id);
    if (grammarDef) result.set(id, identityFromGrammarDefinition(grammarDef));
  }

  return result;
}

/**
 * Sanitize client-claimed skill fields. Returns nulls unless the value is a
 * recognised member of the corresponding enum — unknown claims are dropped
 * rather than persisted as free text.
 */
export function sanitizeClientSkillClaims(claims: {
  languageSkill?: unknown;
  questionType?: unknown;
}): Pick<MistakeSkillIdentity, 'languageSkill' | 'questionType'> {
  const languageSkill = typeof claims.languageSkill === 'string'
    && LANGUAGE_SKILLS.has(claims.languageSkill)
    ? claims.languageSkill
    : null;
  const questionType = typeof claims.questionType === 'string'
    && CLAIMABLE_QUESTION_TYPES.has(claims.questionType)
    ? claims.questionType
    : null;
  return { languageSkill, questionType };
}

/** Trim + cap a display-only question summary supplied by the client. */
export function sanitizeQuestionSummary(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, SUMMARY_MAX);
}
