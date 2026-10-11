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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useT } from '@/hooks/use-i18n';
import {
  CUSTOM_PRACTICE_TOPIC_GROUPS,
  TOPIC_REQUEST_MAX_CHARS,
  composePracticeRequestPlan,
  topicQuestionTypeDefaults,
  type PracticeTopicCategory,
} from '@/shared/utils/custom-practice-topics';

type Category = 'grammar' | 'sentence_pattern' | 'vocabulary';
type Difficulty = 'basic' | 'intermediate' | 'advanced';
type QuestionType = 'mc' | 'fill_blank' | 'error_correction' | 'transformation' | 'sentence_production';
type ErrorKind = 'session' | 'rate' | 'category' | 'invalid' | 'quality' | 'verifier' | 'provider' | 'already' | 'generic' | null;

interface DeliveredQuestion {
  id: string;
  orderIndex: number;
  questionType: string;
  instructions: string;
  prompt: string;
  targetTopic: string;
  maxMarks: number;
}

interface MultipleChoiceOption {
  letter: string;
  text: string;
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
  /** Ticked question types no delivered item uses (empty in the normal case). */
  missingTypes?: string[];
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
  rationaleZh: string | null;
  referenceAnswer: string;
  acceptedAlternatives: string[];
  improvement: string | null;
  improvementZh: string | null;
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
  overallFeedbackZh: string | null;
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

function parseMultipleChoiceOptions(prompt: string): MultipleChoiceOption[] {
  const matches = [...prompt.matchAll(/(?:^|\s)([A-D])[).]\s+(.+?)(?=\s+[A-D][).]\s+|$)/g)];
  return matches.map(match => ({ letter: match[1], text: match[2].trim() }));
}

function multipleChoiceStem(prompt: string, options: readonly MultipleChoiceOption[]): string {
  if (options.length !== 4) return prompt;
  const firstOption = prompt.indexOf(`${options[0].letter})`);
  return firstOption > 0 ? prompt.slice(0, firstOption).trim() : prompt;
}

/**
 * 中英對照 feedback: the Traditional-Chinese line comes first (students with weaker
 * English study from it) and the English original follows, so the language being
 * learnt stays visible. Kept as two lines rather than one paragraph so a missing
 * translation degrades to English instead of leaving a gap in the sentence.
 */
function BilingualFeedback({ zh, en }: { zh: string | null; en: string }) {
  return (
    <div className="space-y-0.5">
      {zh && <p>{zh}</p>}
      <p className={zh ? 'text-slate-600' : undefined}>{en}</p>
    </div>
  );
}

/** Display label of a catalogue topic (module scope so the React Compiler can keep optimizing). */
function topicLabelForId(category: PracticeTopicCategory, id: string, language: string): string {
  const option = CUSTOM_PRACTICE_TOPIC_GROUPS[category]
    .flatMap(group => group.options)
    .find(item => item.id === id);
  if (!option) return id;
  return language === 'en' ? option.label : option.labelZh;
}

