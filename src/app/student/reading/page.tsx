// ============================================
// 學生端 — Reading Practice (DSE Paper 1)
// 閱讀理解：篇章 → 漸進式題目 (Literal → Inferential → Evaluative)
// ============================================
'use client';

import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from 'react';
import { BookOpen, Sparkles, Loader2, CheckCircle, XCircle, ChevronDown, ChevronUp, Target, Lightbulb } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { persistWithRetry } from '@/shared/utils/persistence-helper';
import { getGradeLabel, getDifficultyLabel } from '@/shared/utils/nav';
import { layoutReadingText } from '@/modules/reading/layout';
import VocabEnabledText from '@/modules/vocabulary/components/VocabEnabledText';

interface ReadingPassage {
  title: string;
  content: string;
  wordCount: number;
  source?: string;
}

interface ReadingQuestion {
  /**
   * R3.1: RUNTIME question identity assigned by /api/reading when the
   * questions were generated. Stable for this response→submission round
   * trip, but NOT a durable domain identity (questions are ephemeral).
   */
  id?: string;
  index: number;
  tier: 'literal' | 'inferential' | 'evaluative';
  paragraphRef?: number;
  question: string;
  questionZh?: string;
  type: 'mc' | 'short-answer' | string;
  /** Phase 1B: Preserved DSE question type (snake_case) */
  dseType?:
    | 'multiple_choice'
    | 'true_false_not_given'
    | 'reference'
    | 'vocabulary_in_context'
    | 'inference'
    | 'tone_attitude'
    | 'summary_cloze'
    | 'sentence_transformation'
    // 2026-09-17 (fix B): extraction / matching / ordering questions are no
    // longer degraded to sentence_transformation.
    | 'short_answer';
  /** DSE marks for this question (default 1) */
  marks?: number;
  /** DSE word limit string, e.g. "ONE word", "no more than THREE words" */
  wordLimit?: string;
  /** Alternative acceptable answers */
  acceptAlso?: string[];
  /** Paragraphs this question covers */
  paragraphCoverage?: number[];
  /** Whether this question requires whole-text understanding */
  wholeText?: boolean;
  choices?: string[];
  answer: string;
  explanationZh?: string;
  explanationEn?: string;
}

interface ReadingData {
  passage: ReadingPassage;
  vocabularyHints?: { word: string; meaningZh: string }[];
  questions: ReadingQuestion[];
}

interface AnswerState {
  [questionIndex: number]: {
    answer: string;
    submitted: boolean;
    isCorrect?: boolean;
    isPartiallyCorrect?: boolean;
    score?: number;
    maxScore?: number;
    feedbackZh?: string;
    feedbackEn?: string;
    diagnostic?: {
      verdict: string;
      skillTarget: string;
      skillTargetZh?: string;
      locatingClue?: string;
      locatingClueZh?: string;
      evidenceSummary?: string;
      evidenceSummaryZh?: string;
      errorType?: string;
      improvementAdvice?: string;
      improvementAdviceZh?: string;
      paraphraseAdvice?: string;
      paraphraseAdviceZh?: string;
      grammarAdvice?: string;
      grammarAdviceZh?: string;
      distractorNotes?: string[];
      distractorNotesZh?: string[];
      confidence?: string;
      /**
       * 2026-09-17 (fix E): quality notes on a CORRECT answer. Informational
       * only — the verdict badge mirrors the score shown above.
       */
      qualityFlags?: string[];
      qualityAdvice?: string;
      qualityAdviceZh?: string;
    };
  };
}

/**
 * 2026-09-17 (fix E): the diagnostic badge must show the SAME verdict as the
 * score above it. The scorer's answer state is authoritative; the rule-based
 * diagnostic block only annotates it.
 */
function diagnosticVerdict(a: {
  isCorrect?: boolean;
  isPartiallyCorrect?: boolean;
  diagnostic?: { verdict?: string };
}): 'correct' | 'partially_correct' | 'incorrect' {
  if (a.isCorrect) return 'correct';
  if (a.isPartiallyCorrect) return 'partially_correct';
  if (a.diagnostic?.verdict === 'partially_correct') return 'partially_correct';
  return 'incorrect';
}

const VERDICT_STYLES: Record<string, string> = {
  correct: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  partially_correct: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  incorrect: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const VERDICT_LABELS: Record<string, { zh: string; en: string }> = {
  correct: { zh: '正確', en: 'Correct' },
  partially_correct: { zh: '部分正確', en: 'Partially correct' },
  incorrect: { zh: '不正確', en: 'Incorrect' },
};

/** Fix E: localized badge text for the authoritative verdict. */
function diagnosisVerdictLabel(
  a: {
    isCorrect?: boolean;
    isPartiallyCorrect?: boolean;
    diagnostic?: { verdict?: string };
  },
  language: 'en' | 'zh',
): string {
  const label = VERDICT_LABELS[diagnosticVerdict(a)] ?? VERDICT_LABELS.incorrect;
  return language === 'en' ? label.en : label.zh;
}

/** 2026-09-17 (fix E): codes no longer leak as English snake_case in zh mode. */
const DIAGNOSIS_LABELS: Record<string, { zh: string; en: string }> = {
  missed_keyword: { zh: '未對應題目關鍵詞', en: 'missed keyword' },
  missed_contrast: { zh: '忽略對比關係', en: 'missed contrast' },
  missed_negation: { zh: '忽略否定詞', en: 'missed negation' },
  wrong_reference: { zh: '前詞判斷錯誤', en: 'wrong reference' },
  paraphrase_too_close: { zh: '改寫不足（太接近原文）', en: 'paraphrase too close' },
  paraphrase_too_far: { zh: '改寫偏離原意', en: 'paraphrase too far' },
  tone_too_vague: { zh: '語調描述太籠統', en: 'tone too vague' },
  pos_mismatch: { zh: '詞性不符', en: 'part of speech mismatch' },
  grammar_mismatch: { zh: '詞形文法不符', en: 'grammar mismatch' },
  incomplete_answer: { zh: '答案不完整', en: 'incomplete answer' },
  distractor_trap: { zh: '落入干擾項陷阱', en: 'distractor trap' },
  unsupported_inference: { zh: '推論缺乏文本支持', en: 'unsupported inference' },
};

function diagnosisLabel(code: string, language: 'en' | 'zh'): string {
  const label = DIAGNOSIS_LABELS[code];
  if (!label) return code.replace(/_/g, ' ');
  return language === 'en' ? label.en : label.zh;
}

const GRADES = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] as const;
const DIFFICULTIES = [
  { value: 'remedial', zh: '補底', en: 'Remedial' },
  { value: 'core', zh: '核心', en: 'Core' },
  { value: 'challenge', zh: '挑戰', en: 'Challenge' },
] as const;
const TOPICS = [
  { value: 'general', zh: '綜合', en: 'General' },
  { value: 'science', zh: '科學', en: 'Science' },
  { value: 'society', zh: '社會', en: 'Society' },
  { value: 'environment', zh: '環境', en: 'Environment' },
  { value: 'technology', zh: '科技', en: 'Technology' },
] as const;

