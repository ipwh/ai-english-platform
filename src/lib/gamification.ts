// ============================================
// Gamification 系統 — XP、成就徽章、排行榜
// ============================================

import type { GrammarItem, LanguageSkill } from './types';

// ============================================
// XP 計算
// ============================================

/** 每種操作的基礎 XP */
const XP_VALUES = {
  answerCorrect: 10,
  answerIncorrect: 2,
  completeSession: 15,
  completeDiagnostic: 50,
  submitWriting: 30,
  dailyLogin: 5,
  streakBonus: 5, // per streak day
  reviewMistake: 8,
  learnWord: 5,
  masterWord: 20,
};

/** 難度加成倍率 */
const DIFFICULTY_MULTIPLIER: Record<string, number> = {
  remedial: 0.8,
  core: 1.0,
  challenge: 1.5,
};

export interface XpEvent {
  type: keyof typeof XP_VALUES;
  difficulty?: string;
  streakDays?: number;
}

export function calculateXp(event: XpEvent): number {
  const base = XP_VALUES[event.type] || 0;
  const multiplier = event.difficulty
    ? (DIFFICULTY_MULTIPLIER[event.difficulty] || 1.0)
    : 1.0;
  const streakBonus = event.type === 'dailyLogin' && event.streakDays
    ? event.streakDays * XP_VALUES.streakBonus
    : 0;
  return Math.round(base * multiplier + streakBonus);
}

// ============================================
// 年級自適應（S1-S3 較低門檻，S4-S6 標準門檻）
// ============================================

export function getGradeMultiplier(gradeLevel?: string): number {
  if (!gradeLevel) return 1.0;
  const level = parseInt(gradeLevel.replace('S', ''));
  if (level <= 3) return 1.2; // 初中：較容易升級，鼓勵動機
  return 1.0; // 高中：標準
}

// ============================================
// 每日目標（根據年級自適應）
// ============================================

export function getDailyGoal(gradeLevel?: string): { questions: number; xpTarget: number } {
  const level = gradeLevel ? parseInt(gradeLevel.replace('S', '')) : 4;
  if (level <= 2) return { questions: 10, xpTarget: 50 };
  if (level <= 4) return { questions: 15, xpTarget: 80 };
  return { questions: 20, xpTarget: 120 }; // S5-S6 DSE 衝刺
}

// ============================================
// 等級系統
// ============================================

export interface LevelInfo {
  level: number;
  title: string;
  titleZh: string;
  xpRequired: number;
  xpToNext: number;
}

const LEVEL_THRESHOLDS = [
  0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 4000,
  5000, 6200, 7500, 9000, 11000, 13000, 15500, 18000, 21000, 25000,
];

export function getLevelInfo(totalXp: number): LevelInfo {
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
      break;
    }
  }
  const currentThreshold = LEVEL_THRESHOLDS[level - 1] || 0;
  const nextThreshold = LEVEL_THRESHOLDS[level] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] * 2;
  const titles = [
    { en: 'Beginner', zh: '初學者' },
    { en: 'Learner', zh: '學習者' },
    { en: 'Apprentice', zh: '學徒' },
    { en: 'Explorer', zh: '探索者' },
    { en: 'Scholar', zh: '學者' },
    { en: 'Achiever', zh: '成就者' },
    { en: 'Expert', zh: '專家' },
    { en: 'Master', zh: '大師' },
    { en: 'Grandmaster', zh: '宗師' },
    { en: 'Legend', zh: '傳奇' },
  ];
  const titleIndex = Math.min(level - 1, titles.length - 1);
  const title = titles[titleIndex];

  return {
    level,
    title: title.en,
    titleZh: title.zh,
    xpRequired: currentThreshold,
    xpToNext: nextThreshold - totalXp,
  };
}

// ============================================
// 成就徽章系統
// ============================================

export interface BadgeDefinition {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  icon: string; // emoji
  category: 'streak' | 'accuracy' | 'volume' | 'skill' | 'special';
  condition: (stats: BadgeCheckStats) => boolean;
}

