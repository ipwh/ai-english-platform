// ============================================
// Canonical practice-evidence rules — 單一定義（leaf module，零 imports）
// ============================================
// `practice-evidence-service.ts` 的 TS 判定與 `practice-repo.ts` 的 SQL 聚合
// **必須**共用同一份規則。把規則複製到 SQL 會產生兩套口徑，日後新增
// authority／method 時只改一邊，就會令 SQL 投影與 TS 投影給出不同答案。
//
// 因此這裡是唯一的定義處：
//   - TS：`hasServerKeyAuthority()` / `evaluatePracticeEvidence()`
//   - SQL：`aggregateVerifiedTotals*()`（以這些值生成 predicate）
//
// 新增評分權威時只改本檔，兩邊同步生效。
// ============================================

export interface PracticeEvidenceRules {
  /** `scoredBy` 允許值（TS: SUPPORTED_AUTHORITIES） */
  readonly supportedAuthorities: readonly string[];
  /** `result` 允許值（TS: VALID_RESULTS） */
  readonly validResults: readonly string[];
  /**
   * 證明「答案鍵由伺服器持有」的 (scoredBy, scoringMethod) 配對。
   * `scoredBy` 單獨存在**不足以**構成證據 —— 必須有 method 佐證。
   */
  readonly serverKeyAuthoritative: readonly (readonly [string, string])[];
}

export const PRACTICE_EVIDENCE_RULES: PracticeEvidenceRules = {
  supportedAuthorities: ['server', 'ai'],
  validResults: ['correct', 'incorrect', 'partial', 'ungradable'],
  serverKeyAuthoritative: [
    ['server', 'server-key-resolved'],
    ['server', 'reading-server-exact-match'],
    ['ai', 'reading-ai-semantic-evaluation'],
    // 2026-09-21 ADR-045: listening objective answers scored against the
    // server-owned ListeningQuestion store.
    ['server', 'listening-server-exact-match'],
  ],
};
