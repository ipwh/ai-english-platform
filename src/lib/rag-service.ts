// ============================================
// RAG (Retrieval-Augmented Generation) 服務
// 使用 DeepSeek Embedding API 做向量化 + 相似度檢索
// ============================================

import db from '@/lib/db';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY!;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';

// ============================================
// 一、向量嵌入 (Embedding)
// ============================================

/**
 * 呼叫 DeepSeek Embedding API 生成向量
 */
async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch(`${DEEPSEEK_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-embedding',
      input: text,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding API 錯誤: ${res.status} — ${err}`);
  }

  const json = await res.json();
  return json.data[0].embedding;
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
  const material = await db.material.findUnique({ where: { id: materialId } });
  if (!material || !material.content) {
    throw new Error('教材不存在或尚無文字內容');
  }

  // 更新狀態
  await db.material.update({
    where: { id: materialId },
    data: { ragStatus: 'chunking' },
  });

  // 分塊
  const chunks = chunkText(material.content);
  console.log(`[RAG] 教材 "${material.title}" 分為 ${chunks.length} 個區塊`);

  // 清除舊區塊
  await db.materialChunk.deleteMany({ where: { materialId } });

  // 逐塊建立 embedding
  await db.material.update({
    where: { id: materialId },
    data: { ragStatus: 'embedding' },
  });

  for (let i = 0; i < chunks.length; i++) {
    try {
      const embedding = await getEmbedding(chunks[i]);

      await db.materialChunk.create({
        data: {
          materialId,
          chunkIndex: i,
          content: chunks[i],
          tokenCount: estimateTokens(chunks[i]),
          embedding: JSON.stringify(embedding),
        },
      });
    } catch (err) {
      console.error(`[RAG] 區塊 ${i}/${chunks.length} embedding 失敗:`, err);
      throw err;
    }
  }

  // 完成
  await db.material.update({
    where: { id: materialId },
    data: { ragStatus: 'done' },
  });

  console.log(`[RAG] 教材 "${material.title}" 索引完成 (${chunks.length} chunks)`);
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

/**
 * 檢索相關教材區塊
 * @param query 查詢文字（例如學生的問題或題目）
 * @param topK 返回前 K 個最相關區塊
 * @param threshold 相似度閾值 (0-1)
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
  // 1. 取得查詢向量
  const queryEmbedding = await getEmbedding(query);

  // 2. 獲取所有已嵌入的區塊
  const chunks = await db.materialChunk.findMany({
    where: { embedding: { not: null } },
    include: { material: { select: { title: true } } },
  });

  if (chunks.length === 0) return [];

  // 3. 計算相似度並排序
  const scored = chunks
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
  await db.material.update({
    where: { id: materialId },
    data: {
      content,
      ocrStatus: 'done',
      ragStatus: 'chunking',
    },
  });

  // 建立向量索引
  await indexMaterial(materialId);
}

/**
 * 取得 RAG 狀態統計
 */
export async function getRAGStats() {
  const [totalMaterials, indexedMaterials, totalChunks] = await Promise.all([
    db.material.count(),
    db.material.count({ where: { ragStatus: 'done' } }),
    db.materialChunk.count({ where: { embedding: { not: null } } }),
  ]);

  return { totalMaterials, indexedMaterials, totalChunks };
}
