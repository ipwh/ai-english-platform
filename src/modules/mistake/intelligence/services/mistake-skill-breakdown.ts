// ============================================
// Mistake Skill Breakdown — 錯題技能／題型聚合
// ============================================
// 2026-09-14: 一條 comprehension / listening 錯題是不可重考的（依附一篇
// passage）；學生真正需要的是「我在哪一類題目持續失分」。
// 本函式把錯題捲成技能／題型層面的弱項桶，並附上策略卡與練習目標。
//
// 純函式、無 I/O — 由 API route 與測試共用。
// ============================================

import { getStrategyCard, type StrategyCard } from './mistake-strategy';
import { getSkillLabel } from '@/shared/utils/nav';

/** Minimum shape the breakdown needs — accepts Prisma rows directly. */
export interface BreakdownMistakeInput {
  languageSkill?: string | null;
  grammarItem?: string | null;
  questionType?: string | null;
  mistakeType: string;
  reviewed?: boolean | null;
  createdAt: Date | string;
}

export type MistakePracticeTarget =
  | { kind: 'reading-paper'; languageSkill: 'reading'; grammarItem: null; labelZh: string; labelEn: string }
  | { kind: 'targeted-drill'; languageSkill: string | null; grammarItem: string | null; labelZh: string; labelEn: string }
  | { kind: 'vocab-book'; languageSkill: null; grammarItem: null; labelZh: string; labelEn: string }
  | { kind: 'none'; languageSkill: null; grammarItem: null; labelZh: string; labelEn: string };

export interface MistakeSkillBucket {
  /** Stable bucket key — `reading:inference`, `grammar:tenses-simple`, `vocabulary` … */
  key: string;
  languageSkill: string | null;
  grammarItem: string | null;
  questionType: string | null;
  mistakeType: string;
  count: number;
  unreviewed: number;
  lastSeen: string;
  /**
   * 是否可以「重考同一題」。閱讀／聆聽題目依附在特定 passage，
   * 重考同一條題目沒有意義 → false，改為練習同題型新題。
   */
  replayable: boolean;
  strategy: StrategyCard | null;
  practice: MistakePracticeTarget;
}

const COMPREHENSION_SKILLS = new Set(['reading', 'listening']);

/** Bucket identity: 題型 > 文法項目 > 錯誤類型 */
export function mistakeBucketKey(m: BreakdownMistakeInput): string {
  const skill = m.languageSkill ?? null;
  if (skill && COMPREHENSION_SKILLS.has(skill)) {
    return `${skill}:${m.questionType || 'unclassified'}`;
  }
  if (m.grammarItem) return `grammar:${m.grammarItem}`;
  return m.mistakeType;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function buildPracticeTarget(params: {
  languageSkill: string | null;
  grammarItem: string | null;
  mistakeType: string;
}): MistakePracticeTarget {
  const { languageSkill, grammarItem, mistakeType } = params;

  // 閱讀：重用 DSE 閱讀卷生成（已含題型 blueprint），不重考同一篇 passage。
  if (languageSkill === 'reading') {
    return { kind: 'reading-paper', languageSkill: 'reading', grammarItem: null, labelZh: '練 DSE 閱讀（涵蓋此題型）', labelEn: 'Practise DSE reading (this type included)' };
  }
  if (languageSkill === 'listening') {
    return { kind: 'targeted-drill', languageSkill: 'listening', grammarItem: null, labelZh: '練新聆聽題目', labelEn: 'Practise new listening items' };
  }
  if (grammarItem) {
    return { kind: 'targeted-drill', languageSkill: null, grammarItem, labelZh: '練同項目新題', labelEn: 'Practise new questions on this item' };
  }
  if (mistakeType === 'vocabulary') {
    return { kind: 'vocab-book', languageSkill: null, grammarItem: null, labelZh: '到生詞簿練習', labelEn: 'Practise in vocabulary book' };
  }
  return { kind: 'none', languageSkill: null, grammarItem: null, labelZh: '', labelEn: '' };
}

/**
 * 由 bucket key 反解中文標籤 — 與 mistakeBucketKey 對稱。
 *
 * 用於弱項摘要／教師端顯示，避免把原始 key（`reading:inference`）直接給用戶看。
 * 無法解析時回 null，呼叫方自行退回原值（不杜撰標籤）。
 */
export function bucketKeyLabelZh(key: string): string | null {
  const separator = key.indexOf(':');

  if (separator === -1) {
    // 無 scope：錯誤類型桶（vocabulary / careless / time-management / chinglish / comprehension）
    return getStrategyCard({ mistakeType: key })?.labelZh ?? null;
  }

  const scope = key.slice(0, separator);
  const value = key.slice(separator + 1);
  if (!value) return null;

  if (scope === 'reading' || scope === 'listening') {
    if (value === 'unclassified') {
      return getStrategyCard({ languageSkill: scope })?.labelZh ?? null;
    }
    return getStrategyCard({ languageSkill: scope, questionType: value })?.labelZh ?? value;
  }

  if (scope === 'grammar') {
    return getSkillLabel(value, 'zh') || value;
  }

  return null;
}

/**
 * Group mistakes into skill/type buckets, strongest weakness first.
 * `limit` caps the returned buckets (default 6).
 */
export function buildMistakeSkillBreakdown(
  mistakes: BreakdownMistakeInput[],
  limit = 6,
): MistakeSkillBucket[] {
  const buckets = new Map<string, MistakeSkillBucket>();

  for (const m of mistakes) {
    const key = mistakeBucketKey(m);
    const skill = m.languageSkill ?? null;
    const createdAt = toIso(m.createdAt);
    const existing = buckets.get(key);

    if (existing) {
      existing.count += 1;
      if (!m.reviewed) existing.unreviewed += 1;
      if (createdAt > existing.lastSeen) existing.lastSeen = createdAt;
      continue;
    }

    buckets.set(key, {
      key,
      languageSkill: skill,
      grammarItem: m.grammarItem ?? null,
      questionType: m.questionType ?? null,
      mistakeType: m.mistakeType,
      count: 1,
      unreviewed: m.reviewed ? 0 : 1,
      lastSeen: createdAt,
      // 只有自足題目（文法／詞彙）才可重考同一題；passage-bound 題目不可。
      replayable: !(skill && COMPREHENSION_SKILLS.has(skill)),
      strategy: getStrategyCard({
        languageSkill: skill,
        questionType: m.questionType ?? null,
        grammarItem: m.grammarItem ?? null,
        mistakeType: m.mistakeType,
      }),
      practice: buildPracticeTarget({
        languageSkill: skill,
        grammarItem: m.grammarItem ?? null,
        mistakeType: m.mistakeType,
      }),
    });
  }

  return Array.from(buckets.values())
    .sort((a, b) => (b.count - a.count) || (b.lastSeen.localeCompare(a.lastSeen)))
    .slice(0, limit);
}
