// Sprint 92: Writing Analysis Use Case — canonical implementation
// Physically extracted from ai-service.ts

import { callLLM } from "../services/llm-call";
import { parseAIJSON } from "../services/json-utils";
import { sanitizeForAI } from "../services/sanitizer";
import { validateAIResponse, WritingAnalysisSchema } from "../schemas/ai-schema";
import { HALLUCINATION_GUARD } from "../services/hallucination-guard";
import { detectChinglish } from "@/modules/assessment/services/chinglish";
import { isDSERAGEnabled, retrieveMarkingScheme, buildDSEContextPrompt, type DSESkill } from "../services/rag-service";
import { logger } from "@/shared/logger/logger";


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
  overallScore: number; // 0-100
  contentScore?: number;   // CLO Content 0-7
  languageScore?: number;   // CLO Language 0-7
  organizationScore?: number; // CLO Organization 0-7
  cloTotalScore?: number;   // CLO 總分 0-21
  dseLevel?: string;        // 對應 DSE Level (e.g. "5**", "4", "3")
  strengths: string[];
  weaknesses: string[];
  grammarErrors: { original: string; correction: string; explanation: string }[];
  chinglishWarnings: { original: string; suggestion: string; explanation: string }[];
  vocabularySuggestions: { original: string; suggestion: string; reason: string }[];
  structureFeedback: string;
  revisedVersion?: string;
  generalComment: string;
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

學生作文內容：
"""
${essayContent}
"""`;

  // === Call 1：文法 + Chinglish + 總分 + 總評 + CLO 三維子分數（語言準確性） ===
  const grammarPrompt = `你是一位香港中學英文科教師兼 HKDSE English Paper 2 評卷員，擁有多年 DSE 評卷經驗。
請嚴格依據以下官方 HKDSE Paper 2 Writing 評分框架（Content / Language / Organization，簡稱 CLO）進行評分，每卷滿分 21 分（C:7 + L:7 + O:7），每卷經 2 位評卷員獨立評審。
請以純 JSON 格式回覆（以 { 開頭，以 } 結尾）。${writingMSContext}

【HKDSE Paper 2 Writing 官方評分框架 — 必須以此為唯一評分基準】

═══════════════════════════════════════
🔴 C: Content（內容）— 滿分 7 分
═══════════════════════════════════════

7 分 (Level 5**):
• 內容完全符合題目要求，貼題不離題
• 內容豐富且全面，所有觀點充分拓展（有具體 Examples、有深入闡述）
• 展現高度創意與想像力（記敘文有 twist/高潮位；議論文有獨到見解）
• 高度受眾意識（清楚讀者是誰、寫作目的為何）
• 能引起讀者興趣，展現 critical thinking / sensible 思維
• 五大鋪墊法俱全：現況切入 → 他人意見 → 表達立場 → 理據支持 → 讓步反駁

6 分 (Level 5):
• 內容完全符合題目要求
• 幾乎全部相關，大部分觀點充分拓展
• 適時展現創意與想像力
• 展現良好受眾意識

5 分 (Level 4):
• 內容符合題目要求
• 大部分相關，多數觀點有拓展
• 大部分展現創意與想像力
• 展現一般受眾意識

4 分 (Level 3):
• 內容大致符合題目要求
• 大部分相關，部分觀點有拓展
• 有數處創意與想像力
• 間中展現受眾意識

3 分 (Level 2):
• 內容僅部分滿足題目要求
• 有相關內容但存在缺口或重複資訊
• 部分觀點但未充分拓展
• 偶有受眾意識

2 分 (Level 1):
• 內容僅勉強滿足題目要求
• 間歇性相關，少數觀點且未拓展
• 可能曲解題目或包含錯誤資訊
• 幾乎缺乏受眾意識

1 分:
• 內容不足，高度依賴題目提示字眼
• 極少觀點且全未拓展，部分照抄題目
• 幾乎完全缺乏受眾意識

0 分:
• 完全不充分：完全離題/背誦/全抄題目、無法辨識為完整文章

═══════════════════════════════════════
🟡 L: Language（語言）— 滿分 7 分
═══════════════════════════════════════

7 分 (Level 5**):
• 句型極多變（very wide range of sentence structures），能純熟駕馭複雜句式
• 文法極精準，僅有極輕微偶然失誤
• 選詞細膩精準（well-chosen vocabulary），能表達微妙含義（subtleties of meaning）
• 串字及標點近乎完美
• 語域、語氣、風格（Register, Tone, Style）完全配合文體類型與目標受眾
• 語感極強，非死記硬套句型

