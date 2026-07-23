// Sprint 59: StudentStateBuilder — the ONLY component allowed to assemble StudentState
// Architecture: Repository → StudentStateBuilder → StudentState → All Services

import { logger } from '@/shared/logger/logger';
import type { StudentState, StudentIdentity, StudentMemory,
  StudentMastery, StudentWeakness, StudentVocabulary,
  StudentEngagement, StudentPracticeSummary } from './StudentState';
import type { SkillRank, LearningPersona, MotivationState,
  ConfidenceState, LearningHabit, TwinPredictions, RiskAssessment,
  LearningVelocity, RecoveryMetrics } from '../twin/types';

// ============================================
// Internal types
// ============================================

interface ReviewEntry {
  skillDimension?: string; itemType?: string; itemId?: string;
  estimatedMastery: number; isMastered?: boolean;
  evidenceCount?: number; retentionProbability?: number;
}

type HkdseLevel = 'U' | '1' | '2' | '3' | '4' | '5' | '5*' | '5**';
type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
type Trend = 'improving' | 'stable' | 'declining';
type Trajectory = 'accelerating' | 'steady' | 'plateauing' | 'declining' | 'decelerating';

interface KnowledgeState {
  currentMastery: Record<string, number>;
  predictedMastery: { '7d': Record<string, number>; '30d': Record<string, number>; '90d': Record<string, number> };
  strongSkills: SkillRank[]; weakSkills: SkillRank[];
  estimatedHkdseLevel: string; estimatedCefrLevel: CefrLevel;
  nodesMastered: number; totalNodes: number;
  learningVelocity: number; retentionRate: number;
}

// ============================================
// Internal helpers (derived computation)
// ============================================

function buildMasteryScores(entries: ReviewEntry[]): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const e of entries) {
    const key = e.skillDimension || e.itemType || 'general';
    scores[key] = Math.max(scores[key] || 0, e.estimatedMastery);
    if (e.itemId) scores[e.itemId] = e.estimatedMastery;
  }
  return scores;
}

function estimateHkdse(mastery: Record<string, number>): string {
  const vals = Object.values(mastery);
  if (vals.length === 0) return 'U';
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  if (avg >= 0.85) return '5**';
  if (avg >= 0.78) return '5*';
  if (avg >= 0.73) return '5';
  if (avg >= 0.63) return '4';
  if (avg >= 0.50) return '3';
  if (avg >= 0.40) return '2';
  return '1';
}

function estimateCefr(mastery: Record<string, number>): CefrLevel {
  const vals = Object.values(mastery);
  if (vals.length === 0) return 'A1';
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  if (avg >= 0.85) return 'C1';
  if (avg >= 0.70) return 'B2';
  if (avg >= 0.50) return 'B1';
  if (avg >= 0.30) return 'A2';
  return 'A1';
}

function rankSkills(mastery: Record<string, number>, descending: boolean): SkillRank[] {
  return Object.entries(mastery)
    .sort(([, a], [, b]) => descending ? b - a : a - b)
    .slice(0, 6)
    .map(([skill, score]) => ({
      skill, currentScore: score,
      predictedScore: Math.round(Math.min(1, score + 0.1) * 100) / 100,
      trend: score > 0.7 ? 'stable' : 'improving' as const,
      confidence: Math.min(1, score + 0.2),
    }));
}

function calcDropoutRisk(sessionsPerWeek: number, consistency: number, burnoutRisk: number): number {
  let risk = 0;
  if (sessionsPerWeek < 1) risk += 0.4;
  else if (sessionsPerWeek < 2) risk += 0.2;
  if (consistency < 0.3) risk += 0.3;
  else if (consistency < 0.5) risk += 0.15;
  risk += burnoutRisk * 0.3;
  return Math.min(1, Math.round(risk * 100) / 100);
}

// ============================================
// StudentStateBuilder
// ============================================

export class StudentStateBuilder {

