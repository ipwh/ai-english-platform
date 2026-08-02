// Sprint 93: Question Generation Use Case — canonical implementation
// Physically extracted from ai-service.ts

import { callLLM } from '../services/llm-call';
import { parseAIJSON } from '../services/json-utils';
import { sanitizeForAI } from '../services/sanitizer';
import { validateAIResponse, GeneratedQuestionsArraySchema } from '../schemas/ai-schema';
import { HALLUCINATION_GUARD } from '../services/hallucination-guard';
import { STRICT_ANSWER_RULES } from '../prompts';
import { isDSERAGEnabled, retrievePastPaperContent, retrieveMarkingScheme, buildDSEContextPrompt, type DSESkill } from '../services/rag-service';
import { getDSEEmpiricalTopics, validateDSEtopicMatch } from '../services/dse-topics';
import { getRandomTopicV2, selectDiverseTopic, buildDiversityInstruction } from '../services/topic-selector';
import { BANNED_PATTERNS, TIME_FRAGMENT_PATTERNS, getFallbackFillers } from '../services/mcq-filters';
import { normalizeGeneratedQuestions } from '../services/question-normalizer';
import { validateAndFixQuestion } from '../services/question-validator';
import { validateListeningConsistency } from '../services/listening-normalizer';
import { logger } from '@/shared/logger/logger';
import type { GenerateQuestionsInput, GeneratedQuestion } from '../types/generation-types';

export type { GenerateQuestionsInput, GeneratedQuestion };

