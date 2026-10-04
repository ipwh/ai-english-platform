// ============================================
// 學生端 — IELTS 練習卷（Listening / Reading runner）
// ============================================
// 伺服器評分：提交後才顯示答案、解釋與依據（作答前絕不洩露答案鍵）。
// ============================================
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@/hooks/use-i18n';
import { Loader2, Volume2, Info, CheckCircle2, XCircle, MinusCircle, Sparkles } from 'lucide-react';

interface MistakeExplanationData {
  explanation: string;
  misconception: string;
  tip: string;
  limitations: string[];
}

interface ClientQuestion {
  id: string;
  sectionId: string | null;
  orderIndex: number;
  questionType: string;
  skill: string;
  prompt: string;
  options?: Array<string | { code: string; text: string }>;
  wordLimit?: { maxWords?: number; allowsNumber?: boolean; instruction?: string };
  difficulty: string;
}

interface SectionInfo {
  id: string;
  orderIndex: number;
  label: string;
  instructions: string | null;
  passageText: string | null;
  hasTranscript: boolean;
}

interface TestDetail {
  id: string;
  title: string;
  testType: string;
  skill: string;
  description: string | null;
  /** 'CATALOGUE' | 'INSTANT' — INSTANT sets show the unreviewed-practice banner. */
  origin?: string;
  /** Set for complete components (60 reading / 40 listening minutes). */
  durationMinutes?: number | null;
  sections: SectionInfo[];
  questions: ClientQuestion[];
}

/** Official item target for a complete READING/LISTENING component. */
const FULL_COMPONENT_TARGET = 40;

interface AttemptDetail {
  id: string;
  status: string;
  rawScore: number | null;
  totalItems: number | null;
  bandEstimate: BandEstimate | null;
  notComparableReason: string | null;
  responses?: Array<{ questionId: string; rawAnswer: string }>;
  feedback?: ResponseFeedback[];
}

interface ResponseFeedback {
  questionId: string;
  verdict: 'correct' | 'incorrect' | 'ungradable';
  reason: string;
  correctAnswer: unknown;
  acceptedAnswers: string[] | null;
  explanation: string | null;
  evidence: unknown;
}

interface BandEstimate {
  estimate: true;
  minBand: number;
  maxBandExclusive: number | null;
  displayRange: string;
  officialNote: string;
}

interface SubmitResult {
  id: string;
  rawScore: number;
  totalItems: number;
  bandEstimate: BandEstimate | null;
  notComparableReason: string | null;
  results: ResponseFeedback[];
}

function optionPairs(options: ClientQuestion['options']): Array<{ code: string; text: string }> {
  if (!options) return [];
  return options.map((raw, i) =>
    typeof raw === 'string' ? { code: String.fromCharCode(65 + i), text: raw } : raw,
  );
}

function inputKind(questionType: string): 'mc' | 'tfng' | 'ynng' | 'text' {
  if (questionType === 'reading_true_false_not_given') return 'tfng';
  if (questionType === 'reading_yes_no_not_given') return 'ynng';
  if (questionType.includes('multiple_choice') || questionType.includes('matching')) return 'mc';
  return 'text';
}

