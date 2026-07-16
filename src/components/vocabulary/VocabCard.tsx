// ============================================
// VocabCard — 生字卡片元件
// 顯示：單字、發音、詞性、中英意思、例句、同反義字、搭配詞、掌握度
// ============================================
'use client';

import { Sparkles, Loader2, ChevronDown, ChevronUp, Trash2, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import AudioPlayer from '@/components/shared/AudioPlayer';
import ProgressBar from '@/components/shared/ProgressBar';
import type { Familiarity, VocabItem, MasteryLevel } from '@/lib/types';
import { getFamiliarityLabel, getFamiliarityColor } from '@/lib/utils';
import { useT } from '@/hooks/use-i18n';

interface VocabCardProps {
  vocab: VocabItem;
  language: 'zh' | 'en';
  aiExample?: string;
  generatingAi: boolean;
  onToggleFamiliarity: (v: VocabItem) => void;
  onGenerateAiExample: (v: VocabItem) => void;
  onDelete?: (id: string) => void;
  onSetMasteryLevel?: (id: string, level: MasteryLevel) => void;
  /** 選取模式 */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const masteryStars: Record<number, string> = {
  0: '☆☆☆☆☆', 1: '★☆☆☆☆', 2: '★★☆☆☆', 3: '★★★☆☆', 4: '★★★★☆', 5: '★★★★★',
};

const familiarityProgress: Record<Familiarity, number> = {
  'new': 10, 'learning': 40, 'familiar': 75, 'mastered': 100,
};

export default function VocabCard({
  vocab,
  language,
  aiExample,
  generatingAi,
  onToggleFamiliarity,
  onGenerateAiExample,
  onDelete,
  onSetMasteryLevel,
  selectable = false,
  selected = false,
  onToggleSelect,
}: VocabCardProps) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const hasExtra =
    (vocab.synonyms && vocab.synonyms.length > 0) ||
    (vocab.antonyms && vocab.antonyms.length > 0) ||
    (vocab.collocations && vocab.collocations.length > 0) ||
    (vocab.allPartOfSpeech && vocab.allPartOfSpeech.length > 1) ||
    vocab.secondaryMeaningZh;

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border transition-colors ${
      selected
        ? 'border-teal-400 dark:border-teal-500 ring-2 ring-teal-200 dark:ring-teal-800 bg-teal-50/50 dark:bg-teal-900/10'
        : 'border-gray-100 dark:border-gray-700 hover:border-teal-200 dark:hover:border-teal-700'
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {/* Checkbox for selection mode */}
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect?.(vocab.id)}
              className="mt-1.5 w-4 h-4 rounded border-gray-300 text-teal-500 focus:ring-teal-500 shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
          {/* Word + POS + Audio */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{vocab.word}</h3>
            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
              {vocab.partOfSpeech}
            </span>
            {vocab.allPartOfSpeech && vocab.allPartOfSpeech.length > 1 && (
              <span className="text-[10px] text-teal-500 bg-teal-50 dark:bg-teal-900/20 px-1 py-0.5 rounded">
                +{vocab.allPartOfSpeech.length - 1} POS
              </span>
            )}
            <AudioPlayer text={vocab.word} label="" size="sm" />
          </div>

          {/* Meaning */}
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {vocab.meaningZh}
            {vocab.secondaryMeaningZh && (
              <span className="text-gray-400 dark:text-gray-500"> · {vocab.secondaryMeaningZh}</span>
            )}
          </p>

          {/* Added date */}
          {vocab.createdAt && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              📅 {language === 'en' ? 'Added: ' : '加入日期：'}
              {new Date(vocab.createdAt).toLocaleDateString(language === 'zh' ? 'zh-HK' : 'en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
              })}
            </p>
          )}

          {/* Example sentence */}
          {vocab.exampleSentence && (
            <p className="text-xs text-gray-500 mt-1 italic leading-relaxed break-words">
              &ldquo;{vocab.exampleSentence}&rdquo;
              {vocab.exampleZh && (
                <span className="text-gray-400 not-italic ml-1">({vocab.exampleZh})</span>
              )}
            </p>
          )}

          {/* AI-generated example */}
          {aiExample && (
            <p className="text-xs text-purple-600 dark:text-purple-400 mt-2 bg-purple-50 dark:bg-purple-900/20 p-2 rounded-lg">
              <Sparkles className="w-3 h-3 inline mr-1" />{aiExample}
            </p>
          )}

          {/* Strategy badge — derived from familiarity + mastery */}
          {(() => {
            const strategyKey = vocab.masteryLevel >= 4 && vocab.familiarity === 'mastered'
              ? 'vocab.strategyMastered'
              : vocab.nextReviewDate && new Date(vocab.nextReviewDate) <= new Date()
                ? 'vocab.strategyDue'
                : vocab.familiarity === 'new'
                  ? 'vocab.strategyNew'
                  : vocab.familiarity === 'learning'
                    ? 'vocab.strategyLearning'
                    : vocab.masteryLevel <= 2
                      ? 'vocab.strategyWeak'
                      : '';
            const strategy = strategyKey ? t(strategyKey) : '';
            return strategy ? (
              <span className="inline-block mt-2 text-[10px] px-1.5 py-0.5 bg-teal-50 dark:bg-teal-900/20 text-teal-600 rounded-full">
                🧠 {strategy}
              </span>
            ) : null;
          })()}

          {/* Expanded: synonyms, antonyms, collocations */}
          {expanded && hasExtra && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
              {vocab.allPartOfSpeech && vocab.allPartOfSpeech.length > 1 && (
                <div>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase">{t('vocab.posVariations')}</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {vocab.allPartOfSpeech.map((pos, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
                        {pos}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {vocab.synonyms && vocab.synonyms.length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 uppercase">{t('vocab.synonyms')}</span>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    {vocab.synonyms.join(' · ')}
                  </p>
                </div>
              )}
              {vocab.antonyms && vocab.antonyms.length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold text-red-500 dark:text-red-400 uppercase">{t('vocab.antonyms')}</span>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    {vocab.antonyms.join(' · ')}
                  </p>
                </div>
              )}
              {vocab.collocations && vocab.collocations.length > 0 && (
                <div>
                  <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase">{t('vocab.collocations')}</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {vocab.collocations.map((c, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          </div> {/* close inner flex-1 wrapper */}
        </div> {/* close outer flex wrapper */}

        {/* Right side: familiarity badge + actions */}
        <div className="flex flex-col items-end gap-1.5 ml-3 shrink-0">
          <button
            onClick={() => onToggleFamiliarity(vocab)}
            className={`text-xs px-2 py-1 rounded-full font-medium cursor-pointer hover:opacity-80 transition-opacity ${getFamiliarityColor(vocab.familiarity)}`}
            title={t('vocab.clickToToggle')}
          >
            {getFamiliarityLabel(vocab.familiarity, language)}
          </button>

          {/* Mastery star rating */}
          {onSetMasteryLevel && (
            <button
              onClick={() => {
                const next = ((vocab.masteryLevel ?? 0) + 1) % 6 as MasteryLevel;
                onSetMasteryLevel(vocab.id, next);
              }}
              className="text-[10px] text-yellow-500 hover:text-yellow-600 font-mono tracking-wider"
              title={`Mastery ${vocab.masteryLevel ?? 0}/5`}
            >
              {masteryStars[vocab.masteryLevel ?? 0]}
            </button>
          )}

          {onDelete && (
            <button
              onClick={() => { if (window.confirm('確定要刪除此生字？This will permanently delete this word.')) onDelete(vocab.id); }}
              className="text-gray-300 hover:text-red-500 transition-colors p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
              title="Delete"
              aria-label="Delete word"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Bottom bar: progress + AI example + expand */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
        <div className="flex-1 mr-4">
          <ProgressBar value={familiarityProgress[vocab.familiarity]} size="sm" showPercentage={false} />
        </div>
        <div className="flex items-center gap-2">
          {vocab.nextReviewDate && (
            <span className="text-[10px] text-gray-400">
              📅 {new Date(vocab.nextReviewDate).toLocaleDateString(language === 'en' ? 'en-US' : 'zh-HK')}
            </span>
          )}
          <button
            onClick={() => onGenerateAiExample(vocab)}
            disabled={generatingAi}
            className="text-xs text-purple-500 hover:text-purple-700 disabled:opacity-50 flex items-center gap-0.5"
          >
            {generatingAi ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {' '}{t('vocab.aiExample')}
          </button>
          {hasExtra && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? t('vocab.collapseDetails') : t('vocab.expandDetails')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