/** Phase 4D.3: Map structured API errors to user-friendly messages */
function mapReadingApiError(
  status: number,
  payload: Record<string, unknown> | undefined,
  language: 'en' | 'zh',
): { message: string; recoverable: boolean; code?: string; debugInfo?: string } {
  const code = typeof payload?.code === 'string' ? payload.code : undefined;
  const recoverable = Boolean(payload?.recoverable);
  const details = typeof payload?.details === 'string' ? payload.details : undefined;

  if (status === 422) {
    switch (code) {
      case 'PASSAGE_TOO_SHORT':
        return { code, recoverable: true, debugInfo: details, message: language === 'en'
          ? 'The system did not generate a passage long enough. Please try again.'
          : '系統暫時未生成足夠長的篇章，請再試一次。' };
      case 'PASSAGE_TOO_LONG':
        return { code, recoverable: true, debugInfo: details, message: language === 'en'
          ? 'The generated passage exceeded the length limit. Please try again.'
          : '生成的篇章超出長度限制，請再試一次。' };
      case 'PARAGRAPH_COUNT_INVALID':
        return { code, recoverable: true, debugInfo: details, message: language === 'en'
          ? 'The passage paragraph count is outside the DSE range (3-5). Please try again.'
          : '篇章段落數超出 DSE 範圍（3-5 段），請再試一次。' };
      case 'MALFORMED_AI_OUTPUT':
        return { code, recoverable: true, debugInfo: details, message: language === 'en'
          ? 'The system could not generate valid reading content. Please try again.'
          : '系統暫時未能生成有效內容，請再試一次。' };
      case 'EMPTY_PAPER':
        return { code, recoverable: true, debugInfo: details, message: language === 'en'
          ? 'The system did not generate a complete reading task. Please generate again.'
          : '系統未生成完整閱讀內容，請重新生成。' };
      case 'AI_PROVIDER_ERROR':
        return { code, recoverable: true, debugInfo: details, message: language === 'en'
          ? 'The AI service is temporarily busy. Please wait a moment and try again.'
          : 'AI 服務暫時繁忙，請稍候再試。' };
      default:
        return { code, recoverable, debugInfo: details, message: language === 'en'
          ? 'The request was understood, but the content could not be processed. Please try again.'
          : '系統收到請求，但未能處理內容，請重試。' };
    }
  }

  return { code, recoverable: false, debugInfo: details, message: language === 'en'
    ? 'A system error occurred. Please try again later.'
    : '系統暫時發生錯誤，請稍後再試。' };
}

/**
 * Phase 4E: render one layout line's text with target phrases wrapped in
 * <strong class="dse-target-phrase"> — mirrors the old string-regex
 * highlighting but as React nodes, so the passage is rendered as structured
 * elements and can never be replaced via innerHTML (which destroys any
 * in-progress text selection).
 */
function renderHighlightedLine(lineText: string, targets: string[]): ReactNode {
  if (!targets.length) return lineText;
  const lower = lineText.toLowerCase();
  const segments: ReactNode[] = [];
  let cursor = 0;
  let segKey = 0;
  while (cursor < lineText.length) {
    let matchStart = -1;
    let matchLength = 0;
    for (const phrase of targets) {
      const idx = lower.indexOf(phrase.toLowerCase(), cursor);
      if (idx !== -1 && (matchStart === -1 || idx < matchStart)) {
        matchStart = idx;
        matchLength = phrase.length;
      }
    }
    if (matchStart === -1) {
      segments.push(lineText.slice(cursor));
      break;
    }
    if (matchStart > cursor) segments.push(lineText.slice(cursor, matchStart));
    segments.push(
      <strong key={segKey++} className="dse-target-phrase">
        {lineText.slice(matchStart, matchStart + matchLength)}
      </strong>,
    );
    cursor = matchStart + matchLength;
  }
  return segments;
}

