// ============================================
// 技能標籤晶片元件
// 支援 ELE KLACG 2017 課程文法項目及語言技能
// ============================================
import { skillLabels, skillLabelsEn, difficultyLabels } from '@/lib/nav';
import { useAppStore } from '@/store/appStore';
import type { SkillCategory, DifficultyLevel, GrammarItem, LanguageSkill } from '@/lib/types';

interface SkillChipProps {
  /** @deprecated 使用 grammarItem 或 languageSkill */
  skill?: SkillCategory | string;
  /** 文法項目 (ELE KLACG 2017) */
  grammarItem?: GrammarItem | string;
  /** 語言技能 (ELE KLACG 2017) */
  languageSkill?: LanguageSkill | string;
  subSkill?: string;
  subSkillZh?: string;
  difficulty?: DifficultyLevel;
  size?: 'sm' | 'md';
  className?: string;
}

export default function SkillChip({ skill, grammarItem, languageSkill, subSkill, subSkillZh, difficulty, size = 'sm', className = '' }: SkillChipProps) {
  const language = useAppStore(s => s.language);
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';

  const diffColorMap: Record<string, string> = {
    remedial: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    core: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    challenge: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  };

  const diffLabelsEn: Record<string, string> = { remedial: 'Remedial', core: 'Core', challenge: 'Challenge' };

  // 取得技能標籤文字 — 根據語言選擇
  const skillKey = grammarItem || languageSkill || skill;
  const labels = language === 'en' ? skillLabelsEn : skillLabels;
  const skillLabel = subSkillZh || subSkill || (skillKey ? labels[skillKey] || skillKey : '');

  if (difficulty) {
    const diffLabel = language === 'en' ? (diffLabelsEn[difficulty] || difficulty) : (difficultyLabels[difficulty] || difficulty);
    return (
      <span className={`inline-block rounded-full font-medium ${sizeClass} ${diffColorMap[difficulty] || 'bg-gray-100 text-gray-600'} ${className}`}>
        {diffLabel}
      </span>
    );
  }

  return (
    <span className={`inline-block rounded-full font-medium ${sizeClass} bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300 ${className}`}>
      {skillLabel}
      {(subSkillZh || subSkill) && ` · ${subSkillZh || subSkill}`}
    </span>
  );
}
