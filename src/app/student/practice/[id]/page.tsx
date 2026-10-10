// ============================================
// 學生端 — 單題作答頁面
// 支援：預設題目 + AI 生成題目 + 進度追蹤
// ============================================
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { persistWithRetry } from '@/shared/utils/persistence-helper';
import Link from 'next/link';
import {
  ArrowLeft, ArrowRight, Check, X, Lightbulb,
  Sparkles, Loader2, Flag, Zap, RotateCcw, Home,
} from 'lucide-react';
import { logger } from '@/shared/logger/logger';
import SkillChip from '@/components/shared/SkillChip';
import ProgressBar from '@/components/shared/ProgressBar';
import AudioPlayer, { prefetchTTSAudio } from '@/components/shared/AudioPlayer';
import ListeningScript from '@/components/shared/ListeningScript';
import { useAppStore } from '@/store/appStore';
import { useT } from '@/hooks/use-i18n';
import type { AnswerAnalysis } from '@/modules/ai/services/ai-service';
import type { PracticeQuestion } from '@/shared/types/types';
// 2026-09-15: 客戶端不再自帶 checkAnswer 副本 — 一律委派正典 scorer
// （單一 owner；正典 scorer 同時提供 isOpenEndedQuestionType 處理寫作題）。
import {
  checkAnswer,
  isOpenEndedQuestionType,
} from '@/modules/exercise/services/practice-answer-scorer';
import { findNextSessionQuestionIndex } from '@/modules/exercise/services/practice-session-questions';

const MCQ_LETTERS = ['A', 'B', 'C', 'D'] as const;

/** 穩定的空陣列參考：`currentSession?.questions || []` 每次都建立新陣列，
 *  會令相依它的 useMemo／useEffect 每次渲染都重算（React Compiler 亦警告）。 */
const EMPTY_QUESTIONS: PracticeQuestion[] = [];

function getMcqLetterByIndex(index: number): string | undefined {
  return MCQ_LETTERS[index];
}

function stripMcqPrefix(choice: string): string {
  return choice
    .trim()
    // 只移除明確的字母前置（A/B/C/D）、數字前綴（1./2./3./4.）、或 T/F/True/False 前置
    .replace(/^\s*\(?\s*(?:[A-Da-d]\s*[\).:：\-、]\s*|(?:True|False)\s*[\).:：\-、]\s*)\s*/iu, '')
    .trim();
}

/** Pick a random element from an array (module-level to satisfy React Compiler purity) */
function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 取得完整答案文字（MC 題從選項中查找完整句子，非 MC 題直接回傳答案） */
function getFullAnswerText(question: PracticeQuestion): string {
  if (question.choices && question.choices.length > 0) {
    const answerLetter = question.answer.trim().toUpperCase();
    const answerIndex = MCQ_LETTERS.indexOf(answerLetter as (typeof MCQ_LETTERS)[number]);
    if (answerIndex >= 0 && answerIndex < question.choices.length && question.choices[answerIndex]) {
      return stripMcqPrefix(question.choices[answerIndex]);
    }

    // ⚠️ Answer letter out of range (e.g., "D" but only 3 choices) — try text match
    const textMatch = question.choices.find(c => stripMcqPrefix(c).toLowerCase() === question.answer.trim().toLowerCase());
    if (textMatch) return stripMcqPrefix(textMatch);

    // ⚠️ Fallback: return the first choice's text + letter annotation to avoid showing bare letters
    if (answerIndex >= question.choices.length) {
      logger.warn({
        module: 'student-practice-detail',
        questionId: question.id,
        answer: question.answer,
        choicesCount: question.choices.length,
      }, 'getFullAnswerText: answer letter out of range, falling back to first choice');
      return stripMcqPrefix(question.choices[0] || question.answer);
    }

    return question.answer;
  }
  return question.answer;
}