6 分 (Level 5):
• 廣泛句式準確恰當，掌握簡單句及複雜句
• 文法大致精準，偶有常見錯誤但不影響整體清晰度
• 詞彙廣泛，有多處進階/精緻用語
• 串字及標點大部分正確
• 語域、語氣、風格配合文體類型

5 分 (Level 4):
• 多種句式準確恰當，嘗試使用複雜句
• 文法大致準確，複雜結構中偶有錯誤但不影響清晰度
• 詞彙適度廣泛且恰當
• 串字及標點足夠準確傳意
• 語域、語氣、風格大部分配合文體

4 分 (Level 3):
• 簡單句結構大致良好，偶有嘗試複雜句
• 結構傾向重複，文法錯誤有時影響理解
• 常用詞彙大致恰當
• 基本標點準確，大部分常用字拼寫正確
• 有部分語域、語氣、風格配合文體的證據

3 分 (Level 2):
• 簡短簡單句大致準確，僅零星嘗試長句/複雜句
• 文法錯誤經常影響理解
• 簡單詞彙恰當
• 常用字拼寫正確，基本標點大部分準確

2 分 (Level 1):
• 部分簡短簡單句結構準確
• 文法錯誤頻繁影響理解
• 非常簡單的詞彙，範圍有限，多依賴題目提示字眼
• 少數字拼寫正確，基本標點偶爾準確

1 分:
• 句子結構、串字及/或用詞多方面錯誤致使無法理解

0 分:
• 語言不足以評估：主要由不連貫單詞、簡短筆記式短語或不完整句子組成

═══════════════════════════════════════
🟢 O: Organization（組織）— 滿分 7 分
═══════════════════════════════════════

7 分 (Level 5**):
• 結構極度有效，觀點有邏輯地層層展開
• 段與段之間的連貫性（cohesion）極強
• Cohesive ties（連接手段）運用精妙且多樣化
• 整體結構嚴謹、精緻、完全符合文體類型要求
• Intro → Body → Conclusion 層次分明

6 分 (Level 5):
• 結構組織有效，觀點有邏輯地展開
• 大部分段落連貫清晰
• 全文 cohesive ties 運用穩健
• 整體結構連貫、精緻、配合文體類型

5 分 (Level 4):
• 結構大致組織有效，觀點有邏輯展開
• 大部分段落連貫清晰
• 全文 cohesive ties 合理
• 整體結構連貫，配合文體類型

4 分 (Level 3):
• 部分段落有明確主題
• 部分段落連貫清晰
• 部分段落有 cohesive ties
• 整體結構大致連貫，配合文體類型

3 分 (Level 2):
• 部分段落大致有明確主題
• 部分段落有簡單 cohesive ties，但連貫性有時模糊
• Cohesive devices 使用範圍有限

2 分 (Level 1):
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
第一關 — Layout & Clarity（佔約一半印象分）：
1. 字體清晰度（電腦掃描本上清晰可讀）
2. Layout 是否正確 — 文體格式（Letter 有上下款/標題？Speech 有像樣的 intro/conclusion？）
3. Paragraphing — 有清楚的 intro/body/conclusion 層次；開新段建議隔一行

第二關 — Body 的 CLO 三維評分（Content / Language / Organization）

═══════════════════════════════════════
🧭 內容五大鋪墊法（"現、他、表、理、讓"）
═══════════════════════════════════════
1. 現況切入（Context）— 描述現狀引入話題
2. 他人意見（Others' Views）— 引用他人觀點/社會討論
3. 表達立場（Position）— 清晰表明自己立場/Thesis Statement
4. 理據支持（Reasons + Examples）— 提出 supporting reasons 及具體例子
5. 讓步反駁（Concession + Rebuttal）— 先承認反方論點，再逐一反駁（展現批判思維）

