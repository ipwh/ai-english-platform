// ============================================
// QuickAddVocab — 快速加入生字（浮動按鈕 + AI 自動分析）
// 支援：
//   1. 手動輸入單字 → AI 自動分析詞性/意思/例句/同反義/搭配
//   2. 從外部傳入單字（例如從練習頁 highlight）
//   3. 自動去重提示
// ============================================
'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Plus, Zap, Loader2, X, Sparkles, BookMarked, CheckCircle,
  AlertCircle, Lightbulb,
} from 'lucide-react';
import AudioPlayer from '@/components/shared/AudioPlayer';
import { useT } from '@/hooks/use-i18n';
import type { WordAnalysis } from '@/lib/ai-schema';
import type { VocabItem } from '@/lib/types';

interface QuickAddVocabProps {
  studentId: string;
  gradeLevel: string;
  /** 預填單字（從外部傳入，如練習頁 highlight） */
  initialWord?: string;
  /** 加入成功後的回呼 */
  onAdded?: (vocab: VocabItem | null) => void;
  /** 浮動按鈕樣式覆蓋 */
  className?: string;
}

type Stage = 'idle' | 'input' | 'analyzing' | 'preview' | 'adding' | 'success' | 'duplicate' | 'error';

export default function QuickAddVocab({
  studentId,
  gradeLevel,
  initialWord,
  onAdded,
  className = '',
}: QuickAddVocabProps) {
  const { t, language } = useT();
  const [stage, setStage] = useState<Stage>(initialWord ? 'input' : 'idle');
  const [word, setWord] = useState(initialWord || '');
  const [analysis, setAnalysis] = useState<WordAnalysis | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [existingVocab, setExistingVocab] = useState<unknown>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-open if initialWord is provided
  useEffect(() => {
    if (initialWord) {
      setWord(initialWord);
      setStage('input');
    }
  }, [initialWord]);

  // Focus input when modal opens
  useEffect(() => {
    if (stage === 'input' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [stage]);

  const handleAnalyze = async () => {
    if (!word.trim()) return;
    setStage('analyzing');
    setErrorMsg('');

    try {
      const res = await fetch('/api/ai/analyze-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: word.trim(), gradeLevel }),
      });

      const data = await res.json();
      if (!res.ok || !data.analysis) {
        setErrorMsg(data.error || t('vocab.analyzeFailed'));
        setStage('input');
        return;
      }

      setAnalysis(data.analysis);
      setStage('preview');
    } catch {
      setErrorMsg(t('vocab.analyzeFailed'));
      setStage('input');
    }
  };

  const handleAdd = async () => {
    if (!analysis) return;
    setStage('adding');
    setErrorMsg('');

    try {
      const res = await fetch('/api/vocabulary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          word: analysis.word,
          partOfSpeech: analysis.partOfSpeech,
          allPartOfSpeech: analysis.allPartOfSpeech,
          meaningZh: analysis.meaningZh,
          secondaryMeaningZh: analysis.secondaryMeaningZh,
          exampleSentence: analysis.exampleSentence,
          exampleZh: analysis.exampleZh,
          synonyms: analysis.synonyms,
          antonyms: analysis.antonyms,
          collocations: analysis.collocations,
        }),
      });

      const data = await res.json();

      if (res.status === 409 || data.error === 'duplicate') {
        setExistingVocab(data.vocab);
        setStage('duplicate');
        return;
      }

      if (!res.ok) {
        setErrorMsg(data.error || t('vocab.addFailed'));
        setStage('preview');
        return;
      }

      setStage('success');
      onAdded?.(data.vocab);

      // Auto-close after 2s
      setTimeout(() => {
        setStage('idle');
        setWord('');
        setAnalysis(null);
        setExistingVocab(null);
      }, 2000);
    } catch {
      setErrorMsg(t('vocab.addFailed'));
      setStage('preview');
    }
  };

  const handleClose = () => {
    setStage('idle');
    setWord('');
    setAnalysis(null);
    setErrorMsg('');
    setExistingVocab(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && stage === 'input' && word.trim()) {
      handleAnalyze();
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setStage('input')}
        className={`fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 bg-teal-500 hover:bg-teal-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 active:scale-95 ${stage !== 'idle' ? 'hidden' : ''} ${className}`}
        aria-label={t('vocab.quickAdd')}
      >
        <Plus className="w-5 h-5" />
        <span className="text-sm font-medium hidden sm:inline">{t('vocab.quickAdd')}</span>
      </button>

      {/* Modal Overlay */}
      {stage !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 z-10 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                {stage === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : stage === 'duplicate' ? (
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                ) : (
                  <Zap className="w-5 h-5 text-teal-500" />
                )}
                {stage === 'success'
                  ? t('vocab.addSuccess')
                  : stage === 'duplicate'
                  ? t('vocab.duplicateTitle')
                  : t('vocab.quickAddTitle')}
              </h2>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stage: Input */}
            {stage === 'input' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('vocab.enterWord')}
                  </label>
                  <div className="relative">
                    <input
                      ref={inputRef}
                      type="text"
                      value={word}
                      onChange={(e) => setWord(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={t('vocab.wordPlaceholder')}
                      className="w-full px-4 py-2.5 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    {word.trim() && (
                      <AudioPlayer text={word.trim()} label="" size="sm" className="absolute right-2 top-1/2 -translate-y-1/2" />
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Lightbulb className="w-3 h-3" />
                  輸入英文單字後點擊「AI 分析」，自動填入詞性、意思、例句等。
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleClose}
                    className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    aria-label={language === 'en' ? 'Close' : '關閉'}
                  >
                    {language === 'en' ? 'Close' : '關閉'}
                  </button>
                  <button
                    onClick={handleAnalyze}
                    disabled={!word.trim()}
                    className="flex-[2] flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-500 hover:bg-teal-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                    AI 分析
                  </button>
                </div>
              </div>
            )}

            {/* Stage: Analyzing */}
            {stage === 'analyzing' && (
              <div className="flex flex-col items-center py-8">
                <Loader2 className="w-10 h-10 text-teal-500 animate-spin mb-3" />
                <p className="text-sm text-gray-500">{language === 'en' ? `Analyzing "${word}"...` : `正在分析 「${word}」...`}</p>
                <p className="text-xs text-gray-400 mt-1">{language === 'en' ? 'Looking up POS, meaning, examples, synonyms, antonyms, collocations' : '查詢詞性、意思、例句、同反義字、搭配詞'}</p>
              </div>
            )}

            {/* Stage: Preview (AI results) */}
            {stage === 'preview' && analysis && (
              <div className="space-y-4">
                {/* Analysis preview */}
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{analysis.word}</span>
                    <span className="text-xs text-gray-400 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">{analysis.partOfSpeech}</span>
                    {analysis.allPartOfSpeech.length > 1 && (
                      <span className="text-[10px] text-teal-500">+{analysis.allPartOfSpeech.length - 1}</span>
                    )}
                  </div>

                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      🀄 {analysis.meaningZh}
                      {analysis.secondaryMeaningZh && (
                        <span className="text-gray-400"> · {analysis.secondaryMeaningZh}</span>
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 italic">
                      &ldquo;{analysis.exampleSentence}&rdquo;
                    </p>
                    <p className="text-xs text-gray-400">{analysis.exampleZh}</p>
                  </div>

                  {analysis.synonyms.length > 0 && (
                    <div>
                      <span className="text-[10px] font-semibold text-green-600">{t('vocab.synonyms')}</span>
                      <p className="text-xs text-gray-600">{analysis.synonyms.join(' · ')}</p>
                    </div>
                  )}

                  {analysis.antonyms.length > 0 && (
                    <div>
                      <span className="text-[10px] font-semibold text-red-500">{t('vocab.antonyms')}</span>
                      <p className="text-xs text-gray-600">{analysis.antonyms.join(' · ')}</p>
                    </div>
                  )}

                  {analysis.collocations.length > 0 && (
                    <div>
                      <span className="text-[10px] font-semibold text-blue-600">{t('vocab.collocations')}</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {analysis.collocations.map((c, i) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-full">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}

                <div className="flex gap-2">
                  <button
                    onClick={() => { setStage('input'); setAnalysis(null); }}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium"
                  >
                    {t('generic.cancel')}
                  </button>
                  <button
                    onClick={handleAdd}
                    disabled={stage === ('adding' as Stage)}
                    className="flex-1 px-4 py-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1.5"
                  >
                    {stage === ('adding' as Stage) ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookMarked className="w-4 h-4" />}
                    {t('vocab.addToVocabBook')}
                  </button>
                </div>
              </div>
            )}

            {/* Stage: Success */}
            {stage === 'success' && (
              <div className="flex flex-col items-center py-6">
                <div className="w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-3">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {language === 'en' ? `"${word}" added to vocabulary!` : `「${word}」已加入生字簿！`}
                </p>
              </div>
            )}

            {/* Stage: Duplicate */}
            {stage === 'duplicate' && (
              <div className="flex flex-col items-center py-6">
                <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-3">
                  <AlertCircle className="w-8 h-8 text-amber-500" />
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {language === 'en' ? `"${word}" is already in your vocabulary` : `「${word}」已在生字簿中`}
                </p>
                <p className="text-xs text-gray-500 mt-1">{language === 'en' ? 'No need to add again' : '無需重複加入'}</p>
                <button
                  onClick={handleClose}
                  className="mt-4 px-4 py-2 bg-teal-500 text-white rounded-lg text-sm"
                >
                  {language === 'en' ? 'Got it' : '知道了'}
                </button>
              </div>
            )}

            {/* Stage: Error */}
            {stage === 'error' && (
              <div className="space-y-4">
                <p className="text-sm text-red-500">{errorMsg}</p>
                <button
                  onClick={() => setStage('input')}
                  className="w-full px-4 py-2 bg-teal-500 text-white rounded-lg text-sm"
                >
                  {language === 'en' ? 'Retry' : '重試'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
