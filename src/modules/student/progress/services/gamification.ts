// ============================================
// Gamification 系統 — XP、成就徽章、排行榜
// ============================================

// ============================================
// XP 計算
// ============================================

/**
 * 每種操作的基礎 XP。
 *
 * 2026-09-28 再平衡（與反刷分修正同批，見 `xp-event-policy.ts`）：
 * - **深度行為一律 ≥ 淺層行為**：`reviewMistake` 20、`masterWord` 25、
 *   `learnWord` 12、`submitWriting` 40、`completeSession` 45，全部高於單題
 *   作答 `answerCorrect` 10。舊表倒置（複習錯題 8 < 答對一題 MC 10），
 *   等於獎勵「隨手刷選擇題」而非深度學習。
 * - `answerIncorrect` 由 2 改為 **0**：舊值令「亂答」也有獎，與學習訊號相反。
 *   仍保留鍵值，未知／舊客戶端送來時不會 400，只是不給 XP。
 * - `completeSession` 由 15 調高至 45：舊值只值 1.5 題選擇題，而作答 XP 是
 *   每題即時發放 → 中途放棄幾乎零損失，「完成整套」形同沒有誘因。
 */
const XP_VALUES = {
  answerCorrect: 10,
  answerIncorrect: 0,
  completeSession: 45,
  completeDiagnostic: 50,
  completeSpelling: 15,
  submitWriting: 40,
  dailyLogin: 5,
  reviewMistake: 20,
  learnWord: 12,
  masterWord: 25,
};

/**
 * 連續天數加成：每「練習日」+5 XP，**上限 7 日**（最高 +35）。
 *
 * 2026-09-28：舊設計為 `streakDays * 5` 且**無上限** → 連續 100 天時單是登入
 * 就 505 XP/日（比整套 20 題練習還多），且登入即令加成上升，形成正回饋。
 * 實測有學生單日 90,657 XP 幾乎全來自可重複事件的刷取。
 */
export const STREAK_BONUS_PER_DAY = 5;
export const STREAK_BONUS_MAX_DAYS = 7;

/** 難度加成倍率 */
const DIFFICULTY_MULTIPLIER: Record<string, number> = {
  remedial: 0.8,
  core: 1.0,
  challenge: 1.5,
};

/**
 * 深度學習事件 — 初中年級加成只適用於這些（複習錯題／生字掌握）。
 * 避免獎勵「刷 MC／登入」的淺層行為。
 */
export const DEEP_LEARNING_EVENTS: ReadonlySet<XpEvent['type']> = new Set(['reviewMistake', 'masterWord']);

export interface XpEvent {
  type: keyof typeof XP_VALUES;
  difficulty?: string;
  streakDays?: number;
  metadata?: Record<string, unknown>;  // sessionId, questionId, wordId, mistakeId, ...
}

/**
 * 客戶端可透過 `POST /api/gamification` 請求的 XP 事件（**伺服器白名單**）。
 *
 * 注意：這是**明示清單**，不是 `keyof XP_VALUES` 的自動推導 ——
 * `completeSpelling` 等「只由伺服器發放」的事件必須留在清單之外，
 * 否則客戶端可繞過業務驗證直接聲請。
 */
export const CLIENT_XP_EVENT_TYPES = [
  'answerCorrect',
  'answerIncorrect',
  'completeSession',
  'completeDiagnostic',
  'submitWriting',
  'dailyLogin',
  'reviewMistake',
  'learnWord',
  'masterWord',
] as const satisfies readonly XpEvent['type'][];

export type ClientXpEventType = (typeof CLIENT_XP_EVENT_TYPES)[number];

