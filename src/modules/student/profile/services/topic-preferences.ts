// Sprint 8: Topic Preferences — tracks which topics students engage with
import type { TopicPreference } from '../types';

/** Topic category mapping */
const TOPIC_CATEGORIES: Record<string, TopicPreference['category']> = {
  school: 'school', campus: 'school', club: 'school', election: 'school',
  society: 'society', community: 'society', bullying: 'society', cyberbullying: 'society', mental: 'society', health: 'health',
  technology: 'technology', tech: 'technology', ai: 'technology', stem: 'technology', digital: 'technology', online: 'technology',
  environment: 'environment', eco: 'environment', green: 'environment', plastic: 'environment', renewable: 'environment', climate: 'environment', pollution: 'environment',
  culture: 'culture', festival: 'culture', exchange: 'culture', multicultural: 'culture', tradition: 'culture',
  career: 'career', job: 'career', interview: 'career', internship: 'career', university: 'career', employment: 'career',
  'hk': 'hk-local', hong: 'hk-local', local: 'hk-local',
  daily: 'daily-life', food: 'daily-life', shopping: 'daily-life', travel: 'daily-life', hobby: 'daily-life',
  science: 'science', research: 'science', experiment: 'science',
};

function classifyTopic(topic: string): TopicPreference['category'] {
  const lower = topic.toLowerCase();
  for (const [key, cat] of Object.entries(TOPIC_CATEGORIES)) {
    if (lower.includes(key)) return cat;
  }
  return 'daily-life';
}

export interface TopicEngagement {
  topic: string;
  score: number; // 0-100
  engagedAt: Date;
}

/** Analyze topic engagement and return ranked preferences */
export function analyzeTopicPreferences(engagements: TopicEngagement[]): TopicPreference[] {
  const map = new Map<string, { count: number; totalScore: number; lastAt: Date }>();

  for (const e of engagements) {
    const existing = map.get(e.topic);
    if (existing) {
      existing.count++;
      existing.totalScore += e.score;
      if (e.engagedAt > existing.lastAt) existing.lastAt = e.engagedAt;
    } else {
      map.set(e.topic, { count: 1, totalScore: e.score, lastAt: e.engagedAt });
    }
  }

  return [...map.entries()]
    .map(([topic, data]) => ({
      topic,
      category: classifyTopic(topic),
      engagementCount: data.count,
      averageScore: Math.round(data.totalScore / data.count),
      lastEngagedAt: data.lastAt,
    }))
    .sort((a, b) => b.engagementCount - a.engagementCount);
}
