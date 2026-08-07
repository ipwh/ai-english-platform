// Sprint 92: Writing Analysis Use Case — canonical implementation
// Sprint 126: P0 corrective patch — Promise.allSettled, rubric cleanup, score hardening
//
// Scoring semantics (documented for future refactoring):
//   cloTotalScore — internal HKDSE-style CLO rubric total (0–21)
//   overallScore  — platform's normalized 0–100 score
//   dseLevel      — internal estimated HKDSE performance level (1–5),
//                   NOT an official HKEAA grade conversion

import { callLLM } from "../services/llm-call";
import { parseAIJSON } from "../services/json-utils";
import { sanitizeForAI } from "../services/sanitizer";
import { validateAIResponse, WritingAnalysisSchema } from "../schemas/ai-schema";
import { HALLUCINATION_GUARD } from "../services/hallucination-guard";
import { detectChinglish } from "@/modules/assessment/services/chinglish";
import { isDSERAGEnabled, retrieveMarkingScheme, buildDSEContextPrompt, type DSESkill } from "../services/rag-service";
import { logger } from "@/shared/logger/logger";
import {
  evaluateTaskCoverage,
  buildSemanticEvidencePrompt,
  deriveSemanticContentGuard,
} from "./semantic-evaluator";
import type { SemanticEvaluation } from "../schemas/ai-schema";
import type { EvidenceBackedFeedback } from "../types/assessment-feedback";
import { createRubricMetadata } from "../types/rubric-version";
import type { WritingRevision } from "../schemas/ai-schema";

// ============================================
// Pure helper functions
// ============================================

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Clamp and round CLO rubric scores to half-point increments (0–7, e.g. 4.5). */
function normalizeRubricScore(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const clamped = clamp(value, 0, 7);
  return Math.round(clamped * 2) / 2;
}

/** Normalize text for deduplication comparison (case/whitespace/smart-quote-insensitive). */
function normalizeForDedup(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[""'']/g, "'")
    .replace(/[\u201C\u201D\u2018\u2019]/g, "'");
}

/** Internal estimated HKDSE performance level from CLO total.
 *  This is NOT an official HKEAA grade conversion — it is a conservative
 *  internal estimate for pedagogical guidance only. */
type EstimatedDSELevel = "1" | "2" | "3" | "4" | "5";
function estimateDSELevelFromCLO(cloTotalScore: number): EstimatedDSELevel {
  if (cloTotalScore >= 13) return "5";
  if (cloTotalScore >= 10) return "4";
  if (cloTotalScore >= 7) return "3";
  if (cloTotalScore >= 4) return "2";
  return "1";
}