export interface BadgeCheckStats {
  totalQuestions: number;
  overallAccuracy: number;
  streakDays: number;
  sessionsCompleted: number;
  wordsMastered: number;
  writingSubmissions: number;
  diagnosticCompleted: boolean;
  skillAccuracy: Record<string, number>;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // Streak Badges
  {
    id: 'streak-3',
    name: 'Consistent Learner',
    nameZh: '持之以恆',
    description: '3-day learning streak',
    descriptionZh: '連續 3 天學習',
    icon: '🔥',
    category: 'streak',
    condition: (s) => s.streakDays >= 3,
  },
  {
    id: 'streak-7',
    name: 'Weekly Warrior',
    nameZh: '週戰士',
    description: '7-day learning streak',
    descriptionZh: '連續 7 天學習',
    icon: '⚡',
    category: 'streak',
    condition: (s) => s.streakDays >= 7,
  },
  {
    id: 'streak-30',
    name: 'Monthly Master',
    nameZh: '月度大師',
    description: '30-day learning streak',
    descriptionZh: '連續 30 天學習',
    icon: '🌟',
    category: 'streak',
    condition: (s) => s.streakDays >= 30,
  },
  // Accuracy Badges
  {
    id: 'accuracy-80',
    name: 'Sharp Mind',
    nameZh: '敏銳頭腦',
    description: 'Overall accuracy above 80%',
    descriptionZh: '整體正確率達 80% 以上',
    icon: '🎯',
    category: 'accuracy',
    condition: (s) => s.totalQuestions >= 50 && s.overallAccuracy >= 80,
  },
  {
    id: 'accuracy-90',
    name: 'Precision Expert',
    nameZh: '精準專家',
    description: 'Overall accuracy above 90%',
    descriptionZh: '整體正確率達 90% 以上',
    icon: '💎',
    category: 'accuracy',
    condition: (s) => s.totalQuestions >= 100 && s.overallAccuracy >= 90,
  },
  // Volume Badges
  {
    id: 'volume-100',
    name: 'Century',
    nameZh: '百題達人',
    description: 'Answered 100 questions',
    descriptionZh: '完成 100 道練習題',
    icon: '💯',
    category: 'volume',
    condition: (s) => s.totalQuestions >= 100,
  },
  {
    id: 'volume-500',
    name: 'Dedicated',
    nameZh: '專注學習者',
    description: 'Answered 500 questions',
    descriptionZh: '完成 500 道練習題',
    icon: '📚',
    category: 'volume',
    condition: (s) => s.totalQuestions >= 500,
  },
  {
    id: 'volume-1000',
    name: 'Scholar',
    nameZh: '學者',
    description: 'Answered 1000 questions',
    descriptionZh: '完成 1000 道練習題',
    icon: '🏆',
    category: 'volume',
    condition: (s) => s.totalQuestions >= 1000,
  },
  // Skill Badges
  {
    id: 'writing-5',
    name: 'Budding Writer',
    nameZh: '初露鋒芒',
    description: 'Submitted 5 writing pieces',
    descriptionZh: '提交 5 篇寫作',
    icon: '✍️',
    category: 'skill',
    condition: (s) => s.writingSubmissions >= 5,
  },
  {
    id: 'vocab-50',
    name: 'Word Collector',
    nameZh: '詞彙收集家',
    description: 'Mastered 50 vocabulary words',
    descriptionZh: '掌握 50 個詞彙',
    icon: '📖',
    category: 'skill',
    condition: (s) => s.wordsMastered >= 50,
  },
  // Special Badges
  {
    id: 'diagnostic',
    name: 'Self-Aware',
    nameZh: '知己知彼',
    description: 'Completed diagnostic test',
    descriptionZh: '完成診斷測驗',
    icon: '🔍',
    category: 'special',
    condition: (s) => s.diagnosticCompleted,
  },
  {
    id: 'perfect-session',
    name: 'Perfect Score',
    nameZh: '完美得分',
    description: '100% on a session of 5+ questions',
    descriptionZh: '在一個 5 題以上的練習中全部答對',
    icon: '✨',
    category: 'special',
    condition: (s) => s.sessionsCompleted >= 1,
  },
];

/**
 * 檢查並回傳新解鎖的徽章
 */
export function checkNewBadges(
  stats: BadgeCheckStats,
  alreadyUnlocked: string[]
): BadgeDefinition[] {
  return BADGE_DEFINITIONS.filter(
    (badge) => !alreadyUnlocked.includes(badge.id) && badge.condition(stats)
  );
}

/**
 * 取得所有徽章（含解鎖狀態）
 */
export function getAllBadges(
  stats: BadgeCheckStats,
  unlockedIds: string[]
): (BadgeDefinition & { unlocked: boolean })[] {
  return BADGE_DEFINITIONS.map((badge) => ({
    ...badge,
    unlocked: unlockedIds.includes(badge.id) || badge.condition(stats),
  }));
}

// ============================================
// 排行榜計算（班級內匿名）
// ============================================

export interface LeaderboardEntry {
  rank: number;
  displayName: string; // anonymized: "Student 15"
  xp: number;
  level: number;
  streakDays: number;
  accuracy: number;
}

export function buildLeaderboard(
  students: {
    id: string;
    classNumber?: string | null;
    nameEn?: string | null;
    xp?: number;
    streakDays?: number;
    overallAccuracy?: number;
  }[]
): LeaderboardEntry[] {
  return students
    .map((s, i) => {
      const xp = s.xp || 0;
      const levelInfo = getLevelInfo(xp);
      return {
        rank: 0, // will be set after sort
        displayName: s.classNumber
          ? `Student ${s.classNumber}`
          : s.nameEn || `Student ${i + 1}`,
        xp,
        level: levelInfo.level,
        streakDays: s.streakDays || 0,
        accuracy: s.overallAccuracy || 0,
      };
    })
    .sort((a, b) => b.xp - a.xp)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));
}
