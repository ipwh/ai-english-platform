// ============================================
// API Route: POST /api/ai/generate-questions
// 生成練習題目
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { generateQuestions, isDeepSeekConfigured } from '@/lib/ai-service';

export async function POST(request: NextRequest) {
  try {
    if (!isDeepSeekConfigured()) {
      return NextResponse.json(
        { error: 'DeepSeek API 尚未設定，請在 .env.local 中設定 DEEPSEEK_API_KEY。' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { grammarItem, grammarItemZh, languageSkill, languageSkillZh, difficulty, gradeLevel, count, questionType, topic } = body;

    if (!difficulty || !gradeLevel) {
      return NextResponse.json(
        { error: '請提供 difficulty 和 gradeLevel。' },
        { status: 400 }
      );
    }

    const questions = await generateQuestions({
      grammarItem,
      grammarItemZh,
      languageSkill,
      languageSkillZh,
      difficulty,
      gradeLevel,
      count: count || 5,
      questionType,
      topic,
    });

    return NextResponse.json({ questions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知錯誤';
    console.error('[generate-questions] Error:', message);
    return NextResponse.json({ error: `AI 生成失敗：${message}` }, { status: 500 });
  }
}