  /**
   * Build the complete canonical StudentState.
   * This is the ONLY method allowed to assemble student state from repositories.
   */
  async build(studentId: string): Promise<StudentState> {
    const now = new Date().toISOString();
    const [
      identity, memory, mastery, weakness, vocabulary, engagement, practice,
      reviewEntries,
    ] = await Promise.all([
      this.loadIdentity(studentId),
      this.loadMemory(studentId),
      this.loadMastery(studentId),
      this.loadWeakness(studentId),
      this.loadVocabulary(studentId),
      this.loadEngagement(studentId),
      this.loadPracticeSummary(studentId),
      this.loadReviewEntries(studentId),
    ]);

    // Derive computed fields from canonical sources
    const masteryScores = buildMasteryScores(reviewEntries);
    const persona = this.derivePersona(memory, reviewEntries);
    const knowledge = this.deriveKnowledge(masteryScores, reviewEntries);
    const motivation = this.deriveMotivation(memory, reviewEntries);
    const confidence = this.deriveConfidence(memory, masteryScores);
    const habits = this.deriveHabits(memory, reviewEntries);
    const predictions = this.derivePredictions(masteryScores, reviewEntries, knowledge);
    const risks = this.deriveRisks(motivation, knowledge, reviewEntries);
    const retention = this.deriveRetention(reviewEntries, knowledge);
    const forgetCurve = this.deriveForgetCurve(reviewEntries);
    const velocity = this.deriveVelocity(reviewEntries, knowledge);
    const recovery = this.deriveRecovery(reviewEntries);

    return {
      identity, memory, mastery, weakness, vocabulary,
      engagement, practice,
      persona, knowledge, motivation, confidence, habits,
      predictions, risks, retention, forgetCurve, velocity, recovery,
      generatedAt: now,
    };
  }

  // ============================================
  // Loaders — one canonical source per domain
  // ============================================

  private async loadIdentity(studentId: string): Promise<StudentIdentity> {
    const { findUserById } = await import('@/modules/student/repositories/user-repo');
    const u = await findUserById(studentId);
    return {
      id: studentId,
      email: (u as any).email ?? '',
      nameZh: (u as any).nameZh ?? null,
      nameEn: (u as any).nameEn ?? null,
      role: (u as any).role ?? 'student',
      level: (u as any).level ?? null,
      classId: (u as any).classId ?? null,
      className: (u as any).class?.name ?? null,
      gradeLevel: (u as any).class?.gradeLevel ?? null,
      academicYear: (u as any).academicYear ?? null,
    };
  }

  private async loadMemory(studentId: string): Promise<StudentMemory | null> {
    try {
      const { memoryEngine } = await import('@/modules/learning/memory/services/memory-engine');
      return await memoryEngine.get(studentId);
    } catch (err) { logger.error({ module: 'student-state', studentId, error: String(err) }, 'loadMemory failed'); return null; }
  }

  /** CANONICAL mastery source: student-mastery service */
  private async loadMastery(studentId: string): Promise<StudentMastery> {
    try {
      const { getLearningProfile } = await import('../mastery/services/student-mastery-service');
      const profile = await getLearningProfile(studentId);
      const bySkill: StudentMastery['bySkill'] = {};
      const entries: StudentMastery['entries'] = [];
      for (const [skill, data] of Object.entries(profile.bySkill)) {
        bySkill[skill] = {
          score: (data as any).overallScore ?? 0,
          practiceCount: (data as any).totalPractices ?? 0,
          mistakeCount: (data as any).totalMistakes ?? 0,
          correctCount: (data as any).totalCorrect ?? 0,
        };
        // Collect raw sub-skill entries for analytics
        for (const sub of ((data as any).subSkills ?? [])) {
          entries.push({
            skill: sub.skill ?? skill,
            subSkill: sub.subSkill ?? '',
            masteryScore: sub.masteryScore ?? 0,
            practiceCount: sub.practiceCount ?? 0,
            mistakeCount: sub.mistakeCount ?? 0,
            correctCount: sub.correctCount ?? 0,
            updatedAt: sub.updatedAt?.toISOString?.() ?? sub.updatedAt,
          });
        }
      }
      return {
        overallScore: profile.overallMastery,
        bySkill,
        entries,
        weakSkills: (profile.weakestSkills as any[]).map(w => w.grammarItem || w.skill || ''),
        strongSkills: (profile.strongestSkills as any[]).map(s => s.grammarItem || s.skill || ''),
        estimatedHkdseLevel: '',
        estimatedCefrLevel: '',
      };
    } catch (err) { logger.error({ module: 'student-state', studentId, error: String(err) }, 'loadMastery failed');
      return { overallScore: 0, bySkill: {}, entries: [], weakSkills: [], strongSkills: [], estimatedHkdseLevel: '', estimatedCefrLevel: '' };
    }
  }

