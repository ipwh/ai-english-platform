// ============================================
// 學生端 — IELTS 備考主頁（IELTS-style practice dashboard）
// ============================================
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useT } from '@/hooks/use-i18n';
import { GraduationCap, Headphones, BookText, PencilLine, Mic, TrendingUp, Loader2, Info, Sparkles } from 'lucide-react';

interface IeltsTestSummary {
  id: string;
  slug: string;
  title: string;
  testType: 'ACADEMIC' | 'GENERAL_TRAINING';
  skill: 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING';
  description: string | null;
  durationMinutes: number | null;
  sectionCount: number;
  questionCount: number;
}

const SKILL_ICONS: Record<string, typeof Headphones> = {
  LISTENING: Headphones,
  READING: BookText,
  WRITING: PencilLine,
  SPEAKING: Mic,
};

export default function IeltsDashboardPage() {
  const { t } = useT();
  const router = useRouter();
  const [tests, setTests] = useState<IeltsTestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [testType, setTestType] = useState<'ACADEMIC' | 'GENERAL_TRAINING'>('ACADEMIC');
  const [error, setError] = useState('');

  // 即時自學練習（2026-10-03 VII）— on-demand AI set, NOT teacher-reviewed.
  const [instantSkill, setInstantSkill] = useState<'READING' | 'LISTENING'>('READING');
  const [instantCount, setInstantCount] = useState(5);
  const [instantLoading, setInstantLoading] = useState(false);
  const [instantError, setInstantError] = useState('');

  async function startInstantPractice() {
    setInstantLoading(true);
    setInstantError('');
    try {
      const res = await fetch('/api/ielts/practice/instant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill: instantSkill, testType, count: instantCount }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error === 'INSTANT_DAILY_LIMIT_REACHED' ? 'LIMIT' : String(res.status));
      }
      const data = (await res.json()) as { instant: { testId: string } };
      router.push(`/student/ielts/tests/${data.instant.testId}`);
    } catch (err) {
      setInstantError(
        err instanceof Error && err.message === 'LIMIT'
          ? t('ielts.instant.dailyLimit')
          : t('ielts.instant.failed'),
      );
    } finally {
      setInstantLoading(false);
    }
  }

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/ielts/tests');
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { tests: IeltsTestSummary[] };
      setTests(data.tests ?? []);
    } catch {
      setError(t('ielts.error.generic'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = tests.filter((test) => test.testType === testType);
  const skills: Array<IeltsTestSummary['skill']> = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <header className="flex items-start gap-3">
        <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600">
          <GraduationCap className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t('ielts.title')}
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-xs font-semibold text-amber-800">
              {t('ielts.betaBadge')}
            </span>
          </h1>
          <p className="text-sm text-slate-600">{t('ielts.subtitle')}</p>
        </div>
      </header>

      <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p>{t('ielts.disclaimer')}</p>
          <p className="mt-1 text-xs text-amber-800">{t('ielts.humanEvidence')}</p>
          <p className="mt-1 text-xs text-amber-800">{t('ielts.betaNotice')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          href="/student/ielts/writing"
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow"
        >
          <PencilLine className="h-5 w-5 text-indigo-600" />
          <p className="mt-2 font-semibold text-slate-900">{t('ielts.dashboard.writingLink')}</p>
        </Link>
        <Link
          href="/student/ielts/speaking"
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow"
        >
          <Mic className="h-5 w-5 text-indigo-600" />
          <p className="mt-2 font-semibold text-slate-900">{t('ielts.dashboard.speakingLink')}</p>
        </Link>
        <Link
          href="/student/ielts/progress"
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow"
        >
          <TrendingUp className="h-5 w-5 text-indigo-600" />
          <p className="mt-2 font-semibold text-slate-900">{t('ielts.dashboard.progressLink')}</p>
        </Link>
      </div>

      <div className="flex gap-2">
        {(['ACADEMIC', 'GENERAL_TRAINING'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setTestType(type)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              testType === type
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {type === 'ACADEMIC' ? t('ielts.testType.academic') : t('ielts.testType.general')}
          </button>
        ))}
      </div>

      <p className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
        {testType === 'ACADEMIC' ? t('ielts.dashboard.academicDesc') : t('ielts.dashboard.generalDesc')}
        <span className="mt-1 block text-slate-500">{t('ielts.dashboard.sameNote')}</span>
      </p>

      {/* 即時自學練習（2026-10-03 VII）— 不需等待審核即可練習；內容明確標示未經教師審核，
          永不進入正式題庫（AI 永不自動發佈）。 */}
      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
          <div className="flex-1 space-y-3">
            <div>
              <h2 className="font-semibold text-indigo-900">{t('ielts.instant.title')}</h2>
              <p className="text-xs text-indigo-800">{t('ielts.instant.desc')}</p>
              <p className="mt-1 text-[11px] text-indigo-700">{t('ielts.instant.note')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(['READING', 'LISTENING'] as const).map((skill) => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => setInstantSkill(skill)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    instantSkill === skill
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {t(`ielts.skill.${skill.toLowerCase()}`)}
                </button>
              ))}
              <span className="mx-1 h-4 w-px bg-indigo-200" />
              {[5, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setInstantCount(n)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    instantCount === n
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {t('ielts.questionCount', { count: n })}
                </button>
              ))}
              <button
                type="button"
                onClick={() => void startInstantPractice()}
                disabled={instantLoading}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {instantLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {instantLoading ? t('ielts.instant.starting') : t('ielts.instant.start')}
              </button>
            </div>
            {instantError && <p className="text-xs text-red-600">{instantError}</p>}
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> …
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          <p>{t('ielts.dashboard.noTests')}</p>
          <p className="mt-2 text-xs text-slate-500">{t('ielts.dashboard.adminNote')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {skills.map((skill) => {
            const skillTests = filtered.filter((test) => test.skill === skill);
            if (skillTests.length === 0) return null;
            const Icon = SKILL_ICONS[skill] ?? BookText;
            return (
              <section key={skill} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                  <Icon className="h-4 w-4 text-indigo-600" />
                  {t(`ielts.skill.${skill.toLowerCase()}`)}
                </h2>
                <ul className="mt-3 divide-y divide-slate-100">
                  {skillTests.map((test) => (
                    <li key={test.id} className="flex items-center justify-between gap-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{test.title}</p>
                        <p className="text-xs text-slate-500">
                          {t('ielts.questionCount', { count: test.questionCount })}
                          {test.description ? ` — ${test.description}` : ''}
                        </p>
                      </div>
                      <Link
                        href={`/student/ielts/tests/${test.id}`}
                        className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                      >
                        {t('ielts.start')}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
