// Sprint 11: Achievement Handler — unlocks achievements based on events
import { on } from '../event-bus';
import { emit } from '../event-bus';
import { logger } from '@/shared/logger/logger';

interface Achievement {
  id: string;
  name: string;
  nameZh: string;
  condition: (context: AchievementContext) => boolean;
}

interface AchievementContext {
  studentId: string;
  totalExercises: number;
  totalEssays: number;
  totalVocabulary: number;
  totalCorrect: number;
  streakDays: number;
  highestScore: number;
}

const studentStats = new Map<string, AchievementContext>();
const unlockedAchievements = new Map<string, Set<string>>(); // studentId → achievement IDs

function getContext(studentId: string): AchievementContext {
  if (!studentStats.has(studentId)) {
    studentStats.set(studentId, { studentId, totalExercises: 0, totalEssays: 0, totalVocabulary: 0, totalCorrect: 0, streakDays: 0, highestScore: 0 });
  }
  return studentStats.get(studentId)!;
}

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-exercise', name: 'First Steps', nameZh: '初試啼聲', condition: (c) => c.totalExercises >= 1 },
  { id: 'ten-exercises', name: 'Practice Makes Perfect', nameZh: '熟能生巧', condition: (c) => c.totalExercises >= 10 },
  { id: 'fifty-exercises', name: 'Dedicated Learner', nameZh: '勤奮學者', condition: (c) => c.totalExercises >= 50 },
  { id: 'first-essay', name: 'Budding Writer', nameZh: '嶄露頭角', condition: (c) => c.totalEssays >= 1 },
  { id: 'ten-vocab', name: 'Word Collector', nameZh: '詞彙達人', condition: (c) => c.totalVocabulary >= 10 },
  { id: 'perfect-score', name: 'Flawless', nameZh: '完美無瑕', condition: (c) => c.highestScore >= 100 },
  { id: 'streak-7', name: 'Week Warrior', nameZh: '連續七天', condition: (c) => c.streakDays >= 7 },
];

function checkAchievements(studentId: string): void {
  const ctx = getContext(studentId);
  const unlocked = unlockedAchievements.get(studentId) ?? new Set();

  for (const achievement of ACHIEVEMENTS) {
    if (unlocked.has(achievement.id)) continue;
    if (achievement.condition(ctx)) {
      unlocked.add(achievement.id);
      unlockedAchievements.set(studentId, unlocked);
      emit('achievement:unlocked', {
        studentId,
        achievementId: achievement.id,
        achievementName: achievement.name,
        achievementNameZh: achievement.nameZh,
        unlockedAt: new Date(),
      }).catch(() => {});
      logger.info({ module: 'achievement-handler', studentId, achievement: achievement.id }, 'Achievement unlocked');
    }
  }
}

export function initAchievementHandler(): void {
  on('exercise:completed', (event) => {
    const ctx = getContext(event.payload.studentId);
    ctx.totalExercises++;
    ctx.totalCorrect += event.payload.correctCount;
    if (event.payload.correctCount === event.payload.totalQuestions && event.payload.totalQuestions > 0) {
      ctx.highestScore = Math.max(ctx.highestScore, 100);
    }
    checkAchievements(event.payload.studentId);
  });

  on('essay:submitted', (event) => {
    const ctx = getContext(event.payload.studentId);
    ctx.totalEssays++;
    ctx.highestScore = Math.max(ctx.highestScore, event.payload.overallScore);
    checkAchievements(event.payload.studentId);
  });

  on('vocabulary:learned', (event) => {
    const ctx = getContext(event.payload.studentId);
    ctx.totalVocabulary++;
    checkAchievements(event.payload.studentId);
  });
}

export function getAchievements(studentId: string): Achievement[] {
  const unlocked = unlockedAchievements.get(studentId) ?? new Set();
  return ACHIEVEMENTS.filter(a => unlocked.has(a.id));
}

export function resetAchievementStore(): void {
  studentStats.clear();
  unlockedAchievements.clear();
}
