// Sprint 24: Teacher Analytics API
import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import {
  analyzeClass, detectWeakSkills, rankWriting, rankReading,
  compareStudent, predictRisks, generateSuggestions,
  detectLearningGaps, generateAIReport,
} from '@/modules/teacher/analytics/services/teacher-analytics';
import type { TeacherDashboardInput } from '@/modules/teacher/analytics/types';

export async function GET(request: NextRequest) {
  const auth = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'overview';
  const classId = searchParams.get('classId') || 'default';
  const studentId = searchParams.get('studentId') || '';

  try {
    // Build input from query params (real data wired in API integration)
    const input: TeacherDashboardInput = {
      classId, className: `Class ${classId}`, academicYear: '2025-2026',
      students: [],
    };

    let result: unknown;
    switch (type) {
      case 'overview': result = analyzeClass(input); break;
      case 'weak-skills': result = detectWeakSkills(input); break;
      case 'writing-ranking': result = rankWriting(input); break;
      case 'reading-ranking': result = rankReading(input); break;
      case 'compare': result = compareStudent(input, studentId); break;
      case 'risks': result = predictRisks(input); break;
      case 'suggestions': result = generateSuggestions(input, studentId); break;
      case 'gaps': result = detectLearningGaps(input); break;
      case 'report': result = generateAIReport(input); break;
      default: return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Analytics failed: ${msg}` }, { status: 500 });
  }
}
