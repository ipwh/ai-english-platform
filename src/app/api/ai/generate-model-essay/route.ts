// ============================================
// POST /api/ai/generate-model-essay
// 生成指定目標水平範文（供學生比較學習）
//
// R3.10-K Phase 5 — Generated Model Integrity:
//   - The pedagogical target (e.g. mid → Level 3) is SERVER-DETERMINED by
//     the deterministic mapping in ai/core/writing-artifact.ts. The LLM
//     only writes the essay text — it can never set the target.
//   - The response carries artifact metadata {source: "generated_model",
//     pedagogicalTargetLevel, generationTarget, generationVersion,
//     qualityStatus}. The target NEVER participates in canonical scoring.
//   - A pedagogical quality gate (booleans only, never a score) verifies
//     target fit; after max attempts the endpoint fails closed with
//     MODEL_GENERATION_UNAVAILABLE — never returns an unverified essay.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { callLLM, sanitizeForAI, isBudgetExceededError } from '@/modules/ai';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { z } from 'zod';
import {
  generateModelEssayWithQualityGate,
  ModelGenerationUnavailableError,
} from '@/modules/ai/core/model-essay-generation';
import type { GenerationTarget } from '@/modules/ai/core/writing-artifact';

const generateModelEssaySchema = z.object({
  topic: z.string().min(1),
  textType: z.string().optional(),
  gradeLevel: z.string().optional(),
  wordLimit: z.coerce.number().int().min(50).max(2000).optional(),
  // Product contract: the UI offers mid (Level 3) and high (Level 5) models.
  // 'low' is defined in the mapping ladder but not exposed by this endpoint.
  level: z.enum(['high', 'mid']).default('mid'),
});

export async function POST(req: NextRequest) {
  const authResult = await verifyApiAuth(req);
  if (!authResult.authenticated) return NextResponse.json({ error: authResult.error }, { status: 401 });

  try {
    const body = await req.json();
    const parsed = generateModelEssaySchema.parse(body);

    // Server-determined target — never trusted from any client metadata.
    const target: GenerationTarget = parsed.level;

    const result = await generateModelEssayWithQualityGate(
      {
        topic: sanitizeForAI(parsed.topic),
        textType: parsed.textType,
        gradeLevel: parsed.gradeLevel,
        wordLimit: parsed.wordLimit,
        target,
      },
      {
        generate: (systemPrompt, userPrompt) =>
          callLLM(
            [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            { temperature: 0.5, maxTokens: 2048, jsonMode: true, timeoutMs: 25000, userId: authResult.userId },
          ),
        judge: (systemPrompt, userPrompt) =>
          callLLM(
            [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            { temperature: 0.2, maxTokens: 1024, jsonMode: true, timeoutMs: 15000, userId: authResult.userId },
          ),
      },
    );

    return NextResponse.json({
      essay: result.essay,
      metadata: result.metadata,
    });
  } catch (error) {
    if (isBudgetExceededError(error)) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof ModelGenerationUnavailableError) {
      return NextResponse.json(
        { status: error.status, reason: error.message, retryable: error.retryable },
        { status: 503 },
      );
    }
    logger.error({ module: 'generate-model-essay', error: (error as Error).message }, 'Model essay generation failed');
    return NextResponse.json({ error: '範文生成失敗 / Model essay generation failed' }, { status: 500 });
  }
}

