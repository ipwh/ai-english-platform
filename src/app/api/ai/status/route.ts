// ============================================
// API Route: GET /api/ai/status
// 檢查 AI 供應商連線狀態（DeepSeek / Vertex Gemini / Gemini API）
// ============================================

import { NextResponse } from 'next/server';
import { getAIProviders, isDeepSeekConfigured } from '@/modules/ai/services/ai-service';

export async function GET() {
  const configured = isDeepSeekConfigured();
  const providers = getAIProviders();
  const provider = providers.deepseek
    ? 'deepseek'
    : providers.vertexGemini
      ? 'vertex-gemini'
      : providers.geminiApiKey
        ? 'gemini-api'
        : 'none';

  const model = provider === 'deepseek'
    ? (process.env.DEEPSEEK_MODEL || 'deepseek-chat')
    : provider === 'vertex-gemini'
      ? providers.vertexModel
      : provider === 'gemini-api'
        ? (process.env.GEMINI_MODEL || 'gemini-2.5-flash')
        : null;

  return NextResponse.json({
    configured,
    provider,
    model,
    providers,
    message: configured
      ? `AI 服務已連線（${provider}）`
      : 'AI 服務尚未設定。請設定 DEEPSEEK_API_KEY，或設定 Vertex service account（GCP_PROJECT_ID + GCP_SERVICE_ACCOUNT_JSON/GOOGLE_APPLICATION_CREDENTIALS）。',
  });
}


