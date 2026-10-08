// ============================================
// Embedding provider — DeepSeek embeddings with a Vertex AI fallback
// ============================================
//
// 2026-10-08: extracted from rag-service.ts. Provider credentials, endpoints and the
// fallback selection belong to the provider layer (architecture rule: "Provider-specific
// code (fetch + API key) only in providers/"). The RAG service keeps orchestration,
// chunking and persistence only.
//
// Dimension policy: the FIRST successful call fixes the expected dimension, and a later
// provider answering with a different dimension THROWS — mixing dimensions would corrupt
// the pgvector column, so it must never be indexed silently.
// ============================================

import { config } from '@/shared/config/config';
import { logger } from '@/shared/logger/logger';

const DEEPSEEK_API_KEY = config.deepseek.apiKey;
const DEEPSEEK_BASE_URL = config.deepseek.baseUrl;

/** Detected embedding dimension — populated at first successful call. */
let _detectedEmbeddingDim: number | null = null;

/** Dimension of the vectors currently stored (null until the first successful call). */
export function getDetectedEmbeddingDim(): number | null {
  return _detectedEmbeddingDim;
}

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
export async function getEmbedding(text: string): Promise<number[]> {
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
          const emb = json.data[0].embedding as number[];
          // Detect and validate embedding dimension
          if (_detectedEmbeddingDim === null) {
            _detectedEmbeddingDim = emb.length;
            logger.info({ module: 'rag-service', dimension: _detectedEmbeddingDim, provider: 'DeepSeek' }, 'Embedding dimension detected');
          } else if (emb.length !== _detectedEmbeddingDim) {
            logger.error({ module: 'rag-service', expected: _detectedEmbeddingDim, actual: emb.length }, 'Embedding dimension mismatch — model may have changed');
            throw new Error(`Embedding dimension mismatch: expected ${_detectedEmbeddingDim}, got ${emb.length}`);
          }
          return emb;
        }
      }
      logger.warn({ module: 'rag-service', status: res.status }, 'DeepSeek embedding failed, falling back to Vertex AI');
    } catch (e) {
      logger.warn({ module: 'rag-service', error: (e as Error).message }, 'DeepSeek embedding failed, falling back to Vertex AI');
    }
  }

  // Fallback: Vertex AI embeddings (textembedding-gecko / text-embedding-004, 768-dim)
  try {
    const { getEmbedding: getVertexEmbedding } = await import('@/modules/ai/providers/vertex-embeddings');
    const embedding = await getVertexEmbedding(text);
    if (embedding && embedding.length > 0) {
      // Validate dimension consistency when mixing providers
      if (_detectedEmbeddingDim !== null && embedding.length !== _detectedEmbeddingDim) {
        logger.error({ module: 'rag-service', deepseekDim: _detectedEmbeddingDim, vertexDim: embedding.length }, 'Provider embedding dimension mismatch — pgvector search will fail');
        throw new Error(`Embedding dimension mismatch between providers: DeepSeek ${_detectedEmbeddingDim}d vs Vertex ${embedding.length}d. Cannot safely mix.`);
      }
      if (_detectedEmbeddingDim === null) {
        _detectedEmbeddingDim = embedding.length;
        logger.info({ module: 'rag-service', dimension: _detectedEmbeddingDim, provider: 'Vertex AI' }, 'Embedding dimension detected (fallback)');
      }
      return embedding;
    }
    throw new Error('Vertex AI returned empty embedding');
  } catch (e) {
    throw new Error(`Embedding API failed (both DeepSeek and Vertex AI): ${(e as Error).message}`);
  }
}
