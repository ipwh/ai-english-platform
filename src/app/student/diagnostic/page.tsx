// ============================================
// 學生端 — 診斷測試頁面
// 完整流程：AI 生成題目 → 逐題作答 → AI 分析報告
// ============================================
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle, BookOpen, Pencil, FileText, Sparkles, Loader2, Target } from 'lucide-react';
import ProgressBar from '@/components/shared/ProgressBar';
import SkillChip from '@/components/shared/SkillChip';
import type { PracticeQuestion } from '@/shared/types/types';
import { useT } from '@/hooks/use-i18n';
import { normalizeSkillName, buildWeakSkills } from '@/shared/utils/utils';
import type { PracticeSessionLite, MistakeLite, WeakSkill } from '@/shared/utils/utils';

const MCQ_LETTERS = ['A', 'B', 'C', 'D'] as const;

function getMcqLetterByIndex(index: number): string {
  return MCQ_LETTERS[index] || 'A';
}

function stripMcqPrefix(choice: string): string {
  return choice
    .trim()
    .replace(/^\s*\(?\s*(?:[A-Da-d]|[1-4]|T|F|True|False)\s*\)?\s*[\].:：)\-、]\s*/iu, '')
    .replace(/^\s*\(?\s*(?:[A-Da-d]|[1-4])\s*\)?\s+/u, '')
    .trim();
}

interface DiagnosticResult {
  id: string;
  label: string;
  score: number;
  level: string;
  suggestion: string;
}

interface PracticeRecommendation {
  grammarItem?: string;
  languageSkill?: string;
  difficulty: 'remedial' | 'core' | 'challenge';
  questionType: 'mc' | 'short-writing';
  questionCount: number;
  weakLabel: string;
}

interface StudentProfile {
  id: string;
  level?: string | null;
  streakDays?: number | null;
  class?: { gradeLevel?: string | null } | null;
}

interface DiagnosticPlan {
  grammarItem?: string;
  grammarItemZh?: string;
  languageSkill?: string;
  languageSkillZh?: string;
  questionType: 'mc' | 'short-writing';
  count: number;
  difficulty: 'remedial' | 'core' | 'challenge';
}

function getStudentLevel(profile: StudentProfile | null): string {
  return profile?.level || profile?.class?.gradeLevel || 'S4';
}

function buildDiagnosticPlans(level: string, weakSkills: WeakSkill[]): DiagnosticPlan[] {
  const overall = weakSkills.reduce((sum, item) => sum + item.accuracy, 0) / Math.max(1, weakSkills.length);
  const difficulty: 'remedial' | 'core' | 'challenge' = overall < 45 ? 'remedial' : overall < 75 ? 'core' : 'challenge';
  const weakest = weakSkills[0]?.name;
  const second = weakSkills[1]?.name;
  const junior = ['S1', 'S2', 'S3'].includes(level);

  const plans: DiagnosticPlan[] = [];

  if (weakest === 'grammar' || second === 'grammar') {
    plans.push({
      grammarItem: junior ? 'subject-verb-agreement' : 'tenses',
      grammarItemZh: junior ? '主謂一致' : '時態',
      questionType: 'mc',
      count: 3,
      difficulty,
    });
  }

  if (weakest === 'vocabulary' || second === 'vocabulary') {
    plans.push({
      grammarItem: 'phrasal-verbs',
      grammarItemZh: '詞彙搭配與片語動詞',
      questionType: 'mc',
      count: 2,
      difficulty,
    });
  }

  if (weakest === 'reading' || second === 'reading' || plans.length < 2) {
    plans.push({
      languageSkill: 'reading',
      languageSkillZh: '閱讀',
      questionType: 'mc',
      count: 2,
      difficulty,
    });
  }

  plans.push({
    languageSkill: 'writing',
    languageSkillZh: '寫作',
    questionType: 'short-writing',
    count: 1,
    difficulty: difficulty === 'challenge' ? 'core' : difficulty,
  });

  return plans.slice(0, 4);
}