export function isClientXpEventType(value: unknown): value is ClientXpEventType {
  return typeof value === 'string' && (CLIENT_XP_EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * 答題事件 — 由伺服器重新解析「正典題目身分 + 內容指紋」才可發放
 * （2026-10-01 稽核：任意字串／重新生成的新 id 永不重複領取）。
 */
export const ANSWER_XP_EVENT_TYPES = ['answerCorrect', 'answerIncorrect'] as const satisfies readonly ClientXpEventType[];

export function isAnswerXpEventType(value: unknown): value is (typeof ANSWER_XP_EVENT_TYPES)[number] {
  return typeof value === 'string' && (ANSWER_XP_EVENT_TYPES as readonly string[]).includes(value);
}

export function calculateXp(event: XpEvent): number {
  const base = XP_VALUES[event.type] ?? 0;
  const multiplier = event.difficulty
    ? (DIFFICULTY_MULTIPLIER[event.difficulty] || 1.0)
    : 1.0;
  const streakBonus = event.type === 'dailyLogin' && event.streakDays
    ? Math.min(Math.max(0, Math.floor(event.streakDays)), STREAK_BONUS_MAX_DAYS) * STREAK_BONUS_PER_DAY
    : 0;
  return Math.round(base * multiplier + streakBonus);
}

// ============================================
// 年級自適應（S1-S3 深度學習加成；刷題/登入不再有年級加成）
// ============================================

export function getGradeMultiplier(gradeLevel?: string, eventType?: XpEvent['type']): number {
  if (!gradeLevel) return 1.0;
  const level = parseInt(gradeLevel.replace('S', ''));
  // 初中：1.2× 只加在深度學習（複習錯題／生字掌握），不獎勵刷題
  if (level <= 3 && eventType && DEEP_LEARNING_EVENTS.has(eventType)) return 1.2;
  return 1.0;
}

// ============================================
// 每日目標（根據年級自適應）— 必須含「深度」要件
// ============================================

/** 每日目標深度要件：今日挑戰、或複習 3 錯題、或掌握 3 生字 */
export const DAILY_GOAL_DEPTH = { mistakesReviewed: 3, wordsMastered: 3 } as const;

export interface DailyGoalProgress {
  questionsDone: number;
  xpToday: number;
  challengeDone: boolean;
  mistakesReviewed: number;
  wordsMasteredToday: number;
}

export interface DailyGoalStatus {
  questionsDone: number;
  questionsTarget: number;
  xpToday: number;
  xpTarget: number;
  questionsMet: boolean;
  depthMet: boolean;
  completed: boolean;
  depth: {
    challengeDone: boolean;
    mistakesReviewed: number;
    mistakesTarget: number;
    wordsMasteredToday: number;
    wordsTarget: number;
  };
}

/**
 * 每日目標完成判定：題數達標 AND 至少一項深度活動。
 * 單靠 5 題 MC 無法達標（50 XP 不再能只靠刷選擇題達成）。
 */
export function evaluateDailyGoal(progress: DailyGoalProgress, gradeLevel?: string): DailyGoalStatus {
  const { questions, xpTarget } = getDailyGoal(gradeLevel);
  const mistakesTarget = DAILY_GOAL_DEPTH.mistakesReviewed;
  const wordsTarget = DAILY_GOAL_DEPTH.wordsMastered;
  const depthMet =
    progress.challengeDone ||
    progress.mistakesReviewed >= mistakesTarget ||
    progress.wordsMasteredToday >= wordsTarget;
  const questionsMet = progress.questionsDone >= questions;
  return {
    questionsDone: progress.questionsDone,
    questionsTarget: questions,
    xpToday: progress.xpToday,
    xpTarget,
    questionsMet,
    depthMet,
    completed: questionsMet && depthMet,
    depth: {
      challengeDone: progress.challengeDone,
      mistakesReviewed: progress.mistakesReviewed,
      mistakesTarget,
      wordsMasteredToday: progress.wordsMasteredToday,
      wordsTarget,
    },
  };
}

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
    { en: 'Mythic', zh: '神話' },
    { en: 'Titan', zh: '泰坦' },
    { en: 'Olympian', zh: '奧林匹斯' },
    { en: 'Immortal', zh: '不朽' },
    { en: 'Transcendent', zh: '超越' },
    { en: 'Celestial', zh: '天界' },
    { en: 'Eternal', zh: '永恆' },
    { en: 'Infinity', zh: '無限' },
    { en: 'Singularity', zh: '奇點' },
    { en: 'Cosmic', zh: '宇宙' },
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
  /** 累計複習錯題數（新徽章 mistake-review-10 用） */
  mistakesReviewed?: number;
  /** 最近 7 天每日挑戰完成次數（新徽章 challenge-week 用） */
  weeklyChallenges?: number;
  /** 學生年級（S1-S6）— 年級化徽章資格（初中不頒 writing-5） */
  gradeLevel?: string;
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
  // 初中友善徽章（S133）：深度行為而非刷題
  {
    id: 'vocab-20',
    name: 'Word Starter',
    nameZh: '生字新手',
    description: 'Mastered 20 vocabulary words',
    descriptionZh: '掌握 20 個生字',
    icon: '🔤',
    category: 'skill',
    condition: (s) => s.wordsMastered >= 20,
  },
  {
    id: 'mistake-review-10',
    name: 'Mistake Fixer',
    nameZh: '錯題修理工',
    description: 'Reviewed 10 mistakes',
    descriptionZh: '複習 10 題錯題',
    icon: '🔧',
    category: 'skill',
    condition: (s) => (s.mistakesReviewed ?? 0) >= 10,
  },
  {
    id: 'challenge-week',
    name: 'Challenge Seeker',
    nameZh: '挑戰達人',
    description: 'Completed 5 daily challenges in a week',
    descriptionZh: '本週完成 5 次每日挑戰',
    icon: '🎯',
    category: 'special',
    condition: (s) => (s.weeklyChallenges ?? 0) >= 5,
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
    condition: (s) => s.sessionsCompleted >= 5, // 需完成 5+ 次練習會話（配合 description 中的 "5+ questions"）
  },
  // Hidden Achievements（隱藏成就 — 解鎖時才顯示）
  {
    id: 'hidden-night-owl',
    name: 'Night Owl',
    nameZh: '夜貓子',
    description: 'Practice after 11 PM',
    descriptionZh: '在晚上 11 點後練習（隱藏成就）',
    icon: '🦉',
    category: 'special',
    condition: () => false, // triggered manually via API
  },
  {
    id: 'hidden-perfect-week',
    name: 'Perfect Week',
    nameZh: '完美一週',
    description: '7-day streak with >80% accuracy',
    descriptionZh: '連續 7 天練習且正確率 >80%（隱藏成就）',
    icon: '👑',
    category: 'special',
    condition: (s) => s.streakDays >= 7 && s.overallAccuracy >= 80,
  },
  {
    id: 'hidden-vocab-100',
    name: 'Dictionary',
    nameZh: '活字典',
    description: 'Master 100 vocabulary words',
    descriptionZh: '掌握 100 個詞彙（隱藏成就）',
    icon: '📚',
    category: 'special',
    condition: (s) => s.wordsMastered >= 100,
  },
];

const JUNIOR_GRADES: ReadonlySet<string> = new Set(['S1', 'S2', 'S3']);

/**
 * 年級化徽章資格：初中（S1-S3）不頒「提交 5 篇寫作」；
 * 高中才強調寫作／綜合（與 DSE 卷別比重一致）。
 */
export function eligibleBadgesFor(stats: BadgeCheckStats): BadgeDefinition[] {
  const junior = !!stats.gradeLevel && JUNIOR_GRADES.has(stats.gradeLevel);
  return BADGE_DEFINITIONS.filter((badge) => !(junior && badge.id === 'writing-5'));
}

/**
 * 檢查並回傳新解鎖的徽章
 */
export function checkNewBadges(
  stats: BadgeCheckStats,
  alreadyUnlocked: string[]
): BadgeDefinition[] {
  return eligibleBadgesFor(stats).filter(
    (badge) => !alreadyUnlocked.includes(badge.id) && badge.condition(stats)
  );
}

/**
 * AI 學習推薦 — 根據 gamification 數據建議今日練習重點
 */
export function getStudyRecommendation(stats: BadgeCheckStats): { focus: string; focusZh: string; reason: string; reasonZh: string } {
  if (stats.streakDays < 3) {
    return { focus: 'Daily Practice', focusZh: '每日練習', reason: 'Build a learning habit first', reasonZh: '先建立每日學習習慣' };
  }
  if (stats.overallAccuracy < 60 && stats.totalQuestions > 20) {
    return { focus: 'Grammar Review', focusZh: '文法重溫', reason: 'Accuracy below 60% — focus on fundamentals', reasonZh: '正確率低於 60%，建議重溫基礎文法' };
  }
  if (stats.wordsMastered < 20) {
    return { focus: 'Vocabulary Building', focusZh: '詞彙積累', reason: 'Expand your word bank for better comprehension', reasonZh: '擴充詞彙庫以提升閱讀理解' };
  }
  if (stats.writingSubmissions < 3) {
    return { focus: 'Writing Practice', focusZh: '寫作練習', reason: 'Practice writing to improve expression', reasonZh: '多練習寫作以提升表達能力' };
  }
  if (stats.totalQuestions > 500 && stats.overallAccuracy > 80) {
    return { focus: 'Challenge Mode', focusZh: '挑戰模式', reason: 'You\'re ready for harder content!', reasonZh: '你已經準備好挑戰更難的內容！' };
  }
  return { focus: 'Balanced Practice', focusZh: '均衡練習', reason: 'Keep up the good work across all skills', reasonZh: '在各技能上保持均衡練習' };
}

/**
 * 取得所有徽章（含解鎖狀態）
 */
export function getAllBadges(
  stats: BadgeCheckStats,
  unlockedIds: string[]
): (BadgeDefinition & { unlocked: boolean })[] {
  return eligibleBadgesFor(stats).map((badge) => ({
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
  /** 初中模式：本週活躍日數（取代總 XP 排名） */
  weeklyActiveDays?: number;
  metric: 'xp' | 'weekly-active-days';
}

export function buildLeaderboard(
  students: {
    id: string;
    classNumber?: string | null;
    nameEn?: string | null;
    xp?: number;
    streakDays?: number;
    overallAccuracy?: number;
  }[],
  options: { metric?: 'xp' | 'weekly-active-days'; weeklyActiveDays?: Map<string, number> } = {},
): LeaderboardEntry[] {
  const metric = options.metric ?? 'xp';
  const weekly = options.weeklyActiveDays;
  return students
    .map((s, i) => {
      const xp = s.xp || 0;
      const levelInfo = getLevelInfo(xp);
      const activeDays = weekly?.get(s.id) ?? 0;
      return {
        rank: 0, // will be set after sort
        displayName: s.classNumber
          ? `Student ${s.classNumber}`
          : s.nameEn || `Student ${i + 1}`,
        xp,
        level: levelInfo.level,
        streakDays: s.streakDays || 0,
        accuracy: s.overallAccuracy || 0,
        weeklyActiveDays: activeDays,
        metric,
      };
    })
    .sort((a, b) => metric === 'weekly-active-days'
      ? (b.weeklyActiveDays ?? 0) - (a.weeklyActiveDays ?? 0)
      : b.xp - a.xp)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));
}
