// ============================================
// API Route: POST /api/ai/analyze-writing
// 批改學生寫作
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { analyzeWriting, isDeepSeekConfigured } from '@/lib/ai-service';

export async function POST(request: NextRequest) {
  try {
    if (!isDeepSeekConfigured()) {
      return NextResponse.json(
        { error: 'DeepSeek API 尚未設定，請在 .env.local 中設定 DEEPSEEK_API_KEY。' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { title, prompt, studentDraft, studentLevel, textType } = body;

    if (!title || !studentDraft) {
      return NextResponse.json(
        { error: '請提供 title 和 studentDraft。' },
        { status: 400 }
      );
    }

    const analysis = await analyzeWriting({
      title,
      prompt: prompt || '',
      studentDraft,
      studentLevel,
      textType,
    });

    return NextResponse.json({ analysis });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    console.error('analyze-writing error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
