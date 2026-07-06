// ============================================
// AI 功能 React Hooks
// 提供前端呼叫 DeepSeek AI API 的簡便方法
// ============================================

'use client';

import { useState, useCallback } from 'react';

// ============================================
// 通用 Hook Helper
// ============================================

interface UseAIReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  execute: (body: unknown) => Promise<T | null>;
  reset: () => void;
}

function useAIApi<T>(endpoint: string): UseAIReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (body: unknown): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `請求失敗 (${res.status})`);
        return null;
      }
      // 根據端點提取不同 key
      const key = endpoint.replace(/-./g, x => x[1].toUpperCase());
      const result = json[key] || json.analysis || json.explanation || json.questions || json;
      setData(result);
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '網絡錯誤';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, loading, error, execute, reset };
}

// ============================================
// 一、生成練習題目 Hook
// ============================================

export interface GenerateQuestionsParams {
  grammarItem?: string;
  grammarItemZh?: string;
  languageSkill?: string;
  languageSkillZh?: string;
  difficulty: 'remedial' | 'core' | 'challenge';
  gradeLevel: string;
  count?: number;
  questionType?: string;
  topic?: string;
}

export function useGenerateQuestions() {
  return useAIApi<{ questions: unknown[] }>('generate-questions');
}

// ============================================
// 二、分析答案 Hook
// ============================================

export interface AnalyzeAnswerParams {
  question: string;
  questionType: string;
  correctAnswer: string;
  studentAnswer: string;
  grammarItem?: string;
  grammarItemZh?: string;
  studentLevel?: string;
}

export function useAnalyzeAnswer() {
  return useAIApi<{
    isCorrect: boolean;
    score: number;
    feedbackZh: string;
    feedbackEn: string;
    mistakeType: string;
    explanation: string;
    improvementTip: string;
    relatedGrammarPoint?: string;
  }>('analyze-answer');
}

// ============================================
// 三、寫作批改 Hook
// ============================================

export interface AnalyzeWritingParams {
  title: string;
  prompt: string;
  studentDraft: string;
  studentLevel?: string;
  textType?: string;
}

export function useAnalyzeWriting() {
  return useAIApi<{
    overallScore: number;
    strengths: string[];
    weaknesses: string[];
    grammarErrors: { original: string; correction: string; explanation: string }[];
    chinglishWarnings: { original: string; suggestion: string; explanation: string }[];
    vocabularySuggestions: { original: string; suggestion: string; reason: string }[];
    structureFeedback: string;
    revisedVersion?: string;
    generalComment: string;
  }>('analyze-writing');
}

// ============================================
// 四、錯題解說 Hook
// ============================================

export interface ExplainMistakeParams {
  question: string;
  correctAnswer: string;
  studentAnswer: string;
  grammarItemZh?: string;
  studentLevel?: string;
}

export function useExplainMistake() {
  return useAIApi<{
    reasonZh: string;
    reasonEn: string;
    ruleExplanation: string;
    examples: { wrong: string; correct: string }[];
    memoryTip: string;
    relatedTopics: string[];
  }>('explain-mistake');
}

// ============================================
// 五、進度分析 Hook
// ============================================

export interface AnalyzeProgressParams {
  studentLevel: string;
  overallAccuracy: number;
  weakSkills: { name: string; nameZh: string; accuracy: number }[];
  recentPerformance: { date: string; accuracy: number; questionsDone: number }[];
  streakDays: number;
}

export function useAnalyzeProgress() {
  return useAIApi<{
    summary: string;
    strengthsAreas: string[];
    urgentAreas: string[];
    recommendedFocus: { skill: string; reason: string; priority: string }[];
    studyPlan: string;
    encouragementMessage: string;
    estimatedTimeToImprove: string;
  }>('analyze-progress');
}

// ============================================
// 六、教材分析 Hook
// ============================================

export interface AnalyzeMaterialParams {
  title: string;
  content: string;
  gradeLevel?: string;
}

export function useAnalyzeMaterial() {
  return useAIApi<{
    summary: string;
    keyVocabulary: { word: string; meaningZh: string; exampleSentence: string }[];
    keyGrammarPoints: { point: string; explanationZh: string }[];
    suggestedQuestions: { type: string; prompt: string; answer: string }[];
    difficultyLevel: string;
    suggestedGrade: string;
  }>('analyze-material');
}

// ============================================
// 七、AI 狀態檢查
// ============================================

export function useAICheck() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/ai/status');
      const json = await res.json();
      setConfigured(json.configured);
      return json.configured;
    } catch {
      setConfigured(false);
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  return { configured, checking, check };
}
