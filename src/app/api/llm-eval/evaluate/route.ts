// Sprint 41: POST /api/llm-eval/evaluate — AI Evaluation Platform Pro
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { aiEvalPro } from '@/modules/llm-eval/services/eval-pro';
import { logger } from '@/shared/logger/logger';

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { action, ...data } = body;

    switch (action) {
      case 'evaluate':
        return NextResponse.json({ metrics: aiEvalPro.evaluate(data) });

      case 'provider-metrics':
        return NextResponse.json({ metrics: aiEvalPro.getProviderMetrics(data.provider) });

      case 'rankings':
        return NextResponse.json({ rankings: aiEvalPro.getProviderRankings() });

      case 'ab-test':
        return NextResponse.json({ result: aiEvalPro.runABTest(data) });

      case 'feedback-quality':
        return NextResponse.json({ quality: aiEvalPro.evaluateFeedback(data) });

      case 'recommendation-quality':
        return NextResponse.json({ quality: aiEvalPro.evaluateRecommendations(data) });

      case 'learning-gain':
        return NextResponse.json({ gain: aiEvalPro.calculateLearningGain(data.preScore, data.postScore, data.maxScore) });

      case 'report':
        return NextResponse.json({ report: aiEvalPro.generateReport(data.periodStart, data.periodEnd) });

      case 'history':
        return NextResponse.json({ history: aiEvalPro.getHistory(data.limit || 50) });

      case 'clear':
        aiEvalPro.clearHistory();
        return NextResponse.json({ success: true });

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'llm-eval-pro', error: msg }, 'Evaluation failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
