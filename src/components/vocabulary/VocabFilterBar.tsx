// ============================================
// VocabFilterBar — 進階過濾 + 匯出工具列
// 支援：搜尋、詞性過濾、掌握度過濾、排序、匯出
// ============================================
'use client';

import { Search, Filter, Download, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { Familiarity } from '@/lib/types';
import { useT } from '@/hooks/use-i18n';

interface VocabFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  filter: Familiarity | 'all';
  onFilterChange: (v: Familiarity | 'all') => void;
  posFilter: string;
  onPosFilterChange: (v: string) => void;
  sortBy: 'recent' | 'alphabetical' | 'mastery';
  onSortByChange: (v: 'recent' | 'alphabetical' | 'mastery') => void;
  onExportCSV?: () => void;
  onExportAnki?: () => void;
  language: 'zh' | 'en';
  totalCount: number;
}

const POS_OPTIONS = [
  { value: '', label: { zh: '全部詞性', en: 'All POS' } },
  { value: 'noun', label: { zh: '名詞', en: 'Noun' } },
  { value: 'verb', label: { zh: '動詞', en: 'Verb' } },
  { value: 'adjective', label: { zh: '形容詞', en: 'Adjective' } },
  { value: 'adverb', label: { zh: '副詞', en: 'Adverb' } },
  { value: 'preposition', label: { zh: '介詞', en: 'Preposition' } },
  { value: 'conjunction', label: { zh: '連接詞', en: 'Conjunction' } },
  { value: 'pronoun', label: { zh: '代名詞', en: 'Pronoun' } },
  { value: 'phrase', label: { zh: '片語', en: 'Phrase' } },
];

export default function VocabFilterBar({
  search, onSearchChange,
  filter, onFilterChange,
  posFilter, onPosFilterChange,
  sortBy, onSortByChange,
  onExportCSV, onExportAnki,
  language,
  totalCount,
}: VocabFilterBarProps) {
  const { t } = useT();
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className="space-y-3">
      {/* Search + Sort row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('vocab.search')}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Sort dropdown */}
        <select
          value={sortBy}
          onChange={(e) => onSortByChange(e.target.value as typeof sortBy)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none"
        >
          <option value="recent">{t('vocab.sortRecent')}</option>
          <option value="alphabetical">{t('vocab.sortAlpha')}</option>
          <option value="mastery">{t('vocab.sortMastery')}</option>
        </select>

        {/* Export dropdown */}
        {totalCount > 0 && (onExportCSV || onExportAnki) && (
          <div className="relative">
            <button
              onClick={() => setExportOpen(!exportOpen)}
              className="flex items-center gap-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              <Download className="w-4 h-4" />
              <ChevronDown className="w-3 h-3" />
            </button>
            {exportOpen && (
              <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20 py-1">
                {onExportCSV && (
                  <button
                    onClick={() => { onExportCSV(); setExportOpen(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    📊 {language === 'en' ? 'Export CSV' : '匯出 CSV'}
                  </button>
                )}
                {onExportAnki && (
                  <button
                    onClick={() => { onExportAnki(); setExportOpen(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    🃏 {language === 'en' ? 'Export Anki' : '匯出 Anki'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter chips row */}
      <div className="flex flex-wrap gap-1.5">
        {/* Familiarity chips */}
        {(['all', 'new', 'learning', 'familiar', 'mastered'] as const).map((f) => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
              filter === f
                ? 'bg-teal-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {f === 'all' ? t('vocab.filterAll') : t(`vocab.filter${f.charAt(0).toUpperCase() + f.slice(1)}` as any)}
          </button>
        ))}

        <span className="mx-1 text-gray-300 dark:text-gray-600">|</span>

        {/* POS chips (compact) */}
        <select
          value={posFilter}
          onChange={(e) => onPosFilterChange(e.target.value)}
          className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 outline-none border-0"
        >
          {POS_OPTIONS.map(pos => (
            <option key={pos.value} value={pos.value}>
              {pos.label[language]}
            </option>
          ))}
        </select>

        {/* Count badge */}
        <span className="text-xs text-gray-400 self-center ml-auto">
          {totalCount} {language === 'en' ? 'words' : '個單字'}
        </span>
      </div>
    </div>
  );
}
