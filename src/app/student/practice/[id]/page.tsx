// ============================================
// 學生端 — 單題作答頁面
// 支援：預設題目 + AI 生成題目 + 進度追蹤
// ============================================
'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, ArrowRight, Check, X, Lightbulb, Volume2,
  BookMarked, Clock, Sparkles, Loader2, Flag, Zap, RotateCcw, Home,
} from 'lucide-react';
import SkillChip from '@/components/shared/SkillChip';
import ProgressBar from '@/components/shared/ProgressBar';
import AudioPlayer from '@/components/shared/AudioPlayer';
import { useAppStore } from '@/store/appStore';
import { useT } from '@/hooks/use-i18n';
import type { AnswerAnalysis } from '@/lib/ai-service';
import type { PracticeQuestion } from '@/lib/types';

const MCQ_LETTERS = ['A', 'B', 'C', 'D'] as const;

function getMcqLetterByIndex(index: number): string {
  return MCQ_LETTERS[index] || 'A';
}

function stripMcqPrefix(choice: string): string {
  return choice
    .trim()
    // 只移除明確的字母前置（A/B/C/D）、數字前綴（1./2./3./4.）、或 T/F/True/False 前置
    .replace(/^\s*\(?\s*(?:[A-Da-d]\s*[\).:：\-、]\s*|(?:True|False)\s*[\).:：\-、]\s*)\s*/iu, '')
    .trim();
}

/** 正規化文字以進行精確比對 */
function normalizeAnswer(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')           // 多空格 → 單空格
    .replace(/['']/g, "'")          // 統一撇號
    .replace(/[""]/g, '"')          // 統一引號
    .replace(/[–—]/g, '-')          // 統一破折號
    .replace(/[.!?,;:]$/, '');      // 移除尾部標點
}

/** 智能答案比對：
 *  - MCQ: 比對字母 (A/B/C/D) 或完整選項文字
 *  - 文字題: 正規化後比對，支援部分匹配（至少一個關鍵詞匹配） */
function checkAnswer(student: string, correct: string, type: string, choices?: string[]): boolean {
  if (type === 'mc') {
    const studentUpper = student.trim().toUpperCase();
    const correctUpper = correct.trim().toUpperCase();

    // 字母比對
    if (studentUpper === correctUpper) return true;

    // 學生可能輸入了完整選項文字而非字母
    const correctLetterIndex = MCQ_LETTERS.indexOf(correctUpper as typeof MCQ_LETTERS[number]);
    if (choices && correctLetterIndex >= 0 && correctLetterIndex < choices.length) {
      const correctText = normalizeAnswer(choices[correctLetterIndex]);
      const normalizedStudent = normalizeAnswer(student);
      if (normalizedStudent === correctText) return true;
    }

    return false;
  }

  // 文字題：正規化後比對
  const normStudent = normalizeAnswer(student);
  const normCorrect = normalizeAnswer(correct);

  if (normStudent === normCorrect) return true;

  // 部分匹配：若學生答案包含正確答案的主要詞彙
  const correctWords = normCorrect.split(' ').filter(w => w.length > 2);
  if (correctWords.length >= 2 && correctWords.every(w => normStudent.includes(w))) {
    return true;
  }

  return false;
}

/** 取得完整答案文字（MC 題從選項中查找完整句子，非 MC 題直接回傳答案） */
function getFullAnswerText(question: PracticeQuestion): string {
  if (question.choices && question.choices.length > 0) {
    const answerLetter = question.answer.trim().toUpperCase();
    const answerIndex = MCQ_LETTERS.indexOf(answerLetter as (typeof MCQ_LETTERS)[number]);
    if (answerIndex >= 0 && question.choices[answerIndex]) {
      return stripMcqPrefix(question.choices[answerIndex]);
    }

    const textMatch = question.choices.find(c => stripMcqPrefix(c).toLowerCase() === question.answer.trim().toLowerCase());
    return textMatch ? stripMcqPrefix(textMatch) : question.answer;
  }
  return question.answer;
}

