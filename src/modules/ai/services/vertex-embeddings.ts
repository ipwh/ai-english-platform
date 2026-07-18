// ============================================
// Vertex AI Embeddings Service
// 使用 Google Vertex AI text-embedding-004 模型
// 設定統一從 config.ts 讀取
// ============================================

import { getGoogleAuth } from '@/modules/ai/services/gcp-auth';
import { config } from '@/shared/config/config';

const PROJECT_ID = config.vertex.projectId;
const LOCATION = config.vertex.embeddingsLocation;
const MODEL = config.vertex.embeddingsModel;

interface EmbeddingResponse {
  predictions: { embeddings: { values: number[] } }[];
}

let auth: ReturnType<typeof getGoogleAuth> | null = null;

function getAuth() {
  if (!auth) {
    if (!PROJECT_ID) {
      throw new Error('Vertex AI Embeddings 未設定 GCP_PROJECT_ID。');
    }
    auth = getGoogleAuth();
  }
  return auth;
}

/**
 * 將文字轉換為向量嵌入
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const client = getAuth();
  const token = await client.getAccessToken();

  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [{ content: text }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Vertex AI embedding error (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data: EmbeddingResponse = await res.json();
  const embedding = data.predictions?.[0]?.embeddings?.values;
  if (!embedding || embedding.length === 0) {
    throw new Error('Vertex AI returned empty embedding');
  }
  return embedding;
}

/**
 * 批量將多段文字轉換為向量嵌入
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    const embedding = await getEmbedding(text);
    results.push(embedding);
    // 避免 rate limit
    if (texts.length > 1) await new Promise(r => setTimeout(r, 200));
  }
  return results;
}

/**
 * 計算兩個向量的 cosine 相似度
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * 在素材區塊中搜尋最相關的內容
 */
export async function searchSimilarChunks(
  query: string,
  chunks: { content: string; embedding?: number[] | null }[],
  topK: number = 3
): Promise<{ content: string; score: number }[]> {
  const queryEmbedding = await getEmbedding(query);

  const scored = chunks.map((chunk, i) => {
    let score = 0;
    if (chunk.embedding) {
      try {
        const emb = typeof chunk.embedding === 'string'
          ? JSON.parse(chunk.embedding)
          : chunk.embedding;
        score = cosineSimilarity(queryEmbedding, emb as number[]);
      } catch { /* use 0 */ }
    }
    return { content: chunk.content, score, index: i };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ content, score }) => ({ content, score }));
}

/**
 * 檢查 Vertex AI Embeddings 是否已配置
 */
export async function isVertexConfigured(): Promise<boolean> {
  try {
    await getEmbedding('test');
    return true;
  } catch {
    return false;
  }
}
