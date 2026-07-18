// ============================================
// RAG (Retrieval-Augmented Generation) 服務
// 使用 DeepSeek Embedding API 做向量化 + 相似度檢索
// ============================================

import {
  findMaterialById, updateMaterial, deleteMaterialChunks, createMaterialChunk,
  searchChunks, executeRawUnsafe, queryRawUnsafe, countMaterials, countMaterialChunks
} from '@/modules/ai/repositories/material-repo';
import { config } from '@/shared/config/config';
import { logger } from '@/shared/logger/logger';

const DEEPSEEK_API_KEY = config.deepseek.apiKey;
const DEEPSEEK_BASE_URL = config.deepseek.baseUrl;

function getApiKey(): string {
  if (!config.deepseek.isConfigured) {
    throw new Error('DEEPSEEK_API_KEY not configured. RAG features unavailable.');
  }
  return DEEPSEEK_API_KEY;
}

// ============================================
// 一、向量嵌入 (Embedding)
// ============================================

/**
 * 呼叫 Embedding API 生成向量
 * 優先 DeepSeek，失敗時自動 fallback 到 Vertex AI
 */
async function getEmbedding(text: string): Promise<number[]> {
  // Try DeepSeek embedding first
  if (config.deepseek.isConfigured) {
    try {
      const res = await fetch(`${DEEPSEEK_BASE_URL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify({
          model: 'deepseek-embedding',
          input: text,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.data?.[0]?.embedding) {
          return json.data[0].embedding;
        }
      }
      logger.warn({ module: 'rag-service', status: res.status }, 'DeepSeek embedding failed, falling back to Vertex AI');
    } catch (e) {
      logger.warn({ module: 'rag-service', error: (e as Error).message }, 'DeepSeek embedding failed, falling back to Vertex AI');
    }
  }

  // Fallback: Vertex AI embeddings (textembedding-gecko)
  try {
    const { getEmbedding: getVertexEmbedding } = await import('@/modules/ai/services/vertex-embeddings');
    const embedding = await getVertexEmbedding(text);
    if (embedding && embedding.length > 0) return embedding;
    throw new Error('Vertex AI returned empty embedding');
  } catch (e) {
    throw new Error(`Embedding API failed (both DeepSeek and Vertex AI): ${(e as Error).message}`);
  }
}

// ============================================
// 二、教材分塊 (Chunking)
// ============================================

/**
 * 將教材內容分塊（每塊 ~500 tokens，有重疊）
 */
function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  // 先按段落分割
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());

  let currentChunk = '';
  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);
    const currentTokens = estimateTokens(currentChunk);

    if (currentTokens + paraTokens > chunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      // 重疊：保留最後 overlap 個 token 的內容
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(Math.max(0, words.length - Math.floor(overlap / 2)));
      currentChunk = overlapWords.join(' ') + '\n\n' + para;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/** 簡易 token 估算 (英文: ~4 chars/token, 中文: ~1.5 chars/token) */
function estimateTokens(text: string): number {
  const cnChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const enChars = text.length - cnChars;
  return Math.ceil(cnChars / 1.5 + enChars / 4);
}

// ============================================
// 三、建立教材向量索引
// ============================================

/**
 * 為教材建立 embedding 索引
 */
export async function indexMaterial(materialId: string): Promise<{ chunkCount: number }> {
  const material = await findMaterialById(materialId);
  if (!material || !material.content) {
    throw new Error('教材不存在或尚無文字內容');
  }

  // 更新狀態
  await updateMaterial(materialId, { ragStatus: 'chunking' });

  // 分塊
  const chunks = chunkText(material.content);
  logger.info({ module: 'rag-service', title: material.title, chunkCount: chunks.length }, 'Material chunked');

  // 清除舊區塊
  await deleteMaterialChunks(materialId);

  // 逐塊建立 embedding
  await updateMaterial(materialId, { ragStatus: 'embedding' });

  for (let i = 0; i < chunks.length; i++) {
    try {
      const embedding = await getEmbedding(chunks[i]);
      const embeddingJson = JSON.stringify(embedding);

      // Always store JSON embedding (legacy fallback)
      await createMaterialChunk({
        materialId,
        chunkIndex: i,
        content: chunks[i],
        tokenCount: estimateTokens(chunks[i]),
        embedding: embeddingJson,
      });

      // Also store pgvector embedding if available
      if (await isPgvectorAvailable()) {
        const vectorLiteral = `[${embedding.join(',')}]`;
        await executeRawUnsafe(
          `UPDATE "MaterialChunk" SET "embeddingVector" = $1::vector(1536) WHERE "materialId" = $2 AND "chunkIndex" = $3`,
          vectorLiteral, materialId, i
        );
      }
    } catch (err) {
      logger.error({ module: 'rag-service', chunkIndex: i, total: chunks.length, error: (err as Error).message }, 'Chunk embedding failed');
      throw err;
    }
  }

  // 完成
  await updateMaterial(materialId, { ragStatus: 'done' });

  logger.info({ module: 'rag-service', title: material.title, chunkCount: chunks.length }, 'Material indexed');
  return { chunkCount: chunks.length };
}

// ============================================
// 四、向量相似度檢索
// ============================================

/**
 * 計算餘弦相似度
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================
// pgvector 支援 — 資料庫層級向量相似度檢索
// ============================================

let _pgvectorAvailable: boolean | null = null;

/**
 * 檢測 PostgreSQL pgvector extension 是否可用
 */
async function isPgvectorAvailable(): Promise<boolean> {
  if (_pgvectorAvailable !== null) return _pgvectorAvailable;
  try {
    const result = await queryRawUnsafe(
      `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') AS "installed"`
    ) as { installed: boolean }[];
    _pgvectorAvailable = result[0]?.installed ?? false;
    logger.info({ module: 'rag-service', pgvectorAvailable: _pgvectorAvailable }, 'pgvector detection complete');
  } catch {
    _pgvectorAvailable = false;
    logger.warn({ module: 'rag-service' }, 'pgvector detection failed — falling back to in-memory similarity');
  }
  return _pgvectorAvailable;
}

/**
 * 使用 pgvector 進行向量相似度檢索（高效能，資料庫層級）
 */
async function pgvectorSearch(
  queryEmbedding: number[],
  topK: number,
  threshold: number,
  materialWhere?: Record<string, unknown>
): Promise<{
  chunk: { id: string; content: string; materialId: string };
  score: number;
  materialTitle: string;
}[]> {
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  // Build material filter clause
  let materialFilter = '';
  const params: (string | number)[] = [vectorLiteral, threshold, topK];
  let paramIdx = 3;

  if (materialWhere && Object.keys(materialWhere).length > 0) {
    const clauses: string[] = [];
    if (materialWhere.ragStatus) {
      paramIdx++;
      clauses.push(`m."ragStatus" = $${paramIdx}`);
      params.push(materialWhere.ragStatus as string);
    }
    if (materialWhere.strand) {
      paramIdx++;
      clauses.push(`m."strand" = $${paramIdx}`);
      params.push(materialWhere.strand as string);
    }
    if (materialWhere.gradeLevel) {
      paramIdx++;
      clauses.push(`m."gradeLevel" = $${paramIdx}`);
      params.push(materialWhere.gradeLevel as string);
    }
    if (clauses.length > 0) {
      materialFilter = 'AND ' + clauses.join(' AND ');
    }
  }

  const query = `
    SELECT mc."id", mc."content", mc."materialId", m."title" AS "materialTitle",
           1 - (mc."embeddingVector" <=> $1::vector) AS score
    FROM "MaterialChunk" mc
    JOIN "Material" m ON mc."materialId" = m."id"
    WHERE mc."embeddingVector" IS NOT NULL
      ${materialFilter}
      AND 1 - (mc."embeddingVector" <=> $1::vector) >= $2
    ORDER BY mc."embeddingVector" <=> $1::vector
    LIMIT $3
  `;

  const rows = await queryRawUnsafe(query, ...params) as {
    id: string; content: string; materialId: string; materialTitle: string; score: number;
  }[];

  return rows.map(row => ({
    chunk: { id: row.id, content: row.content, materialId: row.materialId },
    score: Number(row.score),
    materialTitle: row.materialTitle,
  }));
}

/**
 * 檢索相關教材區塊（自動選擇 pgvector 或 in-memory 路徑）
 */
export async function retrieveRelevantChunks(
  query: string,
  topK = 5,
  threshold = 0.6
): Promise<{
  chunk: { id: string; content: string; materialId: string };
  score: number;
  materialTitle: string;
}[]> {
  const queryEmbedding = await getEmbedding(query);

  // Try pgvector first (fast, DB-level)
  if (await isPgvectorAvailable()) {
    try {
      const results = await pgvectorSearch(queryEmbedding, topK, threshold);
      logger.debug({ module: 'rag-service', method: 'pgvector', resultCount: results.length, topK, threshold }, 'Vector search completed');
      return results;
    } catch (err) {
      logger.warn({ module: 'rag-service', error: (err as Error).message }, 'pgvector search failed, falling back to in-memory');
    }
  }

  // Fallback: in-memory cosine similarity (legacy path)
  const MAX_CHUNKS = 200;
  const chunks = await searchChunks({
    where: { embedding: { not: null } },
    include: { material: { select: { title: true } } },
    take: MAX_CHUNKS,
    orderBy: { createdAt: 'desc' },
  });

  if (chunks.length === 0) return [];

  const scored = chunks
    .filter(chunk => {
      if (!chunk.embedding) return false;
      // Filter out empty embedding arrays stored as JSON strings
      if (chunk.embedding === '[]' || chunk.embedding === 'null') return false;
      try {
        const parsed = JSON.parse(chunk.embedding);
        return Array.isArray(parsed) && parsed.length > 0;
      } catch { return false; }
    })
    .map(chunk => ({
      chunk: {
        id: chunk.id,
        content: chunk.content,
        materialId: chunk.materialId,
      },
      score: cosineSimilarity(queryEmbedding, JSON.parse(chunk.embedding!)),
      materialTitle: chunk.material.title,
    }))
    .filter(item => item.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  logger.debug({ module: 'rag-service', method: 'in-memory', resultCount: scored.length, topK, threshold }, 'Vector search completed (fallback)');
  return scored;
}

// ============================================
// 五、RAG 增強 Prompt
// ============================================

/**
 * 建立 RAG 增強後的 System Prompt
 * 將相關教材內容作為上下文注入 AI
 */
export async function buildRAGPrompt(
  userQuery: string,
  contextType: 'practice' | 'explanation' | 'writing' | 'general',
  topK = 3
): Promise<{
  systemPrompt: string;
  retrievedContexts: { title: string; content: string; score: number }[];
}> {
  const retrieved = await retrieveRelevantChunks(userQuery, topK, 0.55);

  const retrievedContexts = retrieved.map(r => ({
    title: r.materialTitle,
    content: r.chunk.content,
    score: r.score,
  }));

  const contextText = retrieved
    .map((r, i) => `【參考資料 ${i + 1}】來自教材《${r.materialTitle}》（相關度: ${(r.score * 100).toFixed(0)}%）\n${r.chunk.content}`)
    .join('\n\n---\n\n');

  const typePrompts: Record<string, string> = {
    practice: `你是一位香港中學英語教師，根據 ELE KLACG 2017 課程指引出題。
請參考以下教材內容，生成適合的練習題目。
題目必須與教材內容相關，難度適合中四至中六學生。`,
    explanation: `你是一位香港中學英語教師，擅長解釋英語文法、詞彙和寫作技巧。
請參考以下教材內容，為學生提供清晰、易懂的解釋。
使用中英雙語解釋，確保學生能理解。`,
    writing: `你是一位香港中學英語寫作導師，幫助學生改善寫作。
請參考以下教材內容，提供具體的寫作建議和修改方向。
注意常犯的中式英文錯誤（Chinglish）。`,
    general: `你是一位香港中學英語教學助理，根據 ELE KLACG 2017 課程指引協助教學。
請參考以下教材內容，回答學生的問題。`,
  };

  const basePrompt = typePrompts[contextType] || typePrompts.general;

  const systemPrompt = `${basePrompt}

${contextText ? `\n\n=== 相關教材內容 ===\n${contextText}\n=== 教材內容完 ===\n` : ''}

請根據以上教材內容回答。如果教材內容不足以回答問題，請如實說明，不要編造資訊。`;

  return { systemPrompt, retrievedContexts };
}

// ============================================
// 六、教材處理入口
// ============================================

/**
 * 處理上傳的教材：提取文字 → 分塊 → 嵌入
 */
export async function processMaterialForRAG(materialId: string, content: string): Promise<void> {
  // 儲存內容
  await updateMaterial(materialId, {
    content,
    ocrStatus: 'done',
    ragStatus: 'chunking',
  });

  // 建立向量索引
  await indexMaterial(materialId);
}

/**
 * 取得 RAG 狀態統計
 */
export async function getRAGStats() {
  const [totalMaterials, indexedMaterials, totalChunks] = await Promise.all([
    countMaterials(),
    countMaterials({ ragStatus: 'done' }),
    countMaterialChunks({ embedding: { not: null } }),
  ]);

  return { totalMaterials, indexedMaterials, totalChunks };
}

// ============================================
// 七、DSE 歷屆試題 RAG 專用功能
// ============================================

/**
 * DSE 卷別 / 技能過濾選項
 */
export type DSEPaper = 'Paper 1' | 'Paper 2' | 'Paper 3' | 'Paper 4' | 'General';
export type DSESkill = 'Reading' | 'Writing' | 'Listening' | 'Speaking' | 'Integrated' | 'General';
export type MaterialCategory = 'reading_passage' | 'qa' | 'marking_scheme' | 'writing_question' | 'writing_ms' | 'sample' | 'curriculum' | 'other';

export interface DSERetrievalFilter {
  paper?: DSEPaper;
  skill?: DSESkill;
  category?: MaterialCategory;
  part?: 'Part A' | 'Part B1' | 'Part B2';
  gradeLevel?: string;
  yearRange?: string;
}

/**
 * 特徵標記開關 — 控制 DSE RAG 是否啟用
 * 可透過環境變數 DSE_RAG_ENABLED=true 啟用（預設為 false）
 */
export function isDSERAGEnabled(): boolean {
  return config.rag.dseRagEnabled;
}

/**
 * 檢索 DSE 相關教材區塊（支援過濾）
 * @param query 查詢文字
 * @param filter 過濾條件（卷別、技能、類別等）
 * @param topK 返回前 K 個最相關區塊
 * @param threshold 相似度閾值
 */
export async function retrieveDSERelevantChunks(
  query: string,
  filter?: DSERetrievalFilter,
  topK = 5,
  threshold = 0.55
): Promise<{
  chunk: { id: string; content: string; materialId: string };
  score: number;
  materialTitle: string;
  materialType: string;
  tags: string[];
}[]> {
  if (!isDSERAGEnabled()) return [];

  // 1. 取得查詢向量
  const queryEmbedding = await getEmbedding(query);

  // 2. 建立 Prisma where 條件（只查 RAG 已完成的教材）
  const materialWhere: Record<string, unknown> = {
    ragStatus: 'done',
  };

  if (filter?.skill && filter.skill !== 'General') {
    materialWhere.strand = filter.skill;
  }
  if (filter?.gradeLevel) {
    materialWhere.gradeLevel = filter.gradeLevel;
  }

  // 用 tags JSON 欄位過濾（Prisma 支援 contains 查詢）
  const tagFilters: string[] = [];
  if (filter?.paper && filter.paper !== 'General') {
    tagFilters.push(filter.paper);
  }
  if (filter?.category) {
    tagFilters.push(filter.category);
  }
  if (filter?.part) {
    tagFilters.push(filter.part);
  }

  // 3. Try pgvector first
  if (await isPgvectorAvailable() && tagFilters.length === 0) {
    try {
      const results = await pgvectorSearch(queryEmbedding, topK, threshold, materialWhere);
      if (results.length > 0) {
        return results.map(r => ({
          ...r,
          materialType: 'General',
          tags: [] as string[],
        }));
      }
    } catch (err) {
      logger.warn({ module: 'rag-service', error: (err as Error).message }, 'pgvector DSE search failed, falling back');
    }
  }

  // 4. Fallback: in-memory cosine similarity
  const where: Record<string, unknown> = { embedding: { not: null } };

  if (Object.keys(materialWhere).length > 0) {
    where.material = materialWhere;
  }

  const chunks = await searchChunks({
    where,
    include: { material: { select: { title: true, tags: true, strand: true } } },
    take: 500,
    orderBy: { createdAt: 'desc' },
  });

  if (chunks.length === 0) return [];

  // 4. tags 過濾（在應用層做，因為 Prisma JSON 欄位過濾有限制）
  const filteredChunks = tagFilters.length > 0
    ? chunks.filter(c => {
        const tags = tryParseJSON<string[]>(c.material.tags, []);
        return tagFilters.every(tf => tags.includes(tf));
      })
    : chunks;

  if (filteredChunks.length === 0) return [];

  // 5. 計算相似度並排序
  const scored = filteredChunks
    .map(chunk => {
      const rawEmbedding = tryParseJSON<number[]>(chunk.embedding!, []);
      return {
        chunk: {
          id: chunk.id,
          content: chunk.content,
          materialId: chunk.materialId,
        },
        score: rawEmbedding.length > 0
          ? cosineSimilarity(queryEmbedding, rawEmbedding)
          : 0,
        materialTitle: chunk.material.title,
        materialType: chunk.material.strand || 'General',
        tags: tryParseJSON<string[]>(chunk.material.tags, []),
      };
    })
    .filter(item => item.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

/**
 * 安全 JSON parse
 */
function tryParseJSON<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * 為特定技能檢索 marking scheme
 */
export async function retrieveMarkingScheme(
  skill: DSESkill,
  topK = 3
): Promise<{
  chunk: { id: string; content: string; materialId: string };
  score: number;
  materialTitle: string;
}[]> {
  if (!isDSERAGEnabled()) return [];

  const skillQueryMap: Record<string, string> = {
    Reading: 'marking scheme reading comprehension acceptable answers scoring rubric',
    Writing: 'writing marking scheme content language organization band descriptors scoring criteria',
    Listening: 'listening marking scheme acceptable answers scoring',
    Speaking: 'speaking marking scheme assessment criteria',
  };

  const query = skillQueryMap[skill] || 'HKDSE marking scheme scoring criteria';

  const results = await retrieveDSERelevantChunks(
    query,
    {
      skill,
      category: skill === 'Writing' ? 'writing_ms' : 'marking_scheme',
    },
    topK,
    0.5
  );

  // 如果按類別過濾沒結果，放寬再試
  if (results.length === 0) {
    const fallback = await retrieveDSERelevantChunks(
      query,
      { skill },
      topK,
      0.45
    );
    return fallback.map(r => ({
      chunk: r.chunk,
      score: r.score,
      materialTitle: r.materialTitle,
    }));
  }

  return results.map(r => ({
    chunk: r.chunk,
    score: r.score,
    materialTitle: r.materialTitle,
  }));
}

/**
 * 為題目生成檢索相關歷屆試題內容（閱讀篇章 + 問題）
 */
export async function retrievePastPaperContent(
  skill: DSESkill,
  topic?: string,
  difficulty?: string,
  gradeLevel?: string,
  topK = 4
): Promise<{
  chunk: { id: string; content: string; materialId: string };
  score: number;
  materialTitle: string;
  tags: string[];
}[]> {
  if (!isDSERAGEnabled()) return [];

  // 建立語義查詢
  const parts: string[] = ['DSE English'];
  parts.push(skill);

  if (topic) parts.push(topic);

  // 根據難度調整查詢
  const diffMap: Record<string, string> = {
    remedial: 'basic simple vocabulary easy questions',
    core: 'intermediate moderate difficulty',
    challenge: 'advanced complex challenging difficult',
  };
  if (difficulty && diffMap[difficulty]) {
    parts.push(diffMap[difficulty]);
  }

  const query = parts.join(' ');

  return retrieveDSERelevantChunks(
    query,
    {
      skill,
      category: undefined, // 不限類別 — 可搜到 reading passages, Q&A, samples
      gradeLevel,
    },
    topK,
    0.5
  );
}

/**
 * 建立 DSE Context Prompt — 將檢索到的真實試題與 Marking Scheme
 * 整理成高品質的 AI prompt context
 */
export function buildDSEContextPrompt(
  pastPaperChunks: { content: string; title: string; score: number }[],
  markingSchemeChunks: { content: string; title: string; score: number }[],
  purpose: 'generate_questions' | 'analyze_answer' | 'analyze_writing' | 'explain_mistake' | 'study_help' | 'analyze_integrated'
): string {
  const sections: string[] = [];

  // 歷屆試題內容
  if (pastPaperChunks.length > 0) {
    const ppLines = pastPaperChunks.map((pp, i) =>
      `【歷屆試題參考 ${i + 1}】來自《${pp.title}》（相關度: ${(pp.score * 100).toFixed(0)}%）\n${pp.content}`
    );
    sections.push(`## 真實 DSE 歷屆試題內容\n\n${ppLines.join('\n\n---\n\n')}`);
  }

  // Marking Scheme
  if (markingSchemeChunks.length > 0) {
    const msLines = markingSchemeChunks.map((ms, i) =>
      `【評分參考 ${i + 1}】來自《${ms.title}》（相關度: ${(ms.score * 100).toFixed(0)}%）\n${ms.content}`
    );
    sections.push(`## 官方 Marking Scheme / 評分參考\n\n${msLines.join('\n\n---\n\n')}`);
  }

  if (sections.length === 0) return '';

  // 根據用途加入指引
  const purposeGuide: Record<string, string> = {
    generate_questions: `
請**嚴格參考以上真實 DSE 歷屆試題內容**來生成練習題目：
- 題型、難度、用詞應盡量模仿真實 DSE 試卷風格
- 閱讀題的篇章難度應與上方歷屆試題相近
- MCQ 選項的設計方式（干擾選項的迷惑性）應參考真實試題
- 若上方有 Marking Scheme，請參考其評分邏輯來設計答案`,
    analyze_answer: `
請**參考以上 Marking Scheme 的評分邏輯**來批改學生答案：
- 比對 marking scheme 中類似題目的 Acceptable Answers
- 評分時考慮 marking scheme 中列出的常見錯誤與 partial credit 規則
- 在 feedback 中引用 marking scheme 的具體評分標準`,
    analyze_writing: `
請**嚴格參考以上 HKDSE Paper 2 Marking Scheme** 來批改學生作文：
- 依據 Content / Language & Style / Organization 三向度的等級描述評分
- 參考 marking scheme 中各 band 的具體要求（如字數、內容深度、語言準確度）
- 給出的等級建議應與 marking scheme 的 band descriptors 對齊`,
    explain_mistake: `
請**參考以上 Marking Scheme** 來解釋學生的錯誤：
- 對照 marking scheme 中的 Acceptable Answers 說明為何學生答案不獲分
- 引用 marking scheme 中相關的評分標準來說明扣分原因
- 提供類似 marking scheme 中的 model answer 作為對比`,
    study_help: `
請**參考以上 DSE 歷屆試題內容與 Marking Scheme** 來給予學習建議：
- 指出學生的弱項在 DSE 考試中對應哪些題型
- 引用真實 marking scheme 說明該類題目的評分重點
- 建議的改善方向應與 marking scheme 的等級要求對齊`,
  };

  const guide = purposeGuide[purpose] || '';

  return `\n\n---\n\n# 📚 以下為真實 DSE 歷屆試題參考資料，請務必以此為依據\n\n${sections.join('\n\n')}\n${guide}\n\n---\n`;
}