export default function PracticeQuestionPage() {
  const params = useParams();
  const router = useRouter();
  const store = useAppStore();
  const { t, language } = useT();

  // 2026-10-07：「作答狀態」由 store（單一真實來源）還原，不得只存在本機 state。
  // 題目 id 改變時本頁會重新掛載 → 初始化時即讀回該題的作答紀錄；因此導覽
  // 若沒有真正換題（失敗／被中止），本機狀態不會被清空，學生剛答完的題目
  // 不會以**未作答**的樣子再次出現（學生回報「作答後，題目重複出現」）。
  // 還原時刻意**不**重跑 AI 解說（避免重複計費）：對錯回饋為本機確定性判定。
  const initialStoredAnswer = store.currentSession?.answers?.[String(params.id)];
  const [selectedAnswer, setSelectedAnswer] = useState(initialStoredAnswer ?? '');
  const [submitted, setSubmitted] = useState(initialStoredAnswer !== undefined);
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
  const hasSavedRef = useRef(false); // 防止重複 savePractice（完成時設為 true）
  const [sessionComplete, setSessionComplete] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [pendingCompletionXp, setPendingCompletionXp] = useState<{ sessionId: string } | null>(null);
  // 保存 session 快照，因為 completeSession() 會清空 currentSession
  const [completedSession, setCompletedSession] = useState<typeof store.currentSession>(null);

  // 失敗鼓勵語（DSE 正向引導）— 依語言切換
  const ENCOURAGEMENTS = language === 'en' ? [
    '💪 Mistakes are part of learning! Read the explanation and try again.',
    '🌟 Every mistake is a chance to improve!',
    '📚 Even top DSE scorers learn from their mistakes!',
    '🎯 Understanding your mistakes matters more than getting it right!',
    '🔥 Making mistakes means you are challenging yourself — keep going!',
    '✨ Mistakes show you what to strengthen — that is a good thing!',
  ] : [
    '💪 錯誤是學習的一部分！看看解釋再試一次。',
    '🌟 每次犯錯都是進步的機會！',
    '📚 DSE 狀元也是從錯誤中學習的！',
    '🎯 了解錯處比答對更重要！',
    '🔥 犯錯代表你在挑戰自己，繼續加油！',
    '✨ 錯誤讓你知道哪裡需要加強，這是好事！',
  ];

  /** 傳送練習記錄（僅儲存，不發 XP）— R3.10-E.2 P1: 重試 5xx/網路，不重試 4xx，回報最終狀態 */
  const savePractice = useCallback(async (payload: Record<string, unknown>): Promise<boolean> => {
    const outcome = await persistWithRetry(() =>
      fetch('/api/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );
    if (!outcome.ok) {
      logger.error({ module: 'student-practice-detail', error: `practice save failed (status=${outcome.status}, kind=${outcome.failureKind}, retried=${outcome.retried})` }, 'savePractice failed');
      return false;
    }
    return true;
  }, []);

  /** 發放 XP 並顯示 toast（難度由伺服器以 questionId 解析，客戶端不自報） */
  const awardXp = useCallback(async (type: string, metadata?: Record<string, unknown>): Promise<boolean> => {
    if (!store.userId) return false;
    try {
      const res = await fetch('/api/gamification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: store.userId,
          event: { type, metadata },
        }),
      });
      if (!res.ok) throw new Error(`XP request failed: ${res.status}`);
      const data = await res.json();
      if (data.xpGained > 0) {
        const badgeMsg = data.newBadges?.length
          ? ` 🏅 ${data.newBadges[0].icon} ${store.language === 'en' ? (data.newBadges[0].name || data.newBadges[0].nameZh) : data.newBadges[0].nameZh} ${store.language === 'en' ? 'Unlocked!' : '解鎖！'}`
          : '';
        setXpToast({ xp: data.xpGained, level: data.level, title: data.levelTitle + badgeMsg });
        setTimeout(() => setXpToast(null), 4000);
      }
      return true;
    } catch (error) {
      logger.error({ module: 'student-practice-detail', error: error instanceof Error ? error.message : String(error) }, 'XP award failed');
      return false;
    }
  }, [store.userId]);

  const retryCompletionXp = useCallback(async () => {
    if (!pendingCompletionXp) return;
    // 2026-09-28：去重鍵由伺服器以已驗證的 sessionId 建立（客戶端不再自報鍵）
    const awarded = await awardXp('completeSession', {
      sessionId: pendingCompletionXp.sessionId,
    });
    if (awarded) setPendingCompletionXp(null);
  }, [awardXp, pendingCompletionXp]);

  // 合併 mock 題目 + AI session 題目
  const allQuestions: PracticeQuestion[] = useMemo(() => {
    const sessionQuestions = store.currentSession?.questions || [];
    return [...sessionQuestions];
  }, [store.currentSession]);

  const question = allQuestions.find(q => q.id === params.id) || null;

  // === Session 進度（必須在 early return 之前計算，供 useEffect 使用）===
  const isSessionMode = !!store.currentSession;
  const sessionQuestions = store.currentSession?.questions ?? EMPTY_QUESTIONS;
  const sessionIndex = sessionQuestions.findIndex(q => q.id === params.id);
  const sessionTotal = sessionQuestions.length;
  const sessionProgress = sessionTotal > 0 ? ((sessionIndex + 1) / sessionTotal) * 100 : 0;

  // 2026-10-07：下一題一律由 findNextSessionQuestionIndex 決定 ——
  // 它會跳過 id 與當前題目相同的項目（否則 router.push 會指向當前 URL，
  // 形成「原地不動、但作答狀態已被清空」的陷阱）以及本場次**已作答**的題目。
  // 回傳 -1 表示後面沒有可前進的題目 → 視為完成練習，學生永遠不會被困在同一題。
  const nextSessionIndex = useMemo(
    () => findNextSessionQuestionIndex(
      sessionQuestions,
      sessionIndex,
      (questionId) => store.currentSession?.answers?.[questionId] !== undefined,
    ),
    [sessionQuestions, sessionIndex, store.currentSession],
  );
  const hasNextSession = nextSessionIndex >= 0;

  // 2026-10-07：作答狀態不是本機私有狀態 —— 題目 id 改變時本頁重新掛載並由
  // store 還原（見上方 useState 初始化），因此重繪／重新進入（上一頁、導覽失敗）
  // 都會看到先前的作答與對錯回饋，而不是把已作答題目當成未作答重新要求作答。

  // ⚠️ 不再使用 cleanup auto-save — 只在 handleNext 最後一題時儲存
  // 避免題目間導航 (Q1→Q2→...→Q5) 每題都建立獨立 PracticeSession

  // 聆聽題：每題獨立錄音（v2.0 — 不再共用長錄音）
  const isListening = question?.languageSkill === 'listening';

  // 預載入下一題聆聽音訊（減少等待時間）
  useEffect(() => {
    if (!isSessionMode || !hasNextSession || !question) return;
    const nextQ = sessionQuestions[nextSessionIndex];
    if (nextQ?.listeningContent && nextQ.languageSkill === 'listening') {
      // 延遲 1 秒載入，避免影響當前頁面渲染
      const timer = setTimeout(() => {
        prefetchTTSAudio(nextQ.listeningContent!).catch((e) => { logger.error({ module: 'student-practice-detail', error: e instanceof Error ? e.message : String(e) }, 'TTS audio prefetch failed'); });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isSessionMode, hasNextSession, nextSessionIndex, sessionQuestions, question]);
  
  // 練習完成摘要 — 必須在 !question 檢查之前，因為 completeSession() 後 currentSession 為 null
  if (sessionComplete && (store.currentSession || completedSession)) {
    const displaySession = store.currentSession || completedSession!;
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        {saveError && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 rounded-xl p-4 text-sm">
            ⚠️ {saveError}
          </div>
        )}
        {pendingCompletionXp && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 rounded-xl p-4 text-sm flex items-center justify-between gap-3">
            <span>{store.language === 'en' ? 'Your completion XP has not been recorded.' : '完成練習的 XP 尚未記錄。'}</span>
            <button onClick={retryCompletionXp} className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-white">
              {store.language === 'en' ? 'Retry XP' : '重試 XP'}
            </button>
          </div>
        )}
        <SessionCompleteSummary
          session={displaySession}
          onBackToPractice={() => router.push('/student/practice')}
          onReviewMistakes={() => router.push('/student/mistakes')}
          onDashboard={() => router.push('/student/dashboard')}
          onRetry={() => {
            setSessionComplete(false);
            setSelectedAnswer('');
            setSubmitted(false);
            const sessionQs = displaySession.questions;
            const firstQ = sessionQs[0];
            if (firstQ) router.push(`/student/practice/${firstQ.id}`);
          }}
        />
      </div>
    );
  }

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

  const isReading = question.languageSkill === 'reading';

  /**
   * 開放式題型（寫作）：沒有確定性答案鍵，正典 scorer 判定為「不自動評分」。
   * 這類題目不得向學生顯示「回答錯誤」，也不得計入分數或錯題
   * （學生回報 2026-09-15）。質性回饋由下方 AI 分析提供。
   */
  const isOpenEnded = isOpenEndedQuestionType(question.type);

  /** 智能答案比對（正典 scorer，@/modules/exercise/services/practice-answer-scorer） */
  const isCorrect = submitted && !isOpenEnded && checkAnswer(selectedAnswer, question.answer, question.type, question.choices);

  const handleSubmit = async () => {
    if (!selectedAnswer) return;
    setSubmitted(true);

    // 🛑 停止所有正在播放的音訊（Web Speech + Cloud TTS audio）
    window.speechSynthesis?.cancel();
    window.dispatchEvent(new CustomEvent('stop-all-audio'));

    const correct = !isOpenEnded && checkAnswer(selectedAnswer, question.answer, question.type, question.choices);

    // 記錄到 store（開放式題目記 null：不計對錯，也不進分母）
    if (isSessionMode) {
      store.submitAnswer(question.id, selectedAnswer, isOpenEnded ? null : correct);
    }

    // 🎮 答題 XP（開放式題目不發 XP — 內容無法自動驗證，避免刷分）
    // 2026-09-28 反刷分：**只有答對**才發（答錯 0 XP，不再鼓勵亂答）；難度由
    // 伺服器以 questionId 解析（客戶端不自報）；questionId 同時是伺服器去重鍵
    // → 同一題重複作答不會重複領取。
    if (!isOpenEnded && correct) {
      awardXp('answerCorrect', { questionId: question.id });
    }

    // 💪 答錯時顯示鼓勵語（開放式題目沒有「錯」，不顯示）
    if (!isOpenEnded && !correct) {
      setWrongEncouragement(pickRandom(ENCOURAGEMENTS));
    }

    // 呼叫 AI 分析答案
    setAiLoading(true);
    setAiError('');
    try {
      // ⚠️ Validate correctAnswer against choices before sending to AI
      // If correctAnswer is a letter out of range (e.g., "D" but only 3 choices),
      // normalize it to prevent AI hallucination
      let normalizedCorrectAnswer = question.answer;
      if (question.choices && question.choices.length > 0) {
        const answerUpper = question.answer.trim().toUpperCase();
        const answerIdx = MCQ_LETTERS.indexOf(answerUpper as (typeof MCQ_LETTERS)[number]);
        if (answerIdx >= 0 && answerIdx >= question.choices.length) {
          // Answer letter out of range — NEVER fabricate 'A'. Only re-point to a
          // choice when the answer text unambiguously matches one; otherwise keep
          // the raw answer for the AI (the server already rejects defective keys).
          logger.warn({
            module: 'student-practice-detail',
            questionId: question.id,
            answer: question.answer,
            choicesCount: question.choices.length,
          }, 'Correct answer letter out of range, keeping original answer for AI analysis');
          const textMatchIdx = question.choices.findIndex(
            c => stripMcqPrefix(c).toLowerCase() === question.answer.trim().toLowerCase()
          );
          if (textMatchIdx >= 0) {
            normalizedCorrectAnswer = getMcqLetterByIndex(textMatchIdx) ?? question.answer;
          }
        }
      }

      const res = await fetch('/api/ai/analyze-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.prompt,
          questionType: question.type,
          correctAnswer: normalizedCorrectAnswer,
          studentAnswer: selectedAnswer,
          choices: question.choices || undefined,
          listeningContent: question.listeningContent || undefined,
          readingContent: question.readingContent || undefined,
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

    // 2026-09-23 稽核修正：**不再**由客戶端建立錯題。
    // 舊碼在這裡以瀏覽器算出的 `correct` 與客戶端自報的答案 POST /api/mistakes，
    // 繞過 usedServerScoring 閘門（而且因為 ON CONFLICT DO NOTHING，客戶端
    // 那筆會贏過之後伺服器評分產生的權威版本）→ 可被偽造、無證據的錯題。
    // 錯題現由伺服器於 submitPractice() 以伺服器答案鍵評分後建立
    // （見 practice-submission-service.ts，必須 usedServerScoring），
    // 且 /api/mistakes 只接受已有伺服器批改紀錄的題目。
  };

  const handleNext = async () => {
    if (isSessionMode && hasNextSession) {
      // 2026-10-07：目標索引由 findNextSessionQuestionIndex 決定（永不指向當前題目）。
      // 這裡**不再**清空本機作答狀態：題目 id 真的改變時本頁會重新掛載，狀態自然
      // 重置（並由 store 還原該題已有的作答紀錄）。導覽若沒有真正發生（失敗／被
      // 中止／同一 id 造成原地不動），狀態因而保留 —— 學生不會看到剛答完的題目
      // 以未作答的樣子再次出現（學生回報的「作答後，題目重複出現」）。
      const nextQ = sessionQuestions[nextSessionIndex];
      if (nextQ) router.push(`/student/practice/${nextQ.id}`);
      return;
    } else if (isSessionMode) {
      // 完成所有題目 → 儲存完整練習記錄 + 顯示摘要
      if (store.currentSession && !hasSavedRef.current) {
        hasSavedRef.current = true;
        const session = store.currentSession;
        // 保存快照以便 SessionCompleteSummary 使用（completeSession 會清空 currentSession）
        setCompletedSession({ ...session });
        const { questions, answers, results, skill, skillZh, difficulty, totalQuestions, correctCount, source } = session;
        const answerRecords = questions.map((q, idx) => ({
          questionId: q.id,
          questionIndex: idx,
          questionType: q.type || 'mc',
          questionPrompt: q.prompt || '',
          correctAnswer: q.answer || '',
          choices: q.choices ?? undefined,
          studentAnswer: answers[q.id] || '',
          // R3.3: isCorrect 僅供舊版伺服器回溯相容；現行伺服器會忽略並自行評分
          isCorrect: results[q.id] ?? false,
        }));
        // 先 await 儲存完成，再標記 session 完成
        // R3.10-E.2 P0-3: clientSubmissionId = session.id 僅作重播/去重鍵，
        // 絕非權威信號。重複提交由伺服器回傳原始持久化結果。
        const saved = await savePractice({
          studentId: store.userId || '',
          skill: skill || 'general',
          skillZh: skillZh || '',
          difficulty: difficulty || 'core',
          totalQuestions,
          correctCount,
          source: source || 'ai-generated',
          clientSubmissionId: session.id,
          answers: answerRecords,
        });
        if (!saved) {
          setSaveError(store.language === 'en'
            ? 'Failed to save this practice session. Please try completing it again to save your progress.'
            : '未能儲存本次練習記錄，請再次按完成練習以保存進度。');
          hasSavedRef.current = false;
          return;
        }
        store.completeSession();
        // 2026-09-28：完成練習 XP 須對應真實場次（伺服器以
        // (studentId, clientSubmissionId) 驗證並自行建立去重鍵）
        const awarded = await awardXp('completeSession', {
          sessionId: session.id,
        });
        if (!awarded) setPendingCompletionXp({ sessionId: session.id });
      }
      setSessionComplete(true);
      return;
    }
    router.push('/student/practice');
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
        {/* 聆聽題：隱藏聆聽內容文字，只顯示播放器（v2.0：每題獨立錄音） */}
        {isListening && (
          <div className="mb-4 p-4 bg-teal-50 dark:bg-teal-900/20 rounded-xl border-2 border-teal-300 dark:border-teal-600">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🎧</span>
              <span className="text-sm font-semibold text-teal-700 dark:text-teal-300">
                {!listeningRevealed && !submitted ? t('practice.question.listeningTitle') : t('practice.question.listeningContent')}
              </span>
              <AudioPlayer
                text={question.listeningContent || question.prompt}
                label={!listeningRevealed && !submitted ? t('practice.question.play') : t('practice.question.replay')}
                size="sm"
                useCloudTTS
                onPrefetchReady={(prefetchFn) => {
                  // 預載入下一題音訊
                  if (isSessionMode && hasNextSession) {
                    const nextQ = sessionQuestions[sessionIndex + 1];
                    if (nextQ?.listeningContent && nextQ.languageSkill === 'listening') {
                      // 在組件掛載後 500ms 觸發預載入
                      setTimeout(() => prefetchFn?.(), 500);
                    }
                  }
                }}
              />
            </div>

            {/* 聆聽文字：根據狀態顯示/隱藏 */}
            <div className={!listeningRevealed && !submitted ? 'hidden' : ''}>
              <ListeningScript
                content={question.listeningContent || question.prompt}
                textColor="text-teal-800"
                textColorDark="dark:text-teal-200"
              />
              {question.listeningContentZh && (
                <p className="text-xs text-teal-500 mt-1">{question.listeningContentZh}</p>
              )}
            </div>

            {/* 揭示/隱藏按鈕（提交前可切換） */}
            {!submitted && (
              <button
                onClick={() => setListeningRevealed(prev => !prev)}
                className="mt-2 text-xs text-teal-500 hover:text-teal-700 underline"
              >
                {listeningRevealed ? t('practice.question.hideText') : t('practice.question.showText')}
              </button>
            )}
          </div>
        )}

        {/* 篇章：只要題目帶有 readingContent 就**必須**顯示。舊碼只在
            `languageSkill === 'reading'` 時渲染，一旦篇章隨其他技能交付
            （詞彙／文法，或模型自發附帶篇章），題目就會被單獨顯示 —— 學生看到
            「According to the passage …」卻無篇章可讀（2026-10-10 生產回報
            「沒有生成 passage」）。條件與診斷頁（`languageSkill === 'reading'
            || readingContent`）一致。 */}
        {question.type !== 'error-correction' && question.readingContent && (
          <div className="mb-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border-2 border-indigo-300 dark:border-indigo-600">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">📖</span>
              <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                {isReading ? t('practice.question.readingPassage') : t('practice.question.contextText')}
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

        {/* 改錯題：顯示需要改正的篇章/句子 */}
        {question.type === 'error-correction' && question.readingContent && (
          <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border-2 border-amber-300 dark:border-amber-600">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">📖</span>
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                {t('practice.question.readingPassage')}
              </span>
            </div>
            <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed whitespace-pre-line">
              {question.readingContent}
            </p>
            {question.readingContentZh && (
              <p className="text-xs text-amber-500 mt-2 italic">{question.readingContentZh}</p>
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
            {question.choices.map((choice: string, index: number) => {
              const correctLetter = question.answer.trim().toUpperCase();
              const choiceLetter = getMcqLetterByIndex(index) ?? '';
              const choiceText = stripMcqPrefix(choice) || (store.language === 'zh' ? `選項 ${choiceLetter}` : `Option ${choiceLetter}`);
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
                  className={`w-full flex items-center gap-3 p-4 border-2 rounded-xl text-left transition-colors min-h-[48px] appearance-none active:bg-gray-50 dark:active:bg-gray-800 ${choiceStyle}`}
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

        {/* 改錯題輸入（僅在沒有 MC 選項時顯示自由輸入框） */}
        {question.type === 'error-correction' && (!question.choices || question.choices.length === 0) && (
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
        <div className={`rounded-xl p-4 border-2 ${isCorrect ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700' : isOpenEnded ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-700'}`}>
          <div className="flex items-center gap-2 mb-3">
            {isCorrect ? (
              <>
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <Check className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-green-800 dark:text-green-200">{t('practice.question.correct')}</span>
              </>
            ) : isOpenEnded ? (
              <>
                <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-amber-800 dark:text-amber-200">{t('practice.question.openEnded')}</span>
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

          {isOpenEnded && (
            <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">{t('practice.question.openEndedNote')}</p>
          )}

          {!isCorrect && (
            <>
              {wrongEncouragement && (
                <p className="text-sm text-orange-600 dark:text-orange-400 mb-2 font-medium animate-fadeIn">
                  {wrongEncouragement}
                </p>
              )}
              <div className="text-sm mb-2 flex items-center gap-2">
              <span className="text-gray-500 dark:text-gray-400">{isOpenEnded ? t('practice.question.sampleAnswerLabel') : t('practice.question.correctAnswerLabel')}</span>
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
                <span>{t('practice.aiAnalyzing')}</span>
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
                  <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide">{t('practice.aiSmartAnalysis')}</span>
                </div>

                {/* AI 評分 */}
                {aiAnalysis.score != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{t('practice.aiScore')}</span>
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
                    <p className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">{t('practice.aiImprovementTips')}</p>
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
      {saveError && (
        <p className="text-sm text-red-600 dark:text-red-400 text-right">{saveError}</p>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!submitted && (
            <button
              onClick={handleHint}
              disabled={currentHint >= question.hintLevels.length}
              className="flex items-center gap-1 px-3 py-2 text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg hover:bg-yellow-100 transition-colors disabled:opacity-50"
            >
              <Lightbulb className="w-4 h-4" />
              {language === 'en'
                ? `Hint (${currentHint}/${question.hintLevels.length})`
                : `提示 (${currentHint}/${question.hintLevels.length})`}
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
              {t('practice.submitAnswer')}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2.5 bg-teal-500 hover:bg-teal-600 text-white font-medium rounded-xl transition-colors"
            >
              {!hasNextSession ? (
                <>{t('practice.completePractice')}</>
              ) : (
                <>{t('practice.nextQuestion')} <ArrowRight className="w-4 h-4" /></>
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
  session: { questions: PracticeQuestion[]; answers: Record<string, string>; results: Record<string, boolean | null>; totalQuestions: number; correctCount: number; skillZh: string; difficulty: string };
  onBackToPractice: () => void;
  onReviewMistakes: () => void;
  onDashboard: () => void;
  onRetry: () => void;
}) {
  const { t, language } = useT();
  // 2026-09-15：開放式題目（results = null）不自動評分 —— 不進分子/分母，
  // 也不以「答錯」顯示。分母只計可自動評分的題目。
  const graded = session.questions
    .map(q => session.results[q.id])
    .filter((v): v is boolean => v === true || v === false);
  const ungradedCount = session.questions.filter(q => session.results[q.id] === null).length;
  const gradedCount = graded.length;
  const gradedCorrect = graded.filter(Boolean).length;
  const hasScored = gradedCount > 0;
  const acc = hasScored ? Math.round((gradedCorrect / gradedCount) * 100) : 0;
  const emoji = acc >= 90 ? '🏆' : acc >= 70 ? '🌟' : acc >= 50 ? '💪' : '📚';
  const color = acc >= 90 ? 'text-amber-600' : acc >= 70 ? 'text-teal-600' : acc >= 50 ? 'text-orange-500' : 'text-red-500';
  const incorrectCount = graded.filter(v => !v).length;

  return (
    <div className="space-y-6">
      <div className="text-center py-8">
        <div className="text-5xl mb-3">{emoji}</div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('practice.completeTitle')}</h1>
        {hasScored ? (
          <>
            <div className={`text-5xl font-extrabold ${color}`}>
              {gradedCorrect}<span className="text-2xl text-gray-400">/{gradedCount}</span>
            </div>
            <p className="text-sm text-gray-500 mt-2">{t('practice.weeklyAccuracy').replace('{n}', String(acc))}</p>
          </>
        ) : (
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">{t('practice.summaryNoScored')}</p>
        )}
        {ungradedCount > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{t('practice.summaryUngraded').replace('{n}', String(ungradedCount))}</p>
        )}
        <p className="text-xs text-gray-400 mt-1">{session.skillZh} · {session.difficulty === 'remedial' ? t('practice.diffRemedial') : session.difficulty === 'challenge' ? t('practice.diffChallenge') : t('practice.diffCore')}</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{t('practice.answerSummary')}</h3>
        <div className="space-y-2">
          {session.questions.map((q, i) => {
            const verdict = session.results[q.id];
            const ungraded = verdict === null;
            const correct = verdict === true;
            const answer = session.answers[q.id] || t('practice.unanswered');
            return (
              <div key={q.id} className={`flex items-start gap-3 p-3 rounded-lg ${ungraded ? 'bg-amber-50 dark:bg-amber-900/10' : correct ? 'bg-green-50 dark:bg-green-900/10' : 'bg-red-50 dark:bg-red-900/10'}`}>
                <span className={`mt-0.5 shrink-0 ${ungraded ? 'text-amber-500' : correct ? 'text-green-500' : 'text-red-500'}`}>
                  {ungraded ? <Sparkles className="w-5 h-5" /> : correct ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate" dangerouslySetInnerHTML={{ __html: "Q" + (i + 1) + ". " + q.prompt }} />
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t('practice.yourAnswer')}<span className={ungraded ? 'text-gray-600 dark:text-gray-400' : correct ? 'text-green-600 font-medium' : 'text-red-500 line-through'}>{answer}</span>
                    {ungraded && <span className="text-amber-600 dark:text-amber-400 ml-2">{t('practice.question.openEndedShort')}</span>}
                    {!correct && !ungraded && <span className="text-green-600 ml-2">✓ {q.answer}</span>}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={onRetry} className="py-3 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
          <RotateCcw className="w-4 h-4" /> {language === 'en' ? 'Try Again' : '再做一次'}
        </button>
        {incorrectCount > 0 && (
          <button onClick={onReviewMistakes} className="py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
            <Flag className="w-4 h-4" /> {language === 'en' ? `Review Mistakes (${incorrectCount})` : `查看錯題 (${incorrectCount})`}
          </button>
        )}
        <button onClick={onBackToPractice} className="py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          {language === 'en' ? 'Continue Practising' : '繼續練習'}
        </button>
        <button onClick={onDashboard} className="py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2">
          <Home className="w-4 h-4" /> {language === 'en' ? 'Back to Dashboard' : '返回主頁'}
        </button>
      </div>
    </div>
  );
}
