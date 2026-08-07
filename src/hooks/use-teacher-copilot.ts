// ============================================
// useTeacherCopilot() — AI Copilot data hook
//
// Extracted from TeacherCopilotPage for:
// - Network request isolation
// - Per-action loading states (loadingMap)
// - Per-action AbortController isolation
// - Per-action error states (errorMap)
// - Single generic callCopilotApi<T>() helper
// ============================================
'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type {
  CopilotOverview, WeeklyTeachingPlan, ClassAnalysis, ExamPrediction,
  StudentAnalysisData, LoadingMap, ErrorMap,
} from './teacher-copilot.types';

// Re-export types for consumers
export type {
  ClassInfo, UrgentAction, WeeklySummary, CopilotOverview,
  DailyActivity, DailyPlan, WeeklyTeachingPlan,
  SkillBreakdown, RiskStudent, ClassAnalysis,
  StudentPrediction, ExamPrediction, StudentAnalysisData,
  LoadingMap, ErrorMap,
} from './teacher-copilot.types';

// ── Helpers ──

/** Check whether a response Content-Type indicates JSON */
function isJsonContentType(res: Response): boolean {
  const ct = res.headers.get('content-type');
  if (!ct) return true; // no header → assume JSON (many APIs omit it)
  return ct.includes('application/json');
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

  if (!isJsonContentType(res)) {
    const ct = res.headers.get('content-type') || 'unknown';
    throw new Error(
      res.ok
        ? `Unexpected response type: ${ct}`
        : `HTTP ${res.status} (${ct})`,
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error(
      res.ok
        ? 'Invalid server response'
        : `HTTP ${res.status}`,
    );
  }

  if (!res.ok) {
    const message =
      typeof json === 'object' && json !== null
        ? ((json as Record<string, unknown>).error ??
           (json as Record<string, unknown>).message ??
           `HTTP ${res.status}`)
        : `HTTP ${res.status}`;
    throw new Error(String(message));
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
  const [errorMap, setErrorMap] = useState<ErrorMap>({});

  const [overview, setOverview] = useState<CopilotOverview | null>(null);
  const [lessonPlan, setLessonPlan] = useState<WeeklyTeachingPlan | null>(null);
  const [classAnalysis, setClassAnalysis] = useState<ClassAnalysis | null>(null);
  const [examPrediction, setExamPrediction] = useState<ExamPrediction | null>(null);
  const [studentAnalysis, setStudentAnalysis] = useState<StudentAnalysisData | null>(null);
  const [generatedContent, setGeneratedContent] = useState('');

  // Per-action AbortControllers — each loading key owns its own controller.
  // Starting lessonPlan only cancels lessonPlan; overview keeps running.
  const abortRefs = useRef<Map<keyof LoadingMap, AbortController>>(new Map());

  // Track which action most recently set an error, for deterministic display.
  // Ref (not state) because it's consumed synchronously inside the error useMemo.
  const lastErrorKeyRef = useRef<keyof LoadingMap | null>(null);

  /** Cancel a specific action's in-flight request, or all if no key given */
  const cancelPending = useCallback((key?: keyof LoadingMap) => {
    if (key) {
      const ctrl = abortRefs.current.get(key);
      if (ctrl) {
        ctrl.abort();
        abortRefs.current.delete(key);
      }
    } else {
      for (const ctrl of abortRefs.current.values()) {
        ctrl.abort();
      }
      abortRefs.current.clear();
    }
  }, []);

  // Abort all in-flight requests on unmount
  useEffect(() => {
    return () => cancelPending();
  }, [cancelPending]);

  // ── Derived: unified error for backward-compatible display ──

  /** The most recently set error, or the first active error. Deterministic. */
  const error = useMemo(() => {
    // Prefer the last-set error if it's still active
    const lastKey = lastErrorKeyRef.current;
    if (lastKey && errorMap[lastKey]) return errorMap[lastKey];
    // Fallback: any active error
    for (const key of Object.keys(errorMap) as (keyof LoadingMap)[]) {
      if (errorMap[key]) return errorMap[key]!;
    }
    return '';
  }, [errorMap]);

  /**
   * Clear error for all actions.
   * Backward-compatible: page calls setError('') on tab switch.
   */
  const setError = useCallback((message: string) => {
    if (message === '') {
      lastErrorKeyRef.current = null;
      setErrorMap({});
    } else {
      // Set all keys — preserves old "global error" behavior
      setErrorMap({
        overview: message,
        lessonPlan: message,
        classAnalysis: message,
        examPrediction: message,
        generate: message,
        studentAnalysis: message,
      });
    }
  }, []);

  // ── Internal: per-action error helpers ──

  const clearErrorFor = useCallback((key: keyof LoadingMap) => {
    setErrorMap(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (lastErrorKeyRef.current === key) {
      lastErrorKeyRef.current = null;
    }
  }, []);

  const setErrorFor = useCallback((key: keyof LoadingMap, message: string) => {
    lastErrorKeyRef.current = key;
    setErrorMap(prev => ({ ...prev, [key]: message }));
  }, []);

  // ── Generic runner ──

  /** Generic runner: sets loadingMap key, handles abort, error, and response */
  const runAction = useCallback(
    async <T>(
      key: keyof LoadingMap,
      fetchFn: (signal: AbortSignal) => Promise<T>,
      setter: (data: T) => void,
    ) => {
      // Cancel only this key's previous request — others keep running
      cancelPending(key);
      const controller = new AbortController();
      abortRefs.current.set(key, controller);
      clearErrorFor(key);
      setLoadingMap(prev => ({ ...prev, [key]: true }));
      try {
        const data = await fetchFn(controller.signal);
        // P1: Prevent late-response state overwrite.
        // If a newer request started while this one was in-flight,
        // abortRefs has a different controller for this key → discard.
        if (abortRefs.current.get(key) !== controller) return;
        setter(data);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setErrorFor(key, err instanceof Error ? err.message : 'Network error');
      } finally {
        const isCurrent = abortRefs.current.get(key) === controller;
        if (isCurrent) {
          abortRefs.current.delete(key);
          setLoadingMap(prev => ({ ...prev, [key]: false }));
        }
      }
    },
    [cancelPending, clearErrorFor, setErrorFor],
  );

  const fetchOverview = useCallback(() => {
    runAction(
      'overview',
      signal =>
        callCopilotApi<{ overview: CopilotOverview }>('/api/teacher/copilot/overview', { signal })
          .then(json => json.overview),
      setOverview,
    );
  }, [runAction]);

  const fetchLessonPlan = useCallback(
    (classId: string, className: string) => {
      runAction(
        'lessonPlan',
        signal =>
          callCopilotApi<{ plan: WeeklyTeachingPlan }>(
            `/api/teacher/copilot/lesson-plan?classId=${classId}&className=${encodeURIComponent(className)}`,
            { signal },
          ).then(json => json.plan),
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
          callCopilotApi<{ analysis: ClassAnalysis }>(
            `/api/teacher/copilot/class-analysis?classId=${classId}&className=${encodeURIComponent(className)}`,
            { signal },
          ).then(json => json.analysis),
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
          callCopilotApi<{ prediction: ExamPrediction }>(`/api/teacher/copilot/exam-prediction?classId=${classId}`, { signal })
            .then(json => json.prediction),
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
          callCopilotApi<{ analysis: StudentAnalysisData }>(
            `/api/teacher/copilot/student-analysis?studentId=${studentId}&classId=${classId}`,
            { signal },
          ).then(json => json.analysis),
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
          callCopilotApi<{
            content?: string; result?: string;
            assignments?: Array<{ titleZh: string; questionCount: number; estimatedMinutes: number; reasonZh: string }>;
          }>('/api/teacher/copilot/generate', {
            method: 'POST',
            signal,
            body: { type, classId: classId || undefined, gradeLevel: 'S4' },
          }).then(json => {
            // Format assignments as readable list if present
            if (json.assignments && json.assignments.length > 0) {
              return json.assignments
                .map(a => `📝 ${a.titleZh}（${a.questionCount}題，約${a.estimatedMinutes}分鐘）\n   ${a.reasonZh}`)
                .join('\n\n');
            }
            return json.content || json.result || JSON.stringify(json, null, 2);
          }),
        setGeneratedContent,
      );
    },
    [runAction],
  );

  return {
    loadingMap,
    errorMap,
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
