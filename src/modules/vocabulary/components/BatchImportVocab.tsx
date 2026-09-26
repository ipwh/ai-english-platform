// ============================================
// BatchImportVocab — 批量匯入生字（貼上文字清單）
// 支援：逐行貼上單字 → AI 批量分析 → 一鍵全部加入
// ============================================
'use client';

import { useState } from 'react';
import { Upload, Loader2, CheckCircle, XCircle, Sparkles, BookMarked, X } from 'lucide-react';
import AudioPlayer from '@/components/shared/AudioPlayer';
import { useT } from '@/hooks/use-i18n';
import type { WordAnalysis } from '@/modules/ai/schemas/ai-schema';

interface BatchImportVocabProps {
  studentId: string;
  gradeLevel: string;
  onClose: () => void;
  onImported?: (count: number) => void;
}

type ImportStatus = 'idle' | 'analyzing' | 'adding' | 'done';

interface WordResult {
  word: string;
  status: 'pending' | 'analyzing' | 'success' | 'duplicate' | 'error';
  analysis?: WordAnalysis;
  error?: string;
  /** true 只在伺服器確認新增成功後設定（避免分析成功被誤報為加入成功） */
  imported?: boolean;
}

export default function BatchImportVocab({
  studentId,
  gradeLevel,
  onClose,
  onImported,
}: BatchImportVocabProps) {
  const { t, language } = useT();
  const [textInput, setTextInput] = useState('');
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [results, setResults] = useState<WordResult[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // Parse text into word list
  const parseWords = (text: string): string[] => {
    return text
      .split(/[\n,;]+/)
      .map(w => w.trim())
      .filter(w => w.length > 0 && /^[a-zA-Z\s'-]+$/.test(w))
      .filter((w, i, arr) => arr.indexOf(w) === i); // dedup within batch
  };

  const handleAnalyze = async () => {
    const words = parseWords(textInput);
    if (words.length === 0) return;
    if (words.length > 30) {
      alert(t('vocab.batchMaxWords'));
      return;
    }

    setStatus('analyzing');
    const wordResults: WordResult[] = words.map(w => ({ word: w, status: 'pending' }));
    setResults(wordResults);
    setProgress({ current: 0, total: words.length });

    // Analyze words one by one (to avoid overwhelming AI)
    for (let i = 0; i < words.length; i++) {
      setProgress({ current: i, total: words.length });
      setResults(prev => prev.map((r, idx) =>
        idx === i ? { ...r, status: 'analyzing' as const } : r
      ));

      try {
        const res = await fetch('/api/ai/analyze-word', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word: words[i], gradeLevel }),
        });
        const data = await res.json();
        if (res.ok && data.analysis) {
          setResults(prev => prev.map((r, idx) =>
            idx === i ? { ...r, status: 'success' as const, analysis: data.analysis } : r
          ));
        } else {
          setResults(prev => prev.map((r, idx) =>
            idx === i ? { ...r, status: 'error' as const, error: data.error || 'Analysis failed' } : r
          ));
        }
      } catch {
        setResults(prev => prev.map((r, idx) =>
          idx === i ? { ...r, status: 'error' as const, error: 'Network error' } : r
        ));
      }

      // Small delay between requests
      await new Promise(r => setTimeout(r, 300));
    }

    setProgress({ current: words.length, total: words.length });
    setStatus('idle'); // Ready to add
  };

  const handleAddAll = async (onlyFailed = false) => {
    // items: 分析完成且待加入；onlyFailed: 只重試上次加入失敗的
    const toAdd = results.filter(r => r.analysis && (onlyFailed ? r.status === 'error' : r.status === 'success' && !r.imported));
    if (toAdd.length === 0) return;

    setStatus('adding');
    let added = 0;

    for (const item of toAdd) {
      if (!item.analysis) continue;
      try {
        const res = await fetch('/api/vocabulary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId,
            word: item.analysis.word,
            // API 欄位正名（translation/example）＋ AI 分析的擴充欄位
            translation: item.analysis.meaningZh,
            partOfSpeech: item.analysis.partOfSpeech,
            allPartOfSpeech: item.analysis.allPartOfSpeech,
            secondaryMeaningZh: item.analysis.secondaryMeaningZh,
            example: item.analysis.exampleSentence,
            exampleZh: item.analysis.exampleZh,
            synonyms: item.analysis.synonyms,
            antonyms: item.analysis.antonyms,
            collocations: item.analysis.collocations,
          }),
        });

        if (res.ok) {
          added++;
          setResults(prev => prev.map(r =>
            r.word === item.word ? { ...r, status: 'success' as const, imported: true, error: undefined } : r
          ));
        } else if (res.status === 409) {
          setResults(prev => prev.map(r =>
            r.word === item.word ? { ...r, status: 'duplicate' as const } : r
          ));
        } else {
          // 失敗必須如實反映（舊碼沒有任何失敗分支 → 一律顯示「成功加入」）
          const data = await res.json().catch(() => null) as { error?: string; details?: Array<{ message?: string }> } | null;
          const message = data?.details?.[0]?.message || data?.error
            || (language === 'en' ? 'Add failed' : '加入失敗，請重試');
          setResults(prev => prev.map(r =>
            r.word === item.word ? { ...r, status: 'error' as const, error: message } : r
          ));
        }
      } catch {
        setResults(prev => prev.map(r =>
          r.word === item.word
            ? { ...r, status: 'error' as const, error: language === 'en' ? 'Network error' : '網絡錯誤' }
            : r
        ));
      }
    }

    setStatus('done');
    onImported?.(added);
  };

  const addedCount = results.filter(r => r.imported).length;
  const duplicateCount = results.filter(r => r.status === 'duplicate').length;
  // 加入失敗（有分析結果但新增被拒）vs 分析失敗（連分析都沒有）
  const failedCount = results.filter(r => r.status === 'error' && r.analysis).length;
  const analysisFailedCount = results.filter(r => r.status === 'error' && !r.analysis).length;
  const readyCount = results.filter(r => r.status === 'success' && r.analysis && !r.imported).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6 z-10 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Upload className="w-5 h-5 text-teal-500" />
            {language === 'en' ? 'Batch Import Words' : '批量匯入生字'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {status === 'done' ? (
          /* Done state */
          <div className="text-center py-6">
            {addedCount === 0 && failedCount + analysisFailedCount > 0 ? (
              <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            ) : (
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
            )}
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {language === 'en'
                ? `Added ${addedCount} words!`
                : `成功加入 ${addedCount} 個單字！`}
            </p>
            {duplicateCount > 0 && (
              <p className="text-sm text-gray-500 mt-1">
                {language === 'en'
                  ? `${duplicateCount} already existed`
                  : `${duplicateCount} 個已存在`}
              </p>
            )}
            {failedCount > 0 && (
              <p className="text-sm text-red-500 mt-1">
                {language === 'en' ? `${failedCount} failed to add` : `${failedCount} 個加入失敗`}
              </p>
            )}
            {analysisFailedCount > 0 && (
              <p className="text-sm text-red-500 mt-1">
                {language === 'en' ? `${analysisFailedCount} could not be analyzed` : `${analysisFailedCount} 個分析失敗`}
              </p>
            )}
            {failedCount > 0 && (
              <button
                onClick={() => handleAddAll(true)}
                className="mt-4 mr-2 px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm"
              >
                {language === 'en' ? `Retry ${failedCount} failed` : `重試失敗的 ${failedCount} 個`}
              </button>
            )}
            <button
              onClick={onClose}
              className="mt-4 px-6 py-2 bg-teal-500 text-white rounded-lg text-sm"
            >
              {language === 'en' ? 'Done' : '完成'}
            </button>
          </div>
        ) : (
          <>
            {/* Text input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {language === 'en'
                  ? 'Paste words (one per line, comma or semicolon separated)'
                  : '貼上單字（每行一個，或以逗號、分號分隔）'}
              </label>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={
                  language === 'en'
                    ? 'ubiquitous\nmeticulous\neloquent\npersevere\n...'
                    : 'ubiquitous\nmeticulous\neloquent\npersevere\n...'
                }
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-base sm:text-sm outline-none focus:ring-2 focus:ring-teal-500 resize-none font-mono"
                disabled={status === 'analyzing' || status === 'adding'}
              />
              <p className="text-xs text-gray-400 mt-1">
                {parseWords(textInput).length} {language === 'en' ? 'words detected' : '個單字'}
                {' · '}
                {language === 'en' ? 'Max 30 words' : '最多 30 個'}
              </p>
            </div>

            {/* Results list */}
            {results.length > 0 && (
              <div className="space-y-1.5 mb-4 max-h-48 overflow-y-auto">
                {results.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                      r.status === 'success' ? 'bg-green-50 dark:bg-green-900/20' :
                      r.status === 'duplicate' ? 'bg-amber-50 dark:bg-amber-900/20' :
                      r.status === 'error' ? 'bg-red-50 dark:bg-red-900/20' :
                      r.status === 'analyzing' ? 'bg-blue-50 dark:bg-blue-900/20' :
                      'bg-gray-50 dark:bg-gray-900/20'
                    }`}
                  >
                    {r.status === 'analyzing' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />}
                    {r.status === 'success' && <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />}
                    {r.status === 'duplicate' && <CheckCircle className="w-4 h-4 text-amber-500 shrink-0" />}
                    {r.status === 'error' && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                    {r.status === 'pending' && <span className="w-4 h-4 shrink-0" />}

                    <span className="font-medium text-gray-900 dark:text-white">{r.word}</span>

                    {r.analysis && (
                      <span className="text-xs text-gray-500 truncate">
                        {r.analysis.meaningZh}
                      </span>
                    )}

                    {r.status === 'duplicate' && (
                      <span className="text-xs text-amber-600 ml-auto">
                        {language === 'en' ? 'already exists' : '已存在'}
                      </span>
                    )}
                    {r.status === 'error' && r.error && (
                      <span className="text-xs text-red-500 ml-auto truncate">{r.error}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Progress */}
            {status === 'analyzing' && (
              <div className="mb-4">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-teal-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1 text-center">
                  {language === 'en'
                    ? `Analyzing ${progress.current}/${progress.total}...`
                    : `分析中 ${progress.current}/${progress.total}...`}
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300"
              >
                {language === 'en' ? 'Cancel' : '取消'}
              </button>

              {results.length === 0 ? (
                <button
                  onClick={handleAnalyze}
                  disabled={parseWords(textInput).length === 0}
                  className="flex-1 px-4 py-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  {language === 'en' ? 'AI Analyze All' : 'AI 批量分析'}
                </button>
              ) : (
                <button
                  onClick={() => handleAddAll()}
                  disabled={status === 'analyzing' || status === 'adding' || readyCount === 0}
                  className="flex-1 px-4 py-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1.5"
                >
                  {status === 'adding' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <BookMarked className="w-4 h-4" />
                  )}
                  {status === 'adding'
                    ? (language === 'en' ? 'Adding...' : '加入中...')
                    : (language === 'en' ? `Add ${readyCount} Words` : `加入 ${readyCount} 個單字`)}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