export default function CustomPracticePage() {
  const { t, language } = useT();
  const router = useRouter();

  const [requestText, setRequestText] = useState('');
  const [category, setCategory] = useState<Category | 'auto'>('auto');
  const [difficulty, setDifficulty] = useState<Difficulty>('intermediate');
  const [questionCount, setQuestionCount] = useState(5);
  const [types, setTypes] = useState<QuestionType[]>([]);
  /** Ticked topics of the chosen category (`CUSTOM_PRACTICE_TOPIC_GROUPS`). */
  const [topics, setTopics] = useState<string[]>([]);

  // What is actually sent to the server: ticked topics (canonical English names) first,
  // then the student's own words. Ticking alone is therefore enough to generate.
  // Memoized so the derived value is stable (the React Compiler requires manual
  // memoization dependencies to match what it infers — see eslint react-hooks/preserve-manual-memoization).
  const composed = useMemo(
    () =>
      composePracticeRequestPlan(
        requestText,
        category === 'auto' ? null : (category as PracticeTopicCategory),
        topics
      ),
    [requestText, category, topics]
  );
  const composedRequest = composed.text;

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

  // Session guard (found by the Sprint 142 browser test): this page is reachable
  // when a visitor has no session, and without a check they would see an empty form
  // with no explanation. The check sets NO state (only navigates), so it does not
  // consume the react-hooks/set-state-in-effect budget.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/custom-practice');
        if (!cancelled && response.status === 401) router.replace('/login');
      } catch {
        // Offline or transient failure: leave the form usable rather than bouncing
        // the student to the login page.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

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
          requestText: composedRequest,
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
      if (response.status === 400) {
        const body = (await response.json().catch(() => ({}))) as { code?: string };
        // CATEGORY_AMBIGUOUS means "we could not tell what you want"; INVALID_REQUEST
        // means the request itself was unusable (too short, out-of-range count…).
        // Both need a concrete, bilingual explanation — the generic "something went
        // wrong" left the student with no idea what to change (observed 2026-10-10).
        setErrorKind(body.code === 'CATEGORY_AMBIGUOUS' ? 'category' : 'invalid');
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
  }, [category, composedRequest, difficulty, generating, loadHistory, questionCount, types]);

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

  // 「練習歷史」以 `?set=<id>` 連到某一份自訂練習（2026-10-10）。以 window.location
  // 讀取而非 useSearchParams()：後者會令本頁必須加 Suspense 邊界才可建構。
  // 只執行一次（重新生成／重新載入不得被舊參數覆蓋）。
  const openedFromHistory = useRef(false);
  useEffect(() => {
    if (openedFromHistory.current) return;
    openedFromHistory.current = true;
    const setId = new URLSearchParams(window.location.search).get('set');
    if (!setId) return;
    // Deferred to the next task: `openSet` updates state, and React 19 forbids a
    // synchronous state update inside an effect (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => void openSet(setId), 0);
    return () => clearTimeout(timer);
  }, [openSet]);

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
      case 'category':
        return t('customPractice.error.category');
      case 'invalid':
        return t('customPractice.error.invalidRequest');
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
          {t('customPractice.requestSectionTitle')}
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
                  onChange={() => {
                    // Topics belong to a category: switching clears the selection so a
                    // ticked grammar topic can never leak into a vocabulary request.
                    setCategory(value);
                    setTopics([]);
                  }}
                />
                <span>{t(`customPractice.category.${value}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {category !== 'auto' && (
          <fieldset className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
            <legend className="text-sm font-medium text-slate-700">{t('customPractice.topicsLegend')}</legend>
            <p className="text-xs text-slate-500">{t('customPractice.topicsHint')}</p>
            <div className="space-y-3">
              {CUSTOM_PRACTICE_TOPIC_GROUPS[category].map(group => (
                <div key={group.id} className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-600">
                    {language === 'en' ? group.labelEn : group.labelZh}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {group.options.map(option => {
                      const selected = topics.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() =>
                            setTopics(current =>
                              current.includes(option.id)
                                ? current.filter(item => item !== option.id)
                                : [...current, option.id]
                            )
                          }
                          className={`rounded-full border px-3 py-1 text-xs ${
                            selected
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500'
                          }`}
                        >
                          {language === 'en' ? option.label : option.labelZh}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {t('customPractice.topicsCount', { count: topics.length, used: composedRequest.length, max: TOPIC_REQUEST_MAX_CHARS })}
            </p>
            {composed.omittedTopicIds.length > 0 && (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                {t('customPractice.topicsOmitted', {
                  count: composed.omittedTopicIds.length,
                  labels: composed.omittedTopicIds
                    .map(id => topicLabelForId(category, id, language))
                    .join(language === 'en' ? ', ' : '、'),
                })}
              </p>
            )}
          </fieldset>
        )}

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
          {category !== 'auto' && types.length === 0 && topics.length > 0 && (
            <p className="text-xs text-slate-500">
              {t('customPractice.typesAutoByTopic', {
                types: topicQuestionTypeDefaults(category, topics)
                  .map(type => t(`customPractice.type.${type}`))
                  .join(language === 'en' ? ', ' : '、'),
              })}
            </p>
          )}
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
          disabled={generating || composedRequest.trim().length < 3}
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

          {meta && (meta.missingTypes?.length ?? 0) > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
              {t('customPractice.missingTypes', {
                types: (meta.missingTypes ?? []).map(type => t(`customPractice.type.${type}`)).join(language === 'en' ? ', ' : '、'),
              })}
            </p>
          )}

          <p className="text-xs text-slate-500">{t('customPractice.verifiedNote')}</p>

          <ol className="space-y-4">
            {set.questions.map((question, index) => {
              const result = results?.responses.find(response => response.questionId === question.id);
              const isMultipleChoice = question.questionType === 'mc';
              const options = isMultipleChoice ? parseMultipleChoiceOptions(question.prompt) : [];
              const selectedAnswer = answers[question.id] ?? '';
              return (
                <li key={question.id} className="space-y-2 rounded-md border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-900">
                    {index + 1}. {question.instructions}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-slate-800">
                    {isMultipleChoice ? multipleChoiceStem(question.prompt, options) : question.prompt}
                  </p>
                  {!results && (
                    <p className="text-xs text-slate-500">
                      {t('customPractice.targetRule')}: {question.targetTopic}
                    </p>
                  )}

                  {!results && (
                    isMultipleChoice && options.length === 4 ? (
                      <fieldset className="space-y-2">
                        <legend className="mb-1 block text-xs font-medium text-slate-600">
                          {t('customPractice.answerLabel')}
                        </legend>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {options.map(option => {
                            const selected = selectedAnswer === option.letter;
                            return (
                              <button
                                key={option.letter}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => setAnswers(current => ({ ...current, [question.id]: option.letter }))}
                                className={`rounded-md border p-2 text-left text-sm ${
                                  selected
                                    ? 'border-slate-900 bg-slate-900 text-white'
                                    : 'border-slate-300 bg-white text-slate-800 hover:border-slate-500'
                                }`}
                              >
                                <span className="mr-2 font-semibold">{option.letter}.</span>
                                {option.text}
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>
                    ) : (
                      <div>
                        <label htmlFor={`answer-${question.id}`} className="mb-1 block text-xs font-medium text-slate-600">
                          {t('customPractice.answerLabel')}
                        </label>
                        <textarea
                          id={`answer-${question.id}`}
                          value={selectedAnswer}
                          onChange={event => setAnswers(current => ({ ...current, [question.id]: event.target.value }))}
                          rows={2}
                          className="w-full rounded-md border border-slate-300 p-2 text-sm focus:border-slate-500 focus:outline-none"
                        />
                      </div>
                    )
                  )}

                  {result && (
                    <div className={`space-y-1 rounded-md border p-2 text-sm ${verdictClass(result.verdict)}`}>
                      <p className="font-medium">
                        {t(`customPractice.verdict.${result.verdict}`)} · {result.awardedMarks}/{result.maxMarks}
                      </p>
                      <BilingualFeedback zh={result.rationaleZh} en={result.rationale} />
                      <p className="text-xs text-slate-600">
                        {t('customPractice.targetRule')}: {result.targetRule}
                      </p>
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
                      <div>
                        <p className="font-medium">{t('customPractice.explanation')}</p>
                        <BilingualFeedback zh={result.explanationZh} en={result.explanationEn} />
                      </div>
                      {result.improvement && (
                        <div>
                          <p className="font-medium">{t('customPractice.improvement')}</p>
                          <BilingualFeedback zh={result.improvementZh} en={result.improvement} />
                        </div>
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
          {results.overallFeedback && <BilingualFeedback zh={results.overallFeedbackZh} en={results.overallFeedback} />}
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
