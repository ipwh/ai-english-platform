// ============================================
// 教師端 — IELTS 出題與審核台 (2026-10-03 V)
// ============================================
// Two jobs:
//   1. Trigger AI practice generation (DeepSeek, guarded pipeline) — output is
//      always stored at QA_REQUIRED inside a DRAFT test.
//   2. Human QA: approve each question (HUMAN_APPROVED → PUBLISHED) and then
//      publish the test. Students only ever see PUBLISHED content.
// ============================================
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/hooks/use-i18n';
import { logger } from '@/shared/logger/logger';
import { GraduationCap, Loader2, Sparkles, CheckCircle2, Upload, RefreshCw } from 'lucide-react';

type GenSkill = 'READING' | 'LISTENING' | 'WRITING';
type TestType = 'ACADEMIC' | 'GENERAL_TRAINING';

interface AdminTestSummary {
  id: string;
  slug: string;
  title: string;
  testType: string;
  skill: string;
  status: string;
  /** 'CATALOGUE' | 'INSTANT' — instant sets are student on-demand self-study. */
  origin: string;
  questionCount: number;
  statusCounts: Record<string, number>;
}

interface AdminQuestionItem {
  id: string;
  testId: string;
  questionType: string;
  skill: string;
  prompt: string;
  validationStatus: string;
  correctAnswer: unknown;
  explanation: string | null;
}

interface GenerationMeta {
  testId: string;
  deliveredCount: number;
  requestedCount: number;
  shortfall: number;
  drops: Array<{ reason: string; count: number }>;
}

