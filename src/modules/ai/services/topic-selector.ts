// ============================================
// 主題選擇引擎 v3.0 — 強化多樣化 DSE 主題抽取
// 提取自 ai-service.ts
//
// v3.0 改進：
// - 用戶級別 topic history tracking（跨 session 記憶）
// - 加權隨機選擇（最近用過的主題權重遞減）
// - 類別輪換（同一類別至少間隔 N 次）
// - 支援多題材批量選取（確保彼此不重複）
// - 提供 AI prompt 用的「禁止重複」指令字串
// ============================================

import {
  LISTENING_TOPICS_V2,
  READING_TOPICS_V2,
  DSE_EMPIRICAL_TOPICS,
} from './dse-topics';
import type { TopicCategory, TopicEntry } from './dse-topics';
import { logger } from '@/shared/logger/logger';

// ============================================
// Constants
// ============================================

/** 每個用戶記憶最近 N 個已使用主題 */
const USER_TOPIC_HISTORY_SIZE = 20;
/** 類別輪換：同一類別至少間隔 N 次選取 */
const CATEGORY_COOLDOWN = 4;
/** 全域最大 user history 數量（防止 memory leak） */
const MAX_USER_HISTORIES = 200;
/** 定期清理：當 user 數超過此值時觸發 */
const CLEANUP_THRESHOLD = 150;

// ============================================
// User-level topic history
// ============================================

interface UserTopicRecord {
  topicText: string;
  category: TopicCategory;
  skill: 'writing' | 'reading' | 'listening' | 'speaking' | 'grammar';
  timestamp: number;
}

const userTopicHistory: Map<string, UserTopicRecord[]> = new Map();

// Legacy session-level tracking (kept for backward compat with getRandomTopicV2)
const topicBlacklist: Map<string, Set<string>> = new Map();
const recentTopicsByCategory: Map<string, string[]> = new Map();
export const MAX_BLACKLIST_SIZE = 50;
const _MAX_RECENT_CATEGORIES = 10;

// ============================================
// Cleanup
// ============================================

function cleanupIfNeeded(): void {
  if (userTopicHistory.size > CLEANUP_THRESHOLD) {
    const keys = [...userTopicHistory.keys()].slice(0, 30);
    for (const key of keys) userTopicHistory.delete(key);
    logger.info({ module: 'topic-selector', removedUsers: keys.length }, 'User history cleanup');
  }
  if (topicBlacklist.size > MAX_BLACKLIST_SIZE) {
    const keys = [...topicBlacklist.keys()].slice(0, 20);
    for (const key of keys) {
      topicBlacklist.delete(key);
      recentTopicsByCategory.delete(key);
    }
    logger.info({ module: 'topic-selector', removedSessions: keys.length }, 'Blacklist cleanup');
  }
}

// ============================================
// User Topic History Management
// ============================================

/**
 * Record a topic as "used" for a user.
 */
export function recordTopicUsage(
  userId: string,
  topicText: string,
  category: TopicCategory,
  skill: 'writing' | 'reading' | 'listening' | 'speaking' | 'grammar',
): void {
  const records = userTopicHistory.get(userId) || [];
  records.push({ topicText, category, skill, timestamp: Date.now() });
  // Keep only last N
  while (records.length > USER_TOPIC_HISTORY_SIZE) records.shift();
  userTopicHistory.set(userId, records);
  cleanupIfNeeded();
}

/**
 * Get recently used topics for a user.
 */
export function getRecentTopics(
  userId: string,
  skill?: 'writing' | 'reading' | 'listening' | 'speaking' | 'grammar',
  limit = 10,
): UserTopicRecord[] {
  const records = userTopicHistory.get(userId) || [];
  const filtered = skill ? records.filter(r => r.skill === skill) : records;
  return filtered.slice(-limit);
}

/**
 * Get recently used categories for a user.
 */
function getRecentCategories(userId: string, limit = CATEGORY_COOLDOWN): TopicCategory[] {
  const records = userTopicHistory.get(userId) || [];
  return records.slice(-limit).map(r => r.category);
}

/**
 * Get recently used topic texts for a user.
 */
function getRecentTopicTexts(userId: string, limit = USER_TOPIC_HISTORY_SIZE): Set<string> {
  const records = userTopicHistory.get(userId) || [];
  return new Set(records.slice(-limit).map(r => r.topicText));
}

// ============================================
// Weighted Topic Selection
// ============================================

