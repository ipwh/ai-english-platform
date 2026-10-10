// ============================================
// 學生端 — 自訂練習（Sprint 141, P0 #3）
// ============================================
// Smallest complete student flow: describe → generate → answer → submit → results.
// Security posture in the client:
//   - answer keys are NEVER in pre-submission state (the API does not send them);
//   - ownership is decided by the SERVER on every read (no client-side check is
//     trusted): another student's set simply 404s;
//   - the submit button is disabled while a request is in flight, so a double click
//     cannot fire two submissions (the database enforces the same rule anyway).
// ============================================

'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useT } from '@/hooks/use-i18n';

type Category = 'grammar' | 'sentence_pattern' | 'vocabulary';
type Difficulty = 'basic' | 'intermediate' | 'advanced';
type QuestionType = 'mc' | 'fill_blank' | 'error_correction' | 'transformation' | 'sentence_production';
type ErrorKind = 'session' | 'rate' | 'quality' | 'verifier' | 'provider' | 'already' | 'generic' | null;

interface DeliveredQuestion {
  id: string;
  orderIndex: number;
  questionType: string;
  instructions: string;
  prompt: string;
  targetRule: string;
  maxMarks: number;
}

interface DeliveredSet {
  id: string;
  objective: string;
  category: string;
  difficulty: string;
  interpretation: string | null;
  questionCount: number;
  submitted: boolean;
  questions: DeliveredQuestion[];
}

interface GenerationMeta {
  requestedCount: number;
  deliveredCount: number;
  shortfall: number;
  rejectedByVerification: number;
  regenerationRounds: number;
  interpretation: string | null;
}

interface ResultResponse {
  questionId: string;
  orderIndex: number;
  verdict: 'correct' | 'partially_correct' | 'incorrect' | 'needs_review';
  awardedMarks: number;
  maxMarks: number;
  rationale: string;
  referenceAnswer: string;
  acceptedAlternatives: string[];
  improvement: string | null;
  explanationEn: string;
  explanationZh: string | null;
  misconceptionTags: string[];
  targetRule: string;
  needsReview: boolean;
}

interface Results {
  setId: string;
  awardedMarks: number;
  totalMarks: number;
  needsReviewCount: number;
  overallFeedback: string | null;
  gradingDegraded: boolean;
  responses: ResultResponse[];
}

interface HistoryItem {
  id: string;
  objective: string;
  category: string;
  difficulty: string;
  questionCount: number;
  createdAt: string;
  submitted: boolean;
  awardedMarks: number | null;
  totalMarks: number | null;
}

const CATEGORIES: Category[] = ['grammar', 'sentence_pattern', 'vocabulary'];
const DIFFICULTIES: Difficulty[] = ['basic', 'intermediate', 'advanced'];
const QUESTION_TYPES: QuestionType[] = ['mc', 'fill_blank', 'error_correction', 'transformation', 'sentence_production'];

