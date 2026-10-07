// ============================================
// 學生端 — IELTS 寫作 AI 輔助練習
// ============================================
// AI_ESTIMATE only：四項官方準則、逐項依據、練習估算分；永不宣稱考官等價。
// 2026-10-07：支援由 IELTS 主頁卷別卡帶入的 `?mode=&task=`（先選組別 → 再挑卷別
// 的流程延續），學生仍可自行更改。
// ============================================
'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useT } from '@/hooks/use-i18n';
import { countIeltsWords } from '@/modules/ielts/domain/word-count';
import { Loader2, Info, AlertTriangle, PencilLine, Sparkles } from 'lucide-react';

type TaskType = 'academic_task1' | 'academic_task2' | 'general_task1' | 'general_task2';

const TASKS_BY_MODE: Record<'ACADEMIC' | 'GENERAL_TRAINING', TaskType[]> = {
  ACADEMIC: ['academic_task2', 'academic_task1'],
  GENERAL_TRAINING: ['general_task2', 'general_task1'],
};

interface BankPrompt {
  testId: string;
  title: string;
  testType: string;
  taskType: string;
  prompt: string;
}

const TASK_CONFIG: Record<TaskType, { min: number; minutes: number; i18nKey: string }> = {
  academic_task1: { min: 150, minutes: 20, i18nKey: 'ielts.writing.task1Academic' },
  academic_task2: { min: 250, minutes: 40, i18nKey: 'ielts.writing.task2Academic' },
  general_task1: { min: 150, minutes: 20, i18nKey: 'ielts.writing.task1General' },
  general_task2: { min: 250, minutes: 40, i18nKey: 'ielts.writing.task2General' },
};

// Original platform-authored sample prompts (NOT official IELTS questions).
const SAMPLE_PROMPTS: Record<TaskType, string> = {
  academic_task1:
    'The chart below shows the percentage of households with internet access in three countries between 2000 and 2020. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
  academic_task2:
    'Some people believe that city centres should be closed to private cars. To what extent do you agree or disagree with this view?',
  general_task1:
    'You recently stayed in a hotel and were unhappy with the service. Write a letter to the hotel manager. In your letter: explain when you stayed; describe the problems you experienced; say what you would like the manager to do.',
  general_task2:
    'Some people think that children should spend their free time on educational activities. Others believe free play is more valuable. Discuss both views and give your own opinion.',
};

interface CriterionResult {
  band: number;
  evidence: Array<{ quote: string; explanation: string; verified: boolean }>;
  strengths: string[];
  weaknesses: string[];
  rationale: string;
}

interface WritingAssessment {
  taskBand: number;
  criteria: Record<string, CriterionResult>;
  taskCoverage: Array<{ requirementId: string; label: string; status: string; evidence: Array<{ quote: string; verified: boolean }> }>;
  unreportedRequirementIds: string[];
  templateSuspicion: { suspected: boolean; rationale: string };
  uncertainty: string[];
  limitations: string[];
  confidence: string;
  belowMinimum: boolean;
  promptVersion: string;
}

const CRITERION_LABELS: Record<string, string> = {
  taskAchievementOrResponse: 'ielts.assessment.criterion.taskAchievement',
  coherenceAndCohesion: 'ielts.assessment.criterion.coherence',
  lexicalResource: 'ielts.assessment.criterion.lexical',
  grammaticalRangeAndAccuracy: 'ielts.assessment.criterion.grammar',
};

