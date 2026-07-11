// ============================================
// 學生端 — 生字簿
// 支援：手動新增生字、AI 例句生成、間隔重溫、熟悉度標記、發音
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { Search, Sparkles, Loader2, BookMarked, TrendingUp, Brain, Plus, X } from 'lucide-react';

import ProgressBar from '@/components/shared/ProgressBar';
import AudioPlayer from '@/components/shared/AudioPlayer';
import { useAppStore } from '@/store/appStore';
import type { Familiarity, VocabItem } from '@/lib/types';
import { useT } from '@/hooks/use-i18n';
import { getFamiliarityLabel, getFamiliarityColor } from '@/lib/utils';
import { familiarityToQuality, calculateNextReview } from '@/lib/srs';

const nextFamiliarity: Record<Familiarity, Familiarity> = {
  'new': 'learning', 'learning': 'familiar', 'familiar': 'mastered', 'mastered': 'mastered',
};
const familiarityProgress: Record<Familiarity, number> = {
  'new': 10, 'learning': 40, 'familiar': 75, 'mastered': 100,
};

const POS_OPTIONS = [
  { value: 'noun', zh: '名詞', en: 'noun' },
  { value: 'verb', zh: '動詞', en: 'verb' },
  { value: 'adjective', zh: '形容詞', en: 'adjective' },
  { value: 'adverb', zh: '副詞', en: 'adverb' },
  { value: 'preposition', zh: '介詞', en: 'preposition' },
  { value: 'conjunction', zh: '連接詞', en: 'conjunction' },
  { value: 'pronoun', zh: '代名詞', en: 'pronoun' },
  { value: 'phrase', zh: '片語', en: 'phrase' },
  { value: 'other', zh: '其他', en: 'other' },
];