export default function IeltsTestPage() {
  const { t, language } = useT();
  const params = useParams<{ id: string }>();
  const testId = params?.id;

  const [test, setTest] = useState<TestDetail | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [audioState, setAudioState] = useState<Record<string, 'idle' | 'loading' | 'error'>>({});
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const [explanations, setExplanations] = useState<
    Record<string, { loading?: boolean; error?: boolean; data?: MistakeExplanationData }>
  >({});

  const load = useCallback(
    async (force = false) => {
      if (!testId) return;
      setError('');
      try {
        const testRes = await fetch(`/api/ielts/tests/${testId}`);
        if (!testRes.ok) throw new Error('TEST_LOAD_FAILED');
        const testData = (await testRes.json()) as { test: TestDetail };
        setTest(testData.test);

        // Server-side reload safety: an unfinished attempt is resumed and a
        // submitted one is returned as-is (only `force` mints a new attempt).
        const attemptRes = await fetch('/api/ielts/attempts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ testId, ...(force ? { force: true } : {}) }),
        });
        if (!attemptRes.ok) {
          // Surface the server's own message (e.g. the bilingual rate-limit text)
          // instead of an opaque generic error, so a blocked student can act.
          const body = (await attemptRes.json().catch(() => ({}))) as { message?: string; error?: string };
          throw new Error(body.message || body.error || 'ATTEMPT_START_FAILED');
        }
        const attemptData = (await attemptRes.json()) as {
          attempt: { id: string; status?: string };
        };
        setAttemptId(attemptData.attempt.id);

        // Already submitted → restore the result AND the student's own answers so
        // a refresh never discards their work or silently starts a blank attempt.
        if (attemptData.attempt.status === 'SUBMITTED') {
          const detailRes = await fetch(`/api/ielts/attempts/${attemptData.attempt.id}`);
          if (detailRes.ok) {
            const detail = (await detailRes.json()) as { attempt: AttemptDetail };
            const restored: Record<string, string> = {};
            for (const response of detail.attempt.responses ?? []) {
              restored[response.questionId] = response.rawAnswer;
            }
            setAnswers(restored);
            setResult({
              id: detail.attempt.id,
              rawScore: detail.attempt.rawScore ?? 0,
              totalItems: detail.attempt.totalItems ?? 0,
              bandEstimate: detail.attempt.bandEstimate,
              notComparableReason: detail.attempt.notComparableReason,
              results: detail.attempt.feedback ?? [],
            });
          }
        } else {
          setResult(null);
        }
      } catch (err) {
        // Show the server's own message (e.g. the bilingual rate-limit text) when it
        // is human-readable; internal SCREAMING_CASE codes fall back to the generic one.
        const serverMessage = err instanceof Error ? err.message : '';
        setError(serverMessage && !/^[A-Z_]+$/.test(serverMessage) ? serverMessage : t('ielts.error.generic'));
      } finally {
        setLoading(false);
      }
    },
    [testId, t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Stop any playing clip when leaving the page (and release its blob URL).
  useEffect(
    () => () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        URL.revokeObjectURL(currentAudioRef.current.src);
        currentAudioRef.current = null;
      }
    },
    [],
  );

  const objectiveQuestions = useMemo(
    () => (test ? test.questions.filter((q) => q.skill !== 'WRITING' && q.skill !== 'SPEAKING') : []),
    [test],
  );
  const answeredCount = objectiveQuestions.filter((q) => (answers[q.id] ?? '').trim().length > 0).length;

  async function playSectionAudio(sectionId: string) {
    setAudioState((prev) => ({ ...prev, [sectionId]: 'loading' }));
    try {
      // Never leave the previous clip running (and never leak its blob URL).
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        URL.revokeObjectURL(currentAudioRef.current.src);
        currentAudioRef.current = null;
      }
      const res = await fetch(`/api/ielts/sections/${sectionId}/audio`, { method: 'POST' });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      audio.addEventListener('ended', () => {
        URL.revokeObjectURL(url);
        if (currentAudioRef.current === audio) currentAudioRef.current = null;
      });
      await audio.play();
      setAudioState((prev) => ({ ...prev, [sectionId]: 'idle' }));
    } catch {
      setAudioState((prev) => ({ ...prev, [sectionId]: 'error' }));
    }
  }

  async function submit() {
    if (!attemptId) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/ielts/attempts/${attemptId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: objectiveQuestions.map((q) => ({ questionId: q.id, answer: answers[q.id] ?? '' })),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { result: SubmitResult };
      setResult(data.result);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError(t('ielts.error.generic'));
    } finally {
      setSubmitting(false);
    }
  }

  // Advisory AI explanation for a WRONG answer — never changes the mark.
  async function explainMistake(questionId: string) {
    if (!attemptId) return;
    setExplanations((prev) => ({ ...prev, [questionId]: { loading: true } }));
    try {
      const res = await fetch('/api/ielts/mistakes/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, questionId, language }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { explanation: MistakeExplanationData };
      setExplanations((prev) => ({ ...prev, [questionId]: { data: data.explanation } }));
    } catch {
      setExplanations((prev) => ({ ...prev, [questionId]: { error: true } }));
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> …
      </div>
    );
  }

  if (!test || error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-red-600">{error || t('ielts.error.generic')}</p>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void load();
            }}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            {t('common.retry')}
          </button>
          <Link href="/student/ielts" className="text-sm text-indigo-600 hover:underline">
            ← {t('ielts.title')}
          </Link>
        </div>
      </div>
    );
  }

  const feedbackById = new Map((result?.results ?? []).map((r) => [r.questionId, r]));

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <header>
        <Link href="/student/ielts" className="text-xs text-indigo-600 hover:underline">
          ← {t('ielts.title')}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {test.title}
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-xs font-semibold text-amber-800">
            {t('ielts.betaBadge')}
          </span>
        </h1>
        <p className="text-xs text-slate-500">
          {t(`ielts.skill.${test.skill.toLowerCase()}`)} · {t('ielts.practiceOnly')}
        </p>
      </header>

      {test.origin === 'INSTANT' && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">{t('ielts.instant.banner')}</p>
            <p className="mt-1 text-xs text-amber-800">{t('ielts.instant.bannerDetail')}</p>
          </div>
        </div>
      )}

      {typeof test.durationMinutes === 'number' && objectiveQuestions.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <p className="font-semibold text-slate-800">{t('ielts.component.title')}</p>
          <p className="mt-1">
            {t('ielts.component.progress', {
              delivered: objectiveQuestions.length,
              official: FULL_COMPONENT_TARGET,
              minutes: test.durationMinutes,
            })}
          </p>
          {objectiveQuestions.length < FULL_COMPONENT_TARGET && (
            <p className="mt-1 text-amber-700">{t('ielts.component.shortfall')}</p>
          )}
        </div>
      )}

      {result && (
        <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-lg font-bold text-indigo-900">
              {t('ielts.score', { score: result.rawScore, total: result.totalItems })}
            </p>
            {result.bandEstimate && (
              <p className="text-sm font-semibold text-indigo-800">
                {t('ielts.bandEstimate')}: {result.bandEstimate.displayRange}
              </p>
            )}
          </div>
          {result.bandEstimate ? (
            <p className="mt-1 text-xs text-indigo-800">{result.bandEstimate.officialNote}</p>
          ) : result.notComparableReason ? (
            <p className="mt-1 text-xs text-indigo-800">{t('ielts.notComparable')}</p>
          ) : null}
        </section>
      )}

      {test.sections.map((section) => {
        const questions = test.questions.filter((q) => q.sectionId === section.id);
        if (questions.length === 0) return null;
        return (
          <section key={section.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900">{section.label}</h2>
              {test.skill === 'LISTENING' && section.hasTranscript && (
                <button
                  type="button"
                  onClick={() => void playSectionAudio(section.id)}
                  disabled={audioState[section.id] === 'loading'}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  {audioState[section.id] === 'loading' ? t('ielts.playLoading') : t('ielts.play')}
                </button>
              )}
            </div>
            {section.instructions && <p className="mt-1 text-xs text-slate-500">{section.instructions}</p>}
            {test.skill === 'LISTENING' && (
              <p className="mt-1 text-[11px] text-slate-400">
                {t('ielts.aiVoiceNotice')} · {t('ielts.transcriptAfterSubmit')}
              </p>
            )}
            {audioState[section.id] === 'error' && (
              <p className="mt-1 text-xs text-red-600">{t('ielts.audioUnavailable')}</p>
            )}

            {section.passageText && (
              <div className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">
                {section.passageText}
              </div>
            )}

            <ol className="mt-4 space-y-4">
              {questions.map((q, index) => {
                const feedback = feedbackById.get(q.id);
                const kind = inputKind(q.questionType);
                const value = answers[q.id] ?? '';
                const optionItems = optionPairs(q.options);
                return (
                  <li key={q.id} className="rounded-xl border border-slate-100 p-3">
                    <p className="text-sm font-medium text-slate-900">
                      {index + 1}. {q.prompt}
                    </p>
                    {q.wordLimit?.instruction ? (
                      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        {q.wordLimit.instruction}
                      </p>
                    ) : q.wordLimit?.maxWords ? (
                      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        {t('ielts.wordLimitShort', { n: q.wordLimit.maxWords })}
                      </p>
                    ) : null}

                    {kind === 'text' ? (
                      <input
                        type="text"
                        value={value}
                        disabled={Boolean(result)}
                        onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder={t('ielts.answerPlaceholder')}
                        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none disabled:bg-slate-50"
                      />
                    ) : (
                      <div className="mt-2 space-y-1.5">
                        {(kind === 'tfng'
                          ? ['TRUE', 'FALSE', 'NOT GIVEN']
                          : kind === 'ynng'
                            ? ['YES', 'NO', 'NOT GIVEN']
                            : optionItems.map((o) => o.code)
                        ).map((code) => {
                          const text =
                            kind === 'tfng' || kind === 'ynng'
                              ? code
                              : optionItems.find((o) => o.code === code)?.text ?? '';
                          return (
                            <label
                              key={code}
                              className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                                value === code ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'
                              } ${result ? 'cursor-default opacity-90' : ''}`}
                            >
                              <input
                                type="radio"
                                name={q.id}
                                value={code}
                                checked={value === code}
                                disabled={Boolean(result)}
                                onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: code }))}
                                className="mt-0.5"
                              />
                              <span>
                                <span className="font-semibold">{code}</span>
                                {kind !== 'tfng' && kind !== 'ynng' && <span> {text}</span>}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {feedback && (
                      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                        <p className="flex items-center gap-1.5 font-semibold">
                          {feedback.verdict === 'correct' ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          ) : feedback.verdict === 'incorrect' ? (
                            <XCircle className="h-4 w-4 text-red-500" />
                          ) : (
                            <MinusCircle className="h-4 w-4 text-slate-400" />
                          )}
                          {t(`ielts.verdict.${feedback.verdict}`)}
                          {feedback.reason === 'WORD_LIMIT_EXCEEDED' &&
                            ` — ${t('ielts.feedback.wordLimitExceeded')}`}
                        </p>
                        {feedback.correctAnswer !== null && (
                          <p className="mt-1">
                            {t('ielts.correctAnswer')}:{' '}
                            <span className="font-semibold">
                              {Array.isArray(feedback.correctAnswer)
                                ? feedback.correctAnswer.join(' / ')
                                : String(feedback.correctAnswer)}
                            </span>
                          </p>
                        )}
                        {feedback.acceptedAnswers && feedback.acceptedAnswers.length > 0 && (
                          <p className="mt-1">
                            {t('ielts.acceptedAnswers')}:{' '}
                            <span className="font-semibold">{feedback.acceptedAnswers.join(' / ')}</span>
                          </p>
                        )}
                        {feedback.explanation && (
                          <p className="mt-1">
                            {t('ielts.explanation')}: {feedback.explanation}
                          </p>
                        )}

                        {feedback.verdict === 'incorrect' && (
                          <div className="mt-2">
                            {!explanations[q.id]?.data && (
                              <button
                                type="button"
                                onClick={() => void explainMistake(q.id)}
                                disabled={explanations[q.id]?.loading}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                              >
                                {explanations[q.id]?.loading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Sparkles className="h-3.5 w-3.5" />
                                )}
                                {explanations[q.id]?.loading
                                  ? t('ielts.explain.loading')
                                  : t('ielts.explain.button')}
                              </button>
                            )}
                            {explanations[q.id]?.error && (
                              <p className="mt-1 text-red-600">{t('ielts.explain.failed')}</p>
                            )}
                            {explanations[q.id]?.data && (
                              <div className="space-y-1 rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5">
                                {explanations[q.id]!.data!.explanation && (
                                  <p>
                                    <span className="font-semibold">{t('ielts.explain.whyKey')}:</span>{' '}
                                    {explanations[q.id]!.data!.explanation}
                                  </p>
                                )}
                                {explanations[q.id]!.data!.misconception && (
                                  <p>
                                    <span className="font-semibold">{t('ielts.explain.whyYours')}:</span>{' '}
                                    {explanations[q.id]!.data!.misconception}
                                  </p>
                                )}
                                {explanations[q.id]!.data!.tip && (
                                  <p>
                                    <span className="font-semibold">{t('ielts.explain.tip')}:</span>{' '}
                                    {explanations[q.id]!.data!.tip}
                                  </p>
                                )}
                                <p className="text-[10px] text-slate-500">{t('ielts.explain.note')}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}

      {!result ? (
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">
            {t('ielts.answered', { answered: answeredCount, total: objectiveQuestions.length })}
          </p>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? t('ielts.submitting') : t('ielts.submit')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{t('ielts.disclaimer')}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setResult(null);
              setAnswers({});
              setExplanations({});
              void load(true);
            }}
            className="self-start rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            {t('ielts.retake')}
          </button>
        </div>
      )}
    </div>
  );
}