export default function PracticeQuestionPage() {
  const params = useParams();
  const router = useRouter();
  const store = useAppStore();
  const { t } = useT();

  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [currentHint, setCurrentHint] = useState(0);
  const [showZh, setShowZh] = useState(true);

  // === AI 分析狀態 ===
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AnswerAnalysis | null>(null);
  const [aiError, setAiError] = useState('');

  // === 聆聽模式：隱藏文字 ===
  const [listeningRevealed, setListeningRevealed] = useState(false);

  // === XP 即時通知 ===
  const [xpToast, setXpToast] = useState<{ xp: number; level: number; title: string } | null>(null);
  const [wrongEncouragement, setWrongEncouragement] = useState('');
  const hasSavedRef = useRef(false); // 防止重複 savePractice
  const [sessionComplete, setSessionComplete] = useState(false);
  const [completedSession, setCompletedSession] = useState<typeof store.currentSession>(null);

  // 失敗鼓勵語（DSE 正向引導）
  const ENCOURAGEMENTS = [
    '💪 錯誤是學習的一部分！看看解釋再試一次。',
    '🌟 每次犯錯都是進步的機會！',
    '📚 DSE 狀元也是從錯誤中學習的！',
    '🎯 了解錯處比答對更重要！',
    '🔥 犯錯代表你在挑戰自己，繼續加油！',
    '✨ 錯誤讓你知道哪裡需要加強，這是好事！',
  ];

  /** 傳送練習記錄（僅儲存，不發 XP） */
  const savePractice = useCallback(async (payload: Record<string, unknown>) => {
    try {
      await fetch('/api/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch { /* silent */ }
  }, []);

  /** 發放 XP 並顯示 toast */
  const awardXp = useCallback(async (type: string, difficulty?: string) => {
    if (!store.userId) return;
    try {
      const res = await fetch('/api/gamification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: store.userId,
          event: { type, difficulty },
        }),
      });
      const data = await res.json();
      if (data.xpGained > 0) {
        const badgeMsg = data.newBadges?.length
          ? ` 🏅 ${data.newBadges[0].icon} ${data.newBadges[0].nameZh} 解鎖！`
          : '';
        setXpToast({ xp: data.xpGained, level: data.level, title: data.levelTitle + badgeMsg });
        setTimeout(() => setXpToast(null), 4000);
      }
    } catch { /* silent */ }
  }, [store.userId]);

  // 合併 mock 題目 + AI session 題目
  const allQuestions = useMemo(() => {
    const sessionQuestions = store.currentSession?.questions || [];
    return [...sessionQuestions];
  }, [store.currentSession]);

  const question = allQuestions.find(q => q.id === params.id) || null;

  // === Session 進度（必須在 early return 之前計算，供 useEffect 使用）===
  const isSessionMode = !!store.currentSession;
  const sessionQuestions = store.currentSession?.questions || [];
  const sessionIndex = sessionQuestions.findIndex(q => q.id === params.id);
  const sessionTotal = sessionQuestions.length;
  const sessionProgress = sessionTotal > 0 ? ((sessionIndex + 1) / sessionTotal) * 100 : 0;
  const hasNextSession = sessionIndex < sessionTotal - 1;

  // 離開頁面時自動儲存 session 進度（僅在未透過 handleSubmit 儲存時）
  useEffect(() => {
    return () => {
        if (isSessionMode && store.currentSession && !store.currentSession.completedAt && !hasSavedRef.current) {
        const { questions, answers, results, skill, skillZh, difficulty, totalQuestions, correctCount, source } = store.currentSession;
        // 構建逐題答案陣列
        const answerRecords = questions.map((q, idx) => ({
          questionIndex: idx,
          questionType: q.type || 'mc',
          questionPrompt: q.prompt || '',
          correctAnswer: q.answer || '',
          studentAnswer: answers[q.id] || '',
          isCorrect: results[q.id] ?? false,
        }));
        savePractice({
          studentId: store.userId || '',
          skill: skill || 'general',
          skillZh: skillZh || '',
          difficulty: difficulty || 'core',
          totalQuestions,
          correctCount,
          source: source || 'ai-generated',
          answers: answerRecords,
        });
      }
    };
  }, [isSessionMode, store.currentSession, store.userId, savePractice]);

  // 聆聽題共用錄音：若本題無 listeningContent，取 session 中第一題的
  // ⚠️ 必須在 if (!question) early return 之前（React hooks 順序規則）
  const isListening = question?.languageSkill === 'listening';
  const sharedListeningContent = useMemo(() => {
    if (!isListening || !question) return undefined;
    if (question.listeningContent) return question.listeningContent;
    const firstWithContent = sessionQuestions.find(q => q.listeningContent);
    return firstWithContent?.listeningContent;
  }, [isListening, question?.listeningContent, sessionQuestions]);
  const sharedListeningContentZh = useMemo(() => {
    if (!isListening || !question) return undefined;
    if (question.listeningContentZh) return question.listeningContentZh;
    const firstWithZh = sessionQuestions.find(q => q.listeningContentZh);
    return firstWithZh?.listeningContentZh;
  }, [isListening, question?.listeningContentZh, sessionQuestions]);
  
  if (!question) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <p className="text-gray-500 mb-3">{t('practice.question.notFound')}</p>
          <Link href="/student/practice" className="text-blue-600 hover:underline">
            {t('practice.question.backToPractice')}
          </Link>
        </div>
      </div>
    );
  }

  if (sessionComplete && completedSession) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <SessionCompleteSummary
          session={completedSession}
          onBackToPractice={() => router.push('/student/practice')}
          onReviewMistakes={() => router.push('/student/mistakes')}
          onDashboard={() => router.push('/student/dashboard')}
          onRetry={() => {
            setSessionComplete(false);
            setSelectedAnswer('');
            setSubmitted(false);
            const firstQ = sessionQuestions[0];
            if (firstQ) router.push(`/student/practice/${firstQ.id}`);
          }}
        />
      </div>
    );
  }
  const isReading = question.languageSkill === 'reading';

  /** 智能答案比對：MC 題精確匹配，文字題忽略大小寫與多餘空白 */
  const isCorrect = submitted && checkAnswer(selectedAnswer, question.answer, question.type, question.choices);

  const handleSubmit = async () => {
    if (!selectedAnswer) return;
    setSubmitted(true);

    const correct = checkAnswer(selectedAnswer, question.answer, question.type, question.choices);

    // 記錄到 store
    if (isSessionMode) {
      store.submitAnswer(question.id, selectedAnswer, correct);
    }

    // 🎮 答題 XP
    awardXp(correct ? 'answerCorrect' : 'answerIncorrect', question.difficulty);

    // 💪 答錯時顯示鼓勵語
    if (!correct) {
      setWrongEncouragement(ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)]);
    }

    // 呼叫 AI 分析答案
    setAiLoading(true);
    setAiError('');
    try {
      const res = await fetch('/api/ai/analyze-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.prompt,
          questionType: question.type,
          correctAnswer: question.answer,
          studentAnswer: selectedAnswer,
          grammarItem: question.grammarItem,
          grammarItemZh: question.subSkillZh,
          studentLevel: question.gradeLevel,
        }),
      });
      const json = await res.json();
      if (res.ok && json.analysis) {
        setAiAnalysis(json.analysis);
      } else {
        setAiError(json.error || t('practice.question.aiUnavailableMsg'));
      }
    } catch {
      setAiError(t('practice.question.aiConnectionMsg'));
    } finally {
      setAiLoading(false);
    }

    // 儲存練習記錄到後端（含逐題答案）
    if (isSessionMode && !hasSavedRef.current) {
      hasSavedRef.current = true;
      const { questions, answers, results, skill, skillZh, difficulty, totalQuestions, correctCount, source } = store.currentSession!;
      const answerRecords = questions.map((q, idx) => ({
        questionIndex: idx,
        questionType: q.type || 'mc',
        questionPrompt: q.prompt || '',
        correctAnswer: q.answer || '',
        studentAnswer: answers[q.id] || '',
        isCorrect: results[q.id] ?? false,
      }));
      savePractice({
        studentId: store.userId || '',
        skill: skill || question.grammarItem || question.languageSkill || 'general',
        skillZh: skillZh || question.subSkillZh || '',
        difficulty: difficulty || question.difficulty || 'core',
        totalQuestions,
        correctCount,
        source: source || 'ai-generated',
        answers: answerRecords,
      });
    }

    // 答錯時儲存錯題
    if (!correct) {
      fetch('/api/mistakes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: store.userId || '',
          questionId: question.id,
          studentAnswer: selectedAnswer,
          correctAnswer: question.answer,
          mistakeType: 'grammar',
          aiExplanation: '',
        }),
      }).catch(() => {});
    }
  };

  const handleNext = () => {
    if (isSessionMode && hasNextSession) {
      const nextQ = sessionQuestions[sessionIndex + 1];
      router.push(`/student/practice/${nextQ.id}`);
    } else {
      // 完成所有題目 → 留在頁面顯示摘要
      if (isSessionMode) {
        // ⚠️ 必須在 completeSession() 前保存快照（completeSession 會設 currentSession = null）
        setCompletedSession({ ...store.currentSession! });
        store.completeSession();
        awardXp('completeSession', store.currentSession?.difficulty);
        setSessionComplete(true);
        return;
      }
      router.push('/student/practice');
    }
    setSelectedAnswer('');
    setSubmitted(false);
    setCurrentHint(0);
    setAiAnalysis(null);
    setAiError('');
    setListeningRevealed(false);
  };

  // === 已完成：useEffect 已移至上方（early return 之前）===

  const handleHint = () => {
    if (currentHint < question.hintLevels.length) {
      setCurrentHint(currentHint + 1);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* XP 獲得即時通知 */}
      {xpToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3">
            <Zap className="w-6 h-6" />
            <div>
              <p className="text-lg font-bold">+{xpToast.xp} XP!</p>
              <p className="text-xs text-amber-100">Lv.{xpToast.level} {xpToast.title}</p>
            </div>
          </div>
        </div>
      )}

      {/* 頂部導航 */}
      <div className="flex items-center justify-between">
        <Link href="/student/practice" className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" />
          {t('practice.question.backToCenter')}
        </Link>
        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> 02:35</span>
          {isSessionMode && (
            <span className="text-purple-500 flex items-center gap-1"><Sparkles className="w-3 h-3" /> {t('practice.question.aiPractice')}</span>
          )}
        </div>
      </div>

      {/* 進度條 */}
      <ProgressBar
        value={isSessionMode ? sessionIndex + 1 : 0}
        max={isSessionMode ? sessionTotal : 0}
        size="sm"
        showPercentage={false}
      />
      <div className="text-xs text-gray-400 text-right">
        {t('practice.question.questionN').replace('{n}', String(isSessionMode ? sessionIndex + 1 : 0)).replace('{total}', String(isSessionMode ? sessionTotal : 0))}
        {isSessionMode && <span className="ml-2 text-purple-500">· {t('practice.question.aiGenerated')}</span>}
      </div>

      {/* 題目標籤 */}
      <div className="flex items-center gap-2 flex-wrap">
        <SkillChip grammarItem={question.grammarItem} languageSkill={question.languageSkill} subSkill={question.subSkill} />
        <SkillChip difficulty={question.difficulty} />
      </div>

      {/* ====== 題目卡 ====== */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        {/* 聆聽題：隱藏聆聽內容文字，只顯示播放器 */}
        {isListening && (
          <div className="mb-4 p-4 bg-teal-50 dark:bg-teal-900/20 rounded-xl border-2 border-teal-300 dark:border-teal-600">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🎧</span>
              <span className="text-sm font-semibold text-teal-700 dark:text-teal-300">
                {!listeningRevealed && !submitted ? t('practice.question.listeningTitle') : t('practice.question.listeningContent')}
              </span>
              <AudioPlayer
                text={sharedListeningContent || question.listeningContent || question.prompt}
                label={!listeningRevealed && !submitted ? t('practice.question.play') : t('practice.question.replay')}
                size="sm"
              />
            </div>

            {/* 聆聽文字：根據狀態顯示/隱藏 */}
            <div className={!listeningRevealed && !submitted ? 'hidden' : ''}>
              <p
                className="text-sm text-teal-800 dark:text-teal-200 leading-relaxed whitespace-pre-line cursor-help"
                title={sharedListeningContentZh || question.listeningContentZh || t('practice.question.listeningContentText')}
              >
                {sharedListeningContent || question.listeningContent || question.prompt}
              </p>
              {(sharedListeningContentZh || question.listeningContentZh) && (
                <p className="text-xs text-teal-500 mt-1">{sharedListeningContentZh || question.listeningContentZh}</p>
              )}
            </div>

            {/* 揭示按鈕（只在上方文字隱藏時顯示） */}
            {!listeningRevealed && !submitted && (
              <button
                onClick={() => setListeningRevealed(true)}
                className="mt-2 text-xs text-teal-500 hover:text-teal-700 underline"
              >
                {t('practice.question.showText')}
              </button>
            )}
          </div>
        )}

        {/* 閱讀理解題：顯示閱讀篇章 */}
        {isReading && question.readingContent && (
          <div className="mb-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border-2 border-indigo-300 dark:border-indigo-600">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">📖</span>
              <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                {t('practice.question.readingPassage')}
              </span>
            </div>
            <p className="text-sm text-indigo-800 dark:text-indigo-200 leading-relaxed whitespace-pre-line">
              {question.readingContent}
            </p>
            {question.readingContentZh && (
              <p className="text-xs text-indigo-500 mt-2 italic">{question.readingContentZh}</p>
            )}
          </div>
        )}

        {/* 題目（始終顯示） */}
        <div className="mb-4">
          <p
            className="text-lg text-gray-900 dark:text-white leading-relaxed cursor-help"
            title={question.promptZh || ''}
          >
            {question.prompt}
          </p>
          {question.promptZh && (
            <details className="mt-2">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">{t('practice.question.showZhHint')}</summary>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 italic">{question.promptZh}</p>
            </details>
          )}
        </div>

        {/* 選項 */}
        {question.choices && question.choices.length > 0 && (
          <div className="space-y-3">
            {question.choices.map((choice, index) => {
              const correctLetter = question.answer.trim().toUpperCase();
              const choiceLetter = getMcqLetterByIndex(index);
              const choiceText = stripMcqPrefix(choice);
              let choiceStyle = 'border-gray-200 dark:border-gray-600 hover:border-teal-300 dark:hover:border-teal-500';
              if (submitted) {
                if (choiceLetter === correctLetter) {
                  choiceStyle = 'border-green-400 bg-green-50 dark:bg-green-900/20 dark:border-green-600';
                } else if (choiceLetter === selectedAnswer && selectedAnswer !== correctLetter) {
                  choiceStyle = 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-600';
                }
              } else if (selectedAnswer === choiceLetter) {
                choiceStyle = 'border-teal-400 bg-teal-50 dark:bg-teal-900/20 dark:border-teal-500';
              }

              return (
                <button
                  key={`${index}-${choice}`}
                  onClick={() => !submitted && setSelectedAnswer(choiceLetter)}
                  disabled={submitted}
                  className={`w-full flex items-center gap-3 p-4 border-2 rounded-xl text-left transition-colors ${choiceStyle}`}
                >
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    submitted && choiceLetter === correctLetter
                      ? 'bg-green-500 text-white'
                      : submitted && choiceLetter === selectedAnswer && choiceLetter !== correctLetter
                        ? 'bg-red-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}>
                    {submitted && choiceLetter === correctLetter ? <Check className="w-4 h-4" /> :
                     submitted && choiceLetter === selectedAnswer && choiceLetter !== correctLetter ? <X className="w-4 h-4" /> :
                     choiceLetter}
                  </span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{choiceText}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 填空題輸入 */}
        {question.type === 'fill-blank' && (
          <div>
            <input
              type="text"
              value={selectedAnswer}
              onChange={(e) => setSelectedAnswer(e.target.value)}
              disabled={submitted}
              placeholder={t('practice.question.inputAnswer')}
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:border-teal-400"
            />
          </div>
        )}

        {/* 寫作題輸入 */}
        {question.type === 'short-writing' && (
          <div>
            <textarea
              value={selectedAnswer}
              onChange={(e) => setSelectedAnswer(e.target.value)}
              disabled={submitted}
              placeholder={t('practice.question.writeAnswer')}
              rows={4}
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:border-teal-400 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              {selectedAnswer.length} {t('practice.question.chars')} / {selectedAnswer.trim() ? selectedAnswer.trim().split(/\s+/).length : 0} {t('practice.question.words')}
            </p>
          </div>
        )}

        {/* 改錯題輸入 */}
        {question.type === 'error-correction' && (
          <div>
            <textarea
              value={selectedAnswer}
              onChange={(e) => setSelectedAnswer(e.target.value)}
              disabled={submitted}
              placeholder={t('practice.question.correctSentence')}
              rows={3}
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:border-teal-400 resize-none"
            />
          </div>
        )}
      </div>

      {/* ====== 分層提示 ====== */}
      {!submitted && currentHint > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">{t('practice.question.hintLevel').replace('{n}', String(currentHint))}</span>
          </div>
          <p className="text-sm text-yellow-700 dark:text-yellow-300">{question.hintLevels[currentHint - 1]}</p>
        </div>
      )}

      {/* ====== 提交後回饋 ====== */}
      {submitted && (
        <div className={`rounded-xl p-4 border-2 ${isCorrect ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-700'}`}>
          <div className="flex items-center gap-2 mb-3">
            {isCorrect ? (
              <>
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <Check className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-green-800 dark:text-green-200">{t('practice.question.correct')}</span>
              </>
            ) : (
              <>
                <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                  <X className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-red-800 dark:text-red-200">{t('practice.question.wrong')}</span>
              </>
            )}
          </div>

          {!isCorrect && (
            <>
              {wrongEncouragement && (
                <p className="text-sm text-orange-600 dark:text-orange-400 mb-2 font-medium animate-fadeIn">
                  {wrongEncouragement}
                </p>
              )}
              <div className="text-sm mb-2 flex items-center gap-2">
              <span className="text-gray-500 dark:text-gray-400">{t('practice.question.correctAnswerLabel')}</span>
              <span className="font-bold text-green-700 dark:text-green-300">{question.answer}</span>
              <AudioPlayer
                text={getFullAnswerText(question)}
                label=""
                size="sm"
              />
            </div>
            </>
          )}

          {/* AI 解釋（中/英切換） */}
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setShowZh(true)}
                className={`text-xs px-2 py-1 rounded ${showZh ? 'bg-teal-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600'}`}
              >
                {t('practice.question.zhExplanation')}
              </button>
              <button
                onClick={() => setShowZh(false)}
                className={`text-xs px-2 py-1 rounded ${!showZh ? 'bg-teal-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600'}`}
              >
                {t('practice.question.enExplanation')}
              </button>
              <AudioPlayer
                text={showZh ? question.explanationZh : question.explanationEn}
                label=""
                size="sm"
                className="ml-auto"
              />
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300">{showZh ? question.explanationZh : question.explanationEn}</p>
          </div>

          {/* 常犯錯誤 */}
          <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
            <p className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">{t('practice.question.commonMistake')}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{question.commonMistake}</p>
          </div>

          {/* 相關文法點 */}
          {question.grammarPoint && (
            <div className="mt-2">
              <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                📘 {question.grammarPoint}
              </span>
            </div>
          )}

          {/* === DeepSeek AI 智能分析 === */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
            {aiLoading && (
              <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>AI 正在分析你的答案...</span>
              </div>
            )}

            {aiError && (
              <div className="text-sm text-gray-400 dark:text-gray-500">
                <Sparkles className="w-4 h-4 inline mr-1" />
                {aiError}{t('practice.question.aiFallback')}
              </div>
            )}

            {aiAnalysis && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide">AI 智能分析</span>
                </div>

                {/* AI 評分 */}
                {aiAnalysis.score != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">AI 評分：</span>
                    <span className={`text-sm font-bold ${(aiAnalysis.score ?? 0) >= 60 ? 'text-green-600' : 'text-red-600'}`}>
                      {aiAnalysis.score ?? '—'}/100
                    </span>
                  </div>
                )}

                {/* AI 回饋 */}
                {(aiAnalysis.feedbackZh || aiAnalysis.feedbackEn) && (
                  <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <p className="text-sm text-purple-800 dark:text-purple-200">
                      {(showZh ? aiAnalysis.feedbackZh : aiAnalysis.feedbackEn) || ''}
                    </p>
                  </div>
                )}

                {/* AI 改進建議 */}
                {!isCorrect && aiAnalysis.improvementTip && (
                  <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-purple-100 dark:border-purple-800">
                    <p className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">💡 AI 改進建議</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{aiAnalysis.improvementTip}</p>
                  </div>
                )}

                {/* 錯誤類型標籤 */}
                {aiAnalysis.mistakeType && aiAnalysis.mistakeType !== 'none' && (() => {
                  const mistakeKey = aiAnalysis.mistakeType === 'time-management'
                    ? 'mistake.timeManagement' : `mistake.${aiAnalysis.mistakeType}`;
                  const label = t(mistakeKey);
                  return (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{t('mistake.typeLabel')}</span>
                      <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full">
                        {label !== mistakeKey ? label : aiAnalysis.mistakeType}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====== 底部操作列 ====== */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!submitted && (
            <button
              onClick={handleHint}
              disabled={currentHint >= question.hintLevels.length}
              className="flex items-center gap-1 px-3 py-2 text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg hover:bg-yellow-100 transition-colors disabled:opacity-50"
            >
              <Lightbulb className="w-4 h-4" />
              提示 ({currentHint}/4)
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!submitted ? (
            <button
              onClick={handleSubmit}
              disabled={!selectedAnswer}
              className="px-6 py-2.5 bg-teal-500 hover:bg-teal-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white font-medium rounded-xl transition-colors disabled:cursor-not-allowed"
            >
              提交答案
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2.5 bg-teal-500 hover:bg-teal-600 text-white font-medium rounded-xl transition-colors"
            >
              {!hasNextSession ? (
                <>完成練習 ✓</>
              ) : (
                <>下一題 <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// 練習完成摘要元件
// ============================================
function SessionCompleteSummary({
  session,
  onBackToPractice,
  onReviewMistakes,
  onDashboard,
  onRetry,
}: {
  session: { questions: PracticeQuestion[]; answers: Record<string, string>; results: Record<string, boolean>; totalQuestions: number; correctCount: number; skillZh: string; difficulty: string };
  onBackToPractice: () => void;
  onReviewMistakes: () => void;
  onDashboard: () => void;
  onRetry: () => void;
}) {
  const acc = session.totalQuestions > 0 ? Math.round((session.correctCount / session.totalQuestions) * 100) : 0;
  const emoji = acc >= 90 ? '🏆' : acc >= 70 ? '🌟' : acc >= 50 ? '💪' : '📚';
  const color = acc >= 90 ? 'text-amber-600' : acc >= 70 ? 'text-teal-600' : acc >= 50 ? 'text-orange-500' : 'text-red-500';
  const incorrectCount = session.questions.filter(q => !session.results[q.id]).length;

  return (
    <div className="space-y-6">
      <div className="text-center py-8">
        <div className="text-5xl mb-3">{emoji}</div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">練習完成！</h1>
        <div className={`text-5xl font-extrabold ${color}`}>
          {session.correctCount}<span className="text-2xl text-gray-400">/{session.totalQuestions}</span>
        </div>
        <p className="text-sm text-gray-500 mt-2">正確率 {acc}%</p>
        <p className="text-xs text-gray-400 mt-1">{session.skillZh} · {session.difficulty === 'remedial' ? '補底' : session.difficulty === 'challenge' ? '挑戰' : '核心'}</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">答題摘要</h3>
        <div className="space-y-2">
          {session.questions.map((q, i) => {
            const correct = session.results[q.id] ?? false;
            const answer = session.answers[q.id] || '（未作答）';
            return (
              <div key={q.id} className={`flex items-start gap-3 p-3 rounded-lg ${correct ? 'bg-green-50 dark:bg-green-900/10' : 'bg-red-50 dark:bg-red-900/10'}`}>
                <span className={`mt-0.5 shrink-0 ${correct ? 'text-green-500' : 'text-red-500'}`}>
                  {correct ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">Q{i + 1}. {q.prompt}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    你的答案：<span className={correct ? 'text-green-600 font-medium' : 'text-red-500 line-through'}>{answer}</span>
                    {!correct && <span className="text-green-600 ml-2">✓ {q.answer}</span>}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={onRetry} className="py-3 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
          <RotateCcw className="w-4 h-4" /> 再做一次
        </button>
        {incorrectCount > 0 && (
          <button onClick={onReviewMistakes} className="py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
            <Flag className="w-4 h-4" /> 查看錯題 ({incorrectCount})
          </button>
        )}
        <button onClick={onBackToPractice} className="py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          繼續練習
        </button>
        <button onClick={onDashboard} className="py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2">
          <Home className="w-4 h-4" /> 返回主頁
        </button>
      </div>
    </div>
  );
}