interface WeightedTopic {
  entry: TopicEntry;
  weight: number;
}

/**
 * Select a single diverse topic with weighted random selection.
 *
 * Weighting strategy:
 * - Base weight = 1.0
 * - Recently used topic text → weight × 0.1 (strong penalty)
 * - Recently used category (within cooldown) → weight × 0.3
 * - Same category as any recent → weight × 0.5
 * - Preferred categories → weight × 2.0
 */
export function selectDiverseTopic(params: {
  userId: string;
  skill: 'writing' | 'reading' | 'listening' | 'speaking' | 'grammar';
  gradeLevel: string;
  preferredCategories?: TopicCategory[];
  excludeTopics?: string[];
}): string {
  const { userId, skill, gradeLevel, preferredCategories, excludeTopics } = params;

  // Determine pool based on skill
  let pool: TopicEntry[];
  switch (skill) {
    case 'listening':
    case 'speaking':
      pool = LISTENING_TOPICS_V2;
      break;
    case 'reading':
      pool = READING_TOPICS_V2;
      break;
    case 'writing':
    case 'grammar':
      // Writing/grammar can use both reading and listening pools
      pool = [...READING_TOPICS_V2, ...LISTENING_TOPICS_V2];
      break;
    default:
      pool = LISTENING_TOPICS_V2;
  }

  // Filter by grade level
  const gradeEligible = pool.filter(t => t.grades.includes(gradeLevel));
  const candidates = gradeEligible.length > 0 ? gradeEligible : pool;

  // Get user's recent context
  const recentTexts = getRecentTopicTexts(userId);
  const recentCats = getRecentCategories(userId);
  const excludeSet = new Set(excludeTopics || []);

  // Build weighted list
  const weighted: WeightedTopic[] = candidates.map(entry => {
    let weight = 1.0;

    // Strong penalty for exact topic reuse
    if (recentTexts.has(entry.text) || excludeSet.has(entry.text)) {
      weight *= 0.05;
    }

    // Penalty for recently used categories (within cooldown window)
    const catIndex = recentCats.lastIndexOf(entry.category);
    if (catIndex >= 0) {
      const recencyRatio = 1 - (catIndex / recentCats.length); // 0 = oldest, 1 = newest
      weight *= 0.1 + recencyRatio * 0.3; // 0.1 to 0.4
    }

    // Boost preferred categories
    if (preferredCategories?.includes(entry.category)) {
      weight *= 2.5;
    }

    return { entry, weight };
  });

  // Weighted random selection
  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  let random = Math.random() * totalWeight;
  for (const w of weighted) {
    random -= w.weight;
    if (random <= 0) {
      recordTopicUsage(userId, w.entry.text, w.entry.category, skill);
      return w.entry.text;
    }
  }

  // Fallback: random
  const fallback = candidates[Math.floor(Math.random() * candidates.length)];
  recordTopicUsage(userId, fallback.text, fallback.category, skill);
  return fallback.text;
}

/**
 * Select multiple diverse topics ensuring no duplicates and category variety.
 */
export function selectDiverseTopics(params: {
  userId: string;
  skill: 'writing' | 'reading' | 'listening' | 'speaking' | 'grammar';
  gradeLevel: string;
  count: number;
  preferredCategories?: TopicCategory[];
}): string[] {
  const results: string[] = [];
  const usedTexts = new Set<string>();
  const usedCategories = new Set<TopicCategory>();

  for (let i = 0; i < params.count; i++) {
    // Determine preferred categories (prefer unused ones)
    const preferred = params.preferredCategories?.filter(c => !usedCategories.has(c));

    const topic = selectDiverseTopic({
      userId: params.userId,
      skill: params.skill,
      gradeLevel: params.gradeLevel,
      preferredCategories: preferred && preferred.length > 0 ? preferred : undefined,
      excludeTopics: [...usedTexts],
    });

    results.push(topic);
    usedTexts.add(topic);

    // Find the category of this topic to track it
    const pool = params.skill === 'listening' || params.skill === 'speaking'
      ? LISTENING_TOPICS_V2
      : params.skill === 'reading'
        ? READING_TOPICS_V2
        : [...READING_TOPICS_V2, ...LISTENING_TOPICS_V2];
    const found = pool.find(t => t.text === topic);
    if (found) usedCategories.add(found.category);
  }

  return results;
}

/**
 * Build an AI prompt instruction string that enforces topic diversity.
 * Pass this into the AI system prompt to prevent topic repetition.
 */
