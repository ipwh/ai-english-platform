// Sprint 4: Assessment Service — submission grading, chinglish detection, plagiarism
import { findAssignmentById, listAssignments, getStudentSubmission, createSubmission } from '@/modules/assessment/repositories/assessment-repo';
import { detectChinglish } from '@/modules/assessment/services/chinglish';
import { detectOverCopying } from '@/modules/assessment/services/plagiarism';
import { logger } from '@/shared/logger/logger';

export interface SubmissionGradingInput {
  studentId: string; assignmentId: string; studentDraft: string;
  prompt?: string; title?: string;
}

export interface GradingResult {
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  chinglishInstances: Array<{ pattern: string; found: string; suggestion: string }>;
  overCopyRatio: number;
}

export async function gradeSubmission(input: SubmissionGradingInput): Promise<GradingResult> {
  logger.info({ module: 'assessment-service', studentId: input.studentId, assignmentId: input.assignmentId }, 'Grading submission');

  const [chinglishResults, plagiarismResult] = await Promise.all([
    detectChinglish(input.studentDraft),
    detectOverCopying(input.prompt || '', input.studentDraft),
  ]);

  return {
    overallScore: 0, // Populated by AI analysis separately
    strengths: [],
    weaknesses: [],
    chinglishInstances: chinglishResults || [],
    overCopyRatio: plagiarismResult?.copyRatio ?? 0,
  };
}

export async function getAssignmentById(id: string) { return findAssignmentById(id); }
export async function getAssignments(filters?: Record<string, unknown>) { return listAssignments(filters); }
