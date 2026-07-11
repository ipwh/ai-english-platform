// ============================================
// 學生端 — 單題作答頁面
// 支援：預設題目 + AI 生成題目 + 進度追蹤
// ============================================
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, ArrowRight, Check, X, Lightbulb, Volume2,
  BookMarked, Clock, Sparkles, Loader2, Flag,
} from 'lucide-react';
import SkillChip from '@/components/shared/SkillChip';
import ProgressBar from '@/components/shared/ProgressBar';
import AudioPlayer from '@/components/shared/AudioPlayer';
import { useAppStore } from '@/store/appStore';
import type { AnswerAnalysis } from '@/lib/ai-service';
import type { PracticeQuestion } from '@/lib/types';

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

/** 智能答案比對：文字題忽略大小寫、多餘空白及標點 */
function checkAnswer(student: string, correct: string, type: string): boolean {
  if (type === 'mc') {
    return student.trim().toUpperCase() === correct.trim().toUpperCase();
  }
  // 文字題：忽略大小寫、前後空白、多餘空格
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?,;:]$/, '');
  return normalize(student) === normalize(correct);
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

  // 合併 mock 題目 + AI session 題目
  const allQuestions = useMemo(() => {
    const sessionQuestions = store.currentSession?.questions || [];
    return [...sessionQuestions];
  }, [store.currentSession]);

  const question = allQuestions.find(q => q.id === params.id) || null;
  
  if (!question) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <p className="text-gray-500 mb-3">找不到此題目</p>
          <Link href="/student/practice" className="text-blue-600 hover:underline">
            ← 返回練習頁面
          </Link>
        </div>
      </div>
    );
  }
  const isListening = question.languageSkill === 'listening';
  const isReading = question.languageSkill === 'reading';

  // === Session 進度 ===
  const isSessionMode = !!store.currentSession;
  const sessionQuestions = store.currentSession?.questions || [];
  const sessionIndex = sessionQuestions.findIndex(q => q.id === params.id);
  const sessionTotal = sessionQuestions.length;
  const sessionProgress = sessionTotal > 0 ? ((sessionIndex + 1) / sessionTotal) * 100 : 0;
  const hasNextSession = sessionIndex < sessionTotal - 1;

  /** 智能答案比對：MC 題精確匹配，文字題忽略大小寫與多餘空白 */
  const isCorrect = submitted && checkAnswer(selectedAnswer, question.answer, question.type);

  const handleSubmit = async () => {
    if (!selectedAnswer) return;
    setSubmitted(true);

    const correct = checkAnswer(selectedAnswer, question.answer, question.type);

    // 記錄到 store
    if (isSessionMode) {
      store.submitAnswer(question.id, selectedAnswer, correct);
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
        setAiError(json.error || 'AI 分析暫時無法使用');
      }
    } catch {
      setAiError('AI 服務連線失敗');
    } finally {
      setAiLoading(false);
    }

    // 儲存練習記錄到後端
    if (isSessionMode) {
      fetch('/api/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: store.userId || '',
          skill: question.grammarItem || question.languageSkill || 'general',
          skillZh: question.subSkillZh || '',
          difficulty: question.difficulty || 'core',
          totalQuestions: sessionQuestions.length,
          correctCount: correct ? 1 : 0,
          source: 'ai-generated',
        }),
      }).catch(() => {});
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
      // 完成所有題目
      if (isSessionMode) store.completeSession();
      router.push('/student/practice');
    }
    setSelectedAnswer('');
    setSubmitted(false);
    setCurrentHint(0);
    setAiAnalysis(null);
    setAiError('');
    setListeningRevealed(false);
  };

  // 離開頁面時自動儲存 session 進度（防止導航遺失）
  useEffect(() => {
    return () => {
      if (isSessionMode && store.currentSession && !store.currentSession.completedAt) {
        // 儲存進行中的 session 到後端
        fetch('/api/practice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId: store.userId || '',
            skill: store.currentSession.skill || 'general',
            skillZh: store.currentSession.skillZh || '',
            difficulty: store.currentSession.difficulty || 'core',
            totalQuestions: store.currentSession.totalQuestions,
            correctCount: store.currentSession.correctCount,
            source: store.currentSession.source || 'ai-generated',
          }),
        }).catch(() => {});
      }
    };
  }, [isSessionMode, store.currentSession, store.userId]);

  const handleHint = () => {
    if (currentHint < question.hintLevels.length) {
      setCurrentHint(currentHint + 1);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 頂部導航 */}
      <div className="flex items-center justify-between">
        <Link href="/student/practice" className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" />
          返回練習中心
        </Link>
        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> 02:35</span>
          {isSessionMode && (
            <span className="text-purple-500 flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI 練習</span>
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
        第 {isSessionMode ? sessionIndex + 1 : 0}/{isSessionMode ? sessionTotal : 0} 題
        {isSessionMode && <span className="ml-2 text-purple-500">· AI 生成練習</span>}
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
                {!listeningRevealed && !submitted ? '聆聽理解練習 — 請先聆聽，不要看文字' : '聆聽內容'}
              </span>
              <AudioPlayer
                text={question.listeningContent || question.prompt}
                label={!listeningRevealed && !submitted ? '▶ 播放' : '重播'}
                size="sm"
              />
            </div>

            {/* 聆聽文字：根據狀態顯示/隱藏 */}
            <div className={!listeningRevealed && !submitted ? 'hidden' : ''}>
              <p
                className="text-sm text-teal-800 dark:text-teal-200 leading-relaxed whitespace-pre-line cursor-help"
                title={question.listeningContentZh || '聆聽內容文字'}
              >
                {question.listeningContent || question.prompt}
              </p>
              {question.listeningContentZh && (
                <p className="text-xs text-teal-500 mt-1">{question.listeningContentZh}</p>
              )}
            </div>

            {/* 揭示按鈕（只在上方文字隱藏時顯示） */}
            {!listeningRevealed && !submitted && (
              <button
                onClick={() => setListeningRevealed(true)}
                className="mt-2 text-xs text-teal-500 hover:text-teal-700 underline"
              >
                我需要看文字版本
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
                閱讀篇章
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
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">顯示中文提示</summary>
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
              placeholder="請輸入答案..."
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
              placeholder="請在此寫下你的答案..."
              rows={4}
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:border-teal-400 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              {selectedAnswer.length} 字元 / {selectedAnswer.trim() ? selectedAnswer.trim().split(/\s+/).length : 0} 字
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
              placeholder="請寫出改正後的句子..."
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
            <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">提示 {currentHint}/4</span>
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
                <span className="font-semibold text-green-800 dark:text-green-200">回答正確！</span>
              </>
            ) : (
              <>
                <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                  <X className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-red-800 dark:text-red-200">回答錯誤</span>
              </>
            )}
          </div>

          {!isCorrect && (
            <div className="text-sm mb-2 flex items-center gap-2">
              <span className="text-gray-500 dark:text-gray-400">正確答案：</span>
              <span className="font-bold text-green-700 dark:text-green-300">{question.answer}</span>
              <AudioPlayer
                text={getFullAnswerText(question)}
                label=""
                size="sm"
              />
            </div>
          )}

          {/* AI 解釋（中/英切換） */}
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setShowZh(true)}
                className={`text-xs px-2 py-1 rounded ${showZh ? 'bg-teal-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600'}`}
              >
                中文解釋
              </button>
              <button
                onClick={() => setShowZh(false)}
                className={`text-xs px-2 py-1 rounded ${!showZh ? 'bg-teal-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600'}`}
              >
                English
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
            <p className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">⚠️ 常犯錯誤</p>
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
                {aiError}（已顯示預設解釋）
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
                  const labels: Record<string, string> = {
                    grammar: '文法錯誤', vocabulary: '詞彙錯誤', comprehension: '理解錯誤',
                    careless: '粗心大意', 'time-management': '時間管理', chinglish: '中式英文',
                  };
                  return (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">錯誤類型：</span>
                      <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full">
                        {labels[aiAnalysis.mistakeType] || aiAnalysis.mistakeType}
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
