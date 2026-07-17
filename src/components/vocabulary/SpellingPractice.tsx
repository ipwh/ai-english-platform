// ============================================
// SpellingPractice — 串字練習元件
// 顯示中文意思 + 英文解釋（可選），用戶自行輸入英文單詞
// 支援：即時批改、重試、進度追蹤、SRS 更新
// ============================================
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Loader2, Check, X, RotateCcw, ArrowRight, ArrowLeft,
  Sparkles, Brain, Target, Trophy, AlertCircle, Eye, EyeOff,
  Volume2, Lightbulb, Search, ListChecks,
} from 'lucide-react';
import AudioPlayer from '@/components/shared/AudioPlayer';
import ProgressBar from '@/components/shared/ProgressBar';
import { useT } from '@/hooks/use-i18n';

// ============================================
// Types
// ============================================

interface SpellingWord {
  vocabId: string;
  word: string;
  meaningZh: string;
  partOfSpeech: string;
  explanationEn?: string;
}

interface SpellingAttempt {
  vocabId?: string;
  word: string;
  meaningZh: string;
  explanationEn?: string;
  studentInput: string;
  attemptCount: number;
  isCorrect?: boolean;
}

type Stage = 'config' | 'practicing' | 'result';

interface Props {
  studentId: string;
  /** 外部傳入的特定單字列表（可選，用於從 vocab 頁面直接開始特定練習） */
  preselectedWords?: { vocabId: string; word: string; meaningZh: string; partOfSpeech: string; exampleSentence?: string }[];
  /** 自選生字 ID 列表（可選，優先於 mode） */
  wordIds?: string[];
  /** 完成後的回呼 */
  onComplete?: (result: { correct: number; total: number; accuracy: number }) => void;
  /** 是否嵌入模式（較小尺寸） */
  embedded?: boolean;
}

// ============================================
// Component
// ============================================

