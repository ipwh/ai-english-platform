// ============================================
// Sprint 114: Student Profile Management
// ============================================

import type { StudentProfile, SkillScore, SkillDomain, DifficultyLevel, PerformanceRecord } from './adaptive-types';
import { ALL_SKILLS, DEFAULT_ADAPTIVE_CONFIG } from './adaptive-types';
import { getPerformanceHistory, getRecentAccuracy, getRecentRecords } from './adaptive-history';

export function createStudentProfile(
  studentId: string,
  currentLevel: DifficultyLevel = 'core',
  targetCEFR?: string,
): StudentProfile {
  return {
    studentId,
    currentLevel,
    targetLevel: currentLevel,
    targetCEFR,
    skills: ALL_SKILLS.map(domain => ({
      domain,
      score: 50,
      correctCount: 0,
      totalAttempts: 0,
      lastUpdated: new Date().toISOString(),
    })),
    recentPerformance: [],
    currentStreak: 0,
    currentLossStreak: 0,
    rollingAccuracy: 0.5,
    totalQuestionsAnswered: 0,
    sessionQuestionsAnswered: 0,
    sessionStartTime: new Date().toISOString(),
    sessionFailures: 0,
    config: { ...DEFAULT_ADAPTIVE_CONFIG },
  };
}

export function updateProfileAfterAnswer(
  profile: StudentProfile,
  domain: SkillDomain,
  correct: boolean,
  score: number,
  difficulty: DifficultyLevel,
  questionType?: string,
  durationMs?: number,
): StudentProfile {
  const record: PerformanceRecord = {
    timestamp: new Date().toISOString(),
    domain,
    correct,
    score,
    difficulty,
    questionType,
    durationMs,
  };

  // Update skills
  const skill = profile.skills.find(s => s.domain === domain);
  if (skill) {
    skill.totalAttempts++;
    if (correct) skill.correctCount++;
    skill.score = skill.totalAttempts > 0
      ? Math.round((skill.correctCount / skill.totalAttempts) * 100)
      : 50;
    skill.lastUpdated = record.timestamp;
  }

  // Update streaks
  profile.currentStreak = correct ? profile.currentStreak + 1 : 0;
  profile.currentLossStreak = correct ? 0 : profile.currentLossStreak + 1;

  // Update session
  profile.totalQuestionsAnswered++;
  profile.sessionQuestionsAnswered++;
  if (!correct) profile.sessionFailures++;

  // Rolling accuracy
  profile.recentPerformance.push(record);
  if (profile.recentPerformance.length > 100) profile.recentPerformance.shift();

  const recent = profile.recentPerformance.slice(-50);
  profile.rollingAccuracy = recent.length > 0
    ? recent.filter(r => r.correct).length / recent.length
    : 0.5;

  return profile;
}

export function getWeakestSkills(profile: StudentProfile, count = 3): SkillDomain[] {
  return [...profile.skills]
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map(s => s.domain);
}

export function getStrongestSkills(profile: StudentProfile, count = 3): SkillDomain[] {
  return [...profile.skills]
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(s => s.domain);
}

export function getSkillScore(profile: StudentProfile, domain: SkillDomain): number {
  return profile.skills.find(s => s.domain === domain)?.score ?? 50;
}

export function isSessionFatigued(profile: StudentProfile): boolean {
  if (profile.sessionQuestionsAnswered > profile.config.maxSessionQuestions) return true;
  if (profile.sessionFailures >= 5 && profile.sessionQuestionsAnswered > 10) return true;
  // Rapid decline: last 5 all wrong
  const last5 = profile.recentPerformance.slice(-5);
  if (last5.length === 5 && last5.every(r => !r.correct)) return true;
  return false;
}
