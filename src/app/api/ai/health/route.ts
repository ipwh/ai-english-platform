// ============================================
// GET /api/ai/health — 測試 AI provider 連線狀態
// ============================================

import { NextResponse } from 'next/server';
import { isAIConfigured, getAIProviders, isDeepSeekConfigured } from '@/modules/ai/services/ai-service';
import { config } from '@/shared/config/config';
import { logger } from '@/shared/logger/logger';

export const maxDuration = 60;

export async function GET() {
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
      results.deepseekTest = {
        model: config.deepseek.model,
        baseUrl: config.deepseek.baseUrl,
        status: res.status,
        latencyMs,
        ok: res.ok,
      };
      if (!res.ok) {
        const errText = await res.text();
        results.deepseekTest.error = errText.slice(0, 300);
      }
    } catch (err) {
      results.deepseekTest = {
        model: config.deepseek.model,
        baseUrl: config.deepseek.baseUrl,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startTime,
      };
    }
  } else {
    results.deepseekTest = { error: 'DeepSeek not configured (API key missing or placeholder)' };
  }

  logger.info({ module: 'ai-health', ...results }, 'AI health check');

  return NextResponse.json(results);
}