export function buildDiversityInstruction(params: {
  userId: string;
  skill: 'writing' | 'reading' | 'listening' | 'speaking' | 'grammar';
  gradeLevel: string;
  count?: number;
}): string {
  const recentTopics = getRecentTopics(params.userId, params.skill, 8);
  const recentTexts = recentTopics.map(r => r.topicText);

  let instruction = `
═══════════════════════════════════════
⚠️ TOPIC DIVERSITY ENFORCEMENT — 題材多元化強制規則
═══════════════════════════════════════

CRITICAL: You MUST use diverse, non-repeating topics. The following topics have been used recently by this student and MUST NOT be reused:
${recentTexts.length > 0 ? recentTexts.map((t, i) => `${i + 1}. ❌ BANNED: "${t}"`).join('\n') : '(No recent topics — you have full freedom to choose)'}

## Topic Selection Rules:
1. NEVER reuse any topic from the BANNED list above
2. Vary categories — don't pick the same category twice in a row
3. Rotate between: HK-local topics (~40%), international/global topics (~60%)
4. For multiple questions in one generation: ensure each question uses a DIFFERENT theme/scenario
5. Avoid overused clichés: sports day, cinema times, library opening hours, bee conservation
6. Prefer fresh, contemporary topics that reflect real DSE diversity (2012-2024 past papers)`.trim();

  return instruction;
}

// ============================================
// Legacy getRandomTopicV2 (kept for backward compat)
// ============================================

/**
 * Get a diverse random topic with:
 * - Grade-level filtering (S3→life-oriented, S5-S6→social issues)
 * - Category rotation (avoid consecutive same-category topics)
 * - Blacklist mechanism (avoid repetition within session)
 * - Student topic preference support
 *
 * @deprecated Prefer selectDiverseTopic() which has user-level tracking
 */
export function getRandomTopicV2(
  isListening: boolean,
  isReading: boolean,
  gradeLevel: string,
  preferredCategories?: TopicCategory[],
): string {
  const pool = isListening ? LISTENING_TOPICS_V2 : isReading ? READING_TOPICS_V2 : LISTENING_TOPICS_V2;

  // Filter by grade level
  const gradeEligible = pool.filter(t => t.grades.includes(gradeLevel));
  const candidates = gradeEligible.length > 0 ? gradeEligible : pool;

  // Session key for blacklist
  const sessionKey = `${gradeLevel}-${isListening ? 'listen' : isReading ? 'read' : 'default'}`;
  const blacklist = topicBlacklist.get(sessionKey) || new Set();

  // Filter out blacklisted topics
  let available = candidates.filter(t => !blacklist.has(t.text));

  // Reset blacklist if all topics are used
  if (available.length === 0) {
    topicBlacklist.delete(sessionKey);
    available = candidates;
  }

  // Category rotation: avoid the last 3 categories used
  const recentCats = recentTopicsByCategory.get(sessionKey) || [];
  const nonRecent = available.filter(t => !recentCats.includes(t.category));
  const poolToUse = nonRecent.length >= 3 ? nonRecent : available;

  // Student preference boost: if preferredCategories specified, prioritize those
  if (preferredCategories && preferredCategories.length > 0) {
    const preferred = poolToUse.filter(t => preferredCategories.includes(t.category));
    if (preferred.length > 0 && Math.random() > 0.4) {
      // 60% chance to use preferred category
      const pick = preferred[Math.floor(Math.random() * preferred.length)];
      updateTopicTracking(sessionKey, pick);
      return pick.text;
    }
  }

  // Select random topic
  const pick = poolToUse[Math.floor(Math.random() * poolToUse.length)];
  updateTopicTracking(sessionKey, pick);
  return pick.text;
}

function updateTopicTracking(sessionKey: string, topic: TopicEntry) {
  // Blacklist (keep last 10)
  const blacklist = topicBlacklist.get(sessionKey) || new Set();
  blacklist.add(topic.text);
  if (blacklist.size > 10) {
    const first = blacklist.values().next().value;
    if (first) blacklist.delete(first);
  }
  topicBlacklist.set(sessionKey, blacklist);

  // Category tracking (keep last 3)
  const cats = recentTopicsByCategory.get(sessionKey) || [];
  cats.push(topic.category);
  if (cats.length > 3) cats.shift();
  recentTopicsByCategory.set(sessionKey, cats);

  cleanupIfNeeded();
}
