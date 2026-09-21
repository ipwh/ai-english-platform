// ============================================
// R3.10-D.1 補充（2026-09-21 稽核）：伺服器解析的提交權威
// ============================================
// 病根（實證）：
// 「AI 練習」頁的閱讀題**已**由 `/api/ai/generate-questions` 在交付前持久化為
// `ReadingQuestion`（帶伺服器答案鍵），但該頁送出的 answers 不含 `dseType`，
// 且 `source` 固定為 `'ai-generated'` → `classifyPracticeSubmission()` 判為
// `legacy-language-skill` → `isServerAuthoritativeSubmission()` 為 false
// → 不產生 verified evidence、不更新掌握度、不建錯題。
// 同一批題目在診斷路徑（`source: 'dse-reading'` + dseType）卻有計分。
//
// 修正原則（與文法路徑一致）：**權威由伺服器解析題目身分決定，不信客戶端自報**。
// 提交的 `questionId` 只要能在正典題目庫全部解析為同一種題目家族，就以該家族
// 為權威；完全無法解析（真正的舊資料）才回退客戶端標記的既有分類。
//
// 保守條件：
// - 必須**全部** id 都解析成功，且家族一致（全 reading 或全 grammar）。
//   部分解析 / 混合家族 → 回傳 null（回退 legacy），避免把混合舊題目
//   交給 `scoreReadingAnswers` 而整份被 NOT_PROJECTABLE 拒絕。
// - 此檔為純資料存取層（無業務判斷），可被單元測試以 mock 注入。

import { resolveReadingQuestionDefinitions } from '@/modules/reading/services/reading-question-service';
import { resolveListeningQuestionDefinitions } from '@/modules/listening/services/listening-question-service';
import { resolveGrammarQuestionDefinitions } from '@/modules/exercise/services/grammar-question-service';

export type ResolvedAuthorityClass = 'reading' | 'listening' | 'grammar';

export interface AuthorityResolution {
  /** 解析出的權威家族；null = 無法判定（呼叫端回退既有分類） */
  authorityClass: ResolvedAuthorityClass | null;
  /** 提交中帶有 questionId 的答案數 */
  totalIds: number;
  /** 成功解析到正典定義的題數 */
  resolvedIds: number;
  reason: 'all-reading' | 'all-listening' | 'all-grammar' | 'no-ids' | 'partial' | 'mixed' | 'none';
}

/**
 * 由提交的 `questionId` 解析權威家族。
 *
 * 回傳 `authorityClass: null` 代表呼叫端必須沿用既有
 * `classifyPracticeSubmission()`（客戶端標記）行為 —— 亦即對真正的
 * 舊資料保持完全相容。
 */
export async function resolveSubmissionAuthorityClass(
  answers: unknown,
): Promise<AuthorityResolution> {
  const ids: string[] = [];
  if (Array.isArray(answers)) {
    for (const raw of answers) {
      const id = (raw as { questionId?: unknown } | null)?.questionId;
      if (typeof id === 'string' && id.trim().length > 0) ids.push(id.trim());
    }
  }
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) {
    return { authorityClass: null, totalIds: 0, resolvedIds: 0, reason: 'no-ids' };
  }

  const [reading, listening, grammar] = await Promise.all([
    resolveReadingQuestionDefinitions(unique).catch(() => new Map()),
    resolveListeningQuestionDefinitions(unique).catch(() => new Map()),
    resolveGrammarQuestionDefinitions(unique).catch(() => new Map()),
  ]);

  const readingCount = unique.filter(id => reading.has(id)).length;
  const listeningCount = unique.filter(id => listening.has(id)).length;
  const grammarCount = unique.filter(id => grammar.has(id)).length;
  const resolvedIds = readingCount + listeningCount + grammarCount;

  if (resolvedIds < unique.length) {
    return { authorityClass: null, totalIds: unique.length, resolvedIds, reason: 'partial' };
  }
  const families = [readingCount, listeningCount, grammarCount].filter(n => n > 0).length;
  if (families > 1) {
    return { authorityClass: null, totalIds: unique.length, resolvedIds, reason: 'mixed' };
  }
  if (readingCount === unique.length) {
    return { authorityClass: 'reading', totalIds: unique.length, resolvedIds, reason: 'all-reading' };
  }
  if (listeningCount === unique.length) {
    return { authorityClass: 'listening', totalIds: unique.length, resolvedIds, reason: 'all-listening' };
  }
  if (grammarCount === unique.length) {
    return { authorityClass: 'grammar', totalIds: unique.length, resolvedIds, reason: 'all-grammar' };
  }
  return { authorityClass: null, totalIds: unique.length, resolvedIds, reason: 'none' };
}
