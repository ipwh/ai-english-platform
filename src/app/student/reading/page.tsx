// ============================================
// 學生端 — Reading Practice (DSE Paper 1)
// 閱讀理解：篇章 → 漸進式題目 (Literal → Inferential → Evaluative)
// ============================================
'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { BookOpen, Sparkles, Loader2, CheckCircle, XCircle, ChevronDown, ChevronUp, Target, Lightbulb } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/hooks/use-i18n';
import { getGradeLabel, getDifficultyLabel } from '@/shared/utils/nav';
import { layoutReadingText } from '@/modules/reading/layout';

interface ReadingPassage {
  title: string;
  content: string;
  wordCount: number;
  source?: string;
}

interface ReadingQuestion {
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
    | 'sentence_transformation';
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
      locatingClue?: string;
      evidenceSummary?: string;
      errorType?: string;
      improvementAdvice?: string;
      paraphraseAdvice?: string;
      grammarAdvice?: string;
      distractorNotes?: string[];
      confidence?: string;
    };
  };
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

export default function ReadingPracticePage() {
  const { language } = useAppStore();
  const { t } = useT();

  const [grade, setGrade] = useState<string>('S4');
  const [difficulty, setDifficulty] = useState<string>('core');
  const [topic, setTopic] = useState<string>('general');
  const [questionCount, setQuestionCount] = useState(6);

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
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024,
  );
  const readingPaneRef = useRef<HTMLDivElement | null>(null);
  const [paneWidth, setPaneWidth] = useState<number>(0);

  // Phase 1C.1: Viewport bucket tracking (coarse, debounced)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setWindowWidth(window.innerWidth), 200);
    };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); clearTimeout(timer); };
  }, []);

  // Phase 1C.1: Pane-based width for fine-grained reading measure
  useEffect(() => {
    if (!readingPaneRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setPaneWidth(entry.contentRect.width);
    });
    observer.observe(readingPaneRef.current);
    return () => observer.disconnect();
  }, []);

  /** Phase 1C.1: Coarse device bucket from viewport width */
  function getViewportMode(width: number): 'mobile' | 'tablet' | 'desktop' {
    if (width >= 1280) return 'desktop';
    if (width >= 768) return 'tablet';
    return 'mobile';
  }

  /** Phase 1C.1: Fine-grained chars-per-line using pane width within the bucket */
  function getPreferredCharsPerLine(params: {
    viewportMode: 'mobile' | 'tablet' | 'desktop';
    paneWidth?: number;
  }): number {
    const { viewportMode, paneWidth } = params;
    if (viewportMode === 'mobile') return 42;
    if (viewportMode === 'tablet') return 58;
    // Desktop: shrink within the 60-66 band based on actual pane width
    if (paneWidth && paneWidth < 760) return 60;
    return 66;
  }

  const isSplitView = windowWidth >= 1024;

  // Layout engine: stable width model — pane-aware, no fluid reflow drift
  const passageLayout = useMemo(() => {
    if (!data?.passage?.content) return null;
    const mode = getViewportMode(windowWidth);
    const preferredChars = getPreferredCharsPerLine({ viewportMode: mode, paneWidth });
    return layoutReadingText(data.passage.content, {
      viewportMode: mode,
      fixedReadingMeasure: true,
      preferredCharsPerLine: preferredChars,
      maxCharsPerLine: preferredChars,
      lineNumberInterval: 5,
      showParagraphLabels: true,
      paragraphLabelMode: 'numeric',
      lineNumberStyle: 'gutter',
    });
  }, [data?.passage?.content, windowWidth, paneWidth]);

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
      answers: data.questions.map((q, i) => ({
        questionIndex: i,
        studentAnswer: answers[i]?.answer || '',
        correctAnswer: q.answer,
        isCorrect: answers[i]?.isCorrect || false,
        questionPrompt: q.question,
        dseType: q.dseType,
        marks: q.marks,
      })),
    };

    fetch('/api/practice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(practicePayload),
    }).catch(() => { /* silent — practice save is non-critical */ });
  }, [answers, data, difficulty]);

  async function generate() {
    setLoading(true); setError('');
    savedRef.current = false;
    try {
      const res = await fetch('/api/reading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradeLevel: grade, difficulty, topic, questionCount }),
      });
      const json = await res.json();
      if (res.ok) {
        setData(json);
        setAnswers({});
        setSeqOrders({});
        setEvaluatingAI(new Set());
      } else {
        setError(json.error || 'Generation failed');
      }
    } catch {
      setError(language === 'en' ? 'Network error' : '網絡錯誤');
    } finally {
      setLoading(false);
    }
  }

  const [evaluatingAI, setEvaluatingAI] = useState<Set<number>>(new Set());

  // Sequencing order tracking
  const [seqOrders, setSeqOrders] = useState<Record<number, string[]>>({});

  /** Phase 2A: Only truly objective types get local grading */
  function shouldUseApiEvaluation(q: ReadingQuestion): boolean {
    if (q.dseType === 'multiple_choice') return false;
    if (q.dseType === 'true_false_not_given') return false;
    return true;
  }

  function submitAnswer(qIndex: number, answer: string) {
    if (!data) return;
    const q = data.questions[qIndex];
    const needsApi = shouldUseApiEvaluation(q);

    // Sequencing: compare order strings (always local)
    if (q.type === 'mc' && q.answer.includes(',') && /order|arrange|sequence|chronolog|sort|ranking/i.test(q.question)) {
      const normalizeOrder = (s: string) => s.toUpperCase().replace(/\s+/g, '').replace(/,/g, ',');
      const studentOrder = normalizeOrder(answer);
      const correctOrder = normalizeOrder(q.answer);
      const isCorrect = studentOrder === correctOrder;

      setAnswers(prev => ({
        ...prev,
        [qIndex]: {
          answer,
          submitted: true,
          isCorrect,
          isPartiallyCorrect: false,
          score: isCorrect ? 1 : 0,
          maxScore: 1,
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

    // MCQ/TFNG (objective types): instant local grading
    if (!needsApi && q.type === 'mc' && q.choices && q.choices.length > 0) {
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
          score: isCorrect ? 1 : 0,
          maxScore: 1,
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
        maxScore: 1,
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
        questions: [{
          index: qIndex,
          type: q.type === 'short-answer' ? 'shortAnswer' : q.type,
          questionText: q.question,
          answer: q.answer,
          marks: 1,
        }],
        studentAnswers: { [qIndex]: answer },
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
                score: analysis.score ?? (analysis.isCorrect ? 1 : 0),
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
  const totalMaxScore = data ? data.questions.length : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
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
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-gray-500">{language === 'en' ? 'Questions' : '題數'}</label>
            <input type="range" min={3} max={10} value={questionCount} onChange={e => setQuestionCount(Number(e.target.value))}
              className="flex-1 accent-indigo-500" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{questionCount}</span>
          </div>
          <button onClick={generate} disabled={loading}
            className="w-full py-3 bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? (language === 'en' ? 'Generating...' : '生成中...') : (language === 'en' ? 'Generate Reading Task' : '生成閱讀練習')}
          </button>
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
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
                grid-template-columns: minmax(420px, 52rem) minmax(380px, 1fr);
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
              max-width: 72ch;
              margin: 0 auto;
            }

            .dse-reading-layout {
              max-width: 72ch;
              display: flex;
              flex-direction: column;
              gap: 0.35rem;
            }

            .dse-paragraph {
              display: flex;
              flex-direction: column;
              gap: 0.1rem;
              margin-bottom: 0.5rem;
            }

            .dse-line {
              display: grid;
              grid-template-columns: 2.75rem 1fr;
              column-gap: 0.5rem;
              align-items: start;
              margin: 0;
              padding: 0;
            }

            .dse-line-gutter {
              margin: 0;
              padding: 0.05rem 0 0 0;
              text-align: right;
              line-height: 1.75;
              font-size: 0.75rem;
              font-family: ui-monospace, monospace;
              color: #9ca3af;
              user-select: none;
            }

            .dse-line-number {
              font-variant-numeric: tabular-nums;
            }

            .dse-line-text {
              margin: 0;
              padding: 0;
              line-height: 1.75;
              white-space: pre-wrap;
              word-break: normal;
            }

            .dse-line-text > span,
            .dse-paragraph-label {
              line-height: inherit;
            }

            .dse-paragraph-label {
              font-weight: 600;
              margin-right: 0.5rem;
              color: #374151;
            }

            .dark .dse-line-gutter { color: #6b7280; }
            .dark .dse-paragraph-label { color: #d1d5db; }
          `}</style>

          <div className="reading-workspace">
            {/* Left pane: Reading Passage */}
            <div className="reading-pane" ref={readingPaneRef}>
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border overflow-hidden">
            <button
              onClick={() => setShowPassage(!showPassage)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-500" />
                <span className="font-semibold text-gray-900 dark:text-white">{data.passage.title}</span>
                <span className="text-xs text-gray-400">({data.passage.wordCount} words)</span>
              </div>
              {showPassage ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {showPassage && (
              <div className="px-4 pb-4">
                {passageLayout ? (
                  <div className="reading-passage-shell bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6 text-sm text-gray-800 dark:text-gray-200"
                    dangerouslySetInnerHTML={{ __html: passageLayout.html }}
                  />
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {data.passage.content}
                  </div>
                )}
                {data.passage.source && (
                  <p className="text-xs text-gray-400 mt-2 italic">Source: {data.passage.source}</p>
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

                  {/* Sprint 102.5: Sequencing / Ordering questions — render number dropdowns */}
                  {q.type === 'mc' && q.choices && q.answer.includes(',') &&
                   /order|arrange|sequence|chronolog|sort|ranking/i.test(q.question) && (
                    <div className="space-y-2">
                      {q.choices.map((choice, ci) => {
                        const letter = String.fromCharCode(65 + ci);
                        const cleanChoice = choice.replace(/^[A-D][.)\s]+/, '').trim();
                        const displayText = cleanChoice || `Option ${letter}`;
                        const currentVal = (seqOrders[qi] || [])[ci] || '';
                        return (
                          <div key={ci} className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-400 w-6">{letter}.</span>
                            <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{displayText}</span>
                            <select
                              className="w-16 p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-sm"
                              disabled={ans?.submitted}
                              value={currentVal}
                              onChange={e => {
                                const newOrder = [...(seqOrders[qi] || new Array(q.choices!.length).fill(''))];
                                newOrder[ci] = e.target.value;
                                setSeqOrders(prev => ({ ...prev, [qi]: newOrder }));
                              }}
                            >
                              <option value="">-</option>
                              {q.choices!.map((_, oi) => (
                                <option key={oi} value={String.fromCharCode(65 + oi)}>{oi + 1}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                      {!ans?.submitted && (
                        <button
                          className="mt-2 w-full px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors"
                          onClick={() => {
                            const order = (seqOrders[qi] || []).filter(Boolean).join(',');
                            if (order) submitAnswer(qi, order);
                          }}
                        >
                          {language === 'en' ? 'Submit Order' : '提交排序'}
                        </button>
                      )}
                    </div>
                  )}

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
                              {ans.diagnostic.verdict && (
                                <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${
                                  ans.diagnostic.verdict === 'correct' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                  ans.diagnostic.verdict === 'partially_correct' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                }`}>
                                  {ans.diagnostic.verdict.replace(/_/g, ' ')}
                                </span>
                              )}
                            </p>
                            {ans.diagnostic.skillTarget && (
                              <p className="text-amber-600 dark:text-amber-400">
                                <span className="font-medium">{language === 'en' ? 'Skill: ' : '技能：'}</span>
                                {ans.diagnostic.skillTarget}
                              </p>
                            )}
                            {ans.diagnostic.locatingClue && (
                              <p className="text-amber-600 dark:text-amber-400">
                                <span className="font-medium">{language === 'en' ? '📍 Locating clue: ' : '📍 定位提示：'}</span>
                                {ans.diagnostic.locatingClue}
                              </p>
                            )}
                            {ans.diagnostic.errorType && (
                              <p className="text-red-600 dark:text-red-400">
                                <span className="font-medium">{language === 'en' ? '⚠️ Issue: ' : '⚠️ 問題：'}</span>
                                {ans.diagnostic.errorType.replace(/_/g, ' ')}
                              </p>
                            )}
                            {ans.diagnostic.improvementAdvice && (
                              <p className="text-green-700 dark:text-green-400">
                                <span className="font-medium">{language === 'en' ? '💡 Improvement: ' : '💡 改進：'}</span>
                                {ans.diagnostic.improvementAdvice}
                              </p>
                            )}
                            {ans.diagnostic.paraphraseAdvice && (
                              <p className="text-amber-600 dark:text-amber-400">
                                <span className="font-medium">{language === 'en' ? '📝 Paraphrase: ' : '📝 改寫：'}</span>
                                {ans.diagnostic.paraphraseAdvice}
                              </p>
                            )}
                            {ans.diagnostic.grammarAdvice && (
                              <p className="text-amber-600 dark:text-amber-400">
                                <span className="font-medium">{language === 'en' ? '📐 Grammar: ' : '📐 文法：'}</span>
                                {ans.diagnostic.grammarAdvice}
                              </p>
                            )}
                            {ans.diagnostic.distractorNotes && ans.diagnostic.distractorNotes.length > 0 && (
                              <div>
                                <p className="font-medium text-amber-600 dark:text-amber-400">
                                  {language === 'en' ? '🎯 Distractor notes:' : '🎯 干擾項分析：'}
                                </p>
                                {ans.diagnostic.distractorNotes.map((note: string, di: number) => (
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
                                <span className="text-indigo-400 font-medium">中文: </span>
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
              <button onClick={() => { setData(null); setAnswers({}); setSeqOrders({}); setEvaluatingAI(new Set()); savedRef.current = false; }}
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
