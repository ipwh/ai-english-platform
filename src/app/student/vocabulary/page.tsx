// ============================================
// 學生端 — 生字簿
// 支援：AI 例句生成、間隔重溫、熟悉度標記、發音
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { Search, Sparkles, Loader2, BookMarked, TrendingUp } from 'lucide-react';

import ProgressBar from '@/components/shared/ProgressBar';
import AudioPlayer from '@/components/shared/AudioPlayer';
import type { Familiarity, VocabItem } from '@/lib/types';
import { useT } from '@/hooks/use-i18n';
import { getFamiliarityLabel, getFamiliarityColor } from '@/lib/utils';

const nextFamiliarity: Record<Familiarity, Familiarity> = {
  'new': 'learning', 'learning': 'familiar', 'familiar': 'mastered', 'mastered': 'mastered',
};
const familiarityProgress: Record<Familiarity, number> = {
  'new': 10, 'learning': 40, 'familiar': 75, 'mastered': 100,
};

export default function VocabularyPage() {
  const { t } = useT();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Familiarity | 'all'>('all');

  // === AI 例句生成 ===
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [vocab, setVocab] = useState<VocabItem[]>([]);

  useEffect(() => {
    fetch('/api/vocabulary')
      .then(r => r.json())
      .then(d => { if (d.vocab?.length) setVocab(d.vocab); })
      .catch(() => {});
  }, []);

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
          gradeLevel: 'S4',
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
      // Fallback to mock example
      setAiExamples(prev => ({
        ...prev,
        [v.id]: `📖 ${v.word}: ${v.exampleSentence}`,
      }));
    } catch { /* silent */ }
    finally { setGeneratingId(null); }
  };

  // 切換熟悉度
  const toggleFamiliarity = (v: VocabItem) => {
    setVocab(prev => prev.map(item =>
      item.id === v.id ? { ...item, familiarity: nextFamiliarity[v.familiarity] } : item
    ));
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
          <TrendingUp className="w-4 h-4" /> 掌握率 {stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0}%
        </div>
      </div>

      {/* 統計列 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '總生字', value: stats.total, color: 'text-teal-600' },
          { label: '已掌握', value: stats.mastered, color: 'text-green-600' },
          { label: '學習中', value: stats.learning, color: 'text-orange-600' },
        ].map((s, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm text-center border border-gray-100 dark:border-gray-700">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* 搜尋與篩選 */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜尋生字..." className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value as Familiarity | 'all')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
          <option value="all">全部</option>
          <option value="new">新學</option>
          <option value="learning">學習中</option>
          <option value="familiar">已熟悉</option>
          <option value="mastered">已掌握</option>
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
                      🧠 {v.strategy === 'collocations' ? '搭配記憶' : v.strategy === 'word-formation' ? '構詞法' : v.strategy === 'mnemonics' ? '記憶術' : v.strategy}
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
                title="點擊切換熟悉度"
              >
                {getFamiliarityLabel(v.familiarity)}
              </button>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <div className="flex-1 mr-4">
                <ProgressBar value={familiarityProgress[v.familiarity]} size="sm" showPercentage={false} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">下次溫習：{new Date(v.nextReviewDate).toLocaleDateString('zh-HK')}</span>
                <button
                  onClick={() => handleAIExample(v)}
                  disabled={generatingId === v.id}
                  className="text-xs text-purple-500 hover:text-purple-700 disabled:opacity-50"
                >
                  {generatingId === v.id ? <Loader2 className="w-3 h-3 animate-spin inline" /> : <Sparkles className="w-3 h-3 inline" />}
                  {' '}AI 例句
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