export default function TeacherIeltsPage() {
  const { t } = useT();
  const [tests, setTests] = useState<AdminTestSummary[]>([]);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<AdminQuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Generation form
  const [skill, setSkill] = useState<GenSkill>('READING');
  const [testType, setTestType] = useState<TestType>('ACADEMIC');
  const [scope, setScope] = useState<'set' | 'full_component'>('set');
  const [count, setCount] = useState(5);
  const [writingTaskType, setWritingTaskType] = useState('academic_task2');
  const [topicHint, setTopicHint] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genMeta, setGenMeta] = useState<GenerationMeta | null>(null);

  const loadTests = useCallback(async () => {
    try {
      const res = await fetch('/api/ielts/admin/tests');
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { tests?: AdminTestSummary[] };
      setTests(data.tests ?? []);
    } catch (err) {
      logger.error({ module: 'teacher-ielts', error: err instanceof Error ? err.message : String(err) }, 'Failed to load IELTS tests');
      setError(t('ielts.admin.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadTests();
  }, [loadTests]);

  const loadQuestions = useCallback(
    async (testId: string) => {
      setSelectedTestId(testId);
      setQuestionsLoading(true);
      try {
        const res = await fetch(`/api/ielts/admin/questions?testId=${encodeURIComponent(testId)}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { questions?: AdminQuestionItem[] };
        setQuestions(data.questions ?? []);
      } catch (err) {
        logger.error({ module: 'teacher-ielts', error: err instanceof Error ? err.message : String(err) }, 'Failed to load IELTS questions');
        setError(t('ielts.admin.loadFailed'));
      } finally {
        setQuestionsLoading(false);
      }
    },
    [t],
  );

  async function generate() {
    setGenerating(true);
    setError('');
    setGenMeta(null);
    setNotice('');
    try {
      const body: Record<string, unknown> = { skill, testType };
      if (skill === 'WRITING') {
        body.writingTaskType = writingTaskType;
      } else {
        body.scope = scope;
        if (scope === 'set') body.count = count;
      }
      if (topicHint.trim()) body.topicHint = topicHint.trim();
      const res = await fetch('/api/ielts/admin/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        generation?: GenerationMeta;
        error?: string;
        message?: string;
        issues?: string[];
      };
      if (!res.ok) {
        setError(`${data.error ?? 'ERROR'}: ${data.message ?? ''} ${(data.issues ?? []).join(' / ')}`.trim());
        return;
      }
      if (data.generation) {
        setGenMeta(data.generation);
        setNotice(t('ielts.admin.generated'));
      }
      await loadTests();
    } catch (err) {
      logger.error({ module: 'teacher-ielts', error: err instanceof Error ? err.message : String(err) }, 'IELTS generation failed');
      setError(t('ielts.admin.generateFailed'));
    } finally {
      setGenerating(false);
    }
  }

  async function transitionQuestion(questionId: string, to: 'HUMAN_APPROVED' | 'PUBLISHED') {
    setError('');
    try {
      const res = await fetch(`/api/ielts/admin/questions/${questionId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? String(res.status));
        return;
      }
      if (selectedTestId) await loadQuestions(selectedTestId);
      await loadTests();
    } catch (err) {
      logger.error({ module: 'teacher-ielts', error: err instanceof Error ? err.message : String(err) }, 'Question transition failed');
      setError(t('ielts.admin.actionFailed'));
    }
  }

  async function publishTest(testId: string) {
    setError('');
    try {
      const res = await fetch(`/api/ielts/admin/tests/${testId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: 'PUBLISHED' }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? String(res.status));
        return;
      }
      setNotice(t('ielts.admin.testPublished'));
      await loadTests();
    } catch (err) {
      logger.error({ module: 'teacher-ielts', error: err instanceof Error ? err.message : String(err) }, 'Test transition failed');
      setError(t('ielts.admin.actionFailed'));
    }
  }

  const statusBadge = (status: string) => {
    const tone =
      status === 'PUBLISHED'
        ? 'bg-emerald-100 text-emerald-800'
        : status === 'QA_REQUIRED'
          ? 'bg-amber-100 text-amber-800'
          : status === 'HUMAN_APPROVED'
            ? 'bg-indigo-100 text-indigo-800'
            : 'bg-slate-100 text-slate-600';
    return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{status}</span>;
  };

  const selectedTest = tests.find((x) => x.id === selectedTestId) ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <GraduationCap className="h-6 w-6 text-indigo-600" />
          {t('ielts.admin.title')}
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {t('ielts.betaBadge')}
          </span>
        </h1>
        <p className="mt-1 text-sm text-slate-600">{t('ielts.admin.note')}</p>
      </header>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

      {/* 一、AI 生成 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Sparkles className="h-4 w-4 text-indigo-600" />
          {t('ielts.admin.generateTitle')}
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-slate-600">
            {t('ielts.admin.skill')}
            <select
              value={skill}
              onChange={(e) => setSkill(e.target.value as GenSkill)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="READING">{t('ielts.skill.reading')}</option>
              <option value="LISTENING">{t('ielts.skill.listening')}</option>
              <option value="WRITING">{t('ielts.skill.writing')}</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            {t('ielts.admin.variant')}
            <select
              value={testType}
              onChange={(e) => setTestType(e.target.value as TestType)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="ACADEMIC">{t('ielts.testType.academic')}</option>
              <option value="GENERAL_TRAINING">{t('ielts.testType.general')}</option>
            </select>
          </label>
          {skill === 'WRITING' ? (
            <label className="text-xs font-semibold text-slate-600">
              {t('ielts.writing.taskType')}
              <select
                value={writingTaskType}
                onChange={(e) => setWritingTaskType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="academic_task1">{t('ielts.writing.task1Academic')}</option>
                <option value="academic_task2">{t('ielts.writing.task2Academic')}</option>
                <option value="general_task1">{t('ielts.writing.task1General')}</option>
                <option value="general_task2">{t('ielts.writing.task2General')}</option>
              </select>
            </label>
          ) : (
            <>
              <label className="text-xs font-semibold text-slate-600">
                {t('ielts.admin.scope')}
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as 'set' | 'full_component')}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="set">{t('ielts.admin.scopeSet')}</option>
                  <option value="full_component">{t('ielts.admin.scopeFull')}</option>
                </select>
              </label>
              {scope === 'set' && (
                <label className="text-xs font-semibold text-slate-600">
                  {t('ielts.admin.count')}
                  <input
                    type="number"
                    min={3}
                    max={skill === 'READING' ? 14 : 10}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
              )}
            </>
          )}
          <label className="text-xs font-semibold text-slate-600">
            {t('ielts.admin.topic')}
            <input
              type="text"
              value={topicHint}
              onChange={(e) => setTopicHint(e.target.value)}
              placeholder={t('ielts.admin.topicPlaceholder')}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? t('ielts.admin.generating') : t('ielts.admin.generate')}
          </button>
        </div>
        {genMeta && (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
            <p>
              {t('ielts.admin.generateResult', {
                delivered: genMeta.deliveredCount,
                requested: genMeta.requestedCount,
                shortfall: genMeta.shortfall,
              })}
            </p>
            {genMeta.drops.length > 0 && (
              <p className="mt-1 text-slate-500">
                {t('ielts.admin.drops')}: {genMeta.drops.map((d) => `${d.reason}×${d.count}`).join(', ')}
              </p>
            )}
          </div>
        )}
      </section>

      {/* 二、試卷與審核 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">{t('ielts.admin.testsTitle')}</h2>
          <button
            type="button"
            onClick={() => void loadTests()}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('ielts.admin.refresh')}
          </button>
        </div>

        {loading ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> …
          </p>
        ) : tests.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t('ielts.admin.noTests')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {tests.map((test) => {
              const allPublished =
                test.questionCount > 0 && test.statusCounts.PUBLISHED === test.questionCount;
              return (
                <li key={test.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {test.title}
                      {test.origin === 'INSTANT' && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-[10px] font-semibold text-amber-800">
                          {t('ielts.admin.instantBadge')}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {test.testType === 'ACADEMIC' ? t('ielts.testType.academic') : t('ielts.testType.general')} ·{' '}
                      {t(`ielts.skill.${test.skill.toLowerCase()}`)} · {t('ielts.admin.questions', { count: test.questionCount })} ·{' '}
                      {t('ielts.admin.qaCount', { count: test.statusCounts.QA_REQUIRED ?? 0 })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(test.status)}
                    <button
                      type="button"
                      onClick={() => void loadQuestions(test.id)}
                      className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                    >
                      {t('ielts.admin.loadQuestions')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void publishTest(test.id)}
                      disabled={test.status === 'PUBLISHED' || !allPublished}
                      title={!allPublished ? t('ielts.admin.publishBlocked') : undefined}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {t('ielts.admin.publishTest')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {selectedTestId && (
          <div className="mt-4 rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-700">
              {t('ielts.admin.reviewTitle')}
              {selectedTest ? ` — ${selectedTest.title}` : ''}
            </p>
            {questionsLoading ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> …
              </p>
            ) : questions.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">{t('ielts.admin.noQuestions')}</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {questions.map((q) => (
                  <li key={q.id} className="rounded-lg border border-slate-100 p-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs text-slate-800">{q.prompt}</p>
                      <div className="flex shrink-0 items-center gap-2">
                        {statusBadge(q.validationStatus)}
                        {q.validationStatus === 'QA_REQUIRED' && (
                          <button
                            type="button"
                            onClick={() => void transitionQuestion(q.id, 'HUMAN_APPROVED')}
                            className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700"
                          >
                            {t('ielts.admin.approve')}
                          </button>
                        )}
                        {q.validationStatus === 'HUMAN_APPROVED' && (
                          <button
                            type="button"
                            onClick={() => void transitionQuestion(q.id, 'PUBLISHED')}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            {t('ielts.admin.publish')}
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {t('ielts.admin.answer')}:{' '}
                      <span className="font-semibold">
                        {Array.isArray(q.correctAnswer)
                          ? q.correctAnswer.join(' / ')
                          : String(q.correctAnswer ?? '—')}
                      </span>
                      {q.explanation ? ` · ${q.explanation}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <p className="text-xs text-slate-500">
        <Link href="/teacher/dashboard" className="text-indigo-600 hover:underline">
          ← {t('teacher.dashboard')}
        </Link>
      </p>
    </div>
  );
}
