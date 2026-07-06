// ============================================
// API Route: POST /api/ai/analyze-material
// 分析教材內容
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { analyzeMaterial, isDeepSeekConfigured } from '@/lib/ai-service';

export async function POST(request: NextRequest) {
  try {
    if (!isDeepSeekConfigured()) {
      return NextResponse.json(
        { error: 'DeepSeek API 尚未設定，請在 .env.local 中設定 DEEPSEEK_API_KEY。' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { title, content, gradeLevel } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: '請提供 title 和 content。' },
        { status: 400 }
      );
    }

    const analysis = await analyzeMaterial({
      title,
      content,
      gradeLevel,
    });

    return NextResponse.json({ analysis });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    console.error('analyze-material error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