function IeltsWritingPageContent() {
  const { t } = useT();
  const searchParams = useSearchParams();

  // 來自 IELTS 主頁卷別卡的 `?mode=&task=`：直接作為**初始狀態**（不經 effect，
  // 避免多餘 render）；學生其後仍可自由更改。只帶 `?mode=` 亦可（用該組第一個任務）。
  const initialSelection = useMemo(() => {
    // 明確把 `string` 收窄成組別聯集（只排除兩個 literals 仍會是 `string`）。
    const rawMode = searchParams.get('mode');
    const resolvedMode: 'ACADEMIC' | 'GENERAL_TRAINING' | null =
      rawMode === 'ACADEMIC' || rawMode === 'GENERAL_TRAINING' ? rawMode : null;
    if (!resolvedMode) return null;
    const requestedTask = searchParams.get('task');
    const resolvedTask = TASKS_BY_MODE[resolvedMode].find((candidate) => candidate === requestedTask)
      ?? TASKS_BY_MODE[resolvedMode][0];
    return { mode: resolvedMode, task: resolvedTask };
  }, [searchParams]);

  const [mode, setMode] = useState<'ACADEMIC' | 'GENERAL_TRAINING'>(initialSelection?.mode ?? 'ACADEMIC');
  const [taskType, setTaskType] = useState<TaskType>(initialSelection?.task ?? 'academic_task2');
  const [source, setSource] = useState<'sample' | 'bank' | 'custom' | 'generated'>('sample');
  const [prompt, setPrompt] = useState(SAMPLE_PROMPTS[initialSelection?.task ?? 'academic_task2']);
  const [bankPrompts, setBankPrompts] = useState<BankPrompt[]>([]);
  const [bankMode, setBankMode] = useState<string | null>(null);
  const [essay, setEssay] = useState('');
  const [assessing, setAssessing] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [generatedRemaining, setGeneratedRemaining] = useState<number | null>(null);
  const [errorKey, setErrorKey] = useState('');
  const [assessment, setAssessment] = useState<WritingAssessment | null>(null);

  const config = TASK_CONFIG[taskType];
  const wordCount = useMemo(() => countIeltsWords(essay), [essay]);
  const belowMinimum = wordCount > 0 && wordCount < config.min;
  const modeTasks = TASKS_BY_MODE[mode];
  const taskBank = bankPrompts.filter((p) => p.taskType === taskType);

  // Published prompt bank for the selected variant (only PUBLISHED tests served).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ielts/writing/prompts?testType=${mode}`)
      .then(async (res) =>
        res.ok ? ((await res.json()) as { prompts?: BankPrompt[] }) : { prompts: [] },
      )
      .then((data) => {
        if (cancelled) return;
        setBankPrompts(data.prompts ?? []);
        setBankMode(mode);
      })
      .catch(() => {
        if (cancelled) return;
        setBankPrompts([]);
        setBankMode(mode);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  function resetAssessment() {
    setAssessment(null);
    setErrorKey('');
  }

  function selectMode(next: 'ACADEMIC' | 'GENERAL_TRAINING') {
    const firstTask = TASKS_BY_MODE[next][0];
    setMode(next);
    setTaskType(firstTask);
    setPrompt(SAMPLE_PROMPTS[firstTask]);
    setSource('sample');
    resetAssessment();
  }

  function selectTask(next: TaskType) {
    setTaskType(next);
    setPrompt(SAMPLE_PROMPTS[next]);
    setSource('sample');
    resetAssessment();
  }

  function selectBankPrompt(item: BankPrompt) {
    setPrompt(item.prompt);
    setSource('bank');
    resetAssessment();
  }

  /**
   * 2026-10-04: on-demand AI writing task (INSTANT self-study).
   * The task is generated through the same conformance gates as authoring,
   * belongs to this student only, is clearly labelled NOT teacher-reviewed and
   * never enters the bank until a teacher publishes it.
   */
  async function generateTask() {
    setGeneratingPrompt(true);
    setErrorKey('');
    try {
      const res = await fetch('/api/ielts/practice/instant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill: 'WRITING', testType: mode, writingTaskType: taskType }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        instant?: { testId: string; remainingToday: number };
      };
      if (!res.ok || !body.instant) {
        const code = body.error ?? '';
        setErrorKey(
          code === 'INSTANT_DAILY_LIMIT_REACHED'
            ? 'ielts.instant.dailyLimit'
            : code === 'AI_BUDGET_EXHAUSTED'
              ? 'ielts.instant.budget'
              : code === 'AI_PROVIDER_TIMEOUT' || code === 'AI_PROVIDER_ERROR'
                ? 'ielts.instant.provider'
                : code === 'WRITING_PROMPT_NOT_CONFORMING' ||
                    code === 'GENERATION_EMPTY' ||
                    code === 'AI_INVALID_JSON'
                  ? 'ielts.instant.noContent'
                  : 'ielts.instant.failed',
        );
        return;
      }

      // The prompt text comes from the canonical task record (never duplicated
      // in the generation response).
      const detail = await fetch(`/api/ielts/tests/${body.instant.testId}`);
      if (!detail.ok) throw new Error('TASK_LOAD_FAILED');
      const data = (await detail.json()) as {
        test: { sections: Array<{ instructions: string | null }> };
      };
      const promptText =
        data.test.sections.map((s) => (s.instructions ?? '').trim()).find((text) => text.length > 0) ?? '';
      if (!promptText) {
        setErrorKey('ielts.instant.noContent');
        return;
      }
      setPrompt(promptText);
      setSource('generated');
      setGeneratedRemaining(body.instant.remainingToday);
      resetAssessment();
    } catch {
      setErrorKey('ielts.instant.failed');
    } finally {
      setGeneratingPrompt(false);
    }
  }

  async function assess() {
    setAssessing(true);
    setErrorKey('');
    setAssessment(null);
    try {
      const res = await fetch('/api/ielts/writing/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskType, taskPrompt: prompt, essay }),
      });
      const data = (await res.json()) as { assessment?: WritingAssessment; error?: string };
      if (!res.ok) {
        setErrorKey(data.error && t(`ielts.error.${data.error}`) !== `ielts.error.${data.error}` ? `ielts.error.${data.error}` : 'ielts.error.generic');
        return;
      }
      if (data.assessment) setAssessment(data.assessment);
    } catch {
      setErrorKey('ielts.error.generic');
    } finally {
      setAssessing(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <header>
        <Link href="/student/ielts" className="text-xs text-indigo-600 hover:underline">
          ← {t('ielts.title')}
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-slate-900">
          <PencilLine className="h-6 w-6 text-indigo-600" />
          {t('ielts.writing.title')}
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {t('ielts.betaBadge')}
          </span>
        </h1>
      </header>

      <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p>{t('ielts.disclaimer')}</p>
          <p className="mt-1 text-[11px] text-amber-800">{t('ielts.betaNotice')}</p>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm font-semibold text-slate-700">{t('ielts.writing.modeLabel')}</label>
        <div className="mt-2 flex gap-2">
          {(['ACADEMIC', 'GENERAL_TRAINING'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => selectMode(m)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                mode === m ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {m === 'ACADEMIC' ? t('ielts.testType.academic') : t('ielts.testType.general')}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {mode === 'ACADEMIC' ? t('ielts.dashboard.academicDesc') : t('ielts.dashboard.generalDesc')}
        </p>

        <label className="mt-4 block text-sm font-semibold text-slate-700">{t('ielts.writing.taskType')}</label>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {modeTasks.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => selectTask(type)}
              className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                taskType === type ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              {t(TASK_CONFIG[type].i18nKey)}
              <span className="block text-[11px] text-slate-500">
                ≥{TASK_CONFIG[type].min} words · ~{TASK_CONFIG[type].minutes} min
              </span>
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm font-semibold text-slate-700">{t('ielts.writing.promptSource')}</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['sample', 'bank', 'custom'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                source === s ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t(
                s === 'sample'
                  ? 'ielts.writing.sourceSample'
                  : s === 'bank'
                    ? 'ielts.writing.sourceBank'
                    : 'ielts.writing.sourceCustom',
              )}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void generateTask()}
            disabled={generatingPrompt}
            className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {generatingPrompt ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {generatingPrompt ? t('ielts.writing.generating') : t('ielts.writing.generate')}
          </button>
          <span className="text-[11px] text-slate-500">
            {generatedRemaining === null
              ? t('ielts.writing.generateHint')
              : t('ielts.writing.generateRemaining', { count: generatedRemaining })}
          </span>
        </div>
        {source === 'generated' && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            {t('ielts.writing.generatedNotice')}
          </p>
        )}
        {source === 'bank' && (
          <div className="mt-2 space-y-1.5">
            <p className="text-[11px] text-slate-500">
              {t('ielts.writing.bankInfo', { count: taskBank.length })}
            </p>
            {taskBank.length === 0 && bankMode === mode ? (
              <p className="text-xs text-slate-500">{t('ielts.writing.bankEmpty')}</p>
            ) : (
              taskBank.slice(0, 8).map((p) => (
                <button
                  key={p.testId}
                  type="button"
                  onClick={() => selectBankPrompt(p)}
                  className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{p.title}</span>
                  <span className="mt-0.5 block text-slate-500">{p.prompt.slice(0, 140)}…</span>
                </button>
              ))
            )}
          </div>
        )}

        <label className="mt-4 block text-sm font-semibold text-slate-700">{t('ielts.writing.promptLabel')}</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-indigo-400 focus:outline-none"
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-700">{t('ielts.writing.essayLabel')}</label>
          <span className={`text-xs font-medium ${belowMinimum ? 'text-amber-600' : 'text-slate-500'}`}>
            {t('ielts.writing.wordCount', { count: wordCount, min: config.min })}
          </span>
        </div>
        <textarea
          value={essay}
          onChange={(e) => setEssay(e.target.value)}
          rows={12}
          placeholder="Write your response here…"
          className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm leading-relaxed focus:border-indigo-400 focus:outline-none"
        />
        {belowMinimum && <p className="mt-2 text-xs text-amber-700">{t('ielts.writing.belowMinWarn')}</p>}
        <div className="mt-3 flex items-center justify-end gap-3">
          {errorKey && <p className="text-xs text-red-600">{t(errorKey)}</p>}
          <button
            type="button"
            onClick={() => void assess()}
            disabled={assessing || essay.trim().length === 0 || prompt.trim().length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {assessing && <Loader2 className="h-4 w-4 animate-spin" />}
            {assessing ? t('ielts.writing.assessing') : t('ielts.writing.assess')}
          </button>
        </div>
      </section>

      {assessment && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <p className="text-lg font-bold text-indigo-900">
              {t('ielts.assessment.taskBand')}: {assessment.taskBand.toFixed(1)}
            </p>
            <p className="mt-1 text-xs text-indigo-800">
              {t('ielts.assessment.confidence')}: {assessment.confidence} · {t('ielts.assessment.calibration')}: NOT_CALIBRATED ·{' '}
              {assessment.promptVersion}
            </p>
          </div>

          {assessment.templateSuspicion.suspected && (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">{t('ielts.assessment.template')}</p>
                {assessment.templateSuspicion.rationale && <p className="text-xs">{assessment.templateSuspicion.rationale}</p>}
              </div>
            </div>
          )}

          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t('ielts.assessment.criteria')}
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {Object.entries(assessment.criteria).map(([key, criterion]) => (
              <article key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">{t(CRITERION_LABELS[key] ?? key)}</h3>
                  <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-sm font-bold text-indigo-800">
                    {criterion.band.toFixed(1)}
                  </span>
                </div>
                {criterion.evidence.filter((e) => e.verified).length > 0 && (
                  <ul className="mt-2 space-y-1 border-l-2 border-indigo-200 pl-3 text-xs italic text-slate-600">
                    {criterion.evidence
                      .filter((e) => e.verified)
                      .slice(0, 3)
                      .map((e, i) => (
                        <li key={i}>“{e.quote}”</li>
                      ))}
                  </ul>
                )}
                {criterion.strengths.length > 0 && (
                  <p className="mt-2 text-xs text-emerald-700">
                    + {criterion.strengths.join(' · ')}
                  </p>
                )}
                {criterion.weaknesses.length > 0 && (
                  <p className="mt-1 text-xs text-rose-700">− {criterion.weaknesses.join(' · ')}</p>
                )}
                {criterion.rationale && <p className="mt-2 text-xs text-slate-600">{criterion.rationale}</p>}
              </article>
            ))}
          </div>

          {assessment.taskCoverage.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">{t('ielts.assessment.coverage')}</h2>
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {assessment.taskCoverage.map((item) => (
                  <li key={item.requirementId} className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        item.status === 'ADDRESSED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.status === 'PARTIALLY_ADDRESSED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {t(`ielts.assessment.coverageStatus.${item.status}`)}
                    </span>
                    {item.label}
                  </li>
                ))}
              </ul>
              {assessment.unreportedRequirementIds.length > 0 && (
                <p className="mt-2 text-[11px] text-slate-500">
                  {t('ielts.assessment.unreported')}: {assessment.unreportedRequirementIds.join(', ')}
                </p>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">{t('ielts.assessment.limitations')}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {assessment.limitations.map((limitation, i) => (
                <li key={i}>{limitation}</li>
              ))}
              {assessment.uncertainty.map((item, i) => (
                <li key={`u-${i}`} className="text-slate-500">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

export default function IeltsWritingPage() {
  // useSearchParams() 需要 Suspense 邊界（Next App Router 靜態預渲染要求）。
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> …
        </div>
      }
    >
      <IeltsWritingPageContent />
    </Suspense>
  );
}
