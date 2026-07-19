// Sprint 42: POST /api/experiment
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { experimentService } from '@/modules/experiment/services/experiment-engine';
import { isFeatureEnabled } from '@/modules/production/services/production-ready';
import { logger } from '@/shared/logger/logger';

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  // Feature flag gate
  if (!isFeatureEnabled('experiment')) {
    return NextResponse.json({ error: 'Experiment platform is not enabled. Set feature flag "experiment" to true.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { action, ...data } = body;

    switch (action) {
      // Prompt experiments
      case 'create-prompt':
        return NextResponse.json({ experiment: experimentService.createPromptExperiment(data) });
      case 'run-prompt':
        return NextResponse.json({ result: experimentService.runPromptExperiment(data.experimentId) });

      // Model experiments
      case 'create-model':
        return NextResponse.json({ experiment: experimentService.createModelExperiment(data) });
      case 'run-model':
        return NextResponse.json({ result: experimentService.runModelExperiment(data.experimentId) });

      // Temperature experiments
      case 'create-temperature':
        return NextResponse.json({ experiment: experimentService.createTemperatureExperiment(data) });
      case 'run-temperature':
        return NextResponse.json({ result: experimentService.runTemperatureExperiment(data.experimentId) });

      // Learning experiments
      case 'create-learning':
        return NextResponse.json({ experiment: experimentService.createLearningExperiment(data) });
      case 'run-learning':
        return NextResponse.json({ result: experimentService.runLearningExperiment(data.experimentId) });

      // A/B testing
      case 'ab-test':
        return NextResponse.json({ comparison: experimentService.runABTest(data) });

      // Cost comparison
      case 'compare-costs':
        return NextResponse.json({ costComparison: experimentService.compareCosts(data.experimentId) });

      // Reports
      case 'report':
        return NextResponse.json({ report: experimentService.generateReport(data.experimentId) });
      case 'recommendation-report':
        return NextResponse.json({ recommendationReport: experimentService.generateRecommendationReport(data.experimentId) });

      // Management
      case 'get':
        return NextResponse.json({ experiment: experimentService.getExperiment(data.experimentId) });
      case 'list':
        return NextResponse.json({ experiments: experimentService.listExperiments() });
      case 'cancel':
        return NextResponse.json({ experiment: experimentService.cancelExperiment(data.experimentId) });

      // Data
      case 'all-data':
        return NextResponse.json({ data: experimentService.getAllData() });
      case 'clear':
        experimentService.clearData();
        return NextResponse.json({ success: true });

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'experiment', error: msg }, 'Experiment operation failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
