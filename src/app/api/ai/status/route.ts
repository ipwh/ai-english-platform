// ============================================
// API Route: GET /api/ai/status
// 檢查 DeepSeek API 連線狀態
// ============================================

import { NextResponse } from 'next/server';
import { isDeepSeekConfigured } from '@/lib/ai-service';

export async function GET() {
  const configured = isDeepSeekConfigured();
  return NextResponse.json({
    configured,
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    message: configured
      ? 'DeepSeek API 已連線'
      : 'DeepSeek API 尚未設定。請在 .env.local 中設定 DEEPSEEK_API_KEY。',
  });
}