function buildPracticeRecommendation(results: DiagnosticResult[], level: string): PracticeRecommendation {
  const weakest = [...results].sort((a, b) => a.score - b.score)[0] || results[0];
  const difficulty: 'remedial' | 'core' | 'challenge' = weakest.score < 50 ? 'remedial' : weakest.score < 75 ? 'core' : 'challenge';

  if (weakest?.id === 'reading') {
    return { languageSkill: 'reading', difficulty, questionType: 'mc', questionCount: 5, weakLabel: weakest.label };
  }
  if (weakest?.id === 'writing') {
    return { languageSkill: 'writing', difficulty: difficulty === 'challenge' ? 'core' : difficulty, questionType: 'short-writing', questionCount: 3, weakLabel: weakest.label };
  }
  if (weakest?.id === 'vocabulary') {
    return { grammarItem: 'phrasal-verbs', difficulty, questionType: 'mc', questionCount: 5, weakLabel: weakest.label };
  }

  const junior = ['S1', 'S2', 'S3'].includes(level);
  return {
    grammarItem: junior ? 'subject-verb-agreement' : 'tenses',
    difficulty,
    questionType: 'mc',
    questionCount: 5,
    weakLabel: weakest?.label || '文法',
  };
}

export default function DiagnosticPage() {
  const { t } = useT();
  const inputRef = useRef<HTMLInputElement>(null);

  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [weakSkills, setWeakSkills] = useState<WeakSkill[]>([]);
  const [recentPerformance, setRecentPerformance] = useState<{ date: string; accuracy: number; questionsDone: number }[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [genError, setGenError] = useState('');
  const [started, setStarted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [completed, setCompleted] = useState(false);
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState<string>('');
  const [writingAnswer, setWritingAnswer] = useState('');
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  /** 正規化文字以進行精確比對 */
  function normalizeAnswer(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/['']/g, "'").replace(/[""]/g, '"').replace(/[–—]/g, '-').replace(/[.!?,;:]$/g, '');
  }

  /** 智能答案比對（與練習頁面一致） */
  function checkAnswer(student: string, correct: string, type: string, choices?: string[]): boolean {
    if (type === 'mc') {
      const s = student.trim().toUpperCase();
      const c = correct.trim().toUpperCase();
      if (s === c) return true;
      const letterIdx = MCQ_LETTERS.indexOf(c as typeof MCQ_LETTERS[number]);
      if (choices && letterIdx >= 0 && letterIdx < choices.length) {
        if (normalizeAnswer(student) === normalizeAnswer(choices[letterIdx])) return true;
      }
      return false;
    }
    // short-writing: accept any non-empty answer (AI model answer won't match free text)
    if (type === 'short-writing') return student.trim().length > 0;
    // fill-blank: normalized comparison
    return normalizeAnswer(student) === normalizeAnswer(correct);
  }

  // 🔥 載入時根據學生年級與弱項自動生成診斷題目
  useEffect(() => {
    setLoadingQuestions(true);
    fetch('/api/auth/profile')
      .then(async profileRes => {
        const profileJson = await profileRes.json();
        if (!profileRes.ok || !profileJson.user?.id) throw new Error(profileJson.error || '未能取得學生資料');

        const profile = profileJson.user as StudentProfile;
        setStudentProfile(profile);
        const studentLevel = getStudentLevel(profile);

        const [practiceJson, mistakeJson] = await Promise.all([
          fetch(`/api/practice?studentId=${profile.id}`).then(r => r.json()),
          fetch(`/api/mistakes?studentId=${profile.id}`).then(r => r.json()),
        ]);

        const sessions = (practiceJson.sessions || []) as PracticeSessionLite[];
        const mistakes = (mistakeJson.mistakes || []) as MistakeLite[];
        const derivedWeakSkills = buildWeakSkills(sessions, mistakes);
        const plans = buildDiagnosticPlans(studentLevel, derivedWeakSkills);

        setWeakSkills(derivedWeakSkills);
        setRecentPerformance(
          sessions.slice(0, 10).map(s => ({
            date: new Date(s.startedAt).toISOString().split('T')[0],
            accuracy: s.totalQuestions > 0 ? Math.round((s.correctCount / s.totalQuestions) * 100) : 0,
            questionsDone: s.totalQuestions,
          }))
        );

        // 🔥 If no weak skills found (new student or insufficient data), show dedicated message
        if (plans.length === 0) {
          setGenError(t('diagnostic.notEnoughData'));
          setLoadingQuestions(false);
          return;
        }

        const aiResponses = await Promise.all(
          plans.map(plan =>
            fetch('/api/ai/generate-questions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                grammarItem: plan.grammarItem,
                grammarItemZh: plan.grammarItemZh,
                languageSkill: plan.languageSkill,
                languageSkillZh: plan.languageSkillZh,
                difficulty: plan.difficulty,
                gradeLevel: studentLevel,
                count: plan.count,
                questionType: plan.questionType,
              }),
            })
              .then(r => r.json())
              .then(data => ({ ...data, __skill: plan.languageSkill, __grammar: plan.grammarItem, __grammarZh: plan.grammarItemZh }))
          )
        );

        const allQuestions: PracticeQuestion[] = [];
        let questionId = 0;

        const addQuestions = (res: { questions?: Array<{ prompt: string; choices?: string[]; answer: string; questionType?: string; listeningContent?: string; listeningContentZh?: string; readingContent?: string; readingContentZh?: string }> }, skill?: string, grammar?: string, grammarZh?: string) => {
          (res.questions || []).forEach((q) => {
            allQuestions.push({
              id: `diag-${++questionId}`,
              type: (q.questionType || 'mc') as PracticeQuestion['type'],
              strand: 'knowledge',
              prompt: q.prompt,
              choices: q.choices || undefined,
              answer: q.answer,
              grammarItem: grammar as PracticeQuestion['grammarItem'],
              languageSkill: skill as PracticeQuestion['languageSkill'],
              subSkill: grammar || skill || 'diagnostic',
              subSkillZh: grammarZh || (grammar === 'tenses' ? '時態' : grammar === 'vocabulary' ? '詞彙' : skill === 'reading' ? '閱讀理解' : skill === 'writing' ? '寫作' : '診斷測試'),
              difficulty: 'core',
              gradeLevel: 'S4',
              keyStage: 'KS4',
              explanationZh: '',
              explanationEn: '',
              commonMistake: '',
              hintLevels: [],
              listeningContent: q.listeningContent,
              listeningContentZh: q.listeningContentZh,
              readingContent: q.readingContent,
              readingContentZh: q.readingContentZh,
            });
          });
        };

        for (const response of aiResponses) {
          addQuestions(response, response.__skill, response.__grammar, response.__grammarZh);
        }

        if (allQuestions.length > 0) {
          setQuestions(allQuestions);
        } else {
          setGenError(t('diagnostic.loadFailed'));
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : t('diagnostic.connectionFailed');
        setGenError(message);
      })
      .finally(() => setLoadingQuestions(false));
  }, []);

  // 載入中
  if (loadingQuestions) {
    return (
      <div className="text-center py-20">
        <Loader2 className="w-10 h-10 animate-spin text-teal-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('diagnostic.title')}</h2>
        <p className="text-gray-500 dark:text-gray-400">{t('diagnostic.aiGenerating')}</p>
      </div>
    );
  }

  // 生成失敗
  if (genError || questions.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('diagnostic.title')}</h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-4">
          {genError || t('diagnostic.cannotGenerate')}
        </p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-teal-500 text-white rounded-lg text-sm">
          {t('diagnostic.reload')}
        </button>
      </div>
    );
  }

  const currentQ = questions[currentStep];
  const totalSteps = questions.length;

  // 技能分類
  const skills = [
    { id: 'grammar', labelKey: 'diagnostic.skillGrammar', icon: BookOpen, descriptionKey: 'diagnostic.grammarDesc' },
    { id: 'vocabulary', labelKey: 'diagnostic.skillVocab', icon: BookOpen, descriptionKey: 'diagnostic.vocabDesc' },
    { id: 'reading', labelKey: 'diagnostic.skillReading', icon: FileText, descriptionKey: 'diagnostic.readingDesc' },
    { id: 'writing', labelKey: 'diagnostic.skillWriting', icon: Pencil, descriptionKey: 'diagnostic.writingDesc' },
  ];

  const diagnosticLevelLabels: Record<string, string> = {
    '核心': 'diagnostic.levelCore',
    '補底': 'diagnostic.levelRemedial',
    '挑戰': 'diagnostic.levelChallenge',
  };

  const handleAnswer = (answer: string) => {
    const isCorrect = checkAnswer(answer, currentQ.answer, currentQ.type, currentQ.choices);
    setAnswers(prev => ({ ...prev, [currentQ.id]: answer }));
    setLastAnswerCorrect(isCorrect);
    setShowFeedback(true);

    // Auto-advance after 1.5s
    setTimeout(() => {
      setShowFeedback(false);
      setLastAnswerCorrect(null);
      if (currentStep < totalSteps - 1) {
        setCurrentStep(currentStep + 1);
      } else {
        handleComplete(answer);
      }
    }, 1500);
  };

  const handleComplete = async (lastAnswer: string) => {
    const finalAnswers = { ...answers, [currentQ.id]: lastAnswer };
    setCompleted(true);

    // 計算各技能分數
    const skillScores: Record<string, { correct: number; total: number }> = {};
    for (const q of questions) {
      const key = q.grammarItem ? 'grammar' : q.languageSkill === 'reading' ? 'reading' : q.languageSkill === 'writing' ? 'writing' : q.languageSkill === 'listening' ? 'listening' : q.languageSkill === 'speaking' ? 'speaking' : 'vocabulary';
      if (!skillScores[key]) skillScores[key] = { correct: 0, total: 0 };
      skillScores[key].total++;
      const userAnswer = finalAnswers[q.id] || '';
      if (checkAnswer(userAnswer, q.answer, q.type, q.choices)) {
        skillScores[key].correct++;
      }
    }

    const computed: DiagnosticResult[] = [
      {
        id: 'grammar', label: t('diagnostic.skillGrammar'),
        score: skillScores.grammar ? Math.round((skillScores.grammar.correct / skillScores.grammar.total) * 100) : 0,
        level: (skillScores.grammar?.correct || 0) >= 3 ? t('diagnostic.levelCore') : t('diagnostic.levelRemedial'),
        suggestion: '',
      },
      {
        id: 'vocabulary', label: t('diagnostic.skillVocab'),
        score: skillScores.vocabulary ? Math.round((skillScores.vocabulary.correct / skillScores.vocabulary.total) * 100) : 0,
        level: (skillScores.vocabulary?.correct || 0) >= 2 ? t('diagnostic.levelCore') : t('diagnostic.levelRemedial'),
        suggestion: '',
      },
      {
        id: 'reading', label: t('diagnostic.skillReading'),
        score: skillScores.reading ? Math.round((skillScores.reading.correct / skillScores.reading.total) * 100) : 0,
        level: (skillScores.reading?.correct || 0) >= 2 ? t('diagnostic.levelCore') : t('diagnostic.levelRemedial'),
        suggestion: '',
      },
      {
        id: 'writing', label: t('diagnostic.skillWriting'),
        score: skillScores.writing ? Math.round((skillScores.writing.correct / skillScores.writing.total) * 100) : 0,
        level: (skillScores.writing?.correct || 0) >= 1 ? t('diagnostic.levelCore') : t('diagnostic.levelRemedial'),
        suggestion: '',
      },
    ];

    setResults(computed);

    // 持久化診斷結果到 DB
    if (studentProfile?.id) {
      fetch('/api/diagnostic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentProfile.id,
          results: computed.map(r => ({
            skill: r.id, skillZh: r.label, accuracy: r.score,
            weakAreas: r.score < 60 ? [r.id] : [],
            recommendedGrammar: r.id === 'grammar' ? (r.score < 60 ? 'tenses' : undefined) : undefined,
            recommendedSkill: r.id === 'reading' ? 'reading' : r.id === 'writing' ? 'writing' : undefined,
          })),
        }),
      }).catch((e) => { console.error("[page] fetch failed", e) });
    }

    // 🎮 記錄診斷完成 XP
    if (studentProfile?.id) {
      fetch('/api/gamification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentProfile.id,
          event: { type: 'completeDiagnostic' },
        }),
      }).catch((e) => { console.error("[page] fetch failed", e) });
    }

    // AI 分析報告
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/analyze-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentLevel: getStudentLevel(studentProfile),
          overallAccuracy: Math.round(computed.reduce((s, r) => s + r.score, 0) / computed.length),
          weakSkills: computed.filter(r => r.score < 60).map(r => ({ name: r.id, nameZh: r.label, accuracy: r.score })),
          recentPerformance,
          streakDays: studentProfile?.streakDays ?? 0,
        }),
      });
      const json = await res.json();
      if (res.ok && json.analysis) {
        setAiReport(json.analysis.summary || '');
      }
    } catch (e) { console.error('Failed to analyze diagnostic progress:', e); }
    finally { setAiLoading(false); }
  };

  // ====== 開始畫面 ======
  if (!started) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('diagnostic.title2')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">{t('diagnostic.title2Desc', { n: totalSteps })}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">{t('diagnostic.content')}</h2>
          <div className="space-y-3">
            {skills.map((s) => (
              <div key={s.id} className="flex gap-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div className="w-10 h-10 bg-teal-100 dark:bg-teal-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                  <s.icon className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">{t(s.labelKey)}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t(s.descriptionKey)}</p>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setStarted(true)}
            className="mt-6 w-full py-3 bg-teal-500 hover:bg-teal-600 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors">
            {t('diagnostic.startBtn')} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">{t('diagnostic.disclaimer')}</p>
        </div>
      </div>
    );
  }

  // ====== 答題畫面 ======
  if (!completed) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('diagnostic.assessment')}</h1>
          <span className="text-sm text-gray-500">{t('diagnostic.questionN', { current: currentStep + 1, total: totalSteps })}</span>
        </div>
        <ProgressBar value={currentStep + 1} max={totalSteps} size="sm" showPercentage={false} />

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <SkillChip grammarItem={currentQ.grammarItem} languageSkill={currentQ.languageSkill} subSkill={currentQ.subSkill} />
          </div>

          {/* 閱讀篇章 / 題目內文 */}
          {(currentQ.languageSkill === 'reading' || currentQ.readingContent) && (
            <div className="mb-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-700">
              <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1">
                {currentQ.languageSkill === 'reading' ? `📖 ${t('diagnostic.skillReading')}` : '📝 題目內文'}
              </p>
              <p className="text-sm text-indigo-800 dark:text-indigo-200 leading-relaxed whitespace-pre-line">{currentQ.readingContent}</p>
              {currentQ.readingContentZh && <p className="text-xs text-indigo-500 mt-1 italic">{currentQ.readingContentZh}</p>}
            </div>
          )}

          <p className="text-lg text-gray-900 dark:text-white mb-6" dangerouslySetInnerHTML={{ __html: currentQ.prompt }} />

          {/* Per-question feedback */}
          {showFeedback && lastAnswerCorrect !== null && (
            <div className={`mb-4 p-3 rounded-xl text-sm font-medium ${
              lastAnswerCorrect
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
            }`}>
              {lastAnswerCorrect ? '✅ 正確！' : `❌ 錯誤。正確答案：${currentQ.answer}`}
            </div>
          )}

          {currentQ.promptZh && (
            <details className="mb-4">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">顯示中文提示</summary>
              <p className="text-sm text-gray-500 mt-1 italic">{currentQ.promptZh}</p>
            </details>
          )}

          {currentQ.choices && currentQ.choices.length > 0 ? (
            <div className="space-y-3">
              {currentQ.choices.map((choice, index) => {
                const choiceLetter = getMcqLetterByIndex(index);
                const choiceText = stripMcqPrefix(choice);
                return (
                  <button key={`${index}-${choice}`} onClick={() => handleAnswer(choiceLetter)}
                    className="w-full text-left p-4 border-2 border-gray-200 dark:border-gray-600 rounded-xl hover:border-teal-400 transition-colors text-gray-700 dark:text-gray-300">
                    <span className="font-bold mr-2">{choiceLetter}.</span>{choiceText}
                  </button>
                );
              })}
            </div>
          ) : (
            <div>
              {currentQ.type === 'short-writing' ? (
                <>
                  <textarea
                    value={writingAnswer}
                    onChange={(e) => setWritingAnswer(e.target.value)}
                    placeholder={t('diagnostic.inputAnswer')}
                    rows={6}
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:border-teal-400 resize-y"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {writingAnswer.trim() ? writingAnswer.trim().split(/\s+/).length : 0} words / {writingAnswer.length} chars
                  </p>
                  <button onClick={() => handleAnswer(writingAnswer)}
                    className="mt-3 px-4 py-2 bg-teal-500 text-white rounded-lg text-sm">{t('diagnostic.submit')}</button>
                </>
              ) : (
                <>
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder={t('diagnostic.inputAnswer')}
                    onKeyDown={(e) => { if (e.key === 'Enter' && inputRef.current) handleAnswer(inputRef.current.value); }}
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:border-teal-400"
                  />
                  <button onClick={() => { if (inputRef.current) handleAnswer(inputRef.current.value); }}
                    className="mt-3 px-4 py-2 bg-teal-500 text-white rounded-lg text-sm">{t('diagnostic.submit')}</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ====== 結果畫面 ======
  const overallScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
  const recommendation = buildPracticeRecommendation(results, getStudentLevel(studentProfile));
  const practiceHref = `/student/practice?mode=diagnostic&grammarItem=${encodeURIComponent(recommendation.grammarItem || '')}&languageSkill=${encodeURIComponent(recommendation.languageSkill || '')}&difficulty=${recommendation.difficulty}&questionType=${recommendation.questionType}&questionCount=${recommendation.questionCount}&gradeLevel=${encodeURIComponent(getStudentLevel(studentProfile))}&weakLabel=${encodeURIComponent(recommendation.weakLabel)}`;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
          <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('diagnostic.complete')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">{t('diagnostic.completeDesc')}</p>
      </div>

      {/* 總體評分 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900 dark:text-white">{t('diagnostic.overallLevel')}</h2>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${overallScore >= 60 ? 'bg-teal-100 text-teal-700' : 'bg-orange-100 text-orange-700'}`}>
            {overallScore >= 70 ? t('diagnostic.coreToChallenge') : overallScore >= 50 ? t('diagnostic.remedialToCore') : t('diagnostic.remedial')}
          </span>
        </div>
        <ProgressBar value={overallScore} size="lg" label={t('diagnostic.comprehensive')} />
      </div>

      {/* 各技能結果 */}
      <div className="space-y-3">
        {results.map((r) => (
          <div key={r.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-900 dark:text-white">{r.label}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.score >= 60 ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                {r.score >= 70 ? t('diagnostic.challenge') : r.score >= 50 ? t('diagnostic.core') : t('diagnostic.remedial')}
              </span>
            </div>
            <ProgressBar value={r.score} size="sm" showPercentage={true} />
          </div>
        ))}
      </div>

      {/* AI 分析報告 */}
      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-2xl p-6 border border-purple-200 dark:border-purple-800">
        <h3 className="font-semibold text-purple-800 dark:text-purple-200 mb-3 flex items-center gap-2">
          <Sparkles className="w-5 h-5" /> {t('diagnostic.aiAdvice')}
        </h3>
        {aiLoading ? (
          <div className="flex items-center gap-2 text-purple-600"><Loader2 className="w-4 h-4 animate-spin" />{t('diagnostic.analyzing')}</div>
        ) : aiReport ? (
          <p className="text-sm text-purple-700 dark:text-purple-300">{aiReport}</p>
        ) : (
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            {results.filter(r => r.score < 60).map(r => (
              <p key={r.id}>• <strong>{r.label}</strong>：{t('diagnostic.remedialAdvice')}</p>
            ))}
            {results.filter(r => r.score >= 60).map(r => (
              <p key={r.id}>• <strong>{r.label}</strong>：{t('diagnostic.coreAdvice')}</p>
            ))}
          </div>
        )}
      </div>

      <div className="bg-orange-50 dark:bg-orange-900/20 rounded-2xl p-5 border border-orange-200 dark:border-orange-800">
        <div className="flex items-center gap-2 mb-2 text-orange-700 dark:text-orange-300 font-semibold">
          <Target className="w-5 h-5" /> {t('diagnostic.goDashboard')}
        </div>
        <p className="text-sm text-orange-800 dark:text-orange-200 mb-4">
          {t('diagnostic.remedialAdvice')}
        </p>
        <Link href={practiceHref}
          className="block w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-xl text-center transition-colors">
          {t('diagnostic.start')} <ArrowRight className="w-4 h-4 inline ml-1" />
        </Link>
      </div>

      <Link href="/student/dashboard"
        className="block w-full py-3 bg-teal-500 hover:bg-teal-600 text-white font-medium rounded-xl text-center transition-colors">
        {t('diagnostic.goDashboard')} <ArrowRight className="w-4 h-4 inline ml-1" />
      </Link>
    </div>
  );
}