  private async loadWeakness(studentId: string): Promise<StudentWeakness | null> {
    try {
      const { buildWeaknessProfile } = await import('@/modules/mistake/intelligence/services/mistake-intelligence-service');
      const w = await buildWeaknessProfile(studentId, 10, true);
      return { topWeaknesses: w.topWeaknesses as any[], totalMistakes: (w as any).totalMistakes ?? 0, generatedAt: w.generatedAt };
    } catch { return null; }
  }

  private async loadVocabulary(studentId: string): Promise<StudentVocabulary | null> {
    try {
      const { buildVocabProfile } = await import('@/modules/vocabulary/intelligence/services/vocabulary-intelligence-service');
      const v = await buildVocabProfile(studentId);
      const byStatus: Record<string, number> = {};
      for (const key of ['known','learning','weak','forgotten','mastered','needReview']) {
        byStatus[key] = ((v as any)[key]?.length ?? 0) as number;
      }
      return { total: (v as any).total ?? 0, byStatus, reviewQueue: (v as any).reviewQueue?.length ?? 0, generatedAt: v.generatedAt };
    } catch { return null; }
  }

  private async loadEngagement(studentId: string): Promise<StudentEngagement> {
    try {
      const { findUserByIdSelect } = await import('@/modules/student/repositories/user-repo');
      const u = await findUserByIdSelect(studentId, { xp: true, streakDays: true, badgeIds: true, overallAccuracy: true });
      let badges: string[] = [];
      try { badges = JSON.parse((u as any).badgeIds ?? '[]'); } catch { /* */ }
      return {
        xp: (u as any).xp ?? 0,
        level: Math.floor(((u as any).xp ?? 0) / 500) + 1,
        streakDays: (u as any).streakDays ?? 0,
        badges,
        overallAccuracy: (u as any).overallAccuracy ?? null,
      };
    } catch { return { xp: 0, level: 1, streakDays: 0, badges: [], overallAccuracy: null }; }
  }

  private async loadPracticeSummary(studentId: string): Promise<StudentPracticeSummary> {
    try {
      const { countPracticeSessions } = await import('@/modules/exercise/repositories/practice-repo');
      const total = await countPracticeSessions(studentId);
      return { totalSessions: total ?? 0, totalQuestions: 0, totalCorrect: 0, recentSessions: 0 };
    } catch { return { totalSessions: 0, totalQuestions: 0, totalCorrect: 0, recentSessions: 0 }; }
  }

  private async loadReviewEntries(studentId: string): Promise<ReviewEntry[]> {
    try {
      const { learningScienceRepo } = await import('@/modules/learning/memory/repositories/learning-science-repository');
      return await learningScienceRepo.getByStudentId(studentId);
    } catch { return []; }
  }

  // ============================================
  // Derivers — compute from canonical sources only
  // ============================================

  private deriveKnowledge(mastery: Record<string, number>, entries: ReviewEntry[]): KnowledgeState {
    const skills = ['grammar', 'vocabulary', 'reading', 'writing', 'listening', 'speaking'];
    const r: Record<string, number> = {};
    for (const s of skills) r[s] = mastery[s] ?? 0;
    const mastered = entries.filter(e => e.isMastered).length;
    return {
      currentMastery: r,
      predictedMastery: {
        '7d': Object.fromEntries(skills.map(s => [s, Math.min(1, (r[s]||0) + 0.03)])),
        '30d': Object.fromEntries(skills.map(s => [s, Math.min(1, (r[s]||0) + 0.10)])),
        '90d': Object.fromEntries(skills.map(s => [s, Math.min(1, (r[s]||0) + 0.25)])),
      },
      strongSkills: rankSkills(r, true),
      weakSkills: rankSkills(r, false),
      estimatedHkdseLevel: estimateHkdse(r),
      estimatedCefrLevel: estimateCefr(r) as any,
      nodesMastered: mastered, totalNodes: entries.length,
      learningVelocity: entries.length > 0 ? Math.round(mastered / entries.length * 1000) / 10 : 0,
      retentionRate: entries.filter(e => (e.retentionProbability ?? 0) > 0.5).length / Math.max(1, entries.length),
    };
  }

