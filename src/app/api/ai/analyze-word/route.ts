// ============================================
// API: POST /api/ai/analyze-word — AI 單字分析
// 輸入一個英文單字 + 學生年級，自動分析詞性、意思、例句、同反義字、搭配詞
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { analyzeWord, sanitizeForAI } from '@/modules/ai/services/ai-service';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { z } from 'zod';

const RequestSchema = z.object({
  word: z.string().min(1).max(100),
  gradeLevel: z.enum(['S1', 'S2', 'S3', 'S4', 'S5', 'S6']).optional().default('S4'),
});

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) return NextResponse.json({ error: authResult.error }, { status: 401 });

  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: '無效的請求：word 為必填，gradeLevel 為 S1-S6' },
        { status: 400 }
      );
    }

    const { word: rawWord, gradeLevel } = parsed.data;

    const analysis = await analyzeWord({
      userId: authResult.userId,
      word: sanitizeForAI(rawWord),
      gradeLevel,
    });

    return NextResponse.json({ analysis });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI 分析失敗';
    logger.error({ module: 'analyze-word', error: message }, 'Word analysis failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
