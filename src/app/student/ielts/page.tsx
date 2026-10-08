// ============================================
// 學生端 — IELTS 備考主頁（IELTS-style practice dashboard）
// ============================================
// 2026-10-07（使用者要求：改善流程及 UI）：
//   1. **先選組別**：學生必須先選學術組／通用組，卡片明確標示「學術組＝較高級的程度、
//      通用組＝較適合中學生」；未選組別前不顯示任何卷別（流程第一步）。
//   2. 選組後列出**該組全部卷別**（聆聽／閱讀／寫作／口說），每個卷別都可即時 AI
//      生成練習（未經教師審核），供學生隨時自學；同時列出已發佈（經教師審核）的試卷。
// 治理不變（docs/ielts/）：AI 永不自動發佈；即時卷只交付本人、明確標示未經審核，
// 口說只提供準備教學、永不評分。
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useT } from '@/hooks/use-i18n';
import { usePreferredIeltsVariant } from '@/hooks/use-ielts-variant-preference';
import {
  GraduationCap, Headphones, BookText, PencilLine, Mic, TrendingUp, Loader2, Info, Sparkles, ArrowRight,
} from 'lucide-react';

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

type IeltsVariant = 'ACADEMIC' | 'GENERAL_TRAINING';
type IeltsPaper = 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING';

const SKILL_ICONS: Record<IeltsPaper, typeof Headphones> = {
  LISTENING: Headphones,
  READING: BookText,
  WRITING: PencilLine,
  SPEAKING: Mic,
};

/** 卷別順序＝官方考卷順序（聆聽 → 閱讀 → 寫作 → 口說）。 */
const PAPER_ORDER: IeltsPaper[] = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'];

/** 每個卷別在兩組的內容差異（聆聽／口說兩組相同）。 */
const PAPER_META_KEYS: Record<IeltsPaper, { academic: string; general: string }> = {
  LISTENING: { academic: 'ielts.paper.listeningMeta', general: 'ielts.paper.listeningMeta' },
  READING: { academic: 'ielts.paper.readingMetaAcademic', general: 'ielts.paper.readingMetaGeneral' },
  WRITING: { academic: 'ielts.paper.writingMetaAcademic', general: 'ielts.paper.writingMetaGeneral' },
  SPEAKING: { academic: 'ielts.paper.speakingMeta', general: 'ielts.paper.speakingMeta' },
};

/** 寫作卷的兩個任務（依組別）；生成與評分都在寫作頁（?mode=&task=）。 */
const WRITING_TASKS: Record<IeltsVariant, Array<{ task: string; labelKey: string }>> = {
  ACADEMIC: [
    { task: 'academic_task1', labelKey: 'ielts.writing.task1Academic' },
    { task: 'academic_task2', labelKey: 'ielts.writing.task2Academic' },
  ],
  GENERAL_TRAINING: [
    { task: 'general_task1', labelKey: 'ielts.writing.task1General' },
    { task: 'general_task2', labelKey: 'ielts.writing.task2General' },
  ],
};

/** 生成失敗 → i18n key（絕不把內部錯誤碼直接顯示給學生）。 */
function instantErrorKey(code: string): string {
  if (code === 'INSTANT_DAILY_LIMIT_REACHED') return 'ielts.instant.dailyLimit';
  if (code === 'AI_BUDGET_EXHAUSTED') return 'ielts.instant.budget';
  if (code === 'AI_PROVIDER_TIMEOUT' || code === 'AI_PROVIDER_ERROR') return 'ielts.instant.provider';
  if (code === 'GENERATION_EMPTY' || code === 'AI_INVALID_JSON') return 'ielts.instant.noContent';
  return 'ielts.instant.failed';
}