export default function CustomPracticePage() {
  const { t } = useT();

  const [requestText, setRequestText] = useState('');
  const [category, setCategory] = useState<Category | 'auto'>('auto');
  const [difficulty, setDifficulty] = useState<Difficulty>('intermediate');
  const [questionCount, setQuestionCount] = useState(5);
  const [types, setTypes] = useState<QuestionType[]>([]);

  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const [set, setSet] = useState<DeliveredSet | null>(null);
  const [meta, setMeta] = useState<GenerationMeta | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Results | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/custom-practice');
      if (response.status === 401) {
        setErrorKind('session');
        return;
      }
      if (!response.ok) return;
      const body = (await response.json()) as { sets: HistoryItem[] };
      setHistory(body.sets ?? []);
      setHistoryLoaded(true);
    } catch {
      // History is secondary: a failure here must not break the practice flow.
    }
  }, []);

  // History is loaded on demand (button) and after each action, rather than from a
  // mount effect: the repository's `react-hooks/set-state-in-effect` budget is a
  // ratchet that may only be lowered, and this is also one less request per visit.

  const generate = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    setErrorKind(null);
    setErrorDetail(null);
    setResults(null);

    try {
      const response = await fetch('/api/custom-practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestText,
          category: category === 'auto' ? undefined : category,
          difficulty,
          questionCount,
          exerciseTypes: types.length > 0 ? types : undefined,
        }),
      });

      if (response.status === 401) {
        setErrorKind('session');
        return;
      }
      if (response.status === 429) {
        setErrorKind('rate');
        return;
      }
      if (response.status === 422) {
        const body = (await response.json().catch(() => ({}))) as { details?: { verifierAvailable?: boolean } };
        setErrorKind(body.details?.verifierAvailable === false ? 'verifier' : 'quality');
        return;
      }
      if (response.status === 502 || response.status === 504) {
        setErrorKind('provider');
        return;
      }
      if (!response.ok) {
        setErrorKind('generic');
        return;
      }

      const body = (await response.json()) as { set: DeliveredSet; meta: GenerationMeta };
      setSet(body.set);
      setMeta(body.meta);
      setAnswers({});
      void loadHistory();
    } catch {
      setErrorKind('generic');
    } finally {
      setGenerating(false);
    }
  }, [category, difficulty, generating, loadHistory, questionCount, requestText, types]);

  // Declared BEFORE `submit` so it can be a real dependency of it (the repo
  // promotes react-hooks/exhaustive-deps to an error — a suppressed dependency
  // would hide the ordering problem rather than fix it).
  const openSet = useCallback(async (setId: string) => {
    try {
      const response = await fetch(`/api/custom-practice/${setId}`);
      if (response.status === 401) {
        setErrorKind('session');
        return;
      }
      if (!response.ok) {
        setErrorKind('generic');
        return;
      }
      const body = (await response.json()) as { set: DeliveredSet; results: Results | null };
      setSet(body.set);
      setResults(body.results);
      setMeta(null);
      setAnswers({});
      setErrorKind(null);
    } catch {
      setErrorKind('generic');
    }
  }, []);

  const submit = useCallback(async () => {
    if (!set || submitting) return;

    const answered = Object.values(answers).filter(value => value.trim().length > 0).length;
    if (answered === 0) {
      setErrorKind(null);
      setErrorDetail(t('customPractice.answerAll'));
      return;
    }

    setSubmitting(true);
    setErrorKind(null);
    setErrorDetail(null);

    try {
      const response = await fetch(`/api/custom-practice/${set.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });

      if (response.status === 401) {
        setErrorKind('session');
        return;
      }
      if (response.status === 429) {
        setErrorKind('rate');
        return;
      }
      if (response.status === 409) {
        setErrorKind('already');
        await openSet(set.id);
        return;
      }
      if (!response.ok) {
        setErrorKind('generic');
        return;
      }

      const body = (await response.json()) as { results: Results };
      setResults(body.results);
      setSet(current => (current ? { ...current, submitted: true } : current));
      void loadHistory();
    } catch {
      setErrorKind('generic');
    } finally {
      setSubmitting(false);
    }
  }, [answers, loadHistory, openSet, set, submitting, t]);

  const errorMessage = (): string | null => {
    if (errorDetail) return errorDetail;
    switch (errorKind) {
      case 'session':
        return t('customPractice.error.session');
      case 'rate':
        return t('customPractice.error.rate');
      case 'quality':
        return t('customPractice.error.quality');
      case 'verifier':
        return t('customPractice.error.verifier');
      case 'provider':
        return t('customPractice.error.provider');
      case 'already':
        return t('customPractice.error.already');
      case 'generic':
        return t('customPractice.error.generic');
      default:
        return null;
    }
  };

  const verdictClass = (verdict: ResultResponse['verdict']): string => {
    switch (verdict) {
      case 'correct':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'partially_correct':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'incorrect':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{t('customPractice.title')}</h1>
          <Link href="/student/dashboard" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('common.back')}
          </Link>
        </div>
        <p className="text-sm text-slate-600">{t('customPractice.subtitle')}</p>
      </header>

      <div aria-live="polite" role="status">
        {errorMessage() && (
          <p className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {errorMessage()}
              {errorKind === 'session' && (
                <>
                  {' '}
                  <Link href="/login" className="underline">
                    {t('nav.login')}
                  </Link>
                </>
              )}
            </span>
          </p>
        )}
      </div>

      <section aria-labelledby="request-heading" className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 id="request-heading" className="text-base font-medium text-slate-900">
          {t('customPractice.requestLabel')}
        </h2>

        <div>
          <label htmlFor="cp-request" className="mb-1 block text-sm font-medium text-slate-700">
            {t('customPractice.requestLabel')}
          </label>
          <textarea
            id="cp-request"
            value={requestText}
            onChange={event => setRequestText(event.target.value)}
            maxLength={400}
            rows={3}
            placeholder={t('customPractice.requestPlaceholder')}
            className="w-full rounded-md border border-slate-300 p-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-500">{t('customPractice.requestHint')}</p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">{t('customPractice.categoryLegend')}</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(['auto', ...CATEGORIES] as const).map(value => (
              <label key={value} className="flex items-center gap-2 rounded-md border border-slate-200 p-2 text-sm">
                <input
                  type="radio"
                  name="cp-category"
                  value={value}
                  checked={category === value}
                  onChange={() => setCategory(value)}
                />
                <span>{t(`customPractice.category.${value}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">{t('customPractice.difficultyLegend')}</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {DIFFICULTIES.map(value => (
              <label key={value} className="flex items-center gap-2 rounded-md border border-slate-200 p-2 text-sm">
                <input
                  type="radio"
                  name="cp-difficulty"
                  value={value}
                  checked={difficulty === value}
                  onChange={() => setDifficulty(value)}
                />
                <span>{t(`customPractice.difficulty.${value}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="cp-count" className="mb-1 block text-sm font-medium text-slate-700">
            {t('customPractice.countLabel')}
          </label>
          <input
            id="cp-count"
            type="number"
            min={3}
            max={10}
            value={questionCount}
            onChange={event => setQuestionCount(Number(event.target.value))}
            className="w-24 rounded-md border border-slate-300 p-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">{t('customPractice.typesLegend')}</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {QUESTION_TYPES.map(value => (
              <label key={value} className="flex items-center gap-2 rounded-md border border-slate-200 p-2 text-sm">
                <input
                  type="checkbox"
                  value={value}
                  checked={types.includes(value)}
                  onChange={event =>
                    setTypes(current =>
                      event.target.checked ? [...current, value] : current.filter(item => item !== value)
                    )
                  }
                />
                <span>{t(`customPractice.type.${value}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          onClick={() => void generate()}
          disabled={generating || requestText.trim().length < 3}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
          {generating ? t('customPractice.generating') : t('customPractice.generate')}
        </button>
      </section>

      {set && (
        <section aria-labelledby="questions-heading" className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <h2 id="questions-heading" className="text-base font-medium text-slate-900">
            {t('customPractice.questionsTitle')}
          </h2>

          {(meta?.interpretation ?? set.interpretation) && (
            <p className="rounded-md border border-sky-200 bg-sky-50 p-2 text-sm text-sky-800">
              {t('customPractice.interpretation')}
              {meta?.interpretation ?? set.interpretation}
            </p>
          )}

          {meta && meta.shortfall > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
              {t('customPractice.shortfall', { requested: meta.requestedCount, delivered: meta.deliveredCount })}
            </p>
          )}

          <p className="text-xs text-slate-500">{t('customPractice.verifiedNote')}</p>

          <ol className="space-y-4">
            {set.questions.map((question, index) => {
              const result = results?.responses.find(response => response.questionId === question.id);
              return (
                <li key={question.id} className="space-y-2 rounded-md border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-900">
                    {index + 1}. {question.instructions}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-slate-800">{question.prompt}</p>
                  <p className="text-xs text-slate-500">
                    {t('customPractice.targetRule')}: {question.targetRule}
                  </p>

                  {!results && (
                    <div>
                      <label htmlFor={`answer-${question.id}`} className="mb-1 block text-xs font-medium text-slate-600">
                        {t('customPractice.answerLabel')}
                      </label>
                      <textarea
                        id={`answer-${question.id}`}
                        value={answers[question.id] ?? ''}
                        onChange={event => setAnswers(current => ({ ...current, [question.id]: event.target.value }))}
                        rows={2}
                        className="w-full rounded-md border border-slate-300 p-2 text-sm focus:border-slate-500 focus:outline-none"
                      />
                    </div>
                  )}

                  {result && (
                    <div className={`space-y-1 rounded-md border p-2 text-sm ${verdictClass(result.verdict)}`}>
                      <p className="font-medium">
                        {t(`customPractice.verdict.${result.verdict}`)} · {result.awardedMarks}/{result.maxMarks}
                      </p>
                      <p>{result.rationale}</p>
                      {!result.needsReview && (
                        <p>
                          <span className="font-medium">{t('customPractice.referenceAnswer')}: </span>
                          {result.referenceAnswer}
                        </p>
                      )}
                      {result.acceptedAlternatives.length > 0 && (
                        <p>
                          <span className="font-medium">{t('customPractice.acceptedAlternatives')}: </span>
                          {result.acceptedAlternatives.join(' / ')}
                        </p>
                      )}
                      <p>
                        <span className="font-medium">{t('customPractice.explanation')}: </span>
                        {result.explanationEn}
                      </p>
                      {result.improvement && (
                        <p>
                          <span className="font-medium">{t('customPractice.improvement')}: </span>
                          {result.improvement}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          {!results && (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              {submitting ? t('customPractice.submitting') : t('customPractice.submit')}
            </button>
          )}
        </section>
      )}

      {results && (
        <section aria-labelledby="results-heading" className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 id="results-heading" className="text-base font-medium text-slate-900">
            {t('customPractice.resultsTitle')}
          </h2>
          <p className="text-sm font-medium text-slate-800">
            {t('customPractice.score', { awarded: results.awardedMarks, total: results.totalMarks })}
          </p>
          {results.overallFeedback && <p className="text-sm text-slate-700">{results.overallFeedback}</p>}
          {results.needsReviewCount > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
              {t('customPractice.needsReviewNote', { count: results.needsReviewCount })}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setSet(null);
              setResults(null);
              setMeta(null);
              setAnswers({});
              setErrorKind(null);
            }}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t('customPractice.again')}
          </button>
        </section>
      )}

      <section aria-labelledby="history-heading" className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 id="history-heading" className="text-base font-medium text-slate-900">
            {t('customPractice.historyTitle')}
          </h2>
          <button
            type="button"
            onClick={() => void loadHistory()}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            {t('customPractice.historyRefresh')}
          </button>
        </div>
        {historyLoaded && history.length === 0 && <p className="text-sm text-slate-500">{t('customPractice.historyEmpty')}</p>}
        <ul className="space-y-2">
          {history.map(item => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 p-2 text-sm">
              <span className="text-slate-800">
                {item.objective}
                <span className="ml-2 text-xs text-slate-500">
                  {item.submitted
                    ? `${t('customPractice.historyDone')} · ${item.awardedMarks ?? 0}/${item.totalMarks ?? 0}`
                    : t('customPractice.historyPending')}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void openSet(item.id)}
                className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
              >
                {t('customPractice.historyOpen')}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
