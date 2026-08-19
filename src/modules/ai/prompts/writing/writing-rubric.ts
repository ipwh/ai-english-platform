// ============================================
// Canonical HKDSE Paper 2 Writing CLO Rubric
// Single source of truth for Content/Language/Organization scoring.
//
// Used by:
//   - ai/prompts/writing/v2.ts (writing analysis prompt)
//   - ai/usecases/analyze-writing.ts (grammar/CLO evaluator prompt)
//
// There are TWO representations:
//   CLO_RUBRIC    — English, concise table format (for v2.ts)
//   CLO_RUBRIC_ZH — Traditional Chinese, detailed band descriptors (for analyze-writing.ts)
//
// Both describe the SAME scoring structure (0-7 per dimension, 0-21 total).
// If you update one, you MUST update the other to match semantically.
//
// IMPORTANT: The CLO total is an internal 0–21 rubric score.
// Any platform-level performance estimate must be treated as an
// internal pedagogical estimate and must not be represented as
// an official HKEAA grade conversion. The canonical analyzeWriting
// pipeline uses Level 1–5 for internal estimates.
// ============================================

/**
 * HKDSE Paper 2 Writing CLO Rubric (0-7 each dimension, total 0-21).
 * Format: Markdown table suitable for LLM system prompts.
 *
 * The "Level" column uses descriptive labels (not official HKEAA grades).
 */
export const CLO_RUBRIC = `
## HKDSE Paper 2 Writing CLO Rubric (0-7 each, total 0-21)

### C: Content（內容）— 0-7
| Score | Description |
|-------|-------------|
| 7 | Fully addresses all requirements; rich, well-developed ideas; specific examples; creative/imaginative; strong audience awareness |
| 6 | Addresses all requirements; almost all relevant; most ideas well-developed; shows creativity |
| 5 | Addresses requirements; mostly relevant; most ideas developed; some creativity |
| 4 | Generally addresses requirements; mostly relevant; some ideas developed |
| 3 | Partially meets requirements; gaps or repetition; some ideas not fully developed |
| 2 | Barely meets requirements; intermittently relevant; few undeveloped ideas |
| 1 | Insufficient content; heavily relies on prompt wording; very few undeveloped ideas |
| 0 | Completely off-topic, memorized, or unrecognizable as writing |

### L: Language（語言）— 0-7
| Score | Description |
|-------|-------------|
| 7 | Very wide range of sentence structures; highly accurate grammar; precise vocabulary; perfect register/tone |
| 6 | Wide range of accurate structures; generally accurate grammar; good vocabulary range |
| 5 | Variety of accurate structures; occasional complex-structure errors; adequate vocabulary range |
| 4 | Simple structures generally good; some complex attempts; errors sometimes affect clarity |
| 3 | Short simple sentences mostly accurate; frequent errors affect understanding |
| 2 | Some simple structures accurate; frequent errors; very simple vocabulary |
| 1 | Multiple errors make text incomprehensible |
| 0 | Language insufficient to evaluate |

### O: Organization（組織）— 0-7
| Score | Description |
|-------|-------------|
| 7 | Highly effective structure; logical progression; excellent cohesion; sophisticated cohesive ties |
| 6 | Effective organization; logical development; good paragraph cohesion; solid cohesive ties |
| 5 | Generally effective; logical development; most paragraphs coherent; reasonable cohesive ties |
| 4 | Some clear paragraphs; some coherence; basic cohesive ties |
| 3 | Some paragraphing attempted; simple cohesive ties; coherence sometimes unclear |
| 2 | Some organizational attempt; limited cohesive devices |
| 1 | Minimal organizational attempt; very limited cohesive devices |
| 0 | Cohesive devices almost entirely absent |

### Internal CLO Total Reference
The CLO total (0–21) is an internal rubric score used for pedagogical estimation.
Any level estimate derived from it is an internal platform estimate,
NOT an official HKEAA grade conversion.
`.trim();

// ============================================
// Traditional Chinese CLO rubric — used by analyze-writing.ts grammar prompt.
// Semantically identical to CLO_RUBRIC above. This is the authoritative
// Chinese representation. Do NOT maintain a separate copy in analyze-writing.ts.
// ============================================
export const CLO_RUBRIC_ZH = `
═══════════════════════════════════════
📐 HKDSE Paper 2 Writing 評分基準 — 必須以此為唯一評分基準
═══════════════════════════════════════

以下 0–7 數字評分帶描述，依據 HKDSE Paper 2 Writing 官方評分準則
（Marking Scheme）整理；官方 HKDSE 寫作等級描述（Level Descriptors）
僅提供 Level 1–5 的定性描述，並無任何 0–7 數字換算帶。
評分時必須對照以下描述決定各維度的分數（0–7，可用半分 — 平台正規化政策，
並非 HKEAA 官方規定）。

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
`.trim();
