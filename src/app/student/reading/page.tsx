// ============================================
// 學生端 — Reading Practice (DSE Paper 1)
// 閱讀理解：篇章 → 漸進式題目 (Literal → Inferential → Evaluative)
// ============================================
'use client';

import { useState, useEffect, useRef } from 'react';
import { BookOpen, Sparkles, Loader2, CheckCircle, XCircle, ChevronDown, ChevronUp, Target, Lightbulb } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/hooks/use-i18n';

interface ReadingPassage {
  title: string;
  content: string;
  wordCount: number;
  source?: string;
}

interface ReadingQuestion {
  index: number;
  tier: 'literal' | 'inferential' | 'evaluative';
  paragraphRef: number;
  question: string;
  questionZh?: string;
  type: 'mc' | 'short-answer';
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
  };
}

const GRADES = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] as const;
const DIFFICULTIES = [
  { value: 'remedial', zh: '基礎', en: 'Remedial' },
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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<ReadingData | null>(null);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [showVocab, setShowVocab] = useState(false);
  const [showPassage, setShowPassage] = useState(true);
  const [showQuestionZh, setShowQuestionZh] = useState(false);
  const savedRef = useRef(false);

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
      correctCount,
      source: 'dse-reading',
      answers: data.questions.map((q, i) => ({
        questionIndex: i,
        studentAnswer: answers[i]?.answer || '',
        correctAnswer: q.answer,
        isCorrect: answers[i]?.isCorrect || false,
        questionPrompt: q.question,
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
      } else {
        setError(json.error || 'Generation failed');
      }
    } catch {
      setError(language === 'en' ? 'Network error' : '網絡錯誤');
    } finally {
      setLoading(false);
    }
  }

  function submitAnswer(qIndex: number, answer: string) {
    if (!data) return;
    const q = data.questions[qIndex];
    const isCorrect = answer.trim().toLowerCase() === q.answer.trim().toLowerCase();
    setAnswers(prev => ({
      ...prev,
      [qIndex]: { answer, submitted: true, isCorrect },
    }));
  }

  function getTierBadge(tier: string) {
    switch (tier) {
      case 'literal': return { zh: '事實', en: 'Literal', color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' };
      case 'inferential': return { zh: '推理', en: 'Inferential', color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' };
      case 'evaluative': return { zh: '評價', en: 'Evaluative', color: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' };
      default: return { zh: tier, en: tier, color: '' };
    }
  }

  const totalScore = data ? Object.values(answers).filter(a => a.isCorrect).length : 0;

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
                    {g}
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
                    {language === 'en' ? d.en : d.zh}
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
          {/* Passage Card */}
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
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {data.passage.content}
                </div>
                {data.passage.source && (
                  <p className="text-xs text-gray-400 mt-2 italic">Source: {data.passage.source}</p>
                )}
              </div>
            )}
          </div>

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
                    </div>
                    <span className="text-xs text-gray-400">¶{q.paragraphRef}</span>
                  </div>
                  <p className="text-sm text-gray-900 dark:text-white">{q.question}</p>
                  {showQuestionZh && q.questionZh && <p className="text-xs text-gray-500">{q.questionZh}</p>}

                  {q.type === 'mc' && q.choices && (
                    <div className="space-y-1.5">
                      {q.choices.map((choice, ci) => {
                        const letter = String.fromCharCode(65 + ci);
                        const isSelected = ans?.answer === letter;
                        const isCorrect = letter === q.answer;
                        let cls = 'w-full text-left p-2.5 rounded-lg text-sm border transition-colors ';
                        if (ans?.submitted) {
                          if (isCorrect) cls += 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700';
                          else if (isSelected) cls += 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700';
                          else cls += 'border-gray-200 dark:border-gray-700 text-gray-400';
                        } else {
                          cls += 'border-gray-200 dark:border-gray-700 hover:border-indigo-400 text-gray-700 dark:text-gray-300';
                        }
                        return (
                          <button key={ci} className={cls}
                            onClick={() => !ans?.submitted && submitAnswer(qi, letter)}
                            disabled={ans?.submitted}>
                            <span className="font-semibold mr-2">{letter}.</span>
                            {choice.replace(/^[A-D][.)\s]+/, '')}
                          </button>
                        );
                      })}
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

                  {ans?.submitted && (
                    <div className={`flex items-start gap-2 text-sm ${ans.isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                      {ans.isCorrect ? <CheckCircle className="w-4 h-4 mt-0.5" /> : <XCircle className="w-4 h-4 mt-0.5" />}
                      <div>
                        {!ans.isCorrect && <p className="font-medium">{language === 'en' ? 'Correct:' : '正確答案：'} {q.answer}</p>}
                        <p className="text-gray-500 text-xs mt-1">
                          {language === 'en' ? q.explanationEn : (showQuestionZh ? q.explanationZh : q.explanationEn)}
                        </p>
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
              <p className="text-2xl font-bold">{totalScore} / {data.questions.length}</p>
              <p className="text-indigo-100 text-sm">
                {language === 'en' ? 'Reading Score' : '閱讀成績'} — {Math.round((totalScore / data.questions.length) * 100)}%
              </p>
              <button onClick={() => { setData(null); setAnswers({}); savedRef.current = false; }}
                className="mt-3 px-4 py-2 bg-white text-indigo-600 rounded-lg text-sm font-medium">
                {language === 'en' ? 'New Reading' : '新閱讀練習'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