export async function generateQuestions(input: GenerateQuestionsInput): Promise<GeneratedQuestion[]> {
  const count = input.count || 5;
  const skillDesc = input.grammarItemZh || input.languageSkillZh || input.grammarItem || input.languageSkill || '綜合';
  const typeDesc = input.questionType || 'mc';
  const diffMap = { remedial: '補底', core: '核心', challenge: '挑戰' };

  const isListening = input.languageSkill === 'listening';
  const isReading = input.languageSkill === 'reading';
  const isWriting = input.languageSkill === 'writing';
  const isSpeaking = input.languageSkill === 'speaking';
  const _isMcq = typeDesc === 'mc';

  // 寫作技能自動使用 short-writing 題型
  const effectiveQuestionType = isWriting ? 'short-writing' : typeDesc;

  const isErrorCorrection = false; // error-correction disabled — underline rendering not supported in UI

  // 聽力/閱讀/口語題使用較低 temperature 提高準確性
  const qTemperature = (isListening || isReading || isSpeaking) ? 0.45 : 0.7;

  // ============================================
  // DSE RAG 整合：檢索相關歷屆試題與 Marking Scheme
  // ============================================
  const skillMap: Record<string, DSESkill> = {
    reading: 'Reading',
    writing: 'Writing',
    listening: 'Listening',
    speaking: 'Speaking',
    integrated: 'Integrated',
  };
  const dseSkill: DSESkill = (input.languageSkill && skillMap[input.languageSkill]) || 'General';

  let dseContextPrompt = '';
  try {
    if (isDSERAGEnabled()) {
      logger.info({ module: 'dse-rag', dseSkill, topic: input.topic, difficulty: input.difficulty, userId: input.userId }, 'Retrieving past paper content...');

      const [pastPaperChunks, markingSchemeChunks] = await Promise.all([
        retrievePastPaperContent(dseSkill, input.topic, input.difficulty, input.gradeLevel, 3),
        retrieveMarkingScheme(dseSkill, 2),
      ]);

      dseContextPrompt = buildDSEContextPrompt(
        pastPaperChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        markingSchemeChunks.map(r => ({ content: r.chunk.content, title: r.materialTitle, score: r.score })),
        'generate_questions'
      );

      if (dseContextPrompt) {
        logger.info({ module: 'dse-rag', pastPaperChunks: pastPaperChunks.length, markingSchemeChunks: markingSchemeChunks.length }, 'Retrieved past paper and marking scheme chunks');
      } else {
        logger.info({ module: 'dse-rag' }, 'No relevant past papers, using pure prompt mode');
      }
    }
  } catch (err) {
    // RAG 失敗不應中斷出題流程，fallback 到純 prompt
    logger.warn({ module: 'dse-rag', error: err instanceof Error ? err.message : String(err) }, 'RAG retrieval failed, falling back to pure prompt');
    dseContextPrompt = '';
  }

  const systemPrompt = `你是一位香港中學英文科教師，熟悉 ELE KLACG 2017 課程指引及 HKDSE English Language Level Descriptors。
請根據以下要求生成英語練習題目，題目必須對齊 HKDSE 各卷別（Reading / Writing / Listening / Speaking）的能力要求。
請以純 JSON 陣列格式回覆（不要用 Markdown 代碼塊包裝）。

═══════════════════════════════════════
DSE EMPIRICAL TOPIC DATABASE — MANDATORY REFERENCE
═══════════════════════════════════════

⚠️ CRITICAL: Strictly base your topics on the DSE Empirical Topic Database derived from 2012-2024 real past papers (Paper 1/2/3).
DO NOT invent new topics not found in real DSE exams. Mimic actual DSE format, language difficulty, and task requirements.

${isListening ? `Listening reference topics (from real DSE Paper 3 past papers):
${getDSEEmpiricalTopics('listening', undefined, 5).map(t => `  • ${t}`).join('\n')}
` : ''}${isReading ? `Reading reference topics (from real DSE Paper 1 past papers):
${getDSEEmpiricalTopics('reading', undefined, 5).map(t => `  • ${t}`).join('\n')}
` : ''}${isWriting ? `Writing reference topics (from real DSE Paper 2 past papers):
${getDSEEmpiricalTopics('writing', undefined, 5).map(t => `  • ${t}`).join('\n')}
` : ''}${isSpeaking ? `Speaking reference topics (from real DSE Paper 4 past papers):
${getDSEEmpiricalTopics('listening', undefined, 3).map(t => `  • ${t}`).join('\n')}
` : ''}${!isListening && !isReading && !isWriting && !isSpeaking ? `Reference topics (from real DSE past papers):
${getDSEEmpiricalTopics('writing', undefined, 3).map(t => `  • ${t}`).join('\n')}
` : ''}

HKDSE 等級對齊指引：
- 補底(remedial) → 對應 HKDSE Level 1-2：基礎詞彙、簡單句型、明示信息提取、字面理解
- 核心(core) → 對應 HKDSE Level 3：中級詞彙、複合句、直接推論、辨識明確觀點
- 挑戰(challenge) → 對應 HKDSE Level 4-5：進階詞彙、複雜句型、深層推論、評價觀點態度、理解比喻語言

要求：
- 題目數量：${count} 題
- 技能範疇：${skillDesc}
- 難度：${diffMap[input.difficulty]}
- 年級：${input.gradeLevel}
- 題型：${effectiveQuestionType}
- ⚠️ 題材強制多樣化：你必須使用以下隨機選定的情境主題來設計題目 — "${selectDiverseTopic({ userId: input.userId || 'anonymous', skill: isListening ? 'listening' : isReading ? 'reading' : isWriting ? 'writing' : isSpeaking ? 'speaking' : 'grammar', gradeLevel: input.gradeLevel })}"
  禁止使用你慣用的預設主題（如籃球選拔/蜜蜂/電影時間）。每題需有不同的對話場景。
${buildDiversityInstruction({ userId: input.userId || 'anonymous', skill: isListening ? 'listening' : isReading ? 'reading' : isWriting ? 'writing' : isSpeaking ? 'speaking' : 'grammar', gradeLevel: input.gradeLevel })}
${input.topic ? `- 主題：${input.topic}` : ''}
${isListening ? `
【DSE Paper 3 Listening 聆聽題 — v3.0 自然語速 + Intonation 強化版】

⚠️ 原創性強制要求：你必須生成 100% 原創的聽力材料。嚴禁複製、改寫、或參照任何真實 HKDSE 歷屆試題內容（含原文、答案、結構）。只能模仿 DSE 的題型風格、難度水平、語言要求。

DSE English Paper 3 佔英文科總分 30%，是四卷中比重最高的分卷。

═══════════════════════════════════════
零、內容多樣性規則（CRITICAL — 防止千篇一律）
═══════════════════════════════════════

⚠️ 嚴禁反覆使用電影/3:30/4:00 這類場景。以下是各年級題材對照表，你必須從中選取多樣化主題：

【題材對照表 — 每題必須從不同類別選取】
- S1-S3（生活化）：校園生活（學會選舉、校隊選拔、課外活動報名、功課討論）、家庭（週末計劃、家庭聚會、購物）、興趣（運動、音樂、閱讀）、日常（餐廳點餐、問路、失物報失）
- S4-S6（社會化）：兼職面試、社區服務計劃、大學開放日、文化交流活動、職場實習、環保項目、科技新聞討論、旅行計劃、選科諮詢、社會議題辯論、香港本地文化

【主題多樣性強制規則 v2.0 — CRITICAL】
1. 每道聆聽題必須使用「題材強制多樣化」參數指定的情境主題，嚴禁使用你自己的預設主題
2. 禁止連續使用相同類別的主題（校園→校園→校園），必須輪換
3. 主題必須涵蓋以下領域（輪流使用）：
   - 校園生活 (school): 學會招募、小組項目、校隊選拔、功課討論
   - 社會議題 (society): 社交媒體、網絡欺凌、心理健康、慈善籌款
   - 科技 (technology): AI 應用、智能手機、STEM 比賽、線上學習
   - 環境 (environment): 環保倡議、塑膠禁令、沙灘清潔、噪音污染
   - 文化 (culture): 節日慶祝、海外交流、多元文化日、傳統工藝
   - 健康 (health): 飲食習慣、睡眠問題、看醫生、心理健康
   - 就業 (career): 兼職面試、暑期實習、大學選科、工作假期
   - 科學 (science): 科學展、基因工程、太空探索、睡眠科學
   - 香港本地 (hk-local): 行山、博物館、飲食文化、粵語保育
   - 日常生活 (daily-life): 餐廳點餐、運動場地預訂、生日派對、客服投訴
4. 聆聽內容必須嵌入至少 3 個「內容信號詞」以提高出題品質：
   - 數據型: "statistics show", "research indicates", "according to"
   - 觀點型: "experts argue", "critics claim", "many students feel"
   - 建議型: "we should", "it is recommended", "one solution is"
   - 對比型: "on the other hand", "in contrast", "compared to"

【時間/數字以外的資訊點類型 — 必須包含至少 3 種】
1. 地點變更（例：原本在 Room 201，改到 Hall）
2. 人物/身份（例：新老師的名字、負責人是誰）
3. 原因/理由（例：為什麼活動延期）
4. 條件/限制（例：只有 S4 以上可參加、需家長同意）
5. 順序/步驟（例：先報名再繳費、先做 A 再做 B）
6. 對比/選擇（例：方案 A vs 方案 B 的優缺點）
7. 情感/態度轉變（例：從抗拒到接受、從興奮到失望）

⚠️ 若你的 listeningContent 只包含時間和數字資訊，請重新設計對話加入上述資訊點。

═══════════════════════════════════════
一、自然語速與 Intonation 控制
═══════════════════════════════════════

真實口語的語速與 intonation 受以下因素控制，你必須在 listeningContent 中自然體現：

【語速變化的觸發因素】
1. 情緒波動 → 語速變化：
   - 興奮/急切 → 加快："Wait, wait — I just remembered! The deadline is actually this Friday, not next Monday!"
   - 猶豫/不確定 → 放慢 + hesitation："Um... I'm not entirely sure, but I think it was... around 200 dollars?"
   - 緊張/壓力 → 破碎短句："Look. We need to act. Now. If we don't submit by 5pm..."
2. 語境正式度 → 整體語速：
   - 正式場合 (會議/訪問) → 清晰、中等語速、完整發音
   - 非正式場合 (朋友聊天) → 較快、多 linking/reduction
3. 重點強調 → 刻意放慢：
   - "And this is the KEY point — we MUST arrive before eight."
   - "Let me repeat: forty. Four-zero. Not fourteen."

【自然口語特徵 — 必須嵌入】
1. Linking (連音)：
   - "gonna" (going to), "wanna" (want to), "gotta" (got to)
   - "kinda" (kind of), "sorta" (sort of), "lemme" (let me)
   - 僅在非正式對話中適度使用（挑戰模式可用，補底模式減少）
2. Reduction (弱化)：
   - "d'you" (do you), "whatcha" (what are you), "don'tcha" (don't you)
   - 挑戰模式可適度使用，模擬真實自然語速
3. Hesitation (停頓/猶豫)：
   - "Um..." / "Er..." / "Well..." / "You know..." / "I mean..."
   - "Let me think... Actually, wait — it was..."
4. 重複與自我修正 (Repetition + Self-correction)：
   - "The meeting is at three — no, wait, actually at four. They changed it."
   - "It was really, really important. Like, the most important thing."
5. 填充詞 (Fillers)：
   - "like", "you know", "I mean", "sort of", "kind of", "basically", "right?"
   - 適度使用使對話自然，但不可過度
6. 情感表達 (Emotion cues)：
   - 驚喜："Oh wow! That's... that's amazing! I didn't expect that at all."
   - 失望："Oh. Right. Yeah, no, I understand. That's... that's fine."
   - 不耐煩："Look, I've told you three times already — it's on the second floor."

═══════════════════════════════════════
二、難度分層系統 (依 difficulty + gradeLevel)
═══════════════════════════════════════

【補底 (remedial) — Level 1-2】
- 語速: 偏慢 (~70% 自然語速的感覺)
- Intonation: 平穩、清晰，一個句子一個語調輪廓
- 詞彙: ~1000 詞水平，高頻詞為主，極少 idiom/phrasal verb
- 句型: 簡單句 + 少量 and/but 複合句
- 陷阱: 0-1 個（僅簡單 distraction — 說了立刻更正）
- 對話結構: 線性、可預測、單一主題
- 口語特徵: 極少 linking/reduction，不用 fillers
- 長度: 1 段對話 (至少 12 行，確保足夠內容點支撐所有題目)，2-3 位說話者
- S1-S3: 校園生活、家庭、興趣
- S4-S6: 簡單社會話題、基礎工作情境

【核心 (core) — Level 3】
- 語速: 中等 (~85% 自然語速的感覺)
- Intonation: 有變化，含疑問/確定/驚訝的語調對比
- 詞彙: ~2000 詞水平，含常見 phrasal verb、collocation
- 句型: 複合句 (if/when/although/because)、被動語態
- 陷阱: 1-2 個 (distraction + synonym replacement)
- 對話結構: 有轉折、短暫離題後回正軌
- 口語特徵: 適度 linking ("gonna", "wanna")，少量 hesitation
- 長度: 1 段對話 (至少 16 行，含 5+ 個可出題的內容點)，2-3 位說話者
- 題材: 校園活動、社區服務、文化交流、兼職工作

【挑戰 (challenge) — Level 4-5】
- 語速: 自然語速 (~100%)
- Intonation: 豐富多變，含 sarcasm、含蓄反對、enthusiasm、disappointment 等情緒層次
- 詞彙: ~3000+ 詞水平，含 idiom、進階 phrasal verb、formal/informal register 切換
- 句型: 複雜句 (倒裝、強調、分裂句)、條件句混合型
- 陷阱: 2-3 個 (distraction + synonym + speaker attitude + numerical/spelling)
- 對話結構: 多主題交錯、自然打斷、插話、修正
- 口語特徵: 自然 linking/reduction/hesitation/fillers，母語人士真實對話感
- 長度: 1 段長對話 (至少 20 行，含 6+ 個可出題的內容點) 或 2 段相關短對話（各至少 10 行），2-3 位說話者
- 題材: 社會議題、科技發展、環境保護、職業規劃、全球化

═══════════════════════════════════════
三、DSE 常見陷阱設計規範
═══════════════════════════════════════

1. Distraction (說了又改) — 必備：
   "It's at 3pm. No, sorry — 4pm. They moved it."
   題目陷阱: question asks for final time, 3pm appears as a choice

2. Synonym Replacement (同義詞替換) — 必備：
   對話說: "The project was postponed."
   題目問: "What happened to the project?" → 正確答案含 "delayed"
   選項中同時出現 "postponed" 和 "delayed" 測試學生是否理解同義關係

3. Speaker Attitude (說話者態度) — 挑戰必備：
   Woman: "Well, that's certainly... one approach. Have you considered other options?"
   → 暗示不認同但不直接說 (含蓄反對)
   題目: "How does the woman feel about the man's suggestion?"
   答案不從單句提取，需綜合語氣判斷

4. Numerical Precision (數字精準) — 必備：
   - 相似數字: thirteen vs thirty, 14 vs 40
   - 時間變化: 3:15 → "quarter past three" vs "three fifteen"
   - 價格格式: "$2.50" vs "two dollars fifty" vs "two fifty"

5. Name/Spelling (名字串法) — 可選：
   對話中清晰串出名字: "It's T-A-N-G, Tang."

6. Inference (推論) — 挑戰必備：
   不直接給答案，學生需從上下文推論。
   "I've been hitting the books every night this week." → 推論此人正在準備考試
   ⚠️ 推論題關鍵規則：對話必須提供足夠線索使正確答案成為唯一合理推論。
   若對話中沒有線索能排除其他選項（例如對話只說 "Let's meet at 3:30" 就問原因），
   這種題目不可出 — 改為事實提取題。

═══════════════════════════════════════
四、題型設計規範
═══════════════════════════════════════

依難度自動組合題型：
- remedial:  2 MCQ + 2 fill-blank + 1 short answer
- core:      2 MCQ + 1 fill-blank + 1 form-filling + 1 matching
- challenge: 1 MCQ + 1 fill-blank + 1 inference + 1 speaker attitude + 1 summary completion

每種題型的設計要點：
1. MCQ: 4 個 plausible options，distractor 必須看似合理。挑戰模式選項用 synonym 測試同義理解。
   - ⚠️ MCQ 選項格式強制規則：
     - 時間答案必須是完整時間格式（如 "4:00 PM"、"4 o'clock"、"four o'clock"），嚴禁只輸出 "00" 或 "30" 等碎片
     - 數字答案必須帶單位或上下文（如 "$50"、"15 minutes"、"3 times"），嚴禁裸數字
     - 每個選項必須是完整的、可直接理解的答案，學生看到就能判斷對錯
     - 禁止使用 "All of the above" 作為選項（DSE 不採用此格式）
     - distractor 必須與正確答案屬同一語義類別（時間題的 distractor 必須是其他時間，不可混入不相關內容）
2. Fill-blank: 答案 verbatim 來自 listeningContent。可能是數字/日期/名稱/關鍵詞。
3. Form-filling: 模擬表格填寫，提供欄位標題，答案從對話中提取。
4. Matching: 提供 4-5 個選項配對到 3-4 個問題。
5. Inference: "What can we infer about...?" / "What does X imply when saying...?"
6. Speaker Attitude: "How does the woman feel about...?" / "What is the man's attitude towards...?"
7. Summary Completion: 提供一段有缺漏的摘要，學生從聽力中補全。

═══════════════════════════════════════
五、答案精準度規則 (STRICT)
═══════════════════════════════════════

1. MCQ answer = "A"/"B"/"C"/"D" 之一
2. 所有非 MC 答案必須 100% verbatim 出現在 listeningContent 中
3. 生成完成後必須 Self-Check：逐一核對每個 answer 是否能在 listeningContent 逐字找到
4. 若 answer 是數字或日期，確保 listeningContent 中該數字/日期的形式與答案一致
5. 若題目要求語法轉換 (singular→plural)，答案仍用 listeningContent 原形

═══════════════════════════════════════
六、DSE Listening 應試策略注入
═══════════════════════════════════════

以下策略既是給學生的技巧，也是你出題時應體現的設計原則：
- 重複即答案：重要資訊在對話中至少出現 2 次
- 轉折詞後是重點：but, however, actually, in fact, the thing is, the real issue is
- 強調詞引導答案：importantly, notably, the key point, above all, most critically
- 語氣轉變處有考點：當說話者語調明顯改變時，通常有題目
- 數字/時間/名字必須精準捕捉，這些是最常見的得分點

═══════════════════════════════════════
七、輸出格式（聆聽題特別重要！）
═══════════════════════════════════════

- listeningContent: 完整對話，每個角色一行，用真實換行 \n 分隔
  - 格式範例（每行獨立，不可擠在同一行）：
    "Boy: What time does the movie start?\nGirl: It's at 3 o'clock.\nBoy: Are you sure?\nGirl: Yes, I checked."
  - ⚠️ 嚴禁將多個角色對話擠在一行（如 "Boy: ... Girl: ... Boy: ..."），這會導致 TTS 無法區分角色
  - 每個對話行格式：角色標籤 + 半形冒號 + 空格 + 台詞
- listeningContentZh: 繁體中文情境說明
- ⚠️ 聆聽題關鍵規則（v4.0 — 每題獨立錄音）：
  - **每道題目必須有自己獨立的 listeningContent**（不再共用長錄音）
  - 每題的 listeningContent 是一段簡短獨立對話，只包含該題所需的資訊
  - 這種設計的好處：TTS 合成更快、更穩定、學生可針對單題重聽
  - 每題 listeningContent 必須是自給自足（self-contained）的迷你對話
  - 同一批題目可使用相似主題/角色，但每題的對話內容獨立
- ⚠️ 對話長度控制（CRITICAL — 確保 TTS 穩定）：
  - 每題獨立 listeningContent，含 1-3 個獨立資訊點
  - 每行 5-20 個單詞，總對話長度控制在 40-120 詞
  - 這樣確保 Google Cloud TTS 合成快速（<3 秒）且不會觸發長文本錯誤
- ⚠️ 題目相關性規則：每個 prompt 必須能從其對應的 listeningContent 中找到答案
  - 不可出與對話內容無關的題目
  - 每個 prompt 的正確答案必須在 listeningContent 中有明確依據
  - ⚠️ 推論題（Inference）特別規範：
    - 推論題僅限挑戰（challenge）難度使用
    - 對話中必須有足夠的上下文線索，使正確答案是唯一合理的推論
    - 反例（BAD）：對話只說 "Let's meet at 3:30"，就問 "Why does she suggest 3:30?" 
      → 對話沒有給出原因，任何推論都是猜測，這種題目不可出
    - 正例（GOOD）：對話說 "The movie starts at 4. It takes about 30 minutes to get there."
      女孩說 "Let's meet at 3:30 then." → 可以合理推論原因是 "To have enough time"
    - 驗證方法：出完推論題後自問：「對話中是否有線索能排除其他所有選項？」
      若答案為否 → 該題必須改為事實提取題（答案直接在對話中明示）
  - 出題前先確認：這條題目的答案真的在對話裡嗎？
- ⚠️ 聆聽題 Self-Check（輸出前逐題驗證）：
  - Q1 出完後，Q2-Q5 的每個 prompt 必須重新對照 listeningContent 確認答案確實存在
  - 若某題的答案在 listeningContent 中找不到 → 該題必須重出，不可輸出無關題目
  - 嚴禁出現「對話內容是講電影時間，題目卻問放學去哪裡」這類不相關題目
- 所有中文使用繁體中文
- 嚴禁使用 A/B/Speaker A/Speaker B 等字母標籤 — 只用性別+年齡角色標籤
- ⚠️ 角色標籤白名單（TTS 朗讀相容性 — 只可使用以下四種，其他一律禁止）：
  - 只允許：Boy / Girl / Man / Woman
  - 嚴禁：Librarian、Student、Teacher、Customer、Waiter、Doctor、Nurse、Interviewer、Host、Presenter、Announcer、Operator 等任何職業/身份標籤
  - 原因：TTS 引擎只認得 Boy/Girl/Man/Woman 四種角色標籤來選擇不同語音。使用其他標籤（如 Librarian、Student）會被 TTS 當作台詞朗讀出來，嚴重影響聆聽體驗。
  - 請根據對話情境，將所有角色映射到 Boy/Girl（青少年/學生）或 Man/Woman（成人）

【對話長度統一規範 — 每題獨立 listeningContent】
每題 listeningContent 是一段獨立自足的對話，不與其他題共用。
行數要求（按難度）：
- 補底 (remedial)：6-8 行（答案明示，角色清晰）
- 核心 (core)：8-12 行（含 1 個干擾資訊點）
- 挑戰 (challenge)：12-16 行（需推論，多個資訊點）

⚠️ 角色標籤格式（TTS CRITICAL — 必須 100% 符合）：
每行必須嚴格符合以下格式，否則 TTS 會朗讀出標籤文字：
  ✅ Woman: This is the correct format.
  ✅ Man: Only these four roles are allowed.
  ✅ Boy: No quotes, no brackets, no full-width colon.
  ✅ Girl: One space after the colon.
  ❌ "Woman": ...     （有引號）
  ❌ Woman : ...      （冒號前有空格）
  ❌ WOMAN: ...       （全大寫）
  ❌ [Woman]: ...     （有括號）
  ❌ Librarian: ...   （職業標籤）
  ❌ Student: ...     （身份標籤）

生成後自我檢查（輸出前必做）：
1. 每行是否以 Woman/Man/Boy/Girl 開頭？
2. 冒號後是否只有一個空格，無引號無括號？
3. 每題行數是否符合難度要求？
若有不符 → 立即修正再輸出。` : ''}
${isWriting ? `
【DSE Paper 2 Writing 寫作題 — 短文寫作】

⚠️ 必須生成原創寫作提示，嚴禁複製真實 DSE 歷屆試題。

要求：
- prompt 欄位：一個具體的短文寫作題目（30-80字），包含情境、角色、任務、具體要求
- answer 欄位：提供一個範例答案（80-150字），展示如何回應題目要求
- 題目必須貼近香港中學生的生活經驗（校園、家庭、社會議題、個人成長等）
- 根據年級調整題目複雜度：S1-S3 較簡單主題，S4-S6 DSE程度
- choices 欄位設為空陣列 []
- 所有中文使用繁體中文
` : ''}${isSpeaking ? `
【DSE Paper 4 Speaking 口語練習題】

⚠️ 必須生成原創口語練習題目，模擬 DSE Group Discussion 或 Individual Response 格式。

要求：
- prompt 欄位：一個口語討論題目或個人回應題目（20-50字）
  - Group Discussion 格式：提供一個爭議性話題，要求學生表達立場並給理由
  - Individual Response 格式：提供一個情境問題，要求學生在1分鐘內回應
- answer 欄位：提供範例回應要點（3-5個 bullet points），不是完整答案
- choices 欄位設為空陣列 []
- 題目應適合口語表達，避免需要計算或書面推理的題目
- 根據年級調整：S1-S3 生活化話題，S4-S6 社會議題
- 所有中文使用繁體中文
` : ''}
${isReading ? `
【閱讀理解題特別要求 — 極重要！】
- readingContent: 一段完整的英文閱讀篇章（80-200字），必須在題目之前提供給學生閱讀
- 所有題目必須基於此閱讀篇章，不可無中生有
- 篇章類型根據年級調整：
  - S1-S3：故事、書信、校園海報、簡單說明文
  - S4-S6：新聞報導、議論文、社論、資訊性文章
- 篇章必須有清晰的主旨、細節、隱含信息，以便出推論題
- readingContentZh: 中文簡短篇章主題說明（例如：「一篇關於環保的新聞報導」）
- prompt: 必須是針對閱讀篇章的題目（例如："According to the passage, what is the main reason..."）

【閱讀題 JSON 輸出示例】
{
  "type": "mc",
  "prompt": "According to the passage, what is the main cause of air pollution in the city?",
  "promptZh": "根據文章，城市空氣污染的主要原因是什麼？",
  "readingContent": "Air pollution has become a serious problem in many cities around the world. In Hong Kong, the main sources of air pollution include vehicle emissions, power plants, and marine vessels. According to a 2024 government report, vehicle emissions account for approximately 40% of the city's air pollutants. The government has introduced several measures to tackle this issue, including promoting electric vehicles and improving public transportation.",
  "readingContentZh": "一篇關於香港空氣污染的短篇文章",
  "choices": ["Vehicle emissions", "Factory smoke", "Volcanic activity", "Forest fires"],
  "answer": "A",
  "explanationZh": "文章明確指出車輛排放佔城市空氣污染物的約40%，是主要來源。",
  "explanationEn": "The passage clearly states that vehicle emissions account for approximately 40% of the city's air pollutants.",
  "commonMistake": "學生可能被干擾選項誤導，應訓練直接從文本中尋找證據。",
  "grammarPoint": "Reading comprehension — identifying explicit information"
}

【聆聽題 JSON 輸出示例 — v4.0 每題獨立短對話 + 完整選項格式】
⚠️ 每題都有自己獨立的 listeningContent！以下展示 2 題的輸出結構：
[
  {
    "type": "mc",
    "prompt": "What time does the meeting start?",
    "promptZh": "會議幾點開始？",
    "listeningContent": "Boy: Do you know when the meeting starts?\nGirl: It's at 2 o'clock in the afternoon.\nBoy: Are you sure? I thought it was at 3.\nGirl: No, they changed it to 2 o'clock. I got the email this morning.",
    "listeningContentZh": "兩個學生討論會議時間。",
    "choices": ["2 o'clock in the afternoon", "3 o'clock in the afternoon", "2:30 in the afternoon", "The speaker did not say"],
    "answer": "A",
    "explanationZh": "女孩明確說會議改為2點，並收到電郵確認。",
    "explanationEn": "The girl clearly states the meeting was changed to 2 o'clock.",
    "commonMistake": "學生可能只聽到第一次提到的3點，忽略了後來的更正。",
    "grammarPoint": "Listening — identifying corrected information"
  },
  {
    "type": "mc",
    "prompt": "Where will the meeting take place?",
    "promptZh": "會議在哪裡舉行？",
    "listeningContent": "Girl: Do you remember which room we're using?\nBoy: I think it's in Room 301.\nGirl: Are you sure? Last time it was in the hall.\nBoy: Actually, they moved it to Room 401. Check the notice board.",
    "listeningContentZh": "兩個學生討論會議地點。",
    "choices": ["Room 401", "Room 301", "The hall", "The library"],
    "answer": "A",
    "explanationZh": "男孩最後更正說會議改到Room 401。",
    "explanationEn": "The boy corrected himself and confirmed Room 401.",
    "commonMistake": "學生可能記住第一次提到的Room 301，忽略了後來的更正。",
    "grammarPoint": "Listening — identifying corrected information"
  }
]
⚠️ 注意上述格式要點：
- 每題都有獨立 listeningContent（不再共用）
- 每個時間選項都是完整片語（如 "2 o'clock in the afternoon"），不是碎片
- 若你的 choices 包含碎片（"00 PM"、"30 PM"），輸出前修正。` : ''}

每題必須包含以下欄位（全部為必填）：
- type: 題型 ("mc" / "fill-blank" / "error-correction" / "short-writing")
- prompt: 英文題目問題${isListening ? '（針對聆聽內容的提問）' : isReading ? '（針對閱讀篇章的提問）' : ''}
- promptZh: 中文輔助說明
${isListening ? '- listeningContent: 英文聆聽材料（對話/獨白，50-100字）\n- listeningContentZh: 中文簡短情境說明\n' : ''}${isReading || isErrorCorrection ? `- readingContent: ${isErrorCorrection ? '含錯誤的英文句子/段落（50-150字）' : '英文閱讀篇章（80-200字）'}\n- readingContentZh: 中文簡短篇章主題說明\n` : ''}- choices: 選項陣列（MC題4個選項；其他題型給空陣列 []）
- answer: 正確答案（MC題只能是 "A" / "B" / "C" / "D" 其中之一；填充題給單詞）
- explanationZh: 繁體中文解釋（簡短）
- explanationEn: 英文解釋（簡短）
- commonMistake: 常犯錯誤（繁體中文，簡短）
- grammarPoint: 相關文法點

【難度與年級自動調節】
- 補底(remedial)：使用基礎詞彙（~1000詞水平）、簡單句型、明顯的錯誤選項
- 核心(core)：使用中級詞彙（~2000詞水平）、複合句、需要思考的干擾選項
- 挑戰(challenge)：使用進階詞彙（~3000詞水平）、複雜句型、陷阱選項
- S1-S3：題目語境以校園、家庭、興趣為主；詞彙量控制在1500以內
- S4-S6：題目語境可包含社會議題、學術話題；可使用DSE程度詞彙
${input.difficulty === 'challenge' ? '- 挑戰模式：可包含DSE歷屆題型、推論題、較長文本' : ''}
${input.difficulty === 'remedial' ? '- 補底模式：每個選項的錯誤應明顯，幫助學生建立信心' : ''}

注意：
- 題目必須貼近香港中學生的生活經驗
- 全部中文使用繁體中文
- MC題必須有恰好4個選項（A/B/C/D）
- MC題 choices 只放「選項內容文字」，不要加上 "A."、"B."、"(C)"、"T/F" 之類前綴
- 回覆必須是有效的 JSON 陣列，以 [ 開頭，以 ] 結尾

【MCQ 選項品質要求（極重要）】
- 每個選項必須是完整、有意義的英文句子或片語（至少3個單詞），不可只有單個單詞或字母
- 嚴禁使用 True/False 題型格式（例如 "T: ..." / "F: ..." / "True ..." / "False ..."）
- 所有選項必須屬於同一語法形式（如全部名詞片語、全部完整句子、全部動詞片語）
- 干擾選項必須看起來合理（plausible distractor），不可明顯荒謬
- 選項長度應大致相近，不可有某個選項明顯過長或過短
- 選項之間不可有重疊或包含關係
- ⚠️ 時間/數字答案 — 完整格式強制規則（CRITICAL）：
  - 時間：必須是 "4:00 PM" / "4 o'clock" / "four o'clock" / "4 o'clock in the afternoon" 這種完整格式
  - 數字：必須帶單位或上下文，如 "$50" / "15 minutes" / "3 times"
  - ❌ 嚴禁碎片： "00" / "30" / "00 PM" / "30 PM" / "5:00"（無 AM/PM）/ 任何裸數字
  - ❌ 嚴禁輸出片段時間文字如 "30 PM"（這種文字沒有意義，會被系統過濾掉導致題目失效）
  - 每個時間選項必須能獨立閱讀理解（例如學生看到 "4:00 PM" 就能判斷對錯，不需要看其他選項補全）
- ⚠️ 禁止 "All of the above" / "None of the above" / "Not mentioned" — DSE 不使用此格式
  - 若 AI 輸出包含這些文字，整個選項會被系統自動過濾，可能導致題目無法使用
- ⚠️ distractor 必須與正確答案屬同一類別（時間題全部是時間、地點題全部是地點）
- ⚠️ MC 題 choices 陣列必須恰好 4 個選項，不可多也不可少
  - 生成後請自我檢查：choices.length === 4?

${STRICT_ANSWER_RULES}

${HALLUCINATION_GUARD}

【正確 JSON 輸出範例】
[
  {
    "type": "mc",
    "prompt": "Choose the correct word to complete the sentence: If I ___ rich, I would travel around the world.",
    "promptZh": "選擇正確的詞語完成句子",
    "choices": ["am", "was", "were", "will be"],
    "answer": "C",
    "explanationZh": "在第二類條件句中，if 子句使用過去式，be 動詞一律用 were。",
    "explanationEn": "In Type 2 conditionals, we use past tense in the if-clause, and 'were' is used for all persons of 'be'.",
    "commonMistake": "學生常誤用 was 代替 were，忽略了條件句中 were 的特殊用法。",
    "grammarPoint": "Type 2 Conditional (Subjunctive)"
https://afterschool.com.hk/blog/242-dse-english-paper-3-listening/  },
  {
    "type": "error-correction",
    "prompt": "The passage below contains ONE grammatical error. Which underlined part is incorrect?",
    "promptZh": "以下段落包含一個文法錯誤，哪個劃線部分是錯誤的？",
    "readingContent": "She has been making pottery since she was a child, and she still enjoys to create new pieces. Her works are inspired by traditional Chinese designs.",
    "readingContentZh": "她從小就開始製作陶器，至今仍然享受創作新作品。她的作品靈感來自中國傳統設計。",
    "choices": ["has been making", "since she was a child", "enjoys to create", "are inspired by"],
    "answer": "C",
    "explanationZh": "「enjoys to create」錯誤，'enjoy' 後應接動名詞（gerund），正確為「enjoys creating」。",
    "explanationEn": "'enjoys to create' is incorrect. After 'enjoy', always use a gerund: 'enjoys creating'.",
    "commonMistake": "學生常混淆動名詞與不定詞的用法，例如 'enjoy to do'、'suggest to go' 是常見錯誤。",
    "grammarPoint": "Gerunds vs Infinitives"
  }
]`;

  const userPrompt = `請生成 ${count} 道 ${skillDesc}（${diffMap[input.difficulty]}程度，${input.gradeLevel}）的${effectiveQuestionType === 'mc' ? '選擇題' : effectiveQuestionType === 'fill-blank' ? '填充題' : effectiveQuestionType === 'error-correction' ? '改錯題' : effectiveQuestionType === 'short-writing' ? '短文寫作題' : '練習題'}。`;

  // 注入 DSE RAG context（若有）
  const finalSystemPrompt = systemPrompt + dseContextPrompt;

  // ============================================
  // Generation with retry — ensure question count + quality
  // ============================================
  const MAX_RETRIES = 2;
  let lastError = '';
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // On retry: force different topic and slightly lower temperature
    const retryTopic = attempt > 0
      ? selectDiverseTopic({ userId: input.userId || 'anonymous', skill: isListening ? 'listening' : isReading ? 'reading' : isWriting ? 'writing' : isSpeaking ? 'speaking' : 'grammar', gradeLevel: input.gradeLevel })
      : undefined;
    const retryPrompt = attempt > 0
      ? `\n\n⚠️ RETRY INSTRUCTION: Previous attempt produced insufficient or low-quality questions. Please generate EXACTLY ${count} questions with COMPLETE fields. Use topic: "${retryTopic}". Ensure every question has a valid answer that appears verbatim in the listening/reading content.\n\nDO NOT use the same scenarios or topics as before.`
      : '';
    
    const effectiveSystemPrompt = finalSystemPrompt + retryPrompt;

  const result = await callLLM(
    [
      { role: 'system', content: effectiveSystemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: attempt > 0 ? Math.max(0.3, qTemperature - 0.15) : qTemperature, maxTokens: isListening ? 4096 : 2048, jsonMode: true, timeoutMs: 25000, userId: input.userId }
  );

  const tryValidate = (rawText: string) => {
    const parsed = parseGeneratedQuestions(rawText);
    const normalized = normalizeGeneratedQuestions(parsed);
    const validated = validateAIResponse(GeneratedQuestionsArraySchema, normalized);
    if (!validated.success) {
      throw new Error(validated.error);
    }
    return validated.data;
  };

  try {
    const questions = tryValidate(result);
    // 後驗證：逐題一致性檢查與自動修正
    const allWarnings: string[] = [];
    const fixedQuestions = questions.map((q, i) => {
      const { fixed, warnings } = validateAndFixQuestion(q, i + 1);
      allWarnings.push(...warnings);
      return fixed;    });
    if (allWarnings.length > 0) {
      logger.warn({ module: 'ai-service', warnings: allWarnings }, 'Generated questions had consistency issues (auto-fixed)');
    }

    // === 出題後品質檢查 ===
    const actualCount = fixedQuestions.length;
    let hasCriticalFailures = isListening
      ? (() => {
          const check = validateListeningConsistency(fixedQuestions);
          if (!check.passed) {
            logger.warn({ module: 'ai-service', attempt: attempt + 1, errors: check.errors, warnings: check.warnings }, 'Listening consistency issues');
          } else {
            logger.info({ module: 'ai-service', attempt: attempt + 1 }, 'Listening consistency passed');
          }
          if (check.errors.length > 0) {
            lastError = check.errors.join('; ');
            return check.questionIndices.length >= fixedQuestions.length * 0.5;
          }
          return false;
        })()
      : false;

    // === Reading Content Validation ===
    if (isReading) {
      const readingIssues = fixedQuestions.filter(q => {
        if (!q.readingContent) return true; // Missing reading content is critical
        return q.readingContent.trim().length < 50; // Too short
      });
      if (readingIssues.length > 0) {
        logger.warn({ module: 'ai-service', readingIssueCount: readingIssues.length, totalQuestions: fixedQuestions.length }, 'Reading questions have missing/short readingContent');
        if (readingIssues.length >= fixedQuestions.length * 0.5) {
          lastError = 'Too many reading questions with insufficient content';
          hasCriticalFailures = true;
        }
      }
    }

    // === Retry decision ===
    const needsRetry = actualCount < count || hasCriticalFailures;
    
    if (!needsRetry || attempt >= MAX_RETRIES - 1) {
      if (actualCount === 0) {
        throw new Error(`AI generated 0 valid questions after ${attempt + 1} attempt(s). Last error: ${lastError || 'all questions rejected by quality checks'}`);
      }
      if (actualCount < count && attempt > 0) {
        logger.warn({ module: 'ai-service', attempts: attempt + 1, actualCount, expectedCount: count, lastError: lastError || undefined }, 'Returning best effort after retry attempts');
      }
      // DSE topic validation (informational only)
      const skillForValidation: 'writing' | 'reading' | 'listening' =
        isListening ? 'listening' : isReading ? 'reading' : 'writing';
      const topicCheck = validateDSEtopicMatch(
        fixedQuestions.map(q => (q.prompt || '') + ' ' + (q.explanationEn || '')).join(' '),
        skillForValidation,
      );
      if (!topicCheck.matched) {
        logger.warn({ module: 'ai-service', dseTopicScore: topicCheck.score }, 'DSE topic match LOW');
      }
      return fixedQuestions;
    }
    
    logger.warn({ module: 'ai-service', attempt: attempt + 1, maxRetries: MAX_RETRIES, actualCount, expectedCount: count, criticalFailure: hasCriticalFailures }, 'Retrying question generation');
    // Continue to next iteration of retry loop
  } catch (firstErr: unknown) {
    const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    if (!/AI 回傳格式無法解析|AI 回傳資料格式異常|JSON/i.test(firstMsg)) {
      throw firstErr;
    }

    // 第二階段：請模型只做「格式修復」，避免偶發非 JSON 輸出導致 500
    const repairSystemPrompt = `你是 JSON 格式修復器。請將輸入內容轉為有效 JSON 陣列。
不要新增或刪除題目，只修正格式。
回覆必須是純 JSON 陣列，不可包含任何其他文字。`;

    const repairUserPrompt = `請把以下內容轉成有效 JSON 陣列，每題需包含：
type, prompt, promptZh, choices, answer, explanationZh, explanationEn, commonMistake, grammarPoint

原始內容：
${result.slice(0, 12000)}`;

    const repaired = await callLLM(
      [
        { role: 'system', content: repairSystemPrompt },
        { role: 'user', content: repairUserPrompt },
      ],
      { temperature: 0, maxTokens: 4096, jsonMode: true, timeoutMs: 15000, userId: input.userId }
    );

    return tryValidate(repaired);
  }
  } // end retry loop

  // All retries exhausted or unreachable
  throw new Error(`AI question generation failed after ${MAX_RETRIES} attempts. ${lastError ? 'Last error: ' + lastError : 'No valid questions produced.'}`);
}

/**
 * 穩健地解析 AI 生成的題目 JSON
 */
function parseGeneratedQuestions(raw: string): GeneratedQuestion[] {
  const parsed = parseAIJSON<GeneratedQuestion[] | { questions: GeneratedQuestion[] }>(raw);
  return Array.isArray(parsed) ? parsed : (parsed.questions || []);
}

