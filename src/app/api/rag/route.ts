// ============================================
// RAG API — 檢索增強生成
// POST /api/rag?action=query   — RAG 檢索查詢（DeepSeek）
// POST /api/rag?action=vertex  — Vertex AI 語義搜尋
// POST /api/rag?action=index   — 為教材建立索引
// GET  /api/rag?action=stats   — RAG 狀態
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { retrieveRelevantChunks, buildRAGPrompt, indexMaterial, getRAGStats } from '@/lib/rag-service';
import { getEmbedding, searchSimilarChunks } from '@/lib/vertex-embeddings';

// ---- RAG 查詢 ----
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'index') return handleIndex(request);
  if (action === 'vertex') return handleVertexSearch(request);
  return handleQuery(request);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  if (action === 'stats') {
    try {
      const stats = await getRAGStats();
      return NextResponse.json(stats);
    } catch {
      return NextResponse.json({ error: 'RAG 未初始化' }, { status: 503 });
    }
  }
  return NextResponse.json({ message: 'RAG API' });
}

/** Vertex AI 語義搜尋 */
async function handleVertexSearch(request: NextRequest) {
  try {
    const { query, chunks } = await request.json();
    if (!query) return NextResponse.json({ error: '請提供 query' }, { status: 400 });

    const results = await searchSimilarChunks(query, chunks || []);
    return NextResponse.json({ results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Vertex AI error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleQuery(request: NextRequest) {
  try {
    const { query, contextType, topK } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: '請提供 query 參數' }, { status: 400 });
    }

    const { systemPrompt, retrievedContexts } = await buildRAGPrompt(
      query,
      contextType || 'general',
      topK || 3
    );

    return NextResponse.json({
      systemPrompt,
      retrievedContexts,
      hasContext: retrievedContexts.length > 0,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'RAG 查詢失敗';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ---- 建立教材索引 ----
async function handleIndex(request: NextRequest) {
  try {
    const { materialId } = await request.json();

    if (!materialId) {
      return NextResponse.json({ error: '請提供 materialId' }, { status: 400 });
    }

    const result = await indexMaterial(materialId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '索引建立失敗';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ---- RAG 狀態 ----
// (GET handler defined above)