export default function ReadingPracticePage() {
  const { language } = useAppStore();
  const authStore = useAuthStore();

  const [grade, setGrade] = useState<string>('S4');
  const [difficulty, setDifficulty] = useState<string>('core');
  const [topic, setTopic] = useState<string>('general');

  // Auto-load grade from student profile
  useEffect(() => {
    fetch('/api/auth/profile')
      .then(r => r.json())
      .then(data => {
        const studentLevel = data?.user?.level || data?.user?.class?.gradeLevel;
        if (studentLevel && ['S1','S2','S3','S4','S5','S6'].includes(studentLevel)) {
          setGrade(studentLevel);
        }
      })
      .catch(() => { /* silent */ });
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<ReadingData | null>(null);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [showVocab, setShowVocab] = useState(false);
  const [showPassage, setShowPassage] = useState(true);
  const [showQuestionZh, setShowQuestionZh] = useState(false);
  const savedRef = useRef(false);
  const readingSubmissionIdRef = useRef('');
  const pendingPracticePayloadRef = useRef<Record<string, unknown> | null>(null);
  const [saveError, setSaveError] = useState('');
  const [savingPractice, setSavingPractice] = useState(false);
  /**
   * Layout params captured ONCE per generated passage, measured via callback
   * ref when the passage card mounts (before paint). The passage is re-chunked
   * ONLY when a new passage is generated — never on resize or orientation
   * changes. This keeps DSE line numbers stable and guarantees the passage
   * DOM is never replaced while the student is selecting text (a mid-selection
   * innerHTML swap made the browser re-anchor the selection at the start of
   * the first paragraph).
   */
  const [layoutParams, setLayoutParams] = useState<{
    viewportMode: 'mobile' | 'tablet' | 'desktop';
    paneWidth: number;
  } | null>(null);

  const measureReadingPane = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const width = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const mode: 'mobile' | 'tablet' | 'desktop' =
      width >= 1280 ? 'desktop' : width >= 768 ? 'tablet' : 'mobile';
    setLayoutParams({ viewportMode: mode, paneWidth: el.getBoundingClientRect().width });
  }, []);

  const saveReadingPractice = useCallback(async (payload: Record<string, unknown>): Promise<boolean> => {
    setSavingPractice(true);
    const outcome = await persistWithRetry(() =>
      fetch('/api/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );
    setSavingPractice(false);
    if (!outcome.ok) {
      setSaveError(language === 'en'
        ? 'Your reading result has not been saved. Please retry saving it.'
        : '閱讀結果尚未儲存，請重試儲存。');
      return false;
    }
    setSaveError('');
    return true;
  }, [language]);

  /** Phase 4D.3: Granular chars-per-line tiers for student split-view.
   *  mobile≈44, tablet≈64, narrow desktop≈68, medium desktop≈72, wide desktop≈76. */
  function getPreferredCharsPerLine(params: {
    viewportMode: 'mobile' | 'tablet' | 'desktop';
    paneWidth?: number;
  }): number {
    const { viewportMode, paneWidth } = params;
    if (viewportMode === 'mobile') return 44;
    if (viewportMode === 'tablet') return 64;
    // Desktop: three granular tiers
    if (!paneWidth || paneWidth < 640) return 68;   // narrow pane
    if (paneWidth < 860) return 72;                  // medium pane
    return 76;                                        // wide pane
  }

  // Stable references for memo dependencies (avoid optional chaining in deps
  // — React Compiler cannot match inferred vs source dependencies for those).
  const passageContent = data?.passage?.content;
  const questions = data?.questions;

  // Layout engine: computed once per generated passage from locked layout
  // params. Rendered as keyed React elements (NOT dangerouslySetInnerHTML) so
  // no re-render can ever replace the passage DOM and destroy a text selection.
  const passageLayout = useMemo(() => {
    if (!passageContent || !layoutParams) return null;
    const mode = layoutParams.viewportMode;
    const preferredChars = getPreferredCharsPerLine({ viewportMode: mode, paneWidth: layoutParams.paneWidth });
    return layoutReadingText(passageContent, {
      viewportMode: mode,
      fixedReadingMeasure: true,
      preferredCharsPerLine: preferredChars,
      maxCharsPerLine: preferredChars,
      lineNumberInterval: 5,
      showParagraphLabels: true,
      paragraphLabelMode: 'numeric',
      lineNumberStyle: 'gutter',
    });
  }, [passageContent, layoutParams]);

  /**
   * Phase 4E: Highlight target phrases from questions in the passage.
   * Extracts key terms (targetPhrase, quoted phrases) and wraps them in
   * <strong> tags for DSE exam-like keyword emphasis.
   */
  const targetPhrases = useMemo(() => {
    const targets = new Set<string>();
    if (questions && questions.length > 0) {
      for (const q of questions) {
        // Collect from targetPhrase field (may exist on raw API response)
        const rawQ = q as unknown as Record<string, unknown>;
        if (typeof rawQ.targetPhrase === 'string') {
          targets.add((rawQ.targetPhrase as string).trim());
        }
        // Collect quoted phrases from question text
        const quotedMatches = q.question.match(/['\u2018\u2019\u201C\u201D]([^'\u2018\u2019\u201C\u201D]{3,40})['\u2018\u2019\u201C\u201D]/g);
        if (quotedMatches) {
          for (const m of quotedMatches) {
            targets.add(m.replace(/['\u2018\u2019\u201C\u201D]/g, '').trim());
          }
        }
      }
    }
    return [...targets].filter(p => p.length >= 3);
  }, [questions]);

  // Passage body as keyed React elements — never replaced via innerHTML.
  const passageBody = passageLayout ? (
    <>
      {passageLayout.paragraphs.map((para) => (
        <div
          key={para.paragraphIndex}
          className="dse-paragraph"
          data-paragraph={para.paragraphIndex}
          data-paragraph-label={para.label}
        >
          {para.lines.length > 0 && para.lines[0].isParagraphStart && (
            <div className="dse-paragraph-label">
              [{para.label.replace(/Paragraph\s*/i, '')}]
            </div>
          )}
          {para.lines.map((line) => (
            <div key={line.lineIndex} className="dse-line">
              <div className="dse-line-gutter">{line.lineNumber ?? ''}</div>
              <div className="dse-line-text">
                <span>{renderHighlightedLine(line.text, targetPhrases)}</span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  ) : null;

  // ══════════════════════════════════════════
  // Question distribution check — warns when questions cluster in one paragraph
  // ══════════════════════════════════════════
  const paragraphDistribution = useMemo(() => {
    if (!questions) return null;
    const counts: Record<number, number> = {};
    const total = questions.length;
    for (const q of questions) {
      const refs = q.paragraphRef ? [q.paragraphRef] : q.paragraphCoverage || [];
      for (const ref of refs) {
        counts[ref] = (counts[ref] || 0) + 1;
      }
    }
    const paras = Object.keys(counts).map(Number).sort((a, b) => a - b);
    if (paras.length === 0) return null;
    const maxCount = Math.max(...Object.values(counts));
    const maxParas = paras.filter(p => counts[p] === maxCount);
    const uncovered = paras.length > 0
      ? Array.from({ length: Math.max(...paras) }, (_, i) => i + 1).filter(p => !(p in counts))
      : [];
    const isImbalanced = maxCount > Math.ceil(total / paras.length) + 1 || uncovered.length > 0;
    return { counts, total, paras, maxCount, maxParas, uncovered, isImbalanced };
  }, [questions]);

  // Persist score when all questions are answered
  useEffect(() => {
    if (!data || savedRef.current) return;
    const allAnswered = data.questions.every((_, i) => answers[i]?.submitted);
    if (!allAnswered) return;

    savedRef.current = true;
    const correctCount = Object.values(answers).filter(a => a.isCorrect).length;

    const practicePayload = {
      studentId: useAuthStore.getState().userId,
      skill: 'reading',
      skillZh: 'DSE 閱讀模擬',
      difficulty,
      totalQuestions: data.questions.length,
      correctCount: Object.values(answers).filter(a => a.isCorrect).length,
      totalScore: Object.values(answers).reduce((s, a) => s + (a.score ?? (a.isCorrect ? 1 : 0)), 0),
      source: 'dse-reading',
      clientSubmissionId: readingSubmissionIdRef.current,
      answers: data.questions.map((q, i) => ({
        questionId: q.id,
        questionIndex: i,
        studentAnswer: answers[i]?.answer || '',
        correctAnswer: q.answer,
        isCorrect: answers[i]?.isCorrect || false,
        questionPrompt: q.question,
        dseType: q.dseType,
        marks: q.marks,
        // R3.2: preserve the reading evaluator's actual scoring verbatim.
        // NO fallback inference: if score/maxScore were absent, the API
        // boundary rejects the submission loudly instead of inventing 1s.
        result: answers[i]?.isPartiallyCorrect
          ? 'partial'
          : answers[i]?.isCorrect ? 'correct' : 'incorrect',
        awardedScore: answers[i]?.score,
        maxScore: answers[i]?.maxScore,
        countsTowardScore: true,
      })),
    };
    pendingPracticePayloadRef.current = practicePayload;
    void saveReadingPractice(practicePayload).then(saved => {
      if (!saved) savedRef.current = false;
    });
  }, [answers, data, difficulty, saveReadingPractice]);

  const retryPracticeSave = useCallback(() => {
    const payload = pendingPracticePayloadRef.current;
    if (!payload || savingPractice) return;
    savedRef.current = true;
    void saveReadingPractice(payload).then(saved => {
      if (!saved) savedRef.current = false;
    });
  }, [saveReadingPractice, savingPractice]);

  async function generate() {
    setLoading(true); setError('');
    savedRef.current = false;
    try {
      const res = await fetch('/api/reading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradeLevel: grade, difficulty, topic, questionCount: 10 }),
      });
      const json = await res.json();
      if (res.ok) {
        setData(json);
        setAnswers({});
        setEvaluatingAI(new Set());
        setError('');
        setSaveError('');
        pendingPracticePayloadRef.current = null;
        readingSubmissionIdRef.current = `reading-${crypto.randomUUID()}`;
      } else {
        const mapped = mapReadingApiError(res.status, json, language === 'en' ? 'en' : 'zh');
        const retryHint = mapped.recoverable
          ? (language === 'en'
              ? ' You can press "Generate Reading Task" to try again.'
              : ' 你可以直接按「生成閱讀練習」再試一次。')
          : '';
        const debugSuffix = mapped.debugInfo
          ? (language === 'en'
              ? ` [Debug: ${mapped.debugInfo.slice(0, 500)}]`
              : ` [除錯：${mapped.debugInfo.slice(0, 500)}]`)
          : '';
        setError(mapped.message + retryHint + debugSuffix);
      }
    } catch {
      setError(language === 'en' ? 'Network error' : '網絡錯誤');
    } finally {
      setLoading(false);
    }
  }

  const [evaluatingAI, setEvaluatingAI] = useState<Set<number>>(new Set());

  /** Phase 2A: Only truly objective types get local grading */
  function shouldUseApiEvaluation(q: ReadingQuestion): boolean {
    if (q.dseType === 'multiple_choice') return false;
    if (q.dseType === 'true_false_not_given') return false;
    // mcCloze / summary_cloze with letter answers are also objective
    if (q.choices && q.choices.length > 0 && /^[A-D]$/i.test(q.answer?.trim())) return false;
    return true;
  }

  function submitAnswer(qIndex: number, answer: string) {
    if (!data) return;
    const q = data.questions[qIndex];
    const needsApi = shouldUseApiEvaluation(q);

    // MCQ/TFNG / mcCloze with choices (objective types): instant local grading
    if (!needsApi && q.choices && q.choices.length > 0) {
      const studentLetter = answer.trim().toUpperCase().charAt(0);
      const correctLetter = extractMcqLetter(q.answer, q.choices);
      const isCorrect = studentLetter === correctLetter;

      setAnswers(prev => ({
        ...prev,
        [qIndex]: {
          answer,
          submitted: true,
          isCorrect,
          isPartiallyCorrect: false,
          // 2026-08-29 audit: honour per-question marks (was hardcoded 1/1).
          score: isCorrect ? (q.marks ?? 1) : 0,
          maxScore: q.marks ?? 1,
          feedbackEn: isCorrect
            ? '✅ Correct! See explanation below for details.'
            : `❌ Incorrect. The correct answer is: ${q.answer}. See explanation below.`,
          feedbackZh: isCorrect
            ? '✅ 正確！請參閱下方解釋。'
            : `❌ 不正確。正確答案是：${q.answer}。請參閱下方解釋。`,
        },
      }));
      return;
    }

    // Phase 2A: Semi-subjective types — ALWAYS use API, never optimistic local grading
    setAnswers(prev => ({
      ...prev,
      [qIndex]: {
        answer,
        submitted: true,
        isCorrect: false,
        isPartiallyCorrect: false,
        score: 0,
        maxScore: data.questions[qIndex].marks ?? 1,
        feedbackEn: '⏳ Evaluating with AI...',
        feedbackZh: '⏳ 正在用AI評分...',
        diagnostic: undefined,
      },
    }));

    setEvaluatingAI(prev => new Set(prev).add(qIndex));
    fetch('/api/reading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'analyze-answers',
        // R3.9: 只送持久化題目 id — 答案鍵 / marks / 題型一律由伺服器
        // 從 ReadingQuestion 解析（客戶端元資料不作數）。
        questionIds: [data.questions[qIndex].id],
        studentAnswers: { 0: answer },
        passageContent: data.passage.content,
      }),
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(result => {
        const analysis = result.analyses?.[0];
        const diagnostic = result.diagnostics?.[0];
        if (analysis) {
          setAnswers(prev => {
            if (!prev[qIndex]) return prev;
            return {
              ...prev,
              [qIndex]: {
                ...prev[qIndex],
                isCorrect: analysis.isCorrect,
                isPartiallyCorrect: analysis.isPartiallyCorrect,
                score: analysis.score ?? 0,
                maxScore: analysis.maxMarks ?? 1,
                feedbackEn: analysis.feedbackEn || prev[qIndex].feedbackEn,
                feedbackZh: analysis.feedbackZh || prev[qIndex].feedbackZh,
                diagnostic,
              },
            };
          });
        }
      })
      .catch(() => {
        setAnswers(prev => ({
          ...prev,
          [qIndex]: {
            ...prev[qIndex],
            feedbackEn: '❌ AI evaluation unavailable.',
            feedbackZh: '❌ AI 評估暫時無法使用。',
          },
        }));
      })
      .finally(() => {
        setEvaluatingAI(prev => {
          const next = new Set(prev);
          next.delete(qIndex);
          return next;
        });
      });
  }

  function getTierBadge(tier: string) {
    switch (tier) {
      case 'literal': return { zh: '事實', en: 'Literal', color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' };
      case 'inferential': return { zh: '推理', en: 'Inferential', color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' };
      case 'evaluative': return { zh: '評價', en: 'Evaluative', color: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' };
      default: return { zh: tier, en: tier, color: '' };
    }
  }

  /**
   * Extract the MCQ letter (A/B/C/D) from an answer that may be:
   * - Just a letter: "C"
   * - Full choice text: "C. It is a complex mental activity."
   * - Choice text without prefix: "It is a complex mental activity."
   * Falls back to finding which choice matches the answer text.
   */
  function extractMcqLetter(answer: string, choices: string[]): string {
    const trimmed = answer.trim();
    // If answer is a single letter A-D
    if (/^[A-D]$/i.test(trimmed)) return trimmed.toUpperCase();
    // If answer starts with a letter prefix like "C." or "C)"
    const prefixMatch = trimmed.match(/^([A-D])[.)\s]/i);
    if (prefixMatch) return prefixMatch[1].toUpperCase();
    // Try matching the answer text against each choice
    const lowerAnswer = trimmed.toLowerCase().replace(/^[A-D][.)\s]+/i, '').trim();
    for (let i = 0; i < choices.length; i++) {
      const cleanChoice = choices[i].replace(/^[A-D][.)\s]+/, '').trim().toLowerCase();
      if (cleanChoice === lowerAnswer) return String.fromCharCode(65 + i);
    }
    // Last resort: partial match
    for (let i = 0; i < choices.length; i++) {
      const cleanChoice = choices[i].replace(/^[A-D][.)\s]+/, '').trim().toLowerCase();
      if (cleanChoice.includes(lowerAnswer) || lowerAnswer.includes(cleanChoice)) {
        return String.fromCharCode(65 + i);
      }
    }
    return trimmed.charAt(0).toUpperCase(); // fallback to first char
  }

  const totalScore = data ? Object.values(answers).reduce((sum, a) => sum + (a.score ?? (a.isCorrect ? 1 : 0)), 0) : 0;
  // 2026-08-29 audit: total available marks = sum of per-question marks
  // (was data.questions.length — misreported the denominator for 2m/3m items).
  const totalMaxScore = data ? data.questions.reduce((sum, q) => sum + (q.marks ?? 1), 0) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="w-6 h-6" /> {language === 'en' ? 'Reading Practice' : '閱讀理解練習'}
        </h1>
        <p className="text-indigo-100 text-sm mt-1">
          {language === 'en' ? 'DSE Paper 1 — Progressive Reading Comprehension' : 'DSE Paper 1 — 漸進式閱讀理解'}
        </p>
      </div>

      {/* Config */}
      {!data && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'en' ? 'Grade' : '年級'}</label>
              <div className="flex flex-wrap gap-1">
                {GRADES.map(g => (
                  <button key={g} onClick={() => setGrade(g)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${grade === g ? 'bg-indigo-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                    {getGradeLabel(g, language)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'en' ? 'Difficulty' : '難度'}</label>
              <div className="flex flex-wrap gap-1">
                {DIFFICULTIES.map(d => (
                  <button key={d.value} onClick={() => setDifficulty(d.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${difficulty === d.value ? 'bg-indigo-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                    {getDifficultyLabel(d.value, language)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'en' ? 'Topic' : '主題'}</label>
            <div className="flex flex-wrap gap-1">
              {TOPICS.map(tp => (
                <button key={tp.value} onClick={() => setTopic(tp.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${topic === tp.value ? 'bg-indigo-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                  {language === 'en' ? tp.en : tp.zh}
                </button>
              ))}
            </div>
          </div>
          <button onClick={generate} disabled={loading}
            className="w-full py-3 bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? (language === 'en' ? 'Generating...' : '生成中...') : (language === 'en' ? 'Generate Reading Task' : '生成閱讀練習')}
          </button>
          {error && <p className="text-sm text-red-500 text-center whitespace-pre-wrap break-all">{error}</p>}
        </div>
      )}

      {/* Reading Passage + Questions */}
      {data && (
        <>
          {/* Phase 1C: Split-view CSS + stable alignment */}
          <style>{`
            .reading-workspace {
              display: grid;
              grid-template-columns: 1fr;
              gap: 1.5rem;
            }

            @media (min-width: 1024px) {
              .reading-workspace {
                grid-template-columns: 1.6fr 1fr;
                gap: 1.5rem;
                align-items: start;
              }
            }

            .reading-pane {
              min-width: 0;
            }

            .questions-pane {
              min-width: 0;
            }

            @media (min-width: 1024px) {
              .questions-pane {
                position: sticky;
                top: 1rem;
                max-height: calc(100vh - 2rem);
                overflow-y: auto;
              }
            }

            .reading-passage-shell {
              width: 100%;
              padding: 1.25rem 2rem;
            }

            .dse-paragraph {
              display: block;
              margin-bottom: 0.6rem;
            }

            .dse-paragraph-label {
              font-weight: 600;
              font-size: 0.75rem;
              color: #6b7280;
              font-family: ui-monospace, monospace;
              margin-bottom: 0.15rem;
              /* Align with text column (past gutter) */
              padding-left: calc(2.5rem + 0.625rem);
            }

            /*
             * v6: block rows with a floated gutter instead of display:grid.
             * The text column is a single block per line, which avoids
             * Chromium grid/flex item-boundary selection quirks and keeps
             * word-level highlighting reliable on desktop and mobile. The
             * floated gutter stays pinned to the FIRST visual row even when a
             * line chunk wraps on narrow screens.
             */
            .dse-line {
              display: block;
              margin: 0;
              padding: 0;
            }

            .dse-line-gutter {
              float: left;
              width: 2.5rem;
              text-align: right;
              line-height: 1.45;
              font-size: 0.7rem;
              font-family: ui-monospace, monospace;
              color: #9ca3af;
              user-select: none;
              -webkit-user-select: none;
              font-variant-numeric: tabular-nums;
            }

            .dse-line-text {
              display: block;
              margin-left: calc(2.5rem + 0.625rem);
              margin-top: 0;
              margin-bottom: 0;
              padding: 0;
              line-height: 1.45;
              text-align: justify;
              user-select: text;
              -webkit-user-select: text;
            }

            .dse-line-text > span {
              line-height: inherit;
            }

            .dse-target-phrase {
              font-weight: 600;
              color: #1e40af;
              background: #dbeafe;
              padding: 0 0.125rem;
              border-radius: 0.125rem;
            }

            .dark .dse-target-phrase {
              color: #93c5fd;
              background: #1e3a5f;
            }
            .dark .dse-line-gutter { color: #6b7280; }
            .dark .dse-paragraph-label { color: #9ca3af; }
          `}</style>

          <div className="reading-workspace">
            {/* Left pane: Reading Passage */}
            <div className="reading-pane" ref={measureReadingPane}>
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border overflow-hidden">
            <button
              onClick={() => setShowPassage(!showPassage)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-500" />
                <span className="font-semibold text-gray-900 dark:text-white">{data.passage.title}</span>
                <span className="text-xs text-gray-400">({data.passage.wordCount} {language === 'en' ? 'words' : '字'})</span>
              </div>
              {showPassage ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {showPassage && (
              <div className="px-0 pb-2">
                {passageBody ? (
                  authStore.userId ? (
                    <VocabEnabledText
                      studentId={authStore.userId}
                      gradeLevel={grade}
                      className="reading-passage-shell bg-gray-50 dark:bg-gray-700/50 rounded-xl text-sm text-gray-800 dark:text-gray-200"
                    >
                      {passageBody}
                    </VocabEnabledText>
                  ) : (
                    <div className="reading-passage-shell bg-gray-50 dark:bg-gray-700/50 rounded-xl text-sm text-gray-800 dark:text-gray-200">
                      {passageBody}
                    </div>
                  )
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap text-justify" style={{ textIndent: '2em' }}>
                    {data.passage.content}
                  </div>
                )}
                {data.passage.source && (
                  <p className="text-xs text-gray-400 mt-2 italic">{language === 'en' ? 'Source' : '來源'}：{data.passage.source}</p>
                )}
              </div>
            )}
          </div>
            </div>{/* End reading-pane */}

            {/* Right pane: Questions */}
            <div className="questions-pane">

          {/* Vocabulary Hints */}
          {data.vocabularyHints && data.vocabularyHints.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border overflow-hidden">
              <button
                onClick={() => setShowVocab(!showVocab)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-yellow-500" />
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {language === 'en' ? 'Vocabulary Hints' : '詞彙提示'} ({data.vocabularyHints.length})
                  </span>
                </div>
                {showVocab ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>
              {showVocab && (
                <div className="px-4 pb-4 flex flex-wrap gap-2">
                  {data.vocabularyHints.map((v, i) => (
                    <span key={i} className="px-2.5 py-1 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-xs border border-yellow-200 dark:border-yellow-800">
                      <span className="font-semibold text-yellow-800 dark:text-yellow-300">{v.word}</span>
                      <span className="text-yellow-600 dark:text-yellow-400 ml-1">— {v.meaningZh}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Questions */}
          <div className="space-y-3">
            {/* Global zh toggle */}
            <div className="flex justify-end">
              <button
                onClick={() => setShowQuestionZh(!showQuestionZh)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-500 transition-colors"
              >
                {showQuestionZh ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {language === 'en' ? 'Show Chinese' : '顯示中文翻譯'}
              </button>
            </div>
            {/* Phase 4F: Paragraph distribution warning */}
            {paragraphDistribution?.isImbalanced && (
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 border border-amber-200 dark:border-amber-800 text-xs space-y-1">
                <p className="font-semibold text-amber-700 dark:text-amber-300">
                  ⚠️ {language === 'en' ? 'Uneven paragraph coverage' : '段落分佈不均'}
                </p>
                {paragraphDistribution.maxCount > Math.ceil(paragraphDistribution.total / paragraphDistribution.paras.length) + 1 && (
                  <p className="text-amber-600 dark:text-amber-400">
                    {language === 'en'
                      ? `Paragraph${paragraphDistribution.maxParas.length > 1 ? 's' : ''} ${paragraphDistribution.maxParas.join(', ')} ${paragraphDistribution.maxParas.length > 1 ? 'have' : 'has'} ${paragraphDistribution.maxCount} questions — too many for one paragraph.`
                      : `第 ${paragraphDistribution.maxParas.join('、')} 段各有 ${paragraphDistribution.maxCount} 題，過於集中。`}
                  </p>
                )}
                {paragraphDistribution.uncovered.length > 0 && (
                  <p className="text-amber-600 dark:text-amber-400">
                    {language === 'en'
                      ? `Paragraph${paragraphDistribution.uncovered.length > 1 ? 's' : ''} ${paragraphDistribution.uncovered.join(', ')} ${paragraphDistribution.uncovered.length > 1 ? 'have' : 'has'} no questions.`
                      : `第 ${paragraphDistribution.uncovered.join('、')} 段沒有任何題目。`}
                  </p>
                )}
                <p className="text-amber-500 dark:text-amber-500 text-[10px]">
                  {language === 'en' ? 'Consider regenerating for better distribution.' : '建議重新生成以獲得更平均的分佈。'}
                </p>
              </div>
            )}
            {data.questions.map((q, qi) => {
              const tier = getTierBadge(q.tier);
              const ans = answers[qi];
              return (
                <div key={qi} className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-400">Q{qi + 1}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${tier.color}`}>
                        {language === 'en' ? tier.en : tier.zh}
                      </span>
                      {/* Phase 1B: DSE type badge */}
                      {q.dseType && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 font-medium">
                          {q.dseType.replace(/_/g, ' ')}
                        </span>
                      )}
                      {q.marks !== undefined && q.marks > 0 && (
                        <span className="text-[10px] text-gray-400 font-mono">{q.marks}m</span>
                      )}
                      {q.wordLimit && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">{q.wordLimit}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {q.wholeText && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                          {language === 'en' ? 'Whole Text' : '全文'}
                        </span>
                      )}
                      {q.paragraphRef ? (
                        <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
                          <BookOpen className="w-3 h-3" />
                          {language === 'en' ? `Para ${q.paragraphRef}` : `第 ${q.paragraphRef} 段`}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-sm text-gray-900 dark:text-white">{q.question}</p>
                  {showQuestionZh && q.questionZh && <p className="text-xs text-gray-500">{q.questionZh}</p>}

                  {/* Sprint 102.5 (removed 2026-08-30 audit R8): sequencing dropdown
                      was unreachable — the server delivers sequencing questions as
                      short-answer (dseType sentence_transformation), never as
                      type 'mc' with comma answers. Server-side sequencing scoring
                      remains live in reading-answer-scoring for legacy rows. */}

                  {q.type === 'mc' && q.choices && !(q.answer.includes(',') &&
                   /order|arrange|sequence|chronolog|sort|ranking/i.test(q.question)) && (
                    <div className="space-y-1.5">
                      {q.choices.map((choice, ci) => {
                        const letter = String.fromCharCode(65 + ci);
                        const isSelected = ans?.answer === letter;
                        const correctLetter = extractMcqLetter(q.answer, q.choices || []);
                        const isCorrectChoice = letter === correctLetter;
                        // Strip any A. B. C. D. prefix that survived API processing
                        const cleanChoice = choice.replace(/^[A-D][.)\s]+/, '').trim();
                        const displayText = cleanChoice || `Option ${letter}`;
                        let cls = 'w-full text-left p-2.5 rounded-lg text-sm border transition-colors appearance-none ';
                        if (ans?.submitted) {
                          if (isCorrectChoice) cls += 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700';
                          else if (isSelected && !isCorrectChoice) cls += 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700';
                          else cls += 'border-gray-200 dark:border-gray-700 text-gray-400';
                        } else {
                          cls += 'border-gray-200 dark:border-gray-700 hover:border-indigo-400 active:bg-indigo-50 text-gray-700 dark:text-gray-300';
                        }
                        return (
                          <button key={ci} className={cls}
                            onClick={() => !ans?.submitted && submitAnswer(qi, letter)}
                            disabled={ans?.submitted}
                            type="button">
                            <span className="font-semibold mr-2">{letter}.</span>
                            {displayText}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Fallback: MC type but no choices provided — render as short-answer */}
                  {q.type === 'mc' && (!q.choices || q.choices.length === 0) && (
                    <div>
                      <input
                        type="text"
                        className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-sm"
                        placeholder={language === 'en' ? 'Type your answer...' : '輸入你的答案...'}
                        disabled={ans?.submitted}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !ans?.submitted) {
                            submitAnswer(qi, (e.target as HTMLInputElement).value);
                          }
                        }}
                      />
                      {!ans?.submitted && (
                        <button
                          className="mt-2 px-4 py-1.5 bg-indigo-500 text-white rounded-lg text-xs"
                          onClick={(e) => {
                            const input = (e.target as HTMLElement).previousElementSibling as HTMLInputElement;
                            if (input) submitAnswer(qi, input.value);
                          }}
                        >
                          {language === 'en' ? 'Submit' : '提交'}
                        </button>
                      )}
                    </div>
                  )}

                  {q.type === 'short-answer' && (
                    <div>
                      <input
                        type="text"
                        className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-sm"
                        placeholder={language === 'en' ? 'Type your answer...' : '輸入你的答案...'}
                        disabled={ans?.submitted}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !ans?.submitted) {
                            submitAnswer(qi, (e.target as HTMLInputElement).value);
                          }
                        }}
                      />
                      {!ans?.submitted && (
                        <button
                          className="mt-2 px-4 py-1.5 bg-indigo-500 text-white rounded-lg text-xs"
                          onClick={(e) => {
                            const input = (e.target as HTMLElement).previousElementSibling as HTMLInputElement;
                            if (input) submitAnswer(qi, input.value);
                          }}
                        >
                          {language === 'en' ? 'Submit' : '提交'}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Fallback for other types with choices (matching, etc.) */}
                  {q.type !== 'mc' && q.type !== 'short-answer' && q.choices && q.choices.length > 0 && (
                    <div className="space-y-1.5">
                      {q.choices.map((choice, ci) => {
                        const letter = String.fromCharCode(65 + ci);
                        const isSelected = ans?.answer === letter;
                        const correctLetter = extractMcqLetter(q.answer, q.choices || []);
                        const isCorrectChoice = letter === correctLetter;
                        const cleanChoice = choice.replace(/^[A-D][.)\s]+/, '').trim();
                        const displayText = cleanChoice || `Option ${letter}`;
                        let cls = 'w-full text-left p-2.5 rounded-lg text-sm border transition-colors appearance-none ';
                        if (ans?.submitted) {
                          if (isCorrectChoice) cls += 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700';
                          else if (isSelected && !isCorrectChoice) cls += 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700';
                          else cls += 'border-gray-200 dark:border-gray-700 text-gray-400';
                        } else {
                          cls += 'border-gray-200 dark:border-gray-700 hover:border-indigo-400 active:bg-indigo-50 text-gray-700 dark:text-gray-300';
                        }
                        return (
                          <button key={ci} className={cls}
                            onClick={() => !ans?.submitted && submitAnswer(qi, letter)}
                            disabled={ans?.submitted}
                            type="button">
                            <span className="font-semibold mr-2">{letter}.</span>
                            {displayText}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Fallback for other types without choices (text input) */}
                  {q.type !== 'mc' && q.type !== 'short-answer' && (!q.choices || q.choices.length === 0) && (
                    /^[A-D]$/i.test(q.answer?.trim()) ? (
                      /* Letter answer without rendered choices — show a hint suggesting retry */
                      <div>
                        <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                          {language === 'en'
                            ? '⚠️ This question expects a multiple-choice answer. If you see a text box, please regenerate.'
                            : '⚠️ 此題目為選擇題。如只看見文字輸入框，請重新生成。'}
                        </p>
                        <input
                          type="text"
                          className="w-full p-2.5 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-sm"
                          placeholder={language === 'en' ? 'Type A, B, C, or D...' : '輸入 A、B、C 或 D...'}
                          disabled={ans?.submitted}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !ans?.submitted) {
                              submitAnswer(qi, (e.target as HTMLInputElement).value.toUpperCase().charAt(0));
                            }
                          }}
                        />
                        {!ans?.submitted && (
                          <button
                            className="mt-2 px-4 py-1.5 bg-amber-500 text-white rounded-lg text-xs"
                            onClick={(e) => {
                              const input = (e.target as HTMLElement).previousElementSibling as HTMLInputElement;
                              if (input) submitAnswer(qi, input.value.toUpperCase().charAt(0));
                            }}
                          >
                            {language === 'en' ? 'Submit' : '提交'}
                          </button>
                        )}
                      </div>
                    ) : (
                    <div>
                      <input
                        type="text"
                        className="w-full p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-sm"
                        placeholder={language === 'en' ? 'Type your answer...' : '輸入你的答案...'}
                        disabled={ans?.submitted}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !ans?.submitted) {
                            submitAnswer(qi, (e.target as HTMLInputElement).value);
                          }
                        }}
                      />
                      {!ans?.submitted && (
                        <button
                          className="mt-2 px-4 py-1.5 bg-indigo-500 text-white rounded-lg text-xs"
                          onClick={(e) => {
                            const input = (e.target as HTMLElement).previousElementSibling as HTMLInputElement;
                            if (input) submitAnswer(qi, input.value);
                          }}
                        >
                          {language === 'en' ? 'Submit' : '提交'}
                        </button>
                      )}
                    </div>
                  ))}

                  {ans?.submitted && (
                    <div className={`flex items-start gap-2 text-sm ${
                      evaluatingAI.has(qi) ? 'text-amber-600' :
                      ans.isPartiallyCorrect ? 'text-amber-600' :
                      ans.isCorrect ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {evaluatingAI.has(qi) ? <Loader2 className="w-4 h-4 mt-0.5 animate-spin" /> :
                       ans.isPartiallyCorrect ? <Sparkles className="w-4 h-4 mt-0.5" /> :
                       ans.isCorrect ? <CheckCircle className="w-4 h-4 mt-0.5" /> :
                       <XCircle className="w-4 h-4 mt-0.5" />}
                      <div>
                        {!ans.isCorrect && !evaluatingAI.has(qi) && (
                          <>
                            <p className="font-medium">
                              {language === 'en' ? 'Correct answer: ' : '正確答案：'}{q.answer}
                            </p>
                            {(ans.score ?? 0) > 0 && (
                              <p className="text-amber-600 text-xs font-medium">
                                {language === 'en' ? `Partial credit: ${ans.score}/${ans.maxScore ?? 1}` : `部分分數：${ans.score}/${ans.maxScore ?? 1}`}
                              </p>
                            )}
                          </>
                        )}
                        {/* AI feedback or explanation */}
                        {ans.feedbackEn && (
                          <p className="text-gray-600 dark:text-gray-400 text-xs mt-1">
                            {language === 'en' ? ans.feedbackEn : (ans.feedbackZh || ans.feedbackEn)}
                          </p>
                        )}
                        {/* Phase 2B: Diagnostic feedback */}
                        {ans.diagnostic && !ans.feedbackEn?.includes('⏳') && (
                          <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 text-xs space-y-1">
                            <p className="font-semibold text-amber-700 dark:text-amber-300">
                              🔍 {language === 'en' ? 'Diagnostic Feedback' : '診斷回饋'}
                              {/* Fix E: mirrors the score above — never a second opinion. */}
                              <span
                                className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${
                                  VERDICT_STYLES[diagnosticVerdict(ans)] ?? VERDICT_STYLES.incorrect
                                }`}
                              >
                                {diagnosisVerdictLabel(ans, language)}
                              </span>
                            </p>
                            {ans.diagnostic.skillTarget && (
                              <p className="text-amber-600 dark:text-amber-400">
                                <span className="font-medium">{language === 'en' ? 'Skill: ' : '技能：'}</span>
                                {language === 'en'
                                  ? ans.diagnostic.skillTarget
                                  : (ans.diagnostic.skillTargetZh || ans.diagnostic.skillTarget)}
                              </p>
                            )}
                            {ans.diagnostic.locatingClue && (
                              <p className="text-amber-600 dark:text-amber-400">
                                <span className="font-medium">{language === 'en' ? '📍 Locating clue: ' : '📍 定位提示：'}</span>
                                {language === 'en'
                                  ? ans.diagnostic.locatingClue
                                  : (ans.diagnostic.locatingClueZh || ans.diagnostic.locatingClue)}
                              </p>
                            )}
                            {ans.diagnostic.evidenceSummary && (
                              <p className="text-amber-600 dark:text-amber-400">
                                <span className="font-medium">{language === 'en' ? '🔎 Evidence: ' : '🔎 證據：'}</span>
                                {language === 'en'
                                  ? ans.diagnostic.evidenceSummary
                                  : (ans.diagnostic.evidenceSummaryZh || ans.diagnostic.evidenceSummary)}
                              </p>
                            )}
                            {ans.diagnostic.errorType && (
                              <p className="text-red-600 dark:text-red-400">
                                <span className="font-medium">{language === 'en' ? '⚠️ Issue: ' : '⚠️ 問題：'}</span>
                                {diagnosisLabel(ans.diagnostic.errorType, language)}
                              </p>
                            )}
                            {ans.diagnostic.qualityFlags && ans.diagnostic.qualityFlags.length > 0 && (
                              <p className="text-amber-700 dark:text-amber-300">
                                <span className="font-medium">{language === 'en' ? '📝 Quality note: ' : '📝 品質提示：'}</span>
                                {ans.diagnostic.qualityFlags.map(f => diagnosisLabel(f, language)).join(language === 'en' ? ', ' : '、')}
                              </p>
                            )}
                            {ans.diagnostic.improvementAdvice && (
                              <p className="text-green-700 dark:text-green-400">
                                <span className="font-medium">{language === 'en' ? '💡 Improvement: ' : '💡 改進：'}</span>
                                {language === 'en'
                                  ? ans.diagnostic.improvementAdvice
                                  : (ans.diagnostic.improvementAdviceZh || ans.diagnostic.improvementAdvice)}
                              </p>
                            )}
                            {ans.diagnostic.paraphraseAdvice && (
                              <p className="text-amber-600 dark:text-amber-400">
                                <span className="font-medium">{language === 'en' ? '📝 Paraphrase: ' : '📝 改寫：'}</span>
                                {language === 'en'
                                  ? ans.diagnostic.paraphraseAdvice
                                  : (ans.diagnostic.paraphraseAdviceZh || ans.diagnostic.paraphraseAdvice)}
                              </p>
                            )}
                            {ans.diagnostic.grammarAdvice && (
                              <p className="text-amber-600 dark:text-amber-400">
                                <span className="font-medium">{language === 'en' ? '📐 Grammar: ' : '📐 文法：'}</span>
                                {language === 'en'
                                  ? ans.diagnostic.grammarAdvice
                                  : (ans.diagnostic.grammarAdviceZh || ans.diagnostic.grammarAdvice)}
                              </p>
                            )}
                            {ans.diagnostic.qualityAdvice && (
                              <p className="text-green-700 dark:text-green-400">
                                <span className="font-medium">{language === 'en' ? '✅ Quality: ' : '✅ 品質：'}</span>
                                {language === 'en'
                                  ? ans.diagnostic.qualityAdvice
                                  : (ans.diagnostic.qualityAdviceZh || ans.diagnostic.qualityAdvice)}
                              </p>
                            )}
                            {ans.diagnostic.distractorNotes && ans.diagnostic.distractorNotes.length > 0 && (
                              <div>
                                <p className="font-medium text-amber-600 dark:text-amber-400">
                                  {language === 'en' ? '🎯 Distractor notes:' : '🎯 干擾項分析：'}
                                </p>
                                {(language === 'en' ? ans.diagnostic.distractorNotes : (ans.diagnostic.distractorNotesZh || ans.diagnostic.distractorNotes)).map((note: string, di: number) => (
                                  <p key={di} className="text-amber-600 dark:text-amber-400 ml-2">• {note}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {/* Always show passage-based explanation (bilingual) */}
                        {(q.explanationEn || q.explanationZh) && (
                          <div className="mt-2 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800">
                            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1">
                              {language === 'en' ? '📖 Explanation / 解釋' : '📖 解釋 / Explanation'}
                            </p>
                            {q.explanationEn && (
                              <p className="text-xs text-gray-700 dark:text-gray-300 mb-1">
                                <span className="text-indigo-400 font-medium">EN: </span>
                                {q.explanationEn}
                              </p>
                            )}
                            {q.explanationZh && (
                              <p className="text-xs text-gray-700 dark:text-gray-300">
                                <span className="text-indigo-400 font-medium">{language === 'en' ? 'ZH: ' : '中文: '}</span>
                                {q.explanationZh}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Score Summary */}
          {data && Object.keys(answers).length === data.questions.length && Object.values(answers).every(a => a.submitted) && (
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white text-center">
              <Target className="w-10 h-10 mx-auto mb-2" />
              <p className="text-2xl font-bold">{totalScore} / {totalMaxScore}</p>
              <p className="text-indigo-100 text-sm">
                {language === 'en' ? 'Reading Score' : '閱讀成績'} — {Math.round((totalScore / totalMaxScore) * 100)}%
              </p>
              {saveError && (
                <div className="mt-3 rounded-lg bg-white/15 p-3 text-sm text-left">
                  <p>{saveError}</p>
                  <button
                    onClick={retryPracticeSave}
                    disabled={savingPractice}
                    className="mt-2 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 disabled:opacity-60"
                  >
                    {savingPractice
                      ? (language === 'en' ? 'Saving...' : '儲存中...')
                      : (language === 'en' ? 'Retry Save' : '重試儲存')}
                  </button>
                </div>
              )}
              <button onClick={() => { setData(null); setAnswers({}); setEvaluatingAI(new Set()); savedRef.current = false; }}
                className="mt-3 px-4 py-2 bg-white text-indigo-600 rounded-lg text-sm font-medium">
                {language === 'en' ? 'New Reading' : '新閱讀練習'}
              </button>
            </div>
          )}
            </div>{/* End questions-pane */}
          </div>{/* End reading-workspace */}
        </>
      )}
    </div>
  );
}