═══════════════════════════════════════
🚫 DSE Writing 十大常見錯誤 — 請逐項檢查
═══════════════════════════════════════
1. 審題不清/離題 → check if the essay addresses ALL parts of the writing prompt
2. 文體格式混淆 → check if the essay follows the correct text type conventions (letter format, speech structure, etc.)
3. 內容空洞，缺乏具體例子 → check if each argument has at least one specific example
4. 文法錯誤（主謂不一致、時態混亂、冠詞錯誤）
5. 用詞重複，詞彙貧乏 → check for repeated words; suggest vocabulary upgrades
6. 句式單調，全是簡單句 → check sentence variety; suggest complex structures
7. 段落結構混亂 → check if each paragraph has ONE clear topic and follows PEEL
8. 缺乏過渡詞 → check for connectors between sentences and paragraphs
9. 開頭結尾公式化 → check if intro has a hook; check if conclusion is more than "In conclusion, I have discussed..."
10. 中式英文 (Chinglish) → specific checks below

═══════════════════════════════════════
🚫 中式英文 (Chinglish) 特別檢查清單
═══════════════════════════════════════
- ❌ "Although... but..." → 英文中 although 和 but 不可並用
- ❌ "Because... so..." → 英文中 because 和 so 不可並用
- ❌ "I very like it" → 應為 "I really like it" 或 "I like it very much"
- ❌ "There have many people" → 應為 "There are many people"
- ❌ "I am agree" → 應為 "I agree"
- ❌ "Discuss about" → 應為 "discuss"（及物動詞，不需要 about）
- ❌ "According to my opinion" → 應為 "In my opinion"
- ❌ "Every coin has two sides" → cliché！用更有創意的表達
- ❌ "Last but not least" → cliché！改用 "Finally" 或 "Most importantly"
- ❌ "More and more important" → 改為 "increasingly important"

═══════════════════════════════════════
✅ 高分技巧檢查 — 學生文章是否具備
═══════════════════════════════════════
- ✅ Show, Don't Tell: 用具體描寫代替抽象陳述
- ✅ PEEL 結構: Point → Explain → Example → Link
- ✅ 讓步反駁 (Concession + Rebuttal): 先承認對方論點再反駁
- ✅ 詞彙多樣化: 避免重複基本詞彙（important → crucial/vital/paramount）
- ✅ 句式變化: 混合簡單句/複合句/倒裝句/強調句
- ✅ 首尾呼應: 結論與引言互相呼應但用詞有變化

═══════════════════════════════════════
📊 JSON 回覆格式（必須嚴格遵守）
═══════════════════════════════════════

{
  "overallScore": 52,
  "contentScore": 3,
  "languageScore": 2,
  "organizationScore": 3,
  "lengthPenalty": -15,
  "offTopicPenalty": -10,
  "grammarErrors": [
    { "original": "錯誤原文", "correction": "修正後", "explanation": "原因（繁體中文）" }
  ],
  "chinglishWarnings": [
    { "original": "中式英文原文", "suggestion": "建議改法", "explanation": "為何是中式英文（繁體中文）" }
  ],
  "generalComment": "語言準確性總評（繁體中文，50-80字）"
}

═══════════════════════════════════════
📏 評分規則（嚴格執行）
═══════════════════════════════════════
- 子分數定義：contentScore / languageScore / organizationScore 皆為 0-7 分（可用半分），必須對照上方官方 CLO 七級描述給予。
- overallScore 必須根據上述 CLO 子分數按 DSE 21 分制比例換算為 0-100，並加上 lengthPenalty 與 offTopicPenalty。換算公式：overallScore = round((contentScore + languageScore + organizationScore) / 21 * 100) + lengthPenalty + offTopicPenalty。
- Level 5** 門檻：CLO 總分 ≥ 19/21（overallScore ≥ 90）。
- Level 5 門檻：CLO 總分 ≥ 16/21（overallScore ≥ 76）。
- Level 4 門檻：CLO 總分 ≥ 12/21（overallScore ≥ 57）。
- Level 3 門檻：CLO 總分 ≥ 9/21（overallScore ≥ 43）。
- Level 2 門檻：CLO 總分 ≥ 6/21（overallScore ≥ 29）。
- Level 1 門檻：CLO 總分 ≥ 3/21（overallScore ≥ 14）。
- 若明顯離題、只寫一兩句、未回應題目要求重點，所有 CLO 子分數不可高於 2，overallScore 不可高於 30（對應 Level 1 或以下）。
- 若字數少於建議字數 50%，lengthPenalty 至少 -15；少於 30% 時至少 -25。
- 不可僅因文法正確而給高分；內容空泛、論點不足、未展開支持細節，contentScore 必須偏低（最多 3，對應 Level 2）。
- 請明確對照官方 CLO 七級描述，在 generalComment 中指出學生文章最接近哪個 HKDSE Level（1-5**），並說明原因。
- 若學生文字極短（少於 30 詞），必須在 generalComment 清楚說明扣分原因，且 overallScore 不得高於 20。
- Organization 分數尤其反映運用「複合句」的能力（主句 + 形容語 + 修飾語的混合應用），這是 Level 4 和 Level 5** 的關鍵分野。

