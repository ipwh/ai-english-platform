// ============================================
// 學生端 — 生字簿 (重構版)
// 新功能：AI 智能分析、快速加入、擴展詞彙卡、進階過濾、匯出
// ============================================
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Loader2, BookMarked, TrendingUp, Brain, Upload, FileDown, Lightbulb, ChevronDown, ChevronUp, Play, Check, X, RotateCcw, AlertCircle, PencilLine } from 'lucide-react';

import VocabCard from '@/components/vocabulary/VocabCard';
import QuickAddVocab from '@/components/vocabulary/QuickAddVocab';
import VocabFilterBar from '@/components/vocabulary/VocabFilterBar';
import BatchImportVocab from '@/components/vocabulary/BatchImportVocab';
import SpellingPractice from '@/components/vocabulary/SpellingPractice';
import { useAppStore } from '@/store/appStore';
import type { Familiarity, VocabItem, MasteryLevel } from '@/lib/types';
import { useT } from '@/hooks/use-i18n';
import { getFamiliarityLabel, getFamiliarityColor } from '@/lib/utils';
import { familiarityToQuality, calculateNextReview } from '@/lib/srs';

const nextFamiliarity: Record<Familiarity, Familiarity> = {
  'new': 'learning', 'learning': 'familiar', 'familiar': 'mastered', 'mastered': 'mastered',
};

