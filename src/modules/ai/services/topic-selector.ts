// ============================================
// 主題選擇引擎 v2.0 — 多樣化 DSE 主題抽取
// 提取自 ai-service.ts
// ============================================

import {
  LISTENING_TOPICS_V2,
  READING_TOPICS_V2,
} from './dse-topics';
import type { TopicCategory, TopicEntry } from './dse-topics';
import { logger } from '@/shared/logger/logger';

const topicBlacklist: Map<string, Set<string>> = new Map(); // sessionKey → Set<topic text>
const recentTopicsByCategory: Map<string, string[]> = new Map(); // category → [recent topics]
export const MAX_BLACKLIST_SIZE = 50; // Prevent unbounded memory growth
const _MAX_RECENT_CATEGORIES = 10;

/** Periodic cleanup to prevent memory leaks in long-running processes */
function cleanupBlacklistIfNeeded(): void {
  if (topicBlacklist.size > MAX_BLACKLIST_SIZE) {
    // Remove oldest entries (first 20)
    const keys = [...topicBlacklist.keys()].slice(0, 20);
    for (const key of keys) {
      topicBlacklist.delete(key);
      recentTopicsByCategory.delete(key);
    }
    logger.info({ module: 'topic-selector', removedSessions: keys.length }, 'Blacklist cleanup');
  }
}

/**
 * Get a diverse random topic with:
 * - Grade-level filtering (S3→life-oriented, S5-S6→social issues)
 * - Category rotation (avoid consecutive same-category topics)
 * - Blacklist mechanism (avoid repetition within session)
 * - Student topic preference support
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

  // Periodic global cleanup
  cleanupBlacklistIfNeeded();
}