  private derivePersona(_memory: StudentMemory | null, entries: ReviewEntry[]): LearningPersona {
    const mastered = entries.filter(e => e.isMastered).length;
    const total = Math.max(1, entries.length);
    const rate = mastered / total;
    let type: string;
    if (rate > 0.8) type = 'balanced-achiever';
    else if (rate > 0.6) type = 'fast-learner';
    else if (rate > 0.4) type = 'steady-grinder';
    else if (rate > 0.2) type = 'struggling-but-persistent';
    else type = 'curious-explorer';
    const labels: Record<string, [string,string]> = {
      'balanced-achiever': ['均衡成就者', '持續穩定努力，逐步進步'],
      'fast-learner': ['快速學習者', '快速掌握，積極性高'],
      'steady-grinder': ['穩定耕耘者', '持續穩定努力，逐步進步'],
      'struggling-but-persistent': ['努力不懈者', '面對困難但堅持不懈'],
      'curious-explorer': ['好奇探索者', '興趣廣泛，探索式學習'],
    };
    const [zh, desc] = labels[type] ?? ['',''];
    return { type: type as any, typeZh: zh, description: desc, descriptionZh: desc, traits: [], traitsZh: [], recommendedApproach: '', recommendedApproachZh: '' };
  }

  private deriveMotivation(memory: StudentMemory | null, _entries: ReviewEntry[]): MotivationState {
    const m = memory?.motivation;
    const s = memory?.learningSpeed;
    const consistency = s?.consistencyScore ?? 0.5;
    const sessionsPerWeek = s?.sessionsPerWeek ?? 0;
    return {
      overallScore: m?.motivationLevel ?? 0.5, intrinsic: m?.intrinsicMotivation ?? 0.5,
      extrinsic: m?.extrinsicMotivation ?? 0.5,
      trend: (m?.motivationTrend as any) ?? 'stable',
      engagementLevel: m?.engagementScore ?? 0.5, consistencyScore: consistency,
      burnoutRisk: m?.burnoutRisk ?? 0,
      dropoutRisk: calcDropoutRisk(sessionsPerWeek, consistency, m?.burnoutRisk ?? 0),
      recentAchievements: m?.recentAchievements ?? [],
      suggestedMotivators: [], suggestedMotivatorsZh: [],
    };
  }

  private deriveConfidence(memory: StudentMemory | null, mastery: Record<string, number>): ConfidenceState {
    const c = memory?.confidence;
    return {
      overallConfidence: c?.overallConfidence ?? 0.5,
      perSkill: c?.confidenceBySkill ?? {},
      calibrationAccuracy: c?.calibrationAccuracy ?? 0,
      overconfidentIn: [], underconfidentIn: [],
      confidenceTrend: (c?.confidenceTrend as any) ?? 'stable',
      suggestedConfidenceBoosters: [], suggestedConfidenceBoostersZh: [],
    };
  }

  private deriveHabits(memory: StudentMemory | null, _entries: ReviewEntry[]): LearningHabit {
    const h = memory?.learningHabits; const s = memory?.learningSpeed;
    return {
      preferredTime: (h?.preferredTimeOfDay as any) ?? 'evening',
      sessionsPerWeek: s?.sessionsPerWeek ?? 2,
      avgSessionMinutes: s?.averageSessionDuration ?? 20,
      completionRate: s?.completionRate ?? 0.5,
      consistencyScore: s?.consistencyScore ?? 0.5,
      procrastinationIndex: h?.procrastinationIndex ?? 0.5,
      focusLevel: h?.focusLevel ?? 0.5,
      fatigueEstimation: (s?.sessionsPerWeek ?? 0) > 5 ? 0.7 : 0.3,
      optimalSessionLength: 20,
      distractionPatterns: h?.distractionPatterns ?? [],
      improvementSuggestions: [], improvementSuggestionsZh: [],
    };
  }

