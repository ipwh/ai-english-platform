// ============================================
// GET /api/ai/health — 測試 AI provider 連線狀態
// R3.10-K Phase 9 Step 6: teacher/admin only, rate-limited, sanitized.
// The live DeepSeek probe is a paid call — it must never be triggerable
// anonymously. Provider configuration details (base URL, raw upstream
// error text) are masked from the response.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { isAIConfigured, getAIProviders, isDeepSeekConfigured } from '@/modules/ai';
import { config } from '@/shared/config/config';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { checkRateLimit } from '@/shared/utils/rate-limiter';
import { logger } from '@/shared/logger/logger';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  // The live probe costs money — throttle per IP even for staff.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateLimit = await checkRateLimit({ maxRequests: 10, windowMs: 60_000, identifier: `ai-health:${ip}` });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.message },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } },
    );
  }

  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    vercelRegion: process.env.VERCEL_REGION || 'local',
    isVercel: process.env.VERCEL === '1',
    aiConfigured: isAIConfigured(),
    providers: getAIProviders(),
  };

  // Test DeepSeek directly
  if (isDeepSeekConfigured()) {
    const startTime = Date.now();
    let deepseekTest: Record<string, unknown>;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.deepseek.apiKey}`,
        },
        body: JSON.stringify({
          model: config.deepseek.model,
          messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
          max_tokens: 10,
          temperature: 0,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;
      deepseekTest = {
        model: config.deepseek.model,
        status: res.status,
        latencyMs,
        ok: res.ok,
      };
      if (!res.ok) {
        // Sanitized: never echo raw upstream error text or the base URL.
        deepseekTest.error = 'DeepSeek connectivity check failed (see server logs)';
      }
    } catch {
      deepseekTest = {
        model: config.deepseek.model,
        error: 'DeepSeek connectivity check failed (see server logs)',
        latencyMs: Date.now() - startTime,
      };
    }
    results.deepseekTest = deepseekTest!;
  } else {
    results.deepseekTest = { error: 'DeepSeek not configured' };
  }

  logger.info({ module: 'ai-health', ...results }, 'AI health check');

  return NextResponse.json(results);
}