export default function SpellingPractice({
  studentId,
  preselectedWords,
  wordIds,
  onComplete,
  embedded = false,
}: Props) {
  const { t, language } = useT();

  // State
  const [stage, setStage] = useState<Stage>(preselectedWords?.length ? 'practicing' : 'config');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [words, setWords] = useState<SpellingWord[]>(
    preselectedWords?.map(w => ({ vocabId: w.vocabId, word: w.word, meaningZh: w.meaningZh, partOfSpeech: w.partOfSpeech, explanationEn: w.exampleSentence })) || []
  );
  const [sessionId, setSessionId] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [attemptCount, setAttemptCount] = useState(1);
  const [showHint, setShowHint] = useState(false);
  const [results, setResults] = useState<SpellingAttempt[]>([]);
  const [mode, setMode] = useState<'new' | 'random' | 'weakest' | 'due' | 'pick'>('random');
  const [count, setCount] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [finalResult, setFinalResult] = useState<{ correct: number; total: number; accuracy: number } | null>(null);

  // Word picker state (for 'pick' mode)
  const [pickerWords, setPickerWords] = useState<SpellingWord[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [pickerError, setPickerError] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on new word & scroll into view for mobile
  useEffect(() => {
    if (stage === 'practicing' && inputRef.current) {
      inputRef.current.focus();
      // Small delay to let mobile keyboard appear, then scroll
      setTimeout(() => {
        inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [currentIndex, stage]);

  // ============================================
  // Fetch vocab for manual picker
  // ============================================
  const fetchVocabForPicker = useCallback(async () => {
    setPickerLoading(true);
    setPickerError('');
    try {
      const res = await fetch(`/api/vocabulary?studentId=${encodeURIComponent(studentId)}&limit=200`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const items = (data.items || data.vocabulary || []).map((v: Record<string, unknown>) => ({
        vocabId: String(v.id || ''),
        word: String(v.word || ''),
        meaningZh: String(v.meaningZh || ''),
        partOfSpeech: String(v.partOfSpeech || ''),
        explanationEn: v.exampleSentence ? String(v.exampleSentence) : undefined,
      }));
      setPickerWords(items);
    } catch (err) {
      setPickerError(err instanceof Error ? err.message : 'Failed to load vocabulary');
    } finally {
      setPickerLoading(false);
    }
  }, [studentId]);

  // Load vocab when entering pick mode
  useEffect(() => {
    if (mode === 'pick' && pickerWords.length === 0 && !pickerLoading) {
      fetchVocabForPicker();
    }
  }, [mode, pickerWords.length, pickerLoading, fetchVocabForPicker]);

  // ============================================
  // Generate words
  // ============================================
  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let url = `/api/vocabulary/spelling?studentId=${encodeURIComponent(studentId)}&count=${count}&mode=${mode}`;
      // In pick mode, pass selected word IDs
      if (mode === 'pick' && pickedIds.size > 0) {
        url += `&wordIds=${Array.from(pickedIds).join(',')}`;
      } else if (wordIds && wordIds.length > 0) {
        url += `&wordIds=${wordIds.join(',')}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || data.message || t('vocab.loadFailed'));
        return;
      }
      if (!data.words?.length) {
        setError(data.message || (language === 'en' ? 'No words to practice. Add some first!' : '生字簿沒有單字，先加入一些吧！'));
        return;
      }
      setWords(data.words);
      setSessionId(data.sessionId);
      setCurrentIndex(0);
      setResults([]);
      setUserInput('');
      setShowResult(false);
      setAttemptCount(1);
      setStage('practicing');
    } catch {
      setError(t('vocab.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [studentId, count, mode, t, language]);

  // If preselected words provided, generate session on mount
  useEffect(() => {
    if (preselectedWords?.length && !sessionId) {
      handleGenerate();
    }
  }, [preselectedWords, sessionId, handleGenerate]);

  // ============================================
  // Submit single answer
  // ============================================
  const handleCheck = () => {
    if (!userInput.trim()) return;
    const correct = userInput.trim().toLowerCase() === words[currentIndex].word.toLowerCase();
    setIsCorrect(correct);
    setShowResult(true);
  };

  const handleNext = () => {
    const attempt: SpellingAttempt = {
      vocabId: words[currentIndex].vocabId,
      word: words[currentIndex].word,
      meaningZh: words[currentIndex].meaningZh,
      explanationEn: words[currentIndex].explanationEn,
      studentInput: userInput.trim(),
      attemptCount,
      isCorrect,
    };
    setResults(prev => [...prev, attempt]);

    if (currentIndex < words.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setUserInput('');
      setShowResult(false);
      setAttemptCount(1);
      setShowHint(false);
    } else {
      // Last word — submit all
      handleSubmitAll([...results, attempt]);
    }
  };

  const handleRetry = () => {
    setUserInput('');
    setShowResult(false);
    setAttemptCount(prev => prev + 1);
  };

  const handleSubmitAll = async (allResults: SpellingAttempt[]) => {
    if (!sessionId) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/vocabulary/spelling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, studentId, attempts: allResults }),
      });
      const data = await res.json();
      if (res.ok) {
        const result = {
          correct: data.correctCount,
          total: data.totalWords,
          accuracy: data.accuracy,
        };
        setFinalResult(result);
        setStage('result');
        onComplete?.(result);
      }
    } catch {
      setError(language === 'en' ? 'Failed to submit results' : '提交結果失敗');
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================
  // Keyboard handler
  // ============================================
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showResult) {
      if (e.key === 'Enter') handleNext();
      else if (e.key === 'Backspace' && !isCorrect) handleRetry();
      return;
    }
    if (e.key === 'Enter') handleCheck();
  };

  // ============================================
  // Render: Config
  // ============================================
  if (stage === 'config' && !preselectedWords?.length) {
    return (
      <div className={`${embedded ? 'p-0' : 'bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700'}`}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <Brain className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {language === 'en' ? 'Spelling Practice' : '串字練習'}
            </h3>
            <p className="text-xs text-gray-500">
              {language === 'en' ? 'See meaning, type the word' : '看中英解釋，輸入正確英文單詞'}
            </p>
          </div>
        </div>

        {/* Mode selection */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              {language === 'en' ? 'Word Selection' : '選字模式'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'new', labelZh: '最新加入', labelEn: 'Newest' },
                { value: 'random', labelZh: '隨機選取', labelEn: 'Random' },
                { value: 'weakest', labelZh: '最弱優先', labelEn: 'Weakest' },
                { value: 'due', labelZh: '到期複習', labelEn: 'Due Review' },
                { value: 'pick', labelZh: '✋ 自選單字', labelEn: '✋ Pick Words' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setMode(opt.value as typeof mode); if (opt.value === 'pick') setCount(pickedIds.size || 10); }}
                  className={`p-3 rounded-xl text-sm font-medium transition-all ${
                    mode === opt.value
                      ? 'bg-purple-500 text-white shadow-md shadow-purple-200 dark:shadow-purple-900/30'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {language === 'en' ? opt.labelEn : opt.labelZh}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Word picker (shown when mode === 'pick') */}
        {mode === 'pick' && (
          <div className="mb-4 p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-200 dark:border-purple-800">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-purple-800 dark:text-purple-300 flex items-center gap-1.5">
                <ListChecks className="w-4 h-4" />
                {language === 'en' ? 'Select Words' : '選取要練習的單字'}
              </h4>
              <span className="text-xs text-purple-600 dark:text-purple-400">
                {language === 'en' ? `${pickedIds.size} selected` : `已選 ${pickedIds.size} 個`}
              </span>
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder={language === 'en' ? 'Search words...' : '搜尋單字...'}
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-300"
              />
            </div>

            {pickerLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
              </div>
            ) : pickerError ? (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-600">
                <AlertCircle className="w-4 h-4" />{pickerError}
                <button onClick={fetchVocabForPicker} className="ml-auto text-xs underline">
                  {language === 'en' ? 'Retry' : '重試'}
                </button>
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {pickerWords
                  .filter(w =>
                    !pickerSearch ||
                    w.word.toLowerCase().includes(pickerSearch.toLowerCase()) ||
                    w.meaningZh.includes(pickerSearch)
                  )
                  .map((w) => (
                    <label
                      key={w.vocabId}
                      className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors text-sm ${
                        pickedIds.has(w.vocabId)
                          ? 'bg-purple-100 dark:bg-purple-800/40 text-purple-900 dark:text-purple-200'
                          : 'hover:bg-white/60 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={pickedIds.has(w.vocabId)}
                        onChange={() => {
                          setPickedIds(prev => {
                            const next = new Set(prev);
                            if (next.has(w.vocabId)) next.delete(w.vocabId);
                            else next.add(w.vocabId);
                            setCount(Math.max(1, next.size));
                            return next;
                          });
                        }}
                        className="rounded accent-purple-500"
                      />
                      <span className="font-medium flex-1 min-w-0 truncate">{w.word}</span>
                      <span className="text-xs text-gray-400 truncate max-w-[120px]">{w.meaningZh}</span>
                      <span className="text-xs text-purple-400 bg-purple-50 dark:bg-purple-800/30 px-1.5 py-0.5 rounded">{w.partOfSpeech}</span>
                    </label>
                  ))}
                {pickerWords.filter(w =>
                  !pickerSearch ||
                  w.word.toLowerCase().includes(pickerSearch.toLowerCase()) ||
                  w.meaningZh.includes(pickerSearch)
                ).length === 0 && (
                  <p className="text-center text-xs text-gray-400 py-4">
                    {language === 'en' ? 'No matching words' : '沒有符合的單字'}
                  </p>
                )}
              </div>
            )}

            {/* Select all / Clear */}
            <div className="flex gap-2 mt-2 pt-2 border-t border-purple-200 dark:border-purple-700">
              <button
                onClick={() => {
                  const allIds = new Set(pickerWords.map(w => w.vocabId));
                  setPickedIds(allIds);
                  setCount(allIds.size);
                }}
                className="text-xs text-purple-600 dark:text-purple-400 hover:underline"
              >
                {language === 'en' ? 'Select all' : '全選'}
              </button>
              <button
                onClick={() => { setPickedIds(new Set()); setCount(0); }}
                className="text-xs text-gray-400 hover:underline"
              >
                {language === 'en' ? 'Clear' : '清除'}
              </button>
              <button
                onClick={fetchVocabForPicker}
                className="text-xs text-gray-400 hover:underline ml-auto"
              >
                {language === 'en' ? 'Refresh' : '重新載入'}
              </button>
            </div>
          </div>
        )}

        {/* Number of words (hidden in pick mode) */}
        {mode !== 'pick' && (
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              {language === 'en' ? 'Number of Words' : '練習數量'}
            </label>
            <div className="flex items-center gap-2">
              {[5, 10, 15, 20].map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={`w-12 h-10 rounded-lg text-sm font-medium transition-all ${
                    count === n
                      ? 'bg-purple-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 dark:bg-red-900/20 rounded-xl text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={loading || (mode === 'pick' && pickedIds.size === 0)}
          className="w-full flex items-center justify-center gap-2 py-3 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-semibold rounded-xl transition-colors"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Play className="w-5 h-5" />
          )}
          {loading
            ? (language === 'en' ? 'Loading...' : '載入中...')
            : (language === 'en' ? 'Start Spelling Practice' : '開始串字練習')}
        </button>
      </div>
    );
  }

  // ============================================
  // Render: Result
  // ============================================
  if (stage === 'result' && finalResult) {
    const { correct, total, accuracy } = finalResult;
    return (
      <div className={`${embedded ? 'p-0' : 'bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700'}`}>
        <div className="text-center">
          <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4 ${
            accuracy >= 80 ? 'bg-green-100 dark:bg-green-900/30' :
            accuracy >= 50 ? 'bg-amber-100 dark:bg-amber-900/30' :
            'bg-red-100 dark:bg-red-900/30'
          }`}>
            {accuracy >= 80 ? (
              <Trophy className="w-10 h-10 text-green-600 dark:text-green-400" />
            ) : accuracy >= 50 ? (
              <Target className="w-10 h-10 text-amber-600 dark:text-amber-400" />
            ) : (
              <Brain className="w-10 h-10 text-red-600 dark:text-red-400" />
            )}
          </div>

          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
            {language === 'en' ? 'Practice Complete!' : '練習完成！'}
          </h3>
          <p className="text-3xl font-bold mb-1">
            <span className={
              accuracy >= 80 ? 'text-green-600' :
              accuracy >= 50 ? 'text-amber-600' : 'text-red-600'
            }>
              {correct}
            </span>
            <span className="text-gray-400"> / {total}</span>
          </p>
          <p className="text-sm text-gray-500 mb-6">{accuracy}% {language === 'en' ? 'accuracy' : '正確率'}</p>

          {/* Word results */}
          <div className="space-y-2 mb-6 text-left max-h-64 overflow-y-auto">
            {results.map((r, i) => (
              <div
                key={i}
                className={`flex items-center justify-between p-2.5 rounded-lg text-sm ${
                  r.isCorrect !== undefined && !r.isCorrect
                    ? 'bg-red-50 dark:bg-red-900/10'
                    : 'bg-green-50 dark:bg-green-900/10'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {r.isCorrect !== undefined && !r.isCorrect ? (
                    <X className="w-4 h-4 text-red-500 flex-shrink-0" />
                  ) : (
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <span className="font-medium text-gray-900 dark:text-white">{r.word}</span>
                    <span className="text-gray-400 ml-2 text-xs">{r.meaningZh}</span>
                  </div>
                </div>
                {r.isCorrect !== undefined && !r.isCorrect && r.studentInput && (
                  <span className="text-red-500 text-xs ml-2 flex-shrink-0 line-through">{r.studentInput}</span>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setStage('config');
                setFinalResult(null);
                setResults([]);
                setWords([]);
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              {language === 'en' ? 'New Practice' : '再練一次'}
            </button>
            <button
              onClick={() => handleGenerate()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-medium transition-colors text-sm"
            >
              <Play className="w-4 h-4" />
              {language === 'en' ? 'Another Round' : '換一批單字'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // Render: Practicing
  // ============================================
  if (words.length === 0) {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-8 h-8 mx-auto text-purple-400 animate-spin mb-3" />
        <p className="text-sm text-gray-500">{language === 'en' ? 'Loading words...' : '載入單字中...'}</p>
      </div>
    );
  }

  const currentWord = words[currentIndex];
  const progress = Math.round(((currentIndex + (showResult ? 1 : 0)) / words.length) * 100);

  return (
    <div className={`${embedded ? 'p-0' : 'bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700'}`}>
      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
            {language === 'en' ? 'Spelling' : '串字練習'}
          </span>
          <span className="text-xs text-gray-400">
            {currentIndex + 1} / {words.length}
          </span>
        </div>
        <ProgressBar value={progress} />
      </div>

      {/* Word card */}
      <div className="bg-purple-50 dark:bg-purple-900/10 rounded-2xl p-6 mb-5 text-center">
        {/* POS badge */}
        <span className="inline-block px-2.5 py-0.5 bg-purple-100 dark:bg-purple-800/50 text-purple-700 dark:text-purple-300 text-xs rounded-full mb-3">
          {currentWord.partOfSpeech}
        </span>

        {/* Chinese meaning */}
        <p className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {currentWord.meaningZh}
        </p>

        {/* English explanation (hint) */}
        {currentWord.explanationEn && (
          <div className="mt-3">
            {!showHint ? (
              <button
                onClick={() => setShowHint(true)}
                className="inline-flex items-center gap-1.5 text-xs text-purple-500 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 transition-colors"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                {language === 'en' ? 'Show hint (example)' : '顯示提示（例句）'}
              </button>
            ) : (
              <p className="text-sm text-purple-700 dark:text-purple-300 italic bg-white/60 dark:bg-purple-900/20 rounded-lg p-2.5">
                💡 {currentWord.explanationEn}
              </p>
            )}
          </div>
        )}

        {/* Audio */}
        <div className="mt-3 flex justify-center">
          <AudioPlayer text={currentWord.word} label="" size="sm" />
        </div>

        {/* Word length hint */}
        {!showResult && (
          <p className="text-xs text-gray-400 mt-3">
            {language === 'en' ? `${currentWord.word.length} letters` : `${currentWord.word.length} 個字母`}
            {currentWord.word.includes(' ') && ` (${language === 'en' ? 'phrase' : '片語'})`}
          </p>
        )}
      </div>

      {/* Input area */}
      <div className="mb-4">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={userInput}
            onChange={(e) => {
              if (!showResult) setUserInput(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder={language === 'en' ? 'Type the English word...' : '輸入正確的英文單詞...'}
            disabled={showResult}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            inputMode="text"
            enterKeyHint="done"
            className={`w-full px-4 py-3.5 text-lg rounded-xl border-2 transition-all outline-none ${
              showResult
                ? isCorrect
                  ? 'border-green-400 bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-300'
                  : 'border-red-400 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-300'
                : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-400 dark:focus:border-purple-500'
            }`}
          />
        </div>

        {/* Result feedback */}
        {showResult && (
          <div className={`mt-3 p-4 rounded-xl ${
            isCorrect
              ? 'bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-start gap-2">
              {isCorrect ? (
                <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
              ) : (
                <X className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
              )}
              <div>
                {isCorrect ? (
                  <p className="font-semibold text-green-700 dark:text-green-300">
                    {language === 'en' ? 'Correct! 🎉' : '正確！🎉'}
                  </p>
                ) : (
                  <div>
                    <p className="font-semibold text-red-700 dark:text-red-300 mb-1">
                      {language === 'en' ? 'Not quite right' : '不太對，正確答案是：'}
                    </p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {currentWord.word}
                    </p>
                  </div>
                )}
                {attemptCount > 1 && (
                  <p className="text-xs text-gray-400 mt-1">
                    {language === 'en'
                      ? `${attemptCount} attempt(s)`
                      : `嘗試 ${attemptCount} 次`}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {!showResult ? (
          <button
            onClick={handleCheck}
            disabled={!userInput.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-semibold rounded-xl transition-colors"
          >
            <Sparkles className="w-5 h-5" />
            {language === 'en' ? 'Check Answer' : '檢查答案'}
          </button>
        ) : (
          <>
            {!isCorrect && (
              <button
                onClick={handleRetry}
                className="flex items-center gap-2 px-4 py-3 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-xl transition-colors text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                {language === 'en' ? 'Retry' : '重試'}
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded-xl transition-colors"
            >
              {currentIndex < words.length - 1
                ? (language === 'en' ? 'Next Word' : '下一個')
                : (language === 'en' ? 'Finish' : '完成')}
              <ArrowRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {submitting && (
        <div className="flex items-center justify-center gap-2 mt-3 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          {language === 'en' ? 'Saving results...' : '儲存結果中...'}
        </div>
      )}
    </div>
  );
}