注意：本回合重點是「嚴格 CLO 評分校準 + 語言準確性問題（文法+Chinglish）」。`.trim();

  const grammarUserPrompt = `${context}\n\n請只分析語言準確性（文法錯誤+中式英文+總分+總評）。`;

  // === Call 2：詞彙 + 結構 + 優缺點 + 修改版（寫作技巧） ===
  // Sprint 102: Trimmed prompt — CLO framework already in Call 1, focus only on style/improvement
  const stylePrompt = `你是一位香港中學英文科教師兼 HKDSE English Paper 2 評卷員。請分析學生文章的寫作技巧並提供修改範例。${writingMSContext}

請以純 JSON 格式回覆：
{
  "strengths": ["優點1（繁體中文）", "優點2（最多3點）"],
  "weaknesses": ["弱點1（繁體中文）", "弱點2（最多3點）"],
  "vocabularySuggestions": [
    { "original": "原詞", "suggestion": "建議詞", "reason": "原因" }
  ],
  "structureFeedback": "文章結構評語（繁體中文，50-80字）",
  "revisedVersion": "修正後的完整文章（保留原意，優化詞彙與句型，補足內容細節以提升至更高 DSE Level）"
}

評分規則：
- strengths 必須對照 CLO 7 分制，不可虛高
- weaknesses 必須具體指出 Content/Organization 不足之處
- vocabularySuggestions 提供 2-4 個詞彙升級建議
- structureFeedback 指出 Organization 對應的 CLO 等級及改善建議
- revisedVersion 需示範如何提升至更高 HKDSE Level，非僅文法潤飾
- 注意文本類型格式要求（Letter 上下款、Speech 開場白等）`.trim();

  const styleUserPrompt = `${context}\n\n請分析寫作技巧並提供修改版（詞彙建議+結構評語+優點+弱點+修改版全文）。`;

  // 並行執行兩個分析（grammar call 加入重試以提升穩定性）
  const [grammarResult, styleResult] = await Promise.all([
    (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await callLLM(
            [
              { role: 'system', content: grammarPrompt + writingMSContext },
              { role: 'user', content: grammarUserPrompt },
            ],
            { temperature: attempt === 0 ? 0.3 : 0.5, maxTokens: 4096, jsonMode: true, timeoutMs: 25000, userId: input.userId }
          );
        } catch (e) {
          if (attempt === 1) throw e;
          logger.warn({ module: 'analyzeWriting', error: (e as Error).message }, 'Grammar call retry after failure');
        }
      }
      throw new Error('Grammar analysis failed after retry');
    })(),
    callLLM(
      [
        { role: 'system', content: stylePrompt + writingMSContext },
        { role: 'user', content: styleUserPrompt },
      ],
      { temperature: 0.3, maxTokens: 4096, jsonMode: true, timeoutMs: 25000, userId: input.userId }
    ),
  ]);

  // 各自獨立解析，允許部分失敗
  let grammarAnalysis: {
    overallScore?: number;
    contentScore?: number;
    organizationScore?: number;
    languageScore?: number;
    lengthPenalty?: number;
    offTopicPenalty?: number;
    grammarErrors?: { original: string; correction: string; explanation: string }[];
    chinglishWarnings?: { original: string; suggestion: string; explanation: string }[];
    generalComment?: string;
  } = {};
  let styleAnalysis: {
    strengths?: string[];
    weaknesses?: string[];
    vocabularySuggestions?: { original: string; suggestion: string; reason: string }[];
    structureFeedback?: string;
    revisedVersion?: string;
  } = {};
  let grammarFailed = false;
  let styleFailed = false;

  try {
    grammarAnalysis = parseAIJSON<typeof grammarAnalysis>(grammarResult);
  } catch (e) {
    grammarFailed = true;
    logger.error({ module: 'analyzeWriting', error: (e as Error).message }, 'Grammar call JSON parse failed');
  }

  try {
    styleAnalysis = parseAIJSON<typeof styleAnalysis>(styleResult);
  } catch (e) {
    styleFailed = true;
    logger.error({ module: 'analyzeWriting', error: (e as Error).message }, 'Style call JSON parse failed');
  }

  // 兩者都失敗才拋錯
  if (grammarFailed && styleFailed) {
    throw new Error('AI 回傳格式無法解析（文法分析與寫作技巧分析皆失敗）。請縮短文章後重試。');
  }

  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
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

  const llmBaseScore = typeof grammarAnalysis.overallScore === 'number' ? grammarAnalysis.overallScore : 70;
  const llmLengthPenalty = typeof grammarAnalysis.lengthPenalty === 'number' ? grammarAnalysis.lengthPenalty : 0;
  const llmOffTopicPenalty = typeof grammarAnalysis.offTopicPenalty === 'number' ? grammarAnalysis.offTopicPenalty : 0;
  const contentScore = typeof grammarAnalysis.contentScore === 'number' ? grammarAnalysis.contentScore : undefined;
  const languageScore = typeof grammarAnalysis.languageScore === 'number' ? grammarAnalysis.languageScore : undefined;
  const organizationScore = typeof grammarAnalysis.organizationScore === 'number' ? grammarAnalysis.organizationScore : undefined;
  const cloTotalScore = (contentScore != null && languageScore != null && organizationScore != null)
    ? contentScore + languageScore + organizationScore
    : undefined;
  const dseLevel = cloTotalScore != null
    ? cloTotalScore >= 19 ? '5**'
    : cloTotalScore >= 16 ? '5*'
    : cloTotalScore >= 13 ? '5'
    : cloTotalScore >= 10 ? '4'
    : cloTotalScore >= 7 ? '3'
    : cloTotalScore >= 4 ? '2'
    : cloTotalScore >= 1 ? '1'
    : 'U'
    : undefined;
  const normalizedOverall = clamp(
    Math.round(llmBaseScore + Math.min(llmLengthPenalty, deterministicLengthPenalty) + llmOffTopicPenalty),
    0,
    100
  );

  // 合併結果（失敗的部分用 fallback）
  // === Rule-based Chinglish detection (supplements AI detection) ===
  const ruleChinglish = detectChinglish(essayContent);
  const ruleChinglishWarnings = ruleChinglish.map(c => ({
    original: c.found,
    suggestion: c.suggestion,
    explanation: c.pattern,
  }));
  const mergedChinglish = [
    ...(grammarAnalysis.chinglishWarnings || []).filter(c =>
      // Sprint 102: Filter out false positives — original === suggestion means no actual chinglish found
      c.original !== c.suggestion &&
      c.original?.length > 0 &&
      c.suggestion?.length > 0
    ),
    ...ruleChinglishWarnings.filter(
      rw => !(grammarAnalysis.chinglishWarnings || []).some(
        gw => gw.original?.toLowerCase() === rw.original?.toLowerCase()
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

  const combined: WritingAnalysis = {
    overallScore: normalizedOverall,
    contentScore,
    languageScore,
    organizationScore,
    cloTotalScore,
    dseLevel,
    strengths: styleAnalysis.strengths || [],
    weaknesses: styleAnalysis.weaknesses || [],
    grammarErrors: filteredGrammarErrors,
    chinglishWarnings: filteredChinglish,
    vocabularySuggestions: styleAnalysis.vocabularySuggestions || [],
    structureFeedback: styleAnalysis.structureFeedback || (styleFailed ? '⚠️ 寫作技巧分析暫時無法生成，請重試。' : ''),
    revisedVersion: styleAnalysis.revisedVersion || undefined,
    generalComment: grammarAnalysis.generalComment || (grammarFailed ? '⚠️ 語言準確性分析暫時無法生成，請重試。' : ''),
  };

  // 記錄部分失敗供前端顯示
  if (grammarFailed || styleFailed) {
    const failedParts = [
      grammarFailed ? '文法分析' : '',
      styleFailed ? '寫作技巧分析' : '',
    ].filter(Boolean).join('、');
    logger.warn({ module: 'analyzeWriting', failedParts }, 'Partial analysis failure');
  }

  const validated = validateAIResponse(WritingAnalysisSchema, combined);
  if (!validated.success) throw new Error(validated.error);
  return validated.data;
}

// ============================================
