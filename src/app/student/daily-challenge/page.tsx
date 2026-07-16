// ============================================
// 學生端 — Daily Challenge 每日挑戰
// 每日一題，完成獲得 streak bonus + XP
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { Calendar, Flame, Sparkles, Loader2, Trophy, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useT } from '@/hooks/use-i18n';

interface DailyQuestion {
  question: {
    prompt: string;
    promptZh?: string;
    choices?: string[];
    answer: string;
    explanationZh?: string;
    explanationEn?: string;
  };
  topic: string;
  topicZh: string;
}

interface ChallengeState {
  status: 'loading' | 'ready' | 'answered' | 'completed' | 'error';
  question?: DailyQuestion;
  selectedAnswer?: string;
  isCorrect?: boolean;
  xpEarned?: number;
  error?: string;
}

export default function DailyChallengePage() {
  const { language, userId } = useAppStore();
  const { t } = useT();
  const [state, setState] = useState<ChallengeState>({ status: 'loading' });
  const [studentId, setStudentId] = useState('');
  const [gradeLevel, setGradeLevel] = useState('S4');

  useEffect(() => {
    fetch('/api/auth/profile')
      .then(r => r.json())
      .then(d => {
        const id = d?.user?.id || '';
        const lvl = d?.user?.level || d?.user?.class?.gradeLevel || 'S4';
        setStudentId(id);
        setGradeLevel(lvl);
        if (id) loadChallenge(id, lvl);
      })
      .catch(() => setState({ status: 'error', error: 'Failed to load profile' }));
  }, []);

  async function loadChallenge(sid: string, lvl: string) {
    setState({ status: 'loading' });
    try {
      const res = await fetch(`/api/daily-challenge?studentId=${encodeURIComponent(sid)}&gradeLevel=${encodeURIComponent(lvl)}`);
      const data = await res.json();
      if (data.alreadyCompleted) {
        setState({ status: 'completed' });
      } else if (data.question) {
        setState({ status: 'ready', question: data });
      } else {
        setState({ status: 'error', error: data.error || 'Failed to load challenge' });
      }
    } catch {
      setState({ status: 'error', error: 'Network error' });
    }
  }

  async function submitAnswer(answer: string) {
    if (!studentId || state.status !== 'ready') return;
    const q = state.question!;
    const isCorrect = answer === q.question.answer;
    setState({ ...state, status: 'answered', selectedAnswer: answer, isCorrect });

    try {
      const res = await fetch('/api/daily-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, answer, correctAnswer: q.question.answer }),
      });
      const data = await res.json();
      setState(prev => ({ ...prev, xpEarned: data.xpEarned || 0 }));
    } catch { /* ignore */ }
  }

  const today = new Date().toLocaleDateString(language === 'en' ? 'en-US' : 'zh-HK', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calendar className="w-6 h-6" /> {language === 'en' ? 'Daily Challenge' : '每日挑戰'}
            </h1>
            <p className="text-orange-100 text-sm mt-1">{today}</p>
          </div>
          <Flame className="w-10 h-10 text-yellow-300" />
        </div>
      </div>

      {/* Loading */}
      {state.status === 'loading' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center shadow-sm border">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500 mx-auto mb-3" />
          <p className="text-gray-500">{language === 'en' ? 'Loading challenge...' : '載入挑戰中...'}</p>
        </div>
      )}

      {/* Error */}
      {state.status === 'error' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow-sm border">
          <p className="text-red-500 mb-3">{state.error}</p>
          <button
            onClick={() => loadChallenge(studentId, gradeLevel)}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm"
          >
            {language === 'en' ? 'Retry' : '重試'}
          </button>
        </div>
      )}

      {/* Already completed */}
      {state.status === 'completed' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow-sm border space-y-4">
          <Trophy className="w-12 h-12 text-yellow-500 mx-auto" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {language === 'en' ? 'Challenge Completed!' : '今日挑戰已完成！'}
          </h2>
          <p className="text-gray-500">
            {language === 'en'
              ? "You've already completed today's challenge. Come back tomorrow!"
              : '你已經完成了今天的挑戰，明天再來吧！'}
          </p>
          <p className="text-4xl">🔥</p>
        </div>
      )}

      {/* Answer feedback */}
      {state.status === 'answered' && (
        <div className={`bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border space-y-4 ${
          state.isCorrect ? 'border-green-300 dark:border-green-700' : 'border-red-300 dark:border-red-700'
        }`}>
          <div className="flex items-center gap-3">
            {state.isCorrect ? (
              <CheckCircle className="w-8 h-8 text-green-500" />
            ) : (
              <XCircle className="w-8 h-8 text-red-500" />
            )}
            <div>
              <p className="font-bold text-lg text-gray-900 dark:text-white">
                {state.isCorrect
                  ? (language === 'en' ? 'Correct!' : '回答正確！')
                  : (language === 'en' ? 'Incorrect' : '回答錯誤')}
              </p>
              {state.xpEarned !== undefined && state.xpEarned > 0 && (
                <p className="text-sm text-orange-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> +{state.xpEarned} XP
                </p>
              )}
            </div>
          </div>
          {!state.isCorrect && (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-sm">
              <p className="text-gray-500 mb-1">{language === 'en' ? 'Correct answer:' : '正確答案：'}</p>
              <p className="font-semibold text-gray-900 dark:text-white">{state.question?.question.answer}</p>
            </div>
          )}
          {(state.question?.question.explanationZh || state.question?.question.explanationEn) && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {language === 'en'
                ? state.question?.question.explanationEn
                : state.question?.question.explanationZh}
            </p>
          )}
        </div>
      )}

      {/* Question */}
      {(state.status === 'ready' || state.status === 'answered') && state.question && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border space-y-4">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full">
              {state.question.topicZh || state.question.topic}
            </span>
          </div>
          <p className="text-lg font-medium text-gray-900 dark:text-white">
            {state.question.question.prompt}
          </p>
          {state.question.question.promptZh && (
            <p className="text-sm text-gray-500">{state.question.question.promptZh}</p>
          )}
          {state.question.question.choices && (
            <div className="space-y-2 mt-4">
              {state.question.question.choices.map((choice, i) => {
                const letter = String.fromCharCode(65 + i);
                const isSelected = state.selectedAnswer === letter;
                const isCorrectAnswer = letter === state.question?.question.answer;
                let btnClass = 'w-full text-left p-3 rounded-xl border transition-colors text-sm ';
                if (state.status === 'answered') {
                  if (isCorrectAnswer) btnClass += 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700';
                  else if (isSelected && !isCorrectAnswer) btnClass += 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700';
                  else btnClass += 'border-gray-200 dark:border-gray-700 text-gray-500';
                } else {
                  btnClass += 'border-gray-200 dark:border-gray-700 hover:border-orange-400 dark:hover:border-orange-500 text-gray-700 dark:text-gray-300';
                }
                return (
                  <button
                    key={i}
                    className={btnClass}
                    onClick={() => state.status === 'ready' && submitAnswer(letter)}
                    disabled={state.status === 'answered'}
                  >
                    <span className="font-semibold mr-2">{letter}.</span>
                    {choice.replace(/^[A-D][.)\s]+/, '')}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
