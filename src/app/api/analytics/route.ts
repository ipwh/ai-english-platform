// Sprint 23: Learning Analytics API
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import {
  buildProgressTimeline, buildLearningStatistics,
  buildMasteryTrend, buildWeaknessTrend,
  buildVocabularyGrowth, buildWritingGrowth,
  buildReadingGrowth, buildPrediction,
  generateHeatmap, generateRadarChart,
  generateTrendLines, generateLearningVelocity,
} from '@/modules/analytics/services/learning-analytics';
import type { TimeGranularity } from '@/modules/analytics/types';
import type { AnalyticsInput } from '@/modules/analytics/services/learning-analytics';

export async function GET(request: NextRequest) {
  const auth = await verifyApiAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'statistics';
  const granularity = (searchParams.get('granularity') || 'monthly') as TimeGranularity;
  const targetDays = parseInt(searchParams.get('targetDays') || '30');

  try {
    // For now, return empty analytics (to be wired to real data in API integration)
    const input: AnalyticsInput = {
      studentId: auth.userId || 'unknown',
      gradeLevel: 'S4',
      practiceHistory: [],
      mistakeHistory: [],
      vocabularyHistory: [],
      writingHistory: [],
      readingHistory: [],
      sessionHistory: [],
      masterySnapshots: [],
    };

    let result: unknown;

    switch (type) {
      case 'timeline':
        result = buildProgressTimeline(input, granularity);
        break;
      case 'statistics':
        result = buildLearningStatistics(input, granularity);
        break;
      case 'mastery':
        result = buildMasteryTrend(input, granularity);
        break;
      case 'weakness':
        result = buildWeaknessTrend(input, granularity);
        break;
      case 'vocabulary':
        result = buildVocabularyGrowth(input, granularity);
        break;
      case 'writing':
        result = buildWritingGrowth(input, granularity);
        break;
      case 'reading':
        result = buildReadingGrowth(input, granularity);
        break;
      case 'prediction':
        result = buildPrediction(input, targetDays);
        break;
      case 'heatmap':
        result = generateHeatmap(input);
        break;
      case 'radar':
        result = generateRadarChart(input);
        break;
      case 'trend':
        result = generateTrendLines(input, granularity);
        break;
      case 'velocity':
        result = generateLearningVelocity(input);
        break;
      default:
        return NextResponse.json({ error: `Unknown analytics type: ${type}` }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Analytics generation failed: ${msg}` }, { status: 500 });
  }
}