/** Evidence normalization helper (reserved for future evidence-backed feedback). */
function normalizeForEvidence(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================
// Phase 3: Evidence-backed feedback construction
// ============================================

/**
 * Check whether a piece of evidence text appears (normalized) in the essay.
 * Level 1: exact substring match after normalization.
 * Level 2 (future): semantic paraphrase — not implemented yet.
 */
function evidenceAppearsInEssay(evidence: string, essay: string): boolean {
  const normalizedEvidence = normalizeForEvidence(evidence);
  const normalizedEssay = normalizeForEvidence(essay);
  return normalizedEssay.includes(normalizedEvidence);
}

/**
 * Filter feedback items to remove unsupported claims.
 * - Items with empty evidence AND confidence != "high" are dropped
 *   UNLESS they represent a "missing" task requirement (which by definition
 *   has no evidence — the absence of text IS the evidence).
 * - Items where at least one evidence item appears in the essay are kept.
 */
function filterUnsupportedFeedback(
  feedback: EvidenceBackedFeedback[],
  essay: string,
): EvidenceBackedFeedback[] {
  return feedback.filter((item) => {
    // Missing task requirements: keep even without evidence (absence is the signal)
    if (
      item.dimension === "task_coverage" &&
      item.kind === "weakness" &&
      item.evidence.length === 0
    ) {
      return true;
    }
    // Items with no evidence that aren't missing requirements: drop
    if (item.evidence.length === 0) {
      return false;
    }
    // Keep if at least one evidence item is verifiable
    return item.evidence.some((ev) => evidenceAppearsInEssay(ev, essay));
  });
}

/**
 * Build structured evidence-backed feedback from semantic evaluation.
 * Only task-coverage evidence is structured enough for verification.
 * Style strengths/weaknesses remain in their existing string[] fields.
 */
function buildFeedbackFromEvidence(
  semantic: SemanticEvaluation | undefined,
  essay: string,
): EvidenceBackedFeedback[] {
  const items: EvidenceBackedFeedback[] = [];

  // From semantic evaluation: task coverage feedback
  if (semantic?.requirements) {
    for (const req of semantic.requirements) {
      if (req.status === "missing" || req.status === "partial") {
        items.push({
          dimension: "task_coverage",
          kind: "weakness",
          claim: `Task requirement "${req.requirement}" is ${req.status}.`,
          evidence: req.evidence,
          recommendation: req.explanation,
          confidence: req.evidence.length > 0 ? "high" : "low",
        });
      }
      if (req.status === "satisfied" && req.evidence.length > 0) {
        items.push({
          dimension: "task_coverage",
          kind: "strength",
          claim: `Task requirement "${req.requirement}" is satisfied.`,
          evidence: req.evidence.slice(0, 1),
          confidence: "high",
        });
      }
    }
  }

  // Style strengths and weaknesses are free-text strings without structured
  // evidence mapping. They remain available via the existing `strengths[]`
  // and `weaknesses[]` fields on WritingAnalysis. We do NOT duplicate them
  // into EvidenceBackedFeedback because they lack verifiable evidence and
  // would be filtered out anyway — generating them only to discard them
  // is wasteful and misleading.

  return filterUnsupportedFeedback(items, essay);
}

// ============================================
// Public types
// ============================================


export interface AnalyzeWritingInput {
  userId?: string;
  title: string;
  prompt: string;
  studentDraft: string;
  studentLevel?: string;
  difficulty?: string;
  textType?: string;
}

export interface WritingAnalysis {
  overallScore: number; // 0-100 platform score
  contentScore?: number;   // CLO Content 0-7 (half-point)
  languageScore?: number;   // CLO Language 0-7 (half-point)
  organizationScore?: number; // CLO Organization 0-7 (half-point)
  cloTotalScore?: number;   // CLO total 0-21
  dseLevel?: string;        // internal estimated level (1-5), NOT official HKEAA grade
  strengths: string[];
  weaknesses: string[];
  grammarErrors: { original: string; correction: string; explanation: string }[];
  chinglishWarnings: { original: string; suggestion: string; explanation: string }[];
  vocabularySuggestions: { original: string; suggestion: string; reason: string }[];
  structureFeedback: string;
  /** @deprecated Use revision.faithfulCorrection or revision.enhancedVersion instead. */
  revisedVersion?: string;
  generalComment: string;
  /** Phase 3: Evidence-backed structured feedback (optional). */
  feedback?: EvidenceBackedFeedback[];
  /** Phase 4: Separated revision modes. */
  revision?: WritingRevision;
  /** Phase 5: Rubric versioning metadata for calibration. */
  rubric?: { rubricVersion: string; paper: "Paper 2"; taskType?: string; examYear?: string };
}

export async function analyzeWriting(input: AnalyzeWritingInput): Promise<WritingAnalysis> {
  const essayContent = sanitizeForAI(input.studentDraft);
  const countWords = (text: string): number => {
    const tokens = text
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .match(/[A-Za-z0-9][A-Za-z0-9'\-]*/g);
    return tokens?.length || 0;
  };

  // ============================================
  // DSE RAG：檢索 Paper 2 Writing Marking Scheme
  // ============================================
  let writingMSContext = '';
  try {
    if (isDSERAGEnabled()) {
      const msChunks = await retrieveMarkingScheme('Writing', 3);
      writingMSContext = buildDSEContextPrompt(
        [],
        msChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        'analyze_writing'
      );
      if (writingMSContext) {
        logger.info({ module: 'dse-rag', msChunks: msChunks.length }, 'analyzeWriting: Retrieved Writing MS chunks');
      }
    }
  } catch (err) {
    logger.warn({ module: 'dse-rag', error: err instanceof Error ? err.message : String(err) }, 'analyzeWriting MS retrieval failed, fallback');
    writingMSContext = '';
  }

  const extractTargetWords = (...texts: string[]): number | null => {
    for (const text of texts) {
      if (!text) continue;
      const m = text.match(/(?:about|around|approximately|at least)?\s*(\d{2,4})\s*words?/i);
      if (m) return Number(m[1]);
    }
    return null;
  };

  const studentWordCount = countWords(essayContent);
  const targetWords = extractTargetWords(input.prompt, input.title);

  const context = `作文題目：${input.title}
寫作要求：${input.prompt}
${input.textType ? `文本類型：${input.textType}` : ''}
${input.studentLevel ? `學生年級：${input.studentLevel}` : ''}
${targetWords ? `建議字數：${targetWords} words` : ''}
實際字數（系統計算）：${studentWordCount} words
⚠️ 系統驗證：學生文章為完整作品（字數 ${studentWordCount}、結構完整）。請勿輸出「文章未完成」/「結尾中斷」/「截斷」等與事實不符的評語。

學生作文內容：
"""
${essayContent}
"""`;

  // === Call 1：Language + CLO rubric scores（語言準確性 + 三維評分） ===
  const grammarPrompt = `你是一位香港中學英文科教師兼 HKDSE English Paper 2 評卷員，擁有多年 DSE 評卷經驗。
請嚴格依據以下官方 HKDSE Paper 2 Writing 評分框架（Content / Language / Organization，簡稱 CLO）進行評分，每卷滿分 21 分（C:7 + L:7 + O:7），每卷經 2 位評卷員獨立評審。
請以純 JSON 格式回覆（以 { 開頭，以 } 結尾）。
${writingMSContext}

═══════════════════════════════════════
📐 HKDSE Paper 2 Writing 官方評分框架 — 必須以此為唯一評分基準
═══════════════════════════════════════

以下評分描述來自 HKDSE 官方等級描述（Level Descriptors），
評分時必須對照這些描述決定各維度的分數（0–7，可用半分）。

───────────────────────────────────────
🔴 C: Content（內容）— 滿分 7 分
───────────────────────────────────────

7 分:
• 內容完全符合題目要求，貼題不離題
• 內容豐富且全面，所有觀點充分拓展
• 展現高度創意與想像力
• 高度受眾意識（清楚讀者是誰、寫作目的為何）
• 能引起讀者興趣，展現 critical thinking

6 分:
• 內容完全符合題目要求
• 幾乎全部相關，大部分觀點充分拓展
• 適時展現創意與想像力
• 展現良好受眾意識

5 分:
• 內容符合題目要求
• 大部分相關，多數觀點有拓展
• 大部分展現創意與想像力
• 展現一般受眾意識

4 分:
• 內容大致符合題目要求
• 大部分相關，部分觀點有拓展
• 有數處創意與想像力
• 間中展現受眾意識

3 分:
• 內容僅部分滿足題目要求
• 有相關內容但存在缺口或重複資訊
• 部分觀點但未充分拓展
• 偶有受眾意識

2 分:
• 內容僅勉強滿足題目要求
• 間歇性相關，少數觀點且未拓展
• 可能曲解題目或包含錯誤資訊
• 幾乎缺乏受眾意識

1 分:
• 內容不足，高度依賴題目提示字眼
• 極少觀點且全未拓展，部分照抄題目

0 分:
• 完全不充分：完全離題/背誦/全抄題目、無法辨識為完整文章

───────────────────────────────────────
🟡 L: Language / Language & Style（語言）— 滿分 7 分
───────────────────────────────────────

Language 評估範圍：
- grammatical accuracy（文法準確性）
- sentence structure variety（句式多樣性）
- vocabulary range & precision（詞彙廣度與精準度）
- spelling & punctuation（串字及標點）
- register, tone, style（語域、語氣、風格）

7 分:
• 句型極多變，能純熟駕馭複雜句式
• 文法極精準，僅有極輕微偶然失誤
• 選詞細膩精準，能表達微妙含義
• 串字及標點近乎完美
• 語域、語氣、風格完全配合文體類型與目標受眾

6 分:
• 廣泛句式準確恰當，掌握簡單句及複雜句
• 文法大致精準，偶有常見錯誤但不影響整體清晰度
• 詞彙廣泛，有多處進階/精緻用語
• 串字及標點大部分正確
• 語域、語氣、風格配合文體類型

5 分:
• 多種句式準確恰當，嘗試使用複雜句
• 文法大致準確，複雜結構中偶有錯誤但不影響清晰度
• 詞彙適度廣泛且恰當
• 串字及標點足夠準確傳意
• 語域、語氣、風格大部分配合文體

4 分:
• 簡單句結構大致良好，偶有嘗試複雜句
• 結構傾向重複，文法錯誤有時影響理解
• 常用詞彙大致恰當
• 基本標點準確，大部分常用字拼寫正確
• 有部分語域、語氣、風格配合文體的證據

3 分:
• 簡短簡單句大致準確，僅零星嘗試長句/複雜句
• 文法錯誤經常影響理解
• 簡單詞彙恰當
• 常用字拼寫正確，基本標點大部分準確

2 分:
• 部分簡短簡單句結構準確
• 文法錯誤頻繁影響理解
• 非常簡單的詞彙，範圍有限，多依賴題目提示字眼
• 少數字拼寫正確，基本標點偶爾準確

1 分:
• 句子結構、串字及/或用詞多方面錯誤致使無法理解

0 分:
• 語言不足以評估：主要由不連貫單詞、簡短筆記式短語或不完整句子組成

───────────────────────────────────────
🟢 O: Organization（組織）— 滿分 7 分
───────────────────────────────────────

Organization 評估範圍：
- overall structure（整體結構是否清晰及有效）
- paragraphing（段落是否有明確功能及邏輯）
- logical sequencing（觀點是否按合理次序發展）
- progression of ideas（觀點層層展開）
- cohesion（段落之間是否有良好 cohesion）
- cohesive devices / transitions（cohesive ties 是否有效及自然）
- text-type organization（是否符合指定文本類型的組織要求）

⚠️ 重要：複合句、句式多樣性及文法複雜度主要屬於 Language / Language & Style，
不可單憑複合句數量提高 Organization 分數。

7 分:
• 結構極度有效，觀點有邏輯地層層展開
• 段與段之間的連貫性（cohesion）極強
• Cohesive ties 運用精妙且多樣化
• 整體結構嚴謹、精緻、完全符合文體類型要求
• Intro → Body → Conclusion 層次分明

6 分:
• 結構組織有效，觀點有邏輯地展開
• 大部分段落連貫清晰
• 全文 cohesive ties 運用穩健
• 整體結構連貫、精緻、配合文體類型

5 分:
• 結構大致組織有效，觀點有邏輯展開
• 大部分段落連貫清晰
• 全文 cohesive ties 合理
• 整體結構連貫，配合文體類型

4 分:
• 部分段落有明確主題
• 部分段落連貫清晰
• 部分段落有 cohesive ties
• 整體結構大致連貫，配合文體類型

3 分:
• 部分段落大致有明確主題
• 部分段落有簡單 cohesive ties，但連貫性有時模糊
• Cohesive devices 使用範圍有限

2 分:
• 部分段落反映組織主題的嘗試
• 有限度使用 cohesive devices 連結觀點

1 分:
• 嘗試組織文章結構
• 極有限度使用 cohesive devices

0 分:
• Cohesive devices 幾乎完全欠缺

═══════════════════════════════════════
📋 評卷員評分流程（Marker's Two Gates）
═══════════════════════════════════════
第一關 — Layout & Clarity：
1. Layout 是否正確 — 文體格式（Letter 有上下款？Speech 有 intro/conclusion？）
2. Paragraphing — 有清楚的 intro/body/conclusion 層次

第二關 — Body 的 CLO 三維評分（Content / Language / Organization）

═══════════════════════════════════════
🧭 寫作發展診斷工具（平台教學啟發式）
═══════════════════════════════════════

以下為本平台的寫作發展診斷工具，用於指出學生可以如何進一步發展內容。
這些是教學啟發式（pedagogical heuristics），不可視為所有 HKDSE 題型的硬性評分條件。

發展方法參考：
1. 現況切入（Context）— 描述現狀引入話題
2. 他人意見（Others' Views）— 引用他人觀點/社會討論
3. 表達立場（Position）— 清晰表明自己立場/Thesis Statement
4. 發展支持（Development）— 透過 example、explanation、elaboration、reasoning、personal experience 或其他適合題型的方式完成
5. 讓步反駁（Concession + Rebuttal）— 先承認反方論點，再逐一反駁（展現批判思維）

評估觀點是否有充分發展，而非強制要求每篇文章必須包含所有元素。

═══════════════════════════════════════
🚫 DSE Writing 常見錯誤檢查
═══════════════════════════════════════
1. 審題不清/離題
2. 文體格式混淆
3. 內容空洞，缺乏充分發展
4. 文法錯誤（主謂不一致、時態混亂、冠詞錯誤）
5. 用詞重複，詞彙貧乏
6. 句式單調，全是簡單句
7. 段落結構混亂
8. 缺乏過渡詞
9. 開頭結尾公式化
10. 中式英文 (Chinglish)

═══════════════════════════════════════
🚫 中式英文 (Chinglish) 特別檢查清單
═══════════════════════════════════════
- ❌ "Although... but..." → 英文中 although 和 but 不可並用
- ❌ "Because... so..." → 英文中 because 和 so 不可並用
- ❌ "I very like it" → 應為 "I really like it"
- ❌ "There have many people" → 應為 "There are many people"
- ❌ "I am agree" → 應為 "I agree"
- ❌ "Discuss about" → 應為 "discuss"
- ❌ "According to my opinion" → 應為 "In my opinion"

═══════════════════════════════════════
✅ 高分技巧參考
═══════════════════════════════════════
- ✅ PEEL 結構: Point → Explain → Example → Link
- ✅ 讓步反駁 (Concession + Rebuttal)
- ✅ 詞彙多樣化
- ✅ 句式變化: 混合簡單句/複合句/倒裝句/強調句
- ✅ 首尾呼應

═══════════════════════════════════════
📊 JSON 回覆格式（必須嚴格遵守）
═══════════════════════════════════════

{
  "overallScore": 52,
  "contentScore": 3,
  "languageScore": 2,
  "organizationScore": 3,
  "lengthPenalty": -15,
  "offTopicPenalty": 0,
  "grammarErrors": [
    { "original": "錯誤原文", "correction": "修正後", "explanation": "原因（繁體中文）" }
  ],
  "chinglishWarnings": [
    { "original": "中式英文原文", "suggestion": "建議改法", "explanation": "為何是中式英文（繁體中文）" }
  ],
  "generalComment": "語言準確性總評（繁體中文，50-80字）"
}

═══════════════════════════════════════
📏 評分規則
═══════════════════════════════════════
- 子分數定義：contentScore / languageScore / organizationScore 皆為 0–7 分（可用半分），必須對照上方 CLO 等級描述給予。
- overallScore 為 LLM 輔助估算，系統會以 CLO 子分數重新計算為準。
- 若明顯離題、只寫一兩句、未回應題目要求重點，所有 CLO 子分數不可高於 2，overallScore 不可高於 30。
- 若字數少於建議字數 50%，lengthPenalty 至少 -15；少於 30% 時至少 -25。
- 不可僅因文法正確而給高分；內容空泛、論點不足、未展開支持細節，contentScore 必須偏低（最多 3）。
- 若學生文字極短（少於 30 詞），必須在 generalComment 清楚說明扣分原因，且 overallScore 不得高於 20。
- 複合句及句式多樣性歸 Language 評分，不作為 Organization 的主要評分依據。

═══════════════════════════════════════
🛡️ SEMANTIC CONTENT GUARD
═══════════════════════════════════════

The system uses a separate semantic evaluator to check task coverage.
Its findings are provided below as TASK-COVERAGE EVIDENCE.

Important rules when using this evidence for Content scoring:
- Do NOT equate high task coverage with high Content.
  A task-complete essay may still receive a low/moderate Content score
  if ideas are poorly developed.
- Do NOT give a high Content score (≥5) when a core task requirement
  is explicitly marked "missing".
- Do NOT give a Content score ≥3 when two or more requirements are missing.
- "unclear" is NOT equivalent to "missing" — do not penalize for it.
- Language and Organization must remain independent from task coverage.
- Do not use semantic coverage to increase Content score.
- The evidence constrains Content only — it does not replace the CLO rubric.`.trim();

  const grammarUserPrompt = `${context}

請分析學生作文的 Language / Language & Style，
並提供 grammarErrors、chinglishWarnings 以及 languageScore。
Content / Organization 分數亦需按 system rubric 評分，
但不要額外發明未有證據的內容或組織問題。`;

  // === Call 2：Style + Structure（寫作技巧） ===
  const stylePrompt = `你是一位香港中學英文科教師兼 HKDSE English Paper 2 評卷員。請分析學生文章的寫作技巧並提供修改範例。
${writingMSContext}

請以純 JSON 格式回覆：
{
  "strengths": ["優點1（繁體中文）", "優點2（最多3點）"],
  "weaknesses": ["弱點1（繁體中文）", "弱點2（最多3點）"],
  "vocabularySuggestions": [
    { "original": "原詞", "suggestion": "建議詞", "reason": "原因" }
  ],
  "structureFeedback": "文章結構評語（繁體中文，50-80字）",
  "faithfulCorrection": "忠實修正版：只修正文法、拼字、標點、明顯用詞及不自然英文。不得新增學生沒有提出的主要觀點、例子或論據。必須保留學生原本的意思。",
  "enhancedVersion": "示範強化版：示範如何將學生文章提升至更高 HKDSE 水平。可以改善組織、詞彙、句式、論點發展及例子。新增內容必須清楚屬於「示範性擴展」，不可假裝是學生原文。"
}

═══════════════════════════════════════
🚫 禁止事項 — 必須嚴格遵守
═══════════════════════════════════════
- ❌ 禁止輸出「文章未完成」「內容突然中斷」「結尾截斷」「文章不完整」等與事實不符的評語。系統已驗證學生文章字數充足、結構完整。
- ❌ 禁止憑空捏造弱點（fabricated weaknesses）。每項 weakness 必須引用文章中的具體句子作為證據。
- ❌ 禁止憑空捏造優點（fabricated strengths）。若文章沒有值得表揚的亮點，strengths 可以留空（空陣列 []），切勿胡亂讚美。
- ❌ 禁止將「內容可進一步拓展」曲解為「內容不完整」——兩者截然不同。
- ❌ 禁止為了湊字數或填充陣列而作出毫無事實根據的分析及建議。
- ❌ 禁止重複 Call 1 已分析的文法錯誤（grammarErrors）。
- ❌ faithfulCorrection 不得新增學生未提出的主要觀點、例子或論據。只能修正語言層面的錯誤。
- ✅ 弱點必須基於文章實際存在的不足：論點薄弱、缺乏例子、邏輯跳躍、段落結構混亂、格式不當等。
- ✅ 若文章確實沒有明顯優點或弱點，必須如實反映：strengths 或 weaknesses 可為空陣列，並在 structureFeedback 中明確說明「文章表現平均，無特別突出或嚴重不足之處」。
- ✅ 所有反饋必須有事實依據。若無法從文章中找到支撐某個評語的具體句子，則不應給出該評語。

評分規則：
- strengths 必須對照 CLO 7 分制，不可虛高
- weaknesses 必須具體指出 Content/Organization 不足之處，每項附帶文章引用
- vocabularySuggestions 提供 2-4 個詞彙升級建議
- structureFeedback 指出 Organization 對應的 CLO 等級及改善建議
- faithfulCorrection 只修正語言錯誤，保留原意和結構
- enhancedVersion 示範更高水平的寫作，可以改進內容、組織和表達
- 注意文本類型格式要求（Letter 上下款、Speech 開場白等）`.trim();

  const styleUserPrompt = `${context}

請分析寫作技巧並提供修改版（詞彙建議+結構評語+優點+弱點+修改版全文）。`;

  // ============================================
  // Two-stage parallel execution:
  //   Stage A: Semantic evaluator + Style evaluator (run concurrently)
  //   Stage B: Grammar/CLO evaluator (consumes semantic evidence)
  //
  // Rationale: Semantic evidence should inform Content scoring,
  // but cannot be passed to a fully parallel Call 1. Two-stage
  // preserves useful concurrency while enabling evidence flow.
  // ============================================

  async function runGrammarAnalysis(semanticEvidenceContext: string): Promise<string> {
    const userPromptWithEvidence = semanticEvidenceContext
      ? `${context}

${semanticEvidenceContext}

請分析學生作文的 Language / Language & Style，
並提供 grammarErrors、chinglishWarnings 以及 languageScore。
Content / Organization 分數亦需按 system rubric 評分，
但不要額外發明未有證據的內容或組織問題。`
      : grammarUserPrompt;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await callLLM(
          [
            { role: 'system', content: grammarPrompt },
            { role: 'user', content: userPromptWithEvidence },
          ],
          { temperature: attempt === 0 ? 0.3 : 0.5, maxTokens: 4096, jsonMode: true, timeoutMs: 25000, userId: input.userId }
        );
      } catch (e) {
        if (attempt === 1) throw e;
        logger.warn({ module: 'analyzeWriting', error: (e as Error).message }, 'Grammar call retry after failure');
      }
    }
    throw new Error('Grammar analysis failed after retry');
  }

  async function runStyleAnalysis(): Promise<string> {
    return callLLM(
      [
        { role: 'system', content: stylePrompt },
        { role: 'user', content: styleUserPrompt },
      ],
      { temperature: 0.3, maxTokens: 4096, jsonMode: true, timeoutMs: 25000, userId: input.userId }
    );
  }

  async function runSemanticAnalysis(): Promise<SemanticEvaluation> {
    return evaluateTaskCoverage({
      prompt: input.prompt,
      studentDraft: input.studentDraft,
      textType: input.textType,
      title: input.title,
      userId: input.userId,
    });
  }

  // Stage A: Semantic + Style run concurrently
  const [semanticSettled, styleSettled] = await Promise.allSettled([
    runSemanticAnalysis(),
    runStyleAnalysis(),
  ]);

  let semanticAnalysis: SemanticEvaluation | undefined;
  let semanticFailed = false;

  if (semanticSettled.status === "fulfilled") {
    semanticAnalysis = semanticSettled.value;
  } else {
    semanticFailed = true;
    logger.error(
      {
        module: "analyzeWriting",
        error:
          semanticSettled.reason instanceof Error
            ? semanticSettled.reason.message
            : String(semanticSettled.reason),
      },
      "Semantic task-coverage evaluation failed",
    );
  }

  // Build semantic evidence context (empty string if semantic failed)
  const semanticEvidenceContext = semanticAnalysis
    ? buildSemanticEvidencePrompt(semanticAnalysis)
    : "";

  // Stage B: Grammar/CLO runs with semantic evidence
  const grammarSettled = (
    await Promise.allSettled([
      runGrammarAnalysis(semanticEvidenceContext),
    ])
  )[0];

  let grammarRaw: string | undefined;
  let styleRaw: string | undefined;
  let grammarFailed = false;
  let styleFailed = false;

  if (grammarSettled.status === "fulfilled") {
    grammarRaw = grammarSettled.value;
  } else {
    grammarFailed = true;
    logger.error(
      {
        module: "analyzeWriting",
        error:
          grammarSettled.reason instanceof Error
            ? grammarSettled.reason.message
            : String(grammarSettled.reason),
      },
      "Grammar analysis failed",
    );
  }

  if (styleSettled.status === "fulfilled") {
    styleRaw = styleSettled.value;
  } else {
    styleFailed = true;
    logger.error(
      {
        module: "analyzeWriting",
        error:
          styleSettled.reason instanceof Error
            ? styleSettled.reason.message
            : String(styleSettled.reason),
      },
      "Style analysis failed",
    );
  }

  // Parse each independently
  type GrammarAnalysisRaw = {
    overallScore?: number;
    contentScore?: number;
    organizationScore?: number;
    languageScore?: number;
    lengthPenalty?: number;
    offTopicPenalty?: number;
    grammarErrors?: { original: string; correction: string; explanation: string }[];
    chinglishWarnings?: { original: string; suggestion: string; explanation: string }[];
    generalComment?: string;
  };
  type StyleAnalysisRaw = {
    strengths?: string[];
    weaknesses?: string[];
    vocabularySuggestions?: { original: string; suggestion: string; reason: string }[];
    structureFeedback?: string;
    revisedVersion?: string;
    faithfulCorrection?: string;
    enhancedVersion?: string;
  };

  let grammarAnalysis: GrammarAnalysisRaw = {};
  let styleAnalysis: StyleAnalysisRaw = {};

  if (grammarRaw) {
    try {
      grammarAnalysis = parseAIJSON<GrammarAnalysisRaw>(grammarRaw);
    } catch (e) {
      grammarFailed = true;
      logger.error({ module: 'analyzeWriting', error: (e as Error).message }, 'Grammar call JSON parse failed');
    }
  }

  if (styleRaw) {
    try {
      styleAnalysis = parseAIJSON<StyleAnalysisRaw>(styleRaw);
    } catch (e) {
      styleFailed = true;
      logger.error({ module: 'analyzeWriting', error: (e as Error).message }, 'Style call JSON parse failed');
    }
  }

  // All three critical evaluators failed → throw
  if (grammarFailed && styleFailed && semanticFailed) {
    throw new Error('AI 回傳格式無法解析（文法分析、寫作技巧分析及任務覆蓋評估皆失敗）。請縮短文章後重試。');
  }

  // ============================================
  // Deterministic score calculation
  // ============================================

  const ratio = targetWords && targetWords > 0 ? studentWordCount / targetWords : null;
  const deterministicLengthPenalty = ratio === null
    ? 0
    : ratio < 0.3
      ? -25
      : ratio < 0.5
        ? -15
        : ratio < 0.7
          ? -8
          : 0;

  const llmLengthPenalty = typeof grammarAnalysis.lengthPenalty === 'number' ? grammarAnalysis.lengthPenalty : 0;
  // Platform policy: LLM length penalty cannot be more severe than deterministic policy.
  // Both values are ≤ 0, so Math.max selects the less severe penalty (closer to zero).
  const appliedLengthPenalty = Math.max(llmLengthPenalty, deterministicLengthPenalty);

  // CLO scores: normalize to half-point increments (0, 0.5, 1, ..., 7)
  const rawContentScore = normalizeRubricScore(grammarAnalysis.contentScore);
  const languageScore = normalizeRubricScore(grammarAnalysis.languageScore);
  const organizationScore = normalizeRubricScore(grammarAnalysis.organizationScore);

  // Phase 7: Deterministic semantic content guard.
  // Semantic evaluator provides task-coverage evidence. The guard applies
  // a Content score ceiling when task requirements are missing or unclear.
  // The guard only LOWERS Content — it never increases it.
  // Semantic failure → guard is empty → Content unchanged.
  const semanticGuard = deriveSemanticContentGuard(semanticAnalysis);
  const contentScore =
    rawContentScore != null && semanticGuard.maxContentScore != null
      ? (Math.min(rawContentScore, semanticGuard.maxContentScore) as number)
      : rawContentScore;

  const cloTotalScore = (contentScore != null && languageScore != null && organizationScore != null)
    ? contentScore + languageScore + organizationScore
    : undefined;

  const computedCloScore = cloTotalScore != null
    ? Math.round((cloTotalScore / 21) * 100)
    : null;

  const llmBaseScore = typeof grammarAnalysis.overallScore === 'number' ? grammarAnalysis.overallScore : 70;
  // Prefer computed CLO score over LLM's potentially inaccurate overallScore
  const baseScore = computedCloScore ?? llmBaseScore;

  // Off-topic impact is represented by Content score.
  // Do not apply an independent LLM-generated penalty here,
  // otherwise the same task-completion weakness may be double-counted.
  // A dedicated task-coverage evaluator can replace this in a future sprint.
  const appliedOffTopicPenalty = 0;

  const normalizedOverall = clamp(
    Math.round(baseScore + appliedLengthPenalty + appliedOffTopicPenalty),
    0,
    100
  );

  // Internal estimated level — NOT an official HKEAA grade conversion
  const dseLevel = cloTotalScore != null
    ? estimateDSELevelFromCLO(cloTotalScore)
    : undefined;

  // ============================================
  // Merge results (failed parts use fallback)
  // ============================================

  // Rule-based Chinglish detection (supplements AI detection)
  const ruleChinglish = detectChinglish(essayContent);
  const ruleChinglishWarnings = ruleChinglish.map(c => ({
    original: c.found,
    suggestion: c.suggestion,
    explanation: c.pattern,
  }));

  // Improved deduplication using normalizeForDedup
  const mergedChinglish = [
    ...(grammarAnalysis.chinglishWarnings || []).filter(c =>
      c.original !== c.suggestion &&
      c.original?.length > 0 &&
      c.suggestion?.length > 0
    ),
    ...ruleChinglishWarnings.filter(
      rw => !(grammarAnalysis.chinglishWarnings || []).some(
        gw => normalizeForDedup(gw.original ?? '') === normalizeForDedup(rw.original)
      )
    ),
  ];

  // Sprint 102: Filter grammar false positives — remove entries where no actual error detected
  const filteredGrammarErrors = (grammarAnalysis.grammarErrors || []).filter(g => {
    if (!g.original || !g.correction) return false; // empty entries
    if (g.original.trim() === g.correction.trim()) return false; // no actual change
    if (g.explanation && /無誤|無錯誤|正確|no error|correct/i.test(g.explanation)) return false; // AI says it's correct
    if (g.original.length < 3) return false; // too short to be meaningful
    return true;
  });

  // Sprint 102: Filter chinglish false positives
  const filteredChinglish = mergedChinglish.filter(c => {
    if (!c.original || !c.suggestion) return false;
    if (c.original.trim() === c.suggestion.trim()) return false;
    return true;
  });

  // Filter false "incomplete essay" hallucinations from weaknesses
  const INCOMPLETE_PATTERNS = /文章未完成|結尾.*中斷|截斷|incomplete|abruptly.*(cut|end|stop)|essay.*not.*(finish|complete)/i;
  const filteredWeaknesses = (styleAnalysis.weaknesses || []).filter(w => !INCOMPLETE_PATTERNS.test(w));
  const filteredStructureFeedback = styleAnalysis.structureFeedback && INCOMPLETE_PATTERNS.test(styleAnalysis.structureFeedback)
    ? ''
    : styleAnalysis.structureFeedback;

  // Build evidence-backed feedback from semantic evaluation + style analysis
  const evidenceFeedback = buildFeedbackFromEvidence(
    semanticAnalysis,
    essayContent,
  );

  // Build revision object with backward-compatible revisedVersion
  const faithfulCorrection = styleAnalysis.faithfulCorrection || undefined;
  const enhancedVersion = styleAnalysis.enhancedVersion || undefined;
  const revision: WritingRevision | undefined =
    faithfulCorrection || enhancedVersion
      ? { faithfulCorrection, enhancedVersion }
      : undefined;
  // Backward compat: populate revisedVersion from new fields
  const backwardCompatRevisedVersion =
    styleAnalysis.revisedVersion ||
    faithfulCorrection ||
    enhancedVersion ||
    undefined;

  const combined: WritingAnalysis = {
    overallScore: normalizedOverall,
    contentScore,
    languageScore,
    organizationScore,
    cloTotalScore,
    dseLevel,
    strengths: styleAnalysis.strengths || [],
    weaknesses: filteredWeaknesses,
    grammarErrors: filteredGrammarErrors,
    chinglishWarnings: filteredChinglish,
    vocabularySuggestions: styleAnalysis.vocabularySuggestions || [],
    structureFeedback: filteredStructureFeedback || (styleFailed ? '⚠️ 寫作技巧分析暫時無法生成，請重試。' : ''),
    // Future improvement: distinguish faithful correction from enhanced demonstration.
    // An enhanced version may add development/examples and should not
    // be presented to students as a purely corrected version.
    revisedVersion: backwardCompatRevisedVersion,
    generalComment: (() => {
      const raw = grammarAnalysis.generalComment || (grammarFailed ? '⚠️ 語言準確性分析暫時無法生成，請重試。' : '');
      if (INCOMPLETE_PATTERNS.test(raw)) {
        return raw.replace(/文章未完成[^。]*。?/g, '').replace(/結尾[^。]*中斷[^。]*。?/g, '').replace(/截斷[^。]*。?/g, '').trim() || raw;
      }
      return raw;
    })(),
    // Phase 3: Evidence-backed structured feedback
    feedback: evidenceFeedback.length > 0 ? evidenceFeedback : undefined,
    // Phase 4: Separated revision modes
    revision,
    // Phase 5: Rubric metadata for calibration
    rubric: createRubricMetadata(input.textType),
  };

  // 記錄部分失敗供前端顯示
  if (grammarFailed || styleFailed || semanticFailed) {
    const failedParts = [
      grammarFailed ? '文法分析' : '',
      styleFailed ? '寫作技巧分析' : '',
      semanticFailed ? '任務覆蓋評估' : '',
    ].filter(Boolean).join('、');
    logger.warn({ module: 'analyzeWriting', failedParts }, 'Partial analysis failure');
  }

  const validated = validateAIResponse(WritingAnalysisSchema, combined);
  if (!validated.success) throw new Error(validated.error);
  return validated.data;
}

// ============================================
