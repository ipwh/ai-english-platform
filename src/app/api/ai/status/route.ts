// ============================================
// API Route: GET /api/ai/status
// 檢查 AI 供應商連線狀態（DeepSeek primary; Grok fallback）
// Admin-only: leaks provider chain configuration
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAIProviders, isDeepSeekConfigured } from '@/modules/ai';
import { verifyApiAuth } from '@/shared/auth/api-auth';

export async function GET(request: NextRequest) {
  const auth = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!auth.authenticated) {
    return NextResponse.json({ error: 'Forbidden — teacher or admin access required' }, { status: 403 });
  }
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
    ? (process.env.DEEPSEEK_MODEL || 'deepseek-flash')
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
      : 'AI 服務尚未設定。請設定 DEEPSEEK_API_KEY。',
  });
}


