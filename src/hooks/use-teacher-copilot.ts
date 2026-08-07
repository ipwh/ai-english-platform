// ============================================
// useTeacherCopilot() — AI Copilot data hook
//
// Extracted from TeacherCopilotPage for:
// - Network request isolation
// - Per-action loading states (loadingMap)
// - AbortController for race-condition prevention
// - Single generic callCopilotApi<T>() helper
// ============================================
'use client';

import { useState, useRef, useCallback } from 'react';

// ── Types ──

export interface ClassInfo {
  id: string; name: string; gradeLevel: string; studentCount: number;
  averageMastery: number; riskCount: number;
}
export interface UrgentAction { type: string; message: string; priority: 'high' | 'medium'; }
export interface WeeklySummary { totalStudents: number; assignmentsDue: number; newRisksDetected: number; }
export interface CopilotOverview { classes: ClassInfo[]; urgentActions: UrgentAction[]; weeklySummary: WeeklySummary; }

export interface DailyActivity { title: string; description: string; duration: string; }
export interface DailyPlan { day: string; date: string; activities: DailyActivity[]; homework: string[]; }
export interface WeeklyTeachingPlan {
  classId: string; focusSkills: string[];
  dailyPlans: DailyPlan[]; grammarFocus: string; vocabularyFocus: string; writingFocus: string;
}

export interface SkillBreakdown { skill: string; skillZh: string; classAverage: number; targetLevel: number; trend: 'up' | 'down' | 'stable'; }
export interface RiskStudent { studentId: string; studentName: string; riskLevel: 'high' | 'medium'; reasons: string[]; }
export interface ClassAnalysis {
  overallMetrics: { averageMastery: number; classHkdseLevel: string };
  skillBreakdown: SkillBreakdown[]; studentRankings: { studentId: string; name: string; score: number }[];
  riskStudents: RiskStudent[]; recommendations: string[];
}

export interface StudentPrediction { studentId: string; studentName: string; predictedLevel: string; confidenceBand: string; }
export interface ExamPrediction {
  predictedPassRate: number;
  studentPredictions: StudentPrediction[];
  paperAnalysis: { paper: string; paperZh: string; averagePredicted: string }[];
}

export interface StudentAnalysisData {
  personaType: string; skillDetails: { skill: string; score: number; classAverage: number; percentile: number; trend: string }[];
  recentProgress: string; teacherNotes: string;
}

export interface LoadingMap {
  overview: boolean;
  lessonPlan: boolean;
  classAnalysis: boolean;
  examPrediction: boolean;
  generate: boolean;
  studentAnalysis: boolean;
}

// ── Generic API helper ──

/**
 * Generic fetch wrapper with AbortController support.
 * All copilot API calls share this function to eliminate duplicated fetch logic.
 */
async function callCopilotApi<T>(
  url: string,
  options?: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal },
): Promise<T> {
  const { method = 'GET', body, signal } = options ?? {};
  const fetchOptions: RequestInit = { method, signal };
  if (body !== undefined) {
    fetchOptions.headers = { 'Content-Type': 'application/json' };
    fetchOptions.body = JSON.stringify(body);
  }
  const res = await fetch(url, fetchOptions);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to load');
  }
  return json as T;
}

// ── Hook ──

export function useTeacherCopilot() {
  const [loadingMap, setLoadingMap] = useState<LoadingMap>({
    overview: false,
    lessonPlan: false,
    classAnalysis: false,
    examPrediction: false,
    generate: false,
    studentAnalysis: false,
  });
  const [error, setError] = useState('');

  const [overview, setOverview] = useState<CopilotOverview | null>(null);
  const [lessonPlan, setLessonPlan] = useState<WeeklyTeachingPlan | null>(null);
  const [classAnalysis, setClassAnalysis] = useState<ClassAnalysis | null>(null);
  const [examPrediction, setExamPrediction] = useState<ExamPrediction | null>(null);
  const [studentAnalysis, setStudentAnalysis] = useState<StudentAnalysisData | null>(null);
  const [generatedContent, setGeneratedContent] = useState('');

  // AbortController ref — cancelled on new request or unmount
  const abortRef = useRef<AbortController | null>(null);

  /** Cancel any in-flight request */
  const cancelPending = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  /** Generic runner: sets loadingMap key, handles abort, error, and response */
  const runAction = useCallback(
    async <T>(
      key: keyof LoadingMap,
      fetchFn: (signal: AbortSignal) => Promise<T>,
      setter: (data: T) => void,
    ) => {
      cancelPending();
      const controller = new AbortController();
      abortRef.current = controller;
      setError('');
      setLoadingMap(prev => ({ ...prev, [key]: true }));
      try {
        const data = await fetchFn(controller.signal);
        if (!controller.signal.aborted) {
          setter(data);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Network error');
      } finally {
        if (!controller.signal.aborted) {
          setLoadingMap(prev => ({ ...prev, [key]: false }));
        }
      }
    },
    [cancelPending],
  );

  const fetchOverview = useCallback(() => {
    runAction('overview', signal => callCopilotApi<CopilotOverview>('/api/teacher/copilot/overview', { signal }), setOverview);
  }, [runAction]);

  const fetchLessonPlan = useCallback(
    (classId: string, className: string) => {
      runAction(
        'lessonPlan',
        signal =>
          callCopilotApi<WeeklyTeachingPlan>(
            `/api/teacher/copilot/lesson-plan?classId=${classId}&className=${encodeURIComponent(className)}`,
            { signal },
          ),
        setLessonPlan,
      );
    },
    [runAction],
  );

  const fetchClassAnalysis = useCallback(
    (classId: string, className: string) => {
      runAction(
        'classAnalysis',
        signal =>
          callCopilotApi<ClassAnalysis>(
            `/api/teacher/copilot/class-analysis?classId=${classId}&className=${encodeURIComponent(className)}`,
            { signal },
          ),
        setClassAnalysis,
      );
    },
    [runAction],
  );

  const fetchExamPrediction = useCallback(
    (classId: string) => {
      runAction(
        'examPrediction',
        signal =>
          callCopilotApi<ExamPrediction>(`/api/teacher/copilot/exam-prediction?classId=${classId}`, { signal }),
        setExamPrediction,
      );
    },
    [runAction],
  );

  const fetchStudentAnalysis = useCallback(
    (studentId: string, classId: string) => {
      runAction(
        'studentAnalysis',
        signal =>
          callCopilotApi<StudentAnalysisData>(
            `/api/teacher/copilot/student-analysis?studentId=${studentId}&classId=${classId}`,
            { signal },
          ),
        setStudentAnalysis,
      );
    },
    [runAction],
  );

  const generateMaterial = useCallback(
    (type: string, classId?: string) => {
      runAction(
        'generate',
        signal =>
          callCopilotApi<{ content?: string; result?: string }>('/api/teacher/copilot/generate', {
            method: 'POST',
            signal,
            body: { type, classId: classId || undefined, gradeLevel: 'S4' },
          }).then(json => json.content || json.result || JSON.stringify(json, null, 2)),
        setGeneratedContent,
      );
    },
    [runAction],
  );

  return {
    loadingMap,
    error,
    setError,
    overview,
    lessonPlan,
    classAnalysis,
    examPrediction,
    studentAnalysis,
    generatedContent,
    fetchOverview,
    fetchLessonPlan,
    fetchClassAnalysis,
    fetchExamPrediction,
    fetchStudentAnalysis,
    generateMaterial,
    cancelPending,
  };
}