export default function IeltsDashboardPage() {
  const { t } = useT();
  const router = useRouter();
  const [tests, setTests] = useState<IeltsTestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // 記住上次組別（2026-10-07）：`storedVariant` 由 localStorage 帶入（hydration 後）；
  // `sessionVariant` 為本次工作階段的明確選擇（`undefined` = 尚未選擇 ⇒ 用已記住的）。
  const [storedVariant, rememberVariant] = usePreferredIeltsVariant();
  const [sessionVariant, setSessionVariant] = useState<IeltsVariant | null | undefined>(undefined);
  /** null = 尚未選組別 → 只顯示第一步（組別選擇）。 */
  const variant: IeltsVariant | null = sessionVariant === undefined ? storedVariant : sessionVariant;

  // 即時自學練習（2026-10-03 VII）— on-demand AI set, NOT teacher-reviewed.
  // `generatingKey`（例：READING-set-5）令只有被按的按鈕顯示載入狀態。
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [instantError, setInstantError] = useState('');

  async function startInstantPractice(
    skill: 'READING' | 'LISTENING',
    scope: 'set' | 'full_component',
    count?: number,
  ) {
    if (!variant) return;
    setGeneratingKey(scope === 'full_component' ? `${skill}-full` : `${skill}-set-${count}`);
    setInstantError('');
    try {
      const res = await fetch('/api/ielts/practice/instant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill,
          testType: variant,
          ...(scope === 'full_component' ? { scope: 'full_component' } : { count }),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        // 診斷可見性（2026-10-08）：伺服器的 message 帶有 fail-closed 閘門的機器丟棄原因
        // （例：VALIDATOR_REJECT:MC_KEY_NOT_IN_OPTIONS）。學生不該看到內部代碼，但維運
        // 需要 —— 先前整段被丟棄，令 422 只能盲猜（40 題全軍覆沒事故花了很久才定位）。
        console.warn('[ielts] instant generation failed', body.error ?? res.status, body.message ?? '');
        setInstantError(instantErrorKey(body.error ?? ''));
        return;
      }
      const data = (await res.json()) as { instant: { testId: string } };
      router.push(`/student/ielts/tests/${data.instant.testId}`);
    } catch {
      setInstantError(t('ielts.instant.failed'));
    } finally {
      setGeneratingKey(null);
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

  const published = variant ? tests.filter((test) => test.testType === variant) : [];
  const variantLabel = variant === 'ACADEMIC' ? t('ielts.testType.academic') : t('ielts.testType.general');
  const variantLevel = variant === 'ACADEMIC' ? t('ielts.dashboard.academicLevel') : t('ielts.dashboard.generalLevel');
  const variantDesc = variant === 'ACADEMIC' ? t('ielts.dashboard.academicDesc') : t('ielts.dashboard.generalDesc');

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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">{t('ielts.dashboard.flowHint')}</p>
        <Link
          href="/student/ielts/progress"
          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
        >
          <TrendingUp className="h-3.5 w-3.5" /> {t('ielts.dashboard.progressLink')}
        </Link>
      </div>

      {variant === null ? (
        /* ---------- 第一步：選擇組別（未選前不顯示任何卷別） ---------- */
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">1. {t('ielts.dashboard.step1Title')}</h2>
            <p className="mt-1 text-sm text-slate-600">{t('ielts.dashboard.step1Desc')}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(['ACADEMIC', 'GENERAL_TRAINING'] as const).map((v) => (
              <article key={v} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-indigo-600" />
                  <h3 className="font-semibold text-slate-900">
                    {v === 'ACADEMIC' ? t('ielts.testType.academic') : t('ielts.testType.general')}
                  </h3>
                </div>
                <p
                  className={`mt-2 w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    v === 'ACADEMIC' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {v === 'ACADEMIC' ? t('ielts.dashboard.academicLevel') : t('ielts.dashboard.generalLevel')}
                </p>
                <p className="mt-2 flex-1 text-xs text-slate-600">
                  {v === 'ACADEMIC' ? t('ielts.dashboard.academicDesc') : t('ielts.dashboard.generalDesc')}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSessionVariant(v);
                    rememberVariant(v);
                    setInstantError('');
                  }}
                  className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
                >
                  {v === 'ACADEMIC' ? t('ielts.dashboard.selectAcademic') : t('ielts.dashboard.selectGeneral')}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </article>
            ))}
          </div>

          <p className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
            {t('ielts.dashboard.sameNote')}
          </p>
        </section>
      ) : (
        <>
          {/* 目前組別（可隨時更改，回到第一步） */}
          <section className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3">
            <div className="text-sm">
              <span className="text-slate-600">{t('ielts.dashboard.currentVariant')}: </span>
              <span className="font-semibold text-indigo-900">{variantLabel}</span>
              <span className="mt-0.5 block text-xs text-indigo-800">
                {variantLevel} · {variantDesc}
              </span>
              {sessionVariant === undefined && storedVariant !== null && (
                <span className="mt-0.5 block text-[11px] text-indigo-700">
                  {t('ielts.dashboard.rememberedVariant')}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setSessionVariant(null);
                setInstantError('');
              }}
              className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-50"
            >
              {t('ielts.dashboard.changeVariant')}
            </button>
          </section>

          {/* ---------- 第二步：選擇卷別 ---------- */}
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">2. {t('ielts.dashboard.step2Title')}</h2>
              <p className="mt-1 text-sm text-slate-600">{t('ielts.dashboard.step2Desc')}</p>
              <p className="mt-1 text-xs text-slate-500">{t('ielts.dashboard.dailyHint')}</p>
              <p className="mt-1 text-[11px] text-slate-500">{t('ielts.dashboard.adminNote')}</p>
            </div>

            {instantError && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{instantError}</p>}

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {PAPER_ORDER.map((paper) => {
                const Icon = SKILL_ICONS[paper];
                const paperTests = published.filter((test) => test.skill === paper);
                const metaKey = PAPER_META_KEYS[paper][variant === 'ACADEMIC' ? 'academic' : 'general'];
                const busy = generatingKey !== null;
                return (
                  <article key={paper} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-2">
                      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
                      <div>
                        <h3 className="font-semibold text-slate-900">{t(`ielts.skill.${paper.toLowerCase()}`)}</h3>
                        <p className="text-xs text-slate-500">{t(metaKey)}</p>
                      </div>
                    </div>

                    <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                      <Sparkles className="h-3.5 w-3.5" /> {t('ielts.paper.instantLabel')}
                    </p>

                    {(paper === 'READING' || paper === 'LISTENING') && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {[5, 10].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => void startInstantPractice(paper, 'set', n)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800 transition hover:bg-indigo-100 disabled:opacity-60"
                          >
                            {generatingKey === `${paper}-set-${n}` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {t('ielts.questionCount', { count: n })}
                          </button>
                        ))}
                        {/* 完整組件（2026-10-04）：官方 4 節／4 部分、約 40 題；成本約為單節 8 倍，
                            因此使用獨立的每日上限。 */}
                        <button
                          type="button"
                          onClick={() => void startInstantPractice(paper, 'full_component')}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
                        >
                          {generatingKey === `${paper}-full` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          {t('ielts.instant.fullComponent')}
                        </button>
                      </div>
                    )}

                    {(paper === 'READING' || paper === 'LISTENING') && generatingKey === `${paper}-full` && (
                      <p className="mt-2 text-[11px] text-indigo-700">
                        {t('ielts.instant.fullComponentNote', { minutes: paper === 'READING' ? 60 : 40 })}
                      </p>
                    )}

                    {paper === 'WRITING' && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {WRITING_TASKS[variant].map(({ task, labelKey }) => (
                          <Link
                            key={task}
                            href={`/student/ielts/writing?mode=${variant}&task=${task}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800 transition hover:bg-indigo-100"
                          >
                            {t(labelKey)} <ArrowRight className="h-3 w-3" />
                          </Link>
                        ))}
                      </div>
                    )}

                    {paper === 'SPEAKING' && (
                      <Link
                        href="/student/ielts/speaking"
                        className="mt-2 inline-flex w-fit items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800 transition hover:bg-indigo-100"
                      >
                        {t('ielts.dashboard.speakingLink')} <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}

                    <p className="mt-2 text-[11px] text-slate-500">
                      {paper === 'SPEAKING' ? t('ielts.speaking.noScoreNotice') : t('ielts.instant.note')}
                    </p>

                    {/* 已發佈（經教師審核）練習卷 */}
                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {t('ielts.paper.publishedLabel')}
                      </p>

                      {loading ? (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> …
                        </p>
                      ) : error ? (
                        <p className="mt-2 text-xs text-red-600">{error}</p>
                      ) : paperTests.length === 0 ? (
                        <p className="mt-2 text-xs text-slate-500">{t('ielts.dashboard.noTests')}</p>
                      ) : (
                        <ul className="mt-2 divide-y divide-slate-100">
                          {paperTests.map((test) => (
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
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
