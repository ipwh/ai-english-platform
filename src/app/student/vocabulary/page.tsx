// ============================================
// 學生端 — 生字簿
// 支援：AI 例句生成、間隔重溫、熟悉度標記、發音
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { Search, Sparkles, Loader2, BookMarked, TrendingUp, CalendarCheck, Brain } from 'lucide-react';

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

export default function VocabularyPage() {
  const { t } = useT();
  const store = useAppStore();
  const language = store.language || 'zh';
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Familiarity | 'all'>('all');

  // === AI 例句生成 ===
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [gradeLevel, setGradeLevel] = useState('S4');

  // === SRS Daily Review ===
  const [srsDue, setSrsDue] = useState<any[]>([]);
  const [srsLoading, setSrsLoading] = useState(false);
  const [srsProgress, setSrsProgress] = useState<{ percentage: number; label: string } | null>(null);

  const loadSrsReview = () => {
    if (!studentId) return;
    setSrsLoading(true);
    fetch(`/api/srs/review?studentId=${encodeURIComponent(studentId)}&type=vocab`)
      .then(r => r.json())
      .then(d => {
        if (d.reviewCards?.vocab) {
          setSrsDue(d.reviewCards.vocab);
          setSrsProgress(d.progress?.vocab || null);
        }
      })
      .catch(() => {})
      .finally(() => setSrsLoading(false));
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
      // 使用 AI 生成例句
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
      // Use vocab item's own exampleSentence field
      setAiExamples(prev => ({
        ...prev,
        [v.id]: `📖 ${v.word}: ${v.exampleSentence}`,
      }));
    } catch { /* silent */ }
    finally { setGeneratingId(null); }
  };

  // 切換熟悉度（更新本地狀態 + 持久化到 API，含 SRS 排程）
  const toggleFamiliarity = (v: VocabItem) => {
    const next = nextFamiliarity[v.familiarity];
    // 根據新熟悉度計算 SRS quality
    const quality = familiarityToQuality(next);
    // 用現有 SRS 狀態計算下一次複習日期
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
    // 持久化到後端（含 SRS 欄位）
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
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <TrendingUp className="w-4 h-4" /> {t('vocab.masteryLabel').replace('{n}', String(stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0))}
        </div>
      </div>

      {/* 統計列 */}
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

      {/* 🧠 SRS 每日複習 */} 
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
                  {getFamiliarityLabel(card.familiarity)}
                </span>
              </div>
            ))}
            {srsDue.length > 5 && (
              <p className="text-xs text-gray-400 text-center">+{srsDue.length - 5} more due today</p>
            )}
          </div>
        </div>
      )}

      {/* 搜尋與篩選 */}
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

      {/* 生字卡列表 */}
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
                <p className="text-xs text-gray-500 mt-1 italic">“{v.exampleSentence}”</p>
                <p className="text-xs text-gray-400">{v.exampleZh}</p>

                {/* 學習策略標籤 */}
                {v.strategy && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="text-[10px] px-1.5 py-0.5 bg-teal-50 dark:bg-teal-900/20 text-teal-600 rounded-full">
                      🧠 {t(v.strategy === 'collocations' ? 'vocab.strategyCollocations' : v.strategy === 'word-formation' ? 'vocab.strategyWordFormation' : v.strategy === 'mnemonics' ? 'vocab.strategyMnemonics' : v.strategy)}
                    </span>
                    {v.topic && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 dark:bg-purple-900/20 text-purple-600 rounded-full">
                        📂 {v.topic}
                      </span>
                    )}
                  </div>
                )}

                {/* AI 例句 */}
                {aiExamples[v.id] && (
                  <p className="text-xs text-purple-600 dark:text-purple-400 mt-2 bg-purple-50 dark:bg-purple-900/20 p-2 rounded-lg">
                    <Sparkles className="w-3 h-3 inline mr-1" />{aiExamples[v.id]}
                  </p>
                )}
              </div>
              {/* 熟悉度 — 點擊切換 */}
              <button
                onClick={() => toggleFamiliarity(v)}
                className={`text-xs px-2 py-1 rounded-full font-medium cursor-pointer hover:opacity-80 transition-opacity ${getFamiliarityColor(v.familiarity)}`}
                title={t('vocab.clickToToggle')}
              >
                {getFamiliarityLabel(v.familiarity)}
              </button>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <div className="flex-1 mr-4">
                <ProgressBar value={familiarityProgress[v.familiarity]} size="sm" showPercentage={false} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{t('vocab.nextReviewLabel').replace('{date}', new Date(v.nextReviewDate).toLocaleDateString(language === 'en' ? 'en-US' : 'zh-HK'))}</span>
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
    </div>
  );
}