  private derivePredictions(mastery: Record<string, number>, _e: ReviewEntry[], knowledge: KnowledgeState): TwinPredictions {
    const vals = Object.values(mastery);
    const avg = vals.length > 0 ? vals.reduce((s,v)=>s+v,0)/vals.length : 0;
    return {
      predictedHkdseLevel: estimateHkdse(mastery),
      predictedExamScore: Math.round(avg * 100),
      examScoreRange: { low: Math.round(avg*100)-10, high: Math.round(avg*100)+10, confidence: 0.7 },
      predictedCefrLevel: estimateCefr(mastery) as any,
      skillPredictions: Object.entries(mastery).map(([skill, score]) => ({
        skill, currentScore: score,
        predictedScore: Math.min(1, score+0.1),
        confidence: 0.7,
        estimatedDaysToMastery: score >= 0.8 ? null : Math.round((0.8-score)*100),
      })),
      trajectory: knowledge.learningVelocity > 0.5 ? 'accelerating' : 'steady',
      recommendedWeeklyMinutes: 120,
    };
  }

  private deriveRisks(motivation: MotivationState, knowledge: KnowledgeState, _e: ReviewEntry[]): RiskAssessment {
    const vals = Object.values(knowledge.currentMastery);
    const avg = vals.length > 0 ? vals.reduce((s,v)=>s+v,0)/vals.length : 0;
    const isLow = avg < 0.3;
    return {
      overallRisk: motivation.dropoutRisk > 0.5 ? 'high' : motivation.dropoutRisk > 0.3 ? 'moderate' : 'low',
      dropoutRisk: motivation.dropoutRisk, burnoutRisk: motivation.burnoutRisk,
      plateauRisk: isLow ? 0.6 : 0.3,
      regressionRisk: motivation.consistencyScore < 0.3 ? 0.5 : 0.2,
      examReadiness: avg,
      riskFactors: [], riskFactorsZh: [],
      mitigationStrategies: [], mitigationStrategiesZh: [],
      requiresIntervention: motivation.dropoutRisk > 0.4,
      interventionSuggestions: [], interventionSuggestionsZh: [],
    };
  }

  private deriveRetention(entries: ReviewEntry[], _k: KnowledgeState): any {
    const rate = entries.filter(e => (e.retentionProbability??0) > 0.5).length / Math.max(1, entries.length);
    return {
      overallRate: rate, perSkill: {},
      averageRetentionDays: Math.round(7 / Math.max(0.01, rate)),
      atRiskSkills: [], strongSkills: [],
      trend: 'stable' as Trend,
      recommendedReviewCadence: 7,
    };
  }

  private deriveForgetCurve(entries: ReviewEntry[]): any {
    const mastered = entries.filter(e => e.isMastered).length;
    const total = Math.max(1, entries.length);
    return { curves: {}, composite: [], knowledgeHalfLifeDays: 7, computedAt: new Date().toISOString() };
  }

  private deriveVelocity(entries: ReviewEntry[], knowledge: KnowledgeState): LearningVelocity {
    const mastered = entries.filter(e => e.isMastered).length;
    const total = Math.max(1, entries.length);
    const rate = mastered / total;
    return {
      weeklyMasteryRate: Math.round(rate * 100) / 100,
      improvementPerSession: Math.round(rate / Math.max(1, total) * 100) / 100,
      estimatedWeeksToTarget: Math.ceil((0.8 - rate) * 52),
      weeklyHistory: [], peerPercentile: 50,
      trend: rate > 0.5 ? 'accelerating' : 'steady',
    };
  }

  private deriveRecovery(entries: ReviewEntry[]): RecoveryMetrics {
    const mastered = entries.filter(e => e.isMastered);
    const rate = entries.length > 0 ? mastered.length / entries.length : 0;
    const compliance = entries.length > 0 ? entries.filter(e => (e.evidenceCount??0) >= 2).length / entries.length : 0.5;
    return {
      avgRecoveryDays: rate > 0 ? Math.round(7/rate) : 14,
      recoveryRate: Math.round(rate*100)/100,
      reviewCompliance: Math.round(compliance*100)/100,
      daysSinceLastReview: 1, overdueReviewCount: entries.filter(e => !e.isMastered).length,
      reviewStreak: compliance > 0.7 ? 3 : 0,
      onTrack: compliance > 0.6,
    };
  }
}

export const studentStateBuilder = new StudentStateBuilder();