export default function VocabularyPage() {
  const { t, language } = useT();
  const store = useAppStore();

  // Data state
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [gradeLevel, setGradeLevel] = useState('S4');

  // SRS
  const [srsDue, setSrsDue] = useState<any[]>([]);
  const [srsProgress, setSrsProgress] = useState<{ percentage: number; label: string } | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Familiarity | 'all'>('all');
  const [posFilter, setPosFilter] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'alphabetical' | 'mastery' | 'date'>('recent');

  // AI
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [aiExamples, setAiExamples] = useState<Record<string, string>>({});

  // Batch import & Review suggestions
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [reviewSuggestions, setReviewSuggestions] = useState<any>(null);
  const [showReviewPanel, setShowReviewPanel] = useState(false);

  // Spelling Practice
  const [showSpelling, setShowSpelling] = useState(false);

  // Quiz
  const [quizQuestions, setQuizQuestions] = useState<any[] | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState<{ correct: number; total: number } | null>(null);

  // Word selection for quiz/practice
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());

  // ============================================
  // Data Loading
  // ============================================

  useEffect(() => {
    fetch('/api/auth/profile')
      .then(r => r.json())
      .then(d => {
        const id = d?.user?.id || store.userId || '';
        if (id) setStudentId(id);
        const level = d?.user?.level || d?.user?.class?.gradeLevel;
        if (level && ['S1','S2','S3','S4','S5','S6'].includes(level)) setGradeLevel(level);
      })
      .catch((e) => { console.error("[page] fetch failed", e) });
  }, [store.userId]);

  const loadVocab = useCallback(() => {
    if (!studentId) return;
    setLoadError(false);
    fetch(`/api/vocabulary?studentId=${encodeURIComponent(studentId)}`)
      .then(r => r.json())
      .then(d => {
        if (d.vocab?.length) {
          setVocab(d.vocab.map((v: VocabItem) => ({
            ...v,
            masteryLevel: (v.masteryLevel ?? 0) as MasteryLevel,
            createdAt: v.createdAt || v.nextReviewDate || undefined,
          })));
        }
      })
      .catch((e) => { console.error('Failed to load vocabulary:', e); setLoadError(true); });
  }, [studentId]);

  const loadSrsReview = useCallback(() => {
    if (!studentId) return;
    fetch(`/api/srs/review?studentId=${encodeURIComponent(studentId)}&type=vocab`)
      .then(r => r.json())
      .then(d => {
        if (d.reviewCards?.vocab) {
          setSrsDue(d.reviewCards.vocab);
          setSrsProgress(d.progress?.vocab || null);
        }
      })
      .catch((e) => { console.error("[page] fetch failed", e) });
  }, [studentId]);

  useEffect(() => { loadVocab(); }, [loadVocab]);
  useEffect(() => { if (studentId) loadSrsReview(); }, [loadSrsReview, studentId]);

  // Load AI review suggestions
  const loadReviewSuggestions = useCallback(() => {
    if (!studentId) return;
    fetch(`/api/vocabulary/review-suggestions?studentId=${encodeURIComponent(studentId)}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setReviewSuggestions(d); })
      .catch((e) => { console.error("[page] fetch failed", e) });
  }, [studentId]);

  useEffect(() => { if (studentId) loadReviewSuggestions(); }, [studentId, loadReviewSuggestions]);

  // ============================================
  // Actions
  // ============================================

  const handleToggleFamiliarity = (v: VocabItem) => {
    const next = nextFamiliarity[v.familiarity];
    const quality = familiarityToQuality(next);
    const srsUpdate = calculateNextReview(quality, {
      easeFactor: v.easeFactor ?? 2.5,
      interval: v.reviewInterval ?? 0,
      repetitions: 0,
      lastReviewedAt: undefined,
    });

    setVocab(prev => prev.map(item =>
      item.id === v.id
        ? { ...item, familiarity: next, nextReviewDate: srsUpdate.nextReviewDate }
        : item
    ));

    fetch('/api/vocabulary', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: v.id,
        familiarity: next,
        masteryLevel: next === 'mastered' ? 5 : next === 'familiar' ? 3 : next === 'learning' ? 1 : 0,
        nextReviewDate: srsUpdate.nextReviewDate,
        reviewInterval: srsUpdate.interval,
        easeFactor: srsUpdate.easeFactor,
        lastReviewedAt: srsUpdate.lastReviewedAt,
      }),
    }).catch((e) => { console.error("[page] fetch failed", e) });

    // 🎮 掌握單字 XP
    if (next === 'mastered' && store.userId) {
      fetch('/api/gamification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: store.userId, event: { type: 'masterWord' } }),
      }).catch((e) => { console.error("[page] fetch failed", e) });
    }
  };

  const handleSetMasteryLevel = (id: string, level: MasteryLevel) => {
    setVocab(prev => prev.map(item =>
      item.id === id ? { ...item, masteryLevel: level } : item
    ));
    fetch('/api/vocabulary', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, masteryLevel: level }),
    }).catch((e) => { console.error("[page] fetch failed", e) });
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('vocab.deleteConfirm'))) return;
    try {
      await fetch(`/api/vocabulary?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      setVocab(prev => prev.filter(v => v.id !== id));
    } catch { /* silent */ }
  };

  const handleAIExample = async (v: VocabItem) => {
    setGeneratingId(v.id);
    try {
      const res = await fetch('/api/ai/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          difficulty: 'core',
          gradeLevel,
          count: 1,
          questionType: 'short-writing',
          topic: `Write an example sentence using the word "${v.word}" (meaning: ${v.meaningZh})`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const questions = data.questions || [];
        if (questions.length > 0) {
          setAiExamples(prev => ({
            ...prev,
            [v.id]: `📖 ${questions[0].prompt || `${v.word}: ${v.exampleSentence}`}`,
          }));
          return;
        }
      }
      setAiExamples(prev => ({ ...prev, [v.id]: `📖 ${v.word}: ${v.exampleSentence}` }));
    } catch { /* silent */ }
    finally { setGeneratingId(null); }
  };

  const handleVocabAdded = (newVocab: VocabItem | null) => {
    if (newVocab) {
      setVocab(prev => [{
        ...newVocab,
        masteryLevel: (newVocab.masteryLevel ?? 0) as MasteryLevel,
      } as VocabItem, ...prev]);
      // 🎮 學習新單字 XP
      if (store.userId) {
        fetch('/api/gamification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: store.userId, event: { type: 'learnWord' } }),
        }).catch((e) => { console.error("[page] fetch failed", e) });
      }
    } else {
      loadVocab();
    }
  };

  // ============================================
  // Export
  // ============================================

  const handleExportCSV = () => {
    const headers = ['word', 'partOfSpeech', 'meaningZh', 'exampleSentence', 'exampleZh', 'synonyms', 'antonyms', 'collocations', 'familiarity', 'masteryLevel'];
    const rows = filtered.map(v => [
      v.word,
      v.partOfSpeech,
      v.meaningZh,
      v.exampleSentence || '',
      v.exampleZh || '',
      (v.synonyms || []).join('; '),
      (v.antonyms || []).join('; '),
      (v.collocations || []).join('; '),
      v.familiarity,
      String(v.masteryLevel ?? 0),
    ]);

    const csv = [
      '\uFEFF' + headers.join(','),
      ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocabulary-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAnki = () => {
    const lines: string[] = [];
    for (const v of filtered) {
      const backParts = [
        v.meaningZh,
        v.partOfSpeech ? `[${v.partOfSpeech}]` : '',
        v.exampleSentence ? `<br><i>${v.exampleSentence}</i>` : '',
        v.exampleZh ? `<br>${v.exampleZh}` : '',
        v.synonyms?.length ? `<br><b>Synonyms:</b> ${v.synonyms.join(', ')}` : '',
        v.antonyms?.length ? `<br><b>Antonyms:</b> ${v.antonyms.join(', ')}` : '',
        v.collocations?.length ? `<br><b>Collocations:</b> ${v.collocations.join(', ')}` : '',
      ].filter(Boolean).join('');
      lines.push(`${v.word}\t${backParts}`);
    }
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/tab-separated-values;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocabulary-anki-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    const ids = sorted.map(v => v.id);
    fetch('/api/vocabulary/export-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, wordIds: ids, format: 'pdf' }),
    })
      .then(r => {
        if (!r.ok) throw new Error('Export failed');
        return r.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vocabulary-${new Date().toISOString().slice(0, 10)}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      })
      .catch((e) => { console.error("[page] PDF export failed", e); });
  };

  // ============================================
  // Filtering & Sorting
  // ============================================

  const filtered = vocab.filter((v) => {
    if (search && !v.word.toLowerCase().includes(search.toLowerCase()) && !v.meaningZh.includes(search)) return false;
    if (filter !== 'all' && v.familiarity !== filter) return false;
    if (posFilter && v.partOfSpeech !== posFilter) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'alphabetical') return a.word.localeCompare(b.word);
    if (sortBy === 'mastery') return (b.masteryLevel ?? 0) - (a.masteryLevel ?? 0);
    if (sortBy === 'date') {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA; // newest first
    }
    return 0; // recent = keep original order
  });

  // ============================================
  // Stats
  // ============================================

  const stats = {
    total: vocab.length,
    mastered: vocab.filter(v => v.familiarity === 'mastered').length,
    learning: vocab.filter(v => v.familiarity === 'learning' || v.familiarity === 'new').length,
    avgMastery: vocab.length > 0
      ? Math.round(vocab.reduce((sum, v) => sum + (v.masteryLevel ?? 0), 0) / vocab.length * 10) / 10
      : 0,
  };

  // ============================================
  // Render
  // ============================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('vocab.title')}</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <TrendingUp className="w-4 h-4" />
            {t('vocab.mastery').replace('{n}', String(stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0))}
          </div>
          <button
            onClick={() => setShowBatchImport(true)}
            className="flex items-center gap-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">{language === 'en' ? 'Batch Import' : '批量匯入'}</span>
          </button>
          <button
            onClick={handleExportPDF}
            disabled={vocab.length === 0}
            className="flex items-center gap-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-40 transition-colors"
          >
            <FileDown className="w-4 h-4" />
            <span className="hidden sm:inline">PDF</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('vocab.total'), value: stats.total, color: 'text-teal-600' },
          { label: t('vocab.mastered'), value: stats.mastered, color: 'text-green-600' },
          { label: t('vocab.learning'), value: stats.learning, color: 'text-orange-600' },
          { label: language === 'en' ? 'Avg Mastery' : '平均掌握', value: stats.avgMastery, color: 'text-purple-600' },
        ].map((s, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm text-center border border-gray-100 dark:border-gray-700">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* SRS Daily Review */}
      {srsDue.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-2xl p-5 border border-indigo-200 dark:border-indigo-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-indigo-800 dark:text-indigo-200 flex items-center gap-2">
              <Brain className="w-5 h-5" /> {t('srs.dailyReview')}
            </h2>
            {srsProgress && (
              <span className="text-xs text-indigo-500 bg-indigo-100 dark:bg-indigo-900/40 px-2.5 py-1 rounded-full">
                {srsProgress.label} ({srsProgress.percentage}%)
              </span>
            )}
          </div>
          <div className="space-y-2">
            {srsDue.slice(0, 5).map((card) => (
              <div key={card.id} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
                <div>
                  <span className="font-bold text-gray-900 dark:text-white">{card.word}</span>
                  <span className="text-xs text-gray-400 ml-2">{card.partOfSpeech}</span>
                  <p className="text-xs text-gray-500">{card.meaningZh}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${getFamiliarityColor(card.familiarity)}`}>
                  {getFamiliarityLabel(card.familiarity, language)}
                </span>
              </div>
            ))}
            {srsDue.length > 5 && (
              <p className="text-xs text-gray-400 text-center">
                {language === 'en'
                  ? `+${srsDue.length - 5} more cards due`
                  : `還有 ${srsDue.length - 5} 張待複習`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <VocabFilterBar
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
        posFilter={posFilter}
        onPosFilterChange={setPosFilter}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        onExportCSV={handleExportCSV}
        onExportAnki={handleExportAnki}
        language={language as 'zh' | 'en'}
        totalCount={filtered.length}
      />

      {/* Quiz Section */}
      {vocab.length >= 3 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-500" />
              {language === 'en' ? 'Vocabulary Quiz' : '生字測驗'}
            </h2>
            <div className="flex items-center gap-2">
              {/* Selection mode toggle */}
              <button
                onClick={() => {
                  setSelectionMode(!selectionMode);
                  if (selectionMode) setSelectedWordIds(new Set());
                }}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  selectionMode
                    ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <BookMarked className="w-3.5 h-3.5" />
                {selectionMode
                  ? (language === 'en' ? `Selected: ${selectedWordIds.size}` : `已選: ${selectedWordIds.size}`)
                  : (language === 'en' ? 'Select Words' : '選取生字')}
              </button>
              {!quizQuestions ? (
                <button
                  onClick={async () => {
                    setQuizLoading(true);
                    try {
                      const body: Record<string, unknown> = {
                        studentId,
                        type: 'mixed',
                        count: selectionMode && selectedWordIds.size > 0 ? selectedWordIds.size : 5,
                      };
                      if (selectionMode && selectedWordIds.size > 0) {
                        body.wordIds = Array.from(selectedWordIds);
                      }
                      const res = await fetch('/api/vocabulary/quiz', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                      });
                      const data = await res.json();
                      if (data.quiz?.length) {
                        setQuizQuestions(data.quiz);
                        setQuizAnswers({});
                        setQuizSubmitted(false);
                        setQuizScore(null);
                      }
                    } catch { /* silent */ }
                    finally { setQuizLoading(false); }
                  }}
                  disabled={quizLoading || (selectionMode && selectedWordIds.size === 0)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  {quizLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {quizLoading
                    ? (language === 'en' ? 'Generating...' : '生成中...')
                    : selectionMode && selectedWordIds.size > 0
                      ? `${language === 'en' ? 'Quiz Selected' : '測驗所選'} (${selectedWordIds.size})`
                      : (language === 'en' ? 'Start Quiz' : '開始測驗')}
                </button>
              ) : (
                <button
                  onClick={() => { setQuizQuestions(null); setQuizSubmitted(false); setQuizScore(null); }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  {language === 'en' ? 'New Quiz' : '重新出題'}
                </button>
              )}
            </div>
          </div>

          {quizQuestions && (
            <div className="space-y-4">
              {quizQuestions.map((q, qi) => {
                const isCorrect = quizSubmitted && quizAnswers[qi] === q.answer;
                const isWrong = quizSubmitted && quizAnswers[qi] && quizAnswers[qi] !== q.answer;
                return (
                  <div key={qi} className={`p-4 rounded-xl border transition-colors ${
                    isCorrect ? 'border-green-300 bg-green-50 dark:bg-green-900/10 dark:border-green-700' :
                    isWrong ? 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-700' :
                    'border-gray-200 dark:border-gray-700'
                  }`}>
                    <div className="flex items-start gap-2 mb-3">
                      <span className="text-xs font-bold text-gray-400 mt-0.5">{qi + 1}.</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {q.type === 'mc' ? q.promptZh : `${q.word} — ${language === 'en' ? 'Match the meaning' : '配對中文意思'}`}
                      </span>
                    </div>
                    {q.type === 'mc' && q.choices ? (
                      <div className="grid grid-cols-2 gap-2">
                        {q.choices.map((choice: string, ci: number) => {
                          const letter = String.fromCharCode(65 + ci);
                          const selected = quizAnswers[qi] === letter;
                          const showCorrect = quizSubmitted && letter === q.answer;
                          const showWrong = quizSubmitted && selected && letter !== q.answer;
                          return (
                            <button
                              key={ci}
                              onClick={() => {
                                if (quizSubmitted) return;
                                setQuizAnswers(prev => ({ ...prev, [qi]: letter }));
                              }}
                              className={`p-2.5 text-sm rounded-lg text-left transition-colors ${
                                showCorrect ? 'bg-green-200 dark:bg-green-800 text-green-900 dark:text-green-100 font-medium' :
                                showWrong ? 'bg-red-200 dark:bg-red-800 text-red-900 dark:text-red-100' :
                                selected ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 ring-2 ring-purple-400' :
                                'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                              }`}
                            >
                              <span className="font-medium mr-1.5">{letter}.</span>
                              {choice}
                              {showCorrect && <Check className="w-3.5 h-3.5 inline ml-1 text-green-600" />}
                              {showWrong && <X className="w-3.5 h-3.5 inline ml-1 text-red-600" />}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">
                        {language === 'en' ? `Answer: ${q.meaningZh}` : `答案：${q.meaningZh}`}
                      </p>
                    )}
                  </div>
                );
              })}

              <div className="flex items-center justify-between pt-2">
                {!quizSubmitted ? (
                  <button
                    onClick={() => {
                      const correct = quizQuestions.filter((q, qi) => quizAnswers[qi] === q.answer).length;
                      setQuizScore({ correct, total: quizQuestions.length });
                      setQuizSubmitted(true);
                    }}
                    disabled={Object.keys(quizAnswers).length < quizQuestions.length}
                    className="px-4 py-2 bg-teal-500 hover:bg-teal-600 disabled:bg-gray-300 text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    {language === 'en' ? 'Submit Answers' : '提交答案'}
                  </button>
                ) : quizScore && (
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-bold ${quizScore.correct === quizScore.total ? 'text-green-600' : quizScore.correct >= quizScore.total / 2 ? 'text-amber-600' : 'text-red-600'}`}>
                      {quizScore.correct} / {quizScore.total}
                    </span>
                    <span className="text-sm text-gray-500">
                      ({Math.round((quizScore.correct / quizScore.total) * 100)}%)
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Spelling Practice Section */}
      {vocab.length >= 3 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <PencilLine className="w-5 h-5 text-purple-500" />
              {language === 'en' ? 'Spelling Practice' : '串字練習'}
              <span className="text-xs font-normal text-gray-400 ml-1">
                {language === 'en' ? '(See meaning → Type the word)' : '（看解釋 → 輸入單詞）'}
              </span>
            </h2>
            <button
              onClick={() => setShowSpelling(!showSpelling)}
              className="flex items-center gap-1 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {showSpelling
                ? (language === 'en' ? 'Hide Practice' : '收起練習')
                : (language === 'en' ? 'Start Spelling' : '開始串字')}
            </button>
          </div>

          {showSpelling && studentId && (
            <SpellingPractice
              studentId={studentId}
              embedded
              onComplete={(result) => {
                // 🎮 XP for completing spelling
                if (store.userId && result.correct > 0) {
                  fetch('/api/gamification', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ studentId: store.userId, event: { type: 'completeSession', metadata: { type: 'spelling', correct: result.correct } } }),
                  }).catch(() => {});
                }
              }}
            />
          )}

          {!showSpelling && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              {language === 'en'
                ? 'Practice spelling by seeing the Chinese meaning and English hint, then typing the correct word. Great for exam preparation!'
                : '看到中文意思及英文提示後，輸入正確的英文單詞。有效強化記憶，適合準備考試！'}
            </p>
          )}
        </div>
      )}

      {/* Error State */}
      {loadError && (
        <div className="text-center py-16">
          <AlertCircle className="w-12 h-12 mx-auto text-red-300 dark:text-red-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">{t('vocab.loadFailed')}</p>
          <button
            onClick={() => { setLoadError(false); window.location.reload(); }}
            className="mt-3 px-4 py-2 bg-red-100 dark:bg-red-800/50 text-red-700 dark:text-red-300 rounded-lg text-sm hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
          >
            {t('common.reloadPage')}
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loadError && vocab.length === 0 && (
        <div className="text-center py-16">
          <BookMarked className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">{t('vocab.empty')}</p>
          <p className="text-xs text-gray-400 mt-1">
            {language === 'en'
              ? 'Click the + button to add your first word!'
              : '點擊右下角的 + 按鈕加入第一個生字！'}
          </p>
        </div>
      )}

      {/* Word Cards */}
      <div className="space-y-3">
        {sorted.map((v) => (
          <VocabCard
            key={v.id}
            vocab={v}
            language={language as 'zh' | 'en'}
            aiExample={aiExamples[v.id]}
            generatingAi={generatingId === v.id}
            onToggleFamiliarity={handleToggleFamiliarity}
            onGenerateAiExample={handleAIExample}
            onDelete={handleDelete}
            onSetMasteryLevel={handleSetMasteryLevel}
            selectable={selectionMode}
            selected={selectedWordIds.has(v.id)}
            onToggleSelect={(id) => {
              setSelectedWordIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
          />
        ))}
      </div>

      {/* Quick Add Floating Button */}
      {studentId && (
        <QuickAddVocab
          studentId={studentId}
          gradeLevel={gradeLevel}
          onAdded={handleVocabAdded}
        />
      )}

      {/* Batch Import Modal */}
      {showBatchImport && studentId && (
        <BatchImportVocab
          studentId={studentId}
          gradeLevel={gradeLevel}
          onClose={() => setShowBatchImport(false)}
          onImported={(count) => { if (count > 0) loadVocab(); }}
        />
      )}

      {/* AI Review Suggestions Panel */}
      {reviewSuggestions && stats.total > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/10 rounded-2xl p-5 border border-amber-200 dark:border-amber-800">
          <button
            onClick={() => setShowReviewPanel(!showReviewPanel)}
            className="w-full flex items-center justify-between"
          >
            <h2 className="font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
              <Lightbulb className="w-5 h-5" />
              {language === 'en' ? 'AI Review Suggestions' : 'AI 個人化複習建議'}
            </h2>
            {showReviewPanel ? <ChevronUp className="w-4 h-4 text-amber-500" /> : <ChevronDown className="w-4 h-4 text-amber-500" />}
          </button>

          {showReviewPanel && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {reviewSuggestions.stats?.streakRecommendation || ''}
              </p>

              {reviewSuggestions.priorities?.urgent?.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                    🔴 {language === 'en' ? 'URGENT' : '緊急'} ({reviewSuggestions.priorities.urgent.length})
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {reviewSuggestions.priorities.urgent.map((w: { id: string; word: string; meaningZh?: string }) => (
                      <span key={w.id} className="text-[10px] px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full">
                        {w.word} <span className="opacity-60">{w.meaningZh}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {reviewSuggestions.priorities?.high?.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                    🟠 {language === 'en' ? 'HIGH' : '高優先'} ({reviewSuggestions.priorities.high.length})
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {reviewSuggestions.priorities.high.map((w: { id: string; word: string }) => (
                      <span key={w.id} className="text-[10px] px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full">
                        {w.word}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