export default function VocabularyPage() {
  const { t } = useT();
  const store = useAppStore();
  const language = store.language || 'zh';
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Familiarity | 'all'>('all');

  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [gradeLevel, setGradeLevel] = useState('S4');

  const [srsDue, setSrsDue] = useState<any[]>([]);
  const [srsProgress, setSrsProgress] = useState<{ percentage: number; label: string } | null>(null);

  // Add Word Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ word: '', partOfSpeech: 'noun', meaning: '', example: '', exampleZh: '' });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  const loadSrsReview = () => {
    if (!studentId) return;
    fetch(`/api/srs/review?studentId=${encodeURIComponent(studentId)}&type=vocab`)
      .then(r => r.json())
      .then(d => {
        if (d.reviewCards?.vocab) {
          setSrsDue(d.reviewCards.vocab);
          setSrsProgress(d.progress?.vocab || null);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetch('/api/auth/profile')
      .then(r => r.json())
      .then(d => {
        const id = d?.user?.id || store.userId || '';
        if (id) setStudentId(id);
        const level = d?.user?.level || d?.user?.class?.gradeLevel;
        if (level && ['S1','S2','S3','S4','S5','S6'].includes(level)) setGradeLevel(level);
      })
      .catch(() => {});
  }, [store.userId]);

  const loadVocab = () => {
    if (!studentId) return;
    setLoadError(false);
    fetch(`/api/vocabulary?studentId=${encodeURIComponent(studentId)}`)
      .then(r => r.json())
      .then(d => { if (d.vocab?.length) setVocab(d.vocab); })
      .catch((e) => { console.error('Failed to load vocabulary:', e); setLoadError(true); });
  };

  useEffect(() => { loadVocab(); }, [studentId]);
  useEffect(() => { if (studentId) loadSrsReview(); }, [studentId]);

  const [aiExamples, setAiExamples] = useState<Record<string, string>>({});

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
      setAiExamples(prev => ({
        ...prev,
        [v.id]: `📖 ${v.word}: ${v.exampleSentence}`,
      }));
    } catch { /* silent */ }
    finally { setGeneratingId(null); }
  };

  const toggleFamiliarity = (v: VocabItem) => {
    const next = nextFamiliarity[v.familiarity];
    const quality = familiarityToQuality(next);
    const srsUpdate = calculateNextReview(quality, {
      easeFactor: (v as any).easeFactor ?? 2.5,
      interval: (v as any).reviewInterval ?? 0,
      repetitions: 0,
      lastReviewedAt: (v as any).lastReviewedAt ?? undefined,
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
        nextReviewDate: srsUpdate.nextReviewDate,
        reviewInterval: srsUpdate.interval,
        easeFactor: srsUpdate.easeFactor,
        lastReviewedAt: srsUpdate.lastReviewedAt,
      }),
    }).catch(() => {});
  };

  const handleAddWord = async () => {
    if (!addForm.word.trim() || !addForm.meaning.trim()) {
      setAddError(language === 'en' ? 'Word and meaning are required.' : '生字和中文意思為必填。');
      return;
    }
    if (!studentId) {
      setAddError(language === 'en' ? 'Please log in first.' : '請先登入。');
      return;
    }
    setAddLoading(true);
    setAddError('');
    try {
      const res = await fetch('/api/vocabulary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          word: addForm.word.trim(),
          partOfSpeech: addForm.partOfSpeech,
          meaningZh: addForm.meaning.trim(),
          exampleSentence: addForm.example.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.vocab) {
        setVocab(prev => [data.vocab, ...prev]);
        setShowAddModal(false);
        setAddForm({ word: '', partOfSpeech: 'noun', meaning: '', example: '', exampleZh: '' });
      } else {
        setAddError(data.error || t('vocab.addFailed'));
      }
    } catch {
      setAddError(t('vocab.addFailed'));
    } finally {
      setAddLoading(false);
    }
  };

  const filtered = vocab.filter((v) => {
    if (search && !v.word.includes(search) && !v.meaningZh.includes(search)) return false;
    if (filter !== 'all' && v.familiarity !== filter) return false;
    return true;
  });

  const stats = {
    total: vocab.length,
    mastered: vocab.filter(v => v.familiarity === 'mastered').length,
    learning: vocab.filter(v => v.familiarity === 'learning' || v.familiarity === 'new').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('vocab.title')}</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <TrendingUp className="w-4 h-4" /> {t('vocab.mastery').replace('{n}', String(stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0))}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('vocab.addWord')}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: t('vocab.total'), value: stats.total, color: 'text-teal-600' },
          { label: t('vocab.mastered'), value: stats.mastered, color: 'text-green-600' },
          { label: t('vocab.learning'), value: stats.learning, color: 'text-orange-600' },
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
            {srsDue.slice(0, 5).map((card: any) => (
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
              <p className="text-xs text-gray-400 text-center">{t('vocab.srsMore').replace('{n}', String(srsDue.length - 5))}</p>
            )}
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('vocab.search')} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value as Familiarity | 'all')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
          <option value="all">{t('vocab.filterAll')}</option>
          <option value="new">{t('vocab.filterNew')}</option>
          <option value="learning">{t('vocab.filterLearning')}</option>
          <option value="familiar">{t('vocab.filterFamiliar')}</option>
          <option value="mastered">{t('vocab.filterMastered')}</option>
        </select>
      </div>

      {/* Empty State */}
      {!loadError && vocab.length === 0 && (
        <div className="text-center py-16">
          <BookMarked className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">{t('vocab.empty')}</p>
        </div>
      )}

      {/* Word Cards */}
      <div className="space-y-3">
        {filtered.map((v) => (
          <div key={v.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-teal-200 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{v.word}</h3>
                  <span className="text-xs text-gray-400">{v.partOfSpeech}</span>
                  <AudioPlayer text={v.word} label="" size="sm" />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{v.meaningZh}</p>
                {v.exampleSentence && (
                  <p className="text-xs text-gray-500 mt-1 italic">&ldquo;{v.exampleSentence}&rdquo;</p>
                )}
                {v.exampleZh && <p className="text-xs text-gray-400">{v.exampleZh}</p>}

                {v.strategy && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="text-[10px] px-1.5 py-0.5 bg-teal-50 dark:bg-teal-900/20 text-teal-600 rounded-full">
                      🧠 {v.strategy === 'collocations' ? t('vocab.strategyCollocations') : v.strategy === 'word-formation' ? t('vocab.strategyWordFormation') : v.strategy === 'mnemonics' ? t('vocab.strategyMnemonics') : v.strategy}
                    </span>
                    {v.topic && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 dark:bg-purple-900/20 text-purple-600 rounded-full">
                        📂 {v.topic}
                      </span>
                    )}
                  </div>
                )}

                {aiExamples[v.id] && (
                  <p className="text-xs text-purple-600 dark:text-purple-400 mt-2 bg-purple-50 dark:bg-purple-900/20 p-2 rounded-lg">
                    <Sparkles className="w-3 h-3 inline mr-1" />{aiExamples[v.id]}
                  </p>
                )}
              </div>
              <button
                onClick={() => toggleFamiliarity(v)}
                className={`text-xs px-2 py-1 rounded-full font-medium cursor-pointer hover:opacity-80 transition-opacity ${getFamiliarityColor(v.familiarity)}`}
                title={t('vocab.clickToToggle')}
              >
                {getFamiliarityLabel(v.familiarity, language)}
              </button>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <div className="flex-1 mr-4">
                <ProgressBar value={familiarityProgress[v.familiarity]} size="sm" showPercentage={false} />
              </div>
              <div className="flex items-center gap-2">
                {v.nextReviewDate && (
                  <span className="text-xs text-gray-400">{t('vocab.nextReviewLabel').replace('{date}', new Date(v.nextReviewDate).toLocaleDateString(language === 'en' ? 'en-US' : 'zh-HK'))}</span>
                )}
                <button
                  onClick={() => handleAIExample(v)}
                  disabled={generatingId === v.id}
                  className="text-xs text-purple-500 hover:text-purple-700 disabled:opacity-50"
                >
                  {generatingId === v.id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : <Sparkles className="w-3 h-3 inline" />}
                  {' '}{t('vocab.aiExample')}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Word Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('vocab.addWordTitle')}</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('vocab.word')}</label>
                <input
                  type="text"
                  value={addForm.word}
                  onChange={(e) => setAddForm(p => ({ ...p, word: e.target.value }))}
                  placeholder={t('vocab.wordPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-teal-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('vocab.partOfSpeech')}</label>
                <select
                  value={addForm.partOfSpeech}
                  onChange={(e) => setAddForm(p => ({ ...p, partOfSpeech: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none"
                >
                  {POS_OPTIONS.map(pos => (
                    <option key={pos.value} value={pos.value}>{language === 'en' ? pos.en : pos.zh}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('vocab.meaning')}</label>
                <input
                  type="text"
                  value={addForm.meaning}
                  onChange={(e) => setAddForm(p => ({ ...p, meaning: e.target.value }))}
                  placeholder={t('vocab.meaningPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('vocab.exampleSentence')}</label>
                <input
                  type="text"
                  value={addForm.example}
                  onChange={(e) => setAddForm(p => ({ ...p, example: e.target.value }))}
                  placeholder={t('vocab.examplePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('vocab.exampleZh')}</label>
                <input
                  type="text"
                  value={addForm.exampleZh}
                  onChange={(e) => setAddForm(p => ({ ...p, exampleZh: e.target.value }))}
                  placeholder={t('vocab.exampleZhPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {addError && <p className="text-sm text-red-500">{addError}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {t('generic.cancel')}
                </button>
                <button
                  onClick={handleAddWord}
                  disabled={addLoading}
                  className="flex-1 px-4 py-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                >
                  {addLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {t('vocab.addWord')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
