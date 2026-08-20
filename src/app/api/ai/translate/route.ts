// ============================================
// POST /api/ai/translate
// 翻譯英文至繁體中文（供筆記指引中英對照使用）
// R3.10-K Phase 9 Step 6: authenticated + Zod-validated + capped.
// Failure never masquerades as a successful empty translation.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
// R3.10-L: import from the AI facade (single pipeline entry), not the
// internal service file directly.
import { callLLM, isBudgetExceededError } from '@/modules/ai';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit, AI_RATE_LIMIT } from '@/shared/utils/rate-limiter';
import { logger } from '@/shared/logger/logger';

const MAX_ITEMS = 20;
const MAX_TEXT_LENGTH = 2000;

const translateSchema = z.object({
  items: z
    .array(
      z.object({
        question: z.string().min(1).max(MAX_TEXT_LENGTH),
        hint: z.string().max(MAX_TEXT_LENGTH),
      }),
    )
    .min(1)
    .max(MAX_ITEMS),
});

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimit = await checkRateLimit({ ...AI_RATE_LIMIT, identifier: `ai-translate:${ip}` });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.message },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = translateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { items } = parsed.data;

    const text = items.map((item, i) => `${i + 1}. Q: ${item.question}\n   Hint: ${item.hint}`).join('\n\n');
    const result = await callLLM(
      [{ role: 'system', content: 'Translate the following English note-taking guide to Traditional Chinese (繁體中文). Return ONLY a JSON array: [{"q":"中文問題","h":"中文提示"}]. No other text.' },
       { role: 'user', content: text }],
      { temperature: 0.1, maxTokens: 1024, jsonMode: true, timeoutMs: 10000 },
    );

    const match = result.match(/\[[\s\S]*\]/);
    let translations: unknown;
    try {
      translations = match ? JSON.parse(match[0]) : [];
    } catch {
      // Malformed upstream output — surface as an error, never as empty success
      return NextResponse.json({ error: 'Translation service returned an invalid response. Please retry.' }, { status: 502 });
    }

    if (!Array.isArray(translations)) {
      return NextResponse.json({ error: 'Translation service returned an invalid response. Please retry.' }, { status: 502 });
    }

    return NextResponse.json({ translations });
  } catch (error: unknown) {
    if (isBudgetExceededError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    logger.error({ module: 'translate', error: error instanceof Error ? error.message : String(error) }, 'Translation failed');
    return NextResponse.json({ error: 'Translation failed. Please try again later.' }, { status: 502 });
  }
}
