// Sprint 28: LLM Evaluation API
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import {
  runEval, runConsistencyEval, benchmarkPrompt, benchmarkModel, rankModels,
  comparePromptVersions, compareProviders, generateReport, getEvalHistory, clearEvalHistory,
} from '@/modules/llm-eval/services/eval-engine';
import type { EvalMetrics } from '@/modules/llm-eval/types';

export async function POST(request: NextRequest) {
  const auth = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'run': {
        const r = runEval(body.input, body.output, body.expectedOutput, body.durationMs || 0, body.costUsd || 0);
        return NextResponse.json(r);
      }
      case 'consistency': {
        return NextResponse.json(runConsistencyEval(body.input, body.outputs || [], body.expectedOutput));
      }
      case 'benchmark-prompt': {
        return NextResponse.json(benchmarkPrompt(body.promptId, body.promptName, body.version, body.provider, body.model, body.metrics, body.issues || []));
      }
      case 'benchmark-model': {
        const models = body.models || [];
        const ranked = rankModels(models);
        return NextResponse.json(ranked);
      }
      case 'compare-versions': {
        return NextResponse.json(comparePromptVersions(
          body.baseline as EvalMetrics, body.candidate as EvalMetrics,
          body.baselineId, body.candidateId, body.baselineVersion, body.candidateVersion,
        ));
      }
      case 'compare-providers': {
        return NextResponse.json(compareProviders(body.providerMetrics || {}));
      }
      case 'report': {
        return NextResponse.json(generateReport(body.type || 'prompt-benchmark', body.results || [], body.title || 'Evaluation Report'));
      }
      case 'history':
        return NextResponse.json(getEvalHistory());
      case 'clear':
        clearEvalHistory();
        return NextResponse.json({ success: true });
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ module: 'llm-eval', error: msg }, 'LLM evaluation failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
