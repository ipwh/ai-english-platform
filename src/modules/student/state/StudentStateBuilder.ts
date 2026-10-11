// Sprint 59: StudentStateBuilder — the ONLY component allowed to assemble StudentState
// Architecture: Repository → StudentStateBuilder → StudentState → All Services

import { logger } from '@/shared/logger/logger';
// 2026-08-30 audit (R7): 正典跨卷估級門檻（76/62/48/33）— 移除本地重複實作，避免漂移。
import { estimateLevelFromScore100 } from '@/modules/ai/core/level-estimation';
import type { StudentState, StudentIdentity, StudentMemory,
  StudentMastery, StudentWeakness, StudentVocabulary,
  StudentEngagement, StudentPracticeSummary } from './StudentState';
import type { SkillRank, LearningPersona, MotivationState,
  ConfidenceState, LearningHabit, TwinPredictions, RiskAssessment,
  LearningVelocity, RecoveryMetrics, ForgetCurve } from '../twin/types';

// ============================================
// Internal types
// ============================================

interface ReviewEntry {
  skillDimension?: string; itemType?: string; itemId?: string;
  estimatedMastery: number; isMastered?: boolean;
  evidenceCount?: number; retentionProbability?: number;
}

/** Minimal user shape from Prisma — what loaders actually access */
interface RawUser {
  id: string;
  email?: string | null;
  nameZh?: string | null;
  nameEn?: string | null;
  role?: string | null;
  level?: string | null;
  classId?: string | null;
  class?: { name?: string | null; gradeLevel?: string | null } | null;
  academicYear?: string | null;
  xp?: number | null;
  streakDays?: number | null;
  badgeIds?: string | null;
  overallAccuracy?: number | null;
}

/** Skill data from getLearningProfile().bySkill entries */
interface RawSkillData {
  overallScore?: number;
  totalPractices?: number;
  totalMistakes?: number;
  totalCorrect?: number;
  subSkills?: RawSubSkill[];
}

interface RawSubSkill {
  skill?: string;
  subSkill?: string;
  masteryScore?: number;
  practiceCount?: number;
  mistakeCount?: number;
  correctCount?: number;
  updatedAt?: string | { toISOString?: () => string };
}

/** Vocab profile from buildVocabProfile() */
interface RawVocabProfile {
  known?: unknown[];
  learning?: unknown[];
  weak?: unknown[];
  forgotten?: unknown[];
  mastered?: unknown[];
  needReview?: unknown[];
  total?: number;
  reviewQueue?: unknown[];
  generatedAt: string;
}

/** Learning profile from getLearningProfile() */
interface RawLearningProfile {
  overallMastery: number;
  bySkill: Record<string, RawSkillData>;
  weakestSkills: Array<{ grammarItem?: string; skill?: string }>;
  strongestSkills: Array<{ grammarItem?: string; skill?: string }>;
}

type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
type Trend = 'improving' | 'stable' | 'declining';

/** Retention projection returned by `deriveRetention` (consumed by the state snapshot). */
interface RetentionState {
  overallRate: number;
  perSkill: Record<string, number>;
  averageRetentionDays: number;
  atRiskSkills: string[];
  strongSkills: string[];
  trend: Trend;
  recommendedReviewCadence: number;
}

/** Forget-curve placeholder returned by `deriveForgetCurve` (shape: twin/types `ForgetCurve`). */
interface ForgetCurveState {
  curves: ForgetCurve['curves'];
  composite: ForgetCurve['composite'];
  knowledgeHalfLifeDays: number;
  computedAt: string;
}

interface KnowledgeState {
  currentMastery: Record<string, number>;  predictedMastery: { '7d': Record<string, number>; '30d': Record<string, number>; '90d': Record<string, number> };
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

/**
 * Internal platform level estimate (1-5, NO star labels) using the canonical
 * cross-paper thresholds (76/62/48/33) — 2026-08-30 audit (R7): 統一委派
 * ai/core/level-estimation，移除本地重複實作。
 * Uncalibrated platform estimate — never an official HKEAA grade.
 */
function estimateHkdse(mastery: Record<string, number>): string {
  const vals = Object.values(mastery);
  if (vals.length === 0) return '1';
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  return estimateLevelFromScore100(Math.round(avg * 100));
}

/**
 * CEFR estimate derived from the platform HKDSE-level estimate via
 * HKDSE_CEFR_ALIGNMENT（平台參考對照，非官方對照表；見 curriculum/data）。
 * Level 1-2 → A2, 3-4 → B1, 5 → B2 — 不輸出星級（平台不發星級）。
 * 2026-08-30 audit (R7): 移除「EDB Official」宣稱 — HKEAA/EDB 無公佈官方
 * CEFR 等值表，此對照為教學參考。
 */
function estimateCefr(mastery: Record<string, number>): CefrLevel {
  const hkdse = estimateHkdse(mastery);
  if (hkdse === '5') return 'B2';
  if (hkdse === '4' || hkdse === '3') return 'B1';
  return 'A2';
}

function rankSkills(mastery: Record<string, number>, descending: boolean): SkillRank[] {
  return Object.entries(mastery)
    .sort(([, a], [, b]) => descending ? b - a : a - b)
    .slice(0, 6)
    .map(([skill, score]) => ({
      skill, currentScore: score,
      // 2026-08-30 audit (R6): 平台無校準投影模型 — predictedScore 即目前值，
      // 不再以固定 +0.1 冒充「預測進步」。
      predictedScore: Math.round(score * 100) / 100,
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
// Level calculation — consistent with gamification.ts LEVEL_THRESHOLDS
// ============================================

const LEVEL_THRESHOLDS = [
  0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 4000,
  5000, 6200, 7500, 9000, 11000, 13000, 15500, 18000, 21000, 25000,
];

function getLevelFromXp(totalXp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
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
    const u = await findUserById(studentId) as RawUser | null;
    return {
      id: studentId,
      email: u?.email ?? '',
      nameZh: u?.nameZh ?? null,
      nameEn: u?.nameEn ?? null,
      role: (u?.role ?? 'student') as StudentIdentity['role'],
      level: u?.level ?? null,
      classId: u?.classId ?? null,
      className: u?.class?.name ?? null,
      gradeLevel: u?.class?.gradeLevel ?? null,
      academicYear: u?.academicYear ?? null,
    };
  }

  private async loadMemory(studentId: string): Promise<StudentMemory | null> {
    try {
      const { memoryService } = await import('@/modules/learning/memory/memory-service-simple');
      return await memoryService.get(studentId);
    } catch (err) { logger.error({ module: 'student-state', studentId, error: String(err) }, 'loadMemory failed'); return null; }
  }

  /** CANONICAL mastery source: student-mastery service */
  private async loadMastery(studentId: string): Promise<StudentMastery> {
    try {
      const { getLearningProfile } = await import('../mastery/services/student-mastery-service');
      const profile = await getLearningProfile(studentId) as RawLearningProfile;
      const bySkill: StudentMastery['bySkill'] = {};
      const entries: StudentMastery['entries'] = [];
      for (const [skill, data] of Object.entries(profile.bySkill)) {
        const sd = data as RawSkillData;
        bySkill[skill] = {
          score: sd.overallScore ?? 0,
          practiceCount: sd.totalPractices ?? 0,
          mistakeCount: sd.totalMistakes ?? 0,
          correctCount: sd.totalCorrect ?? 0,
        };
        // Collect raw sub-skill entries for analytics
        for (const sub of (sd.subSkills ?? [])) {
          entries.push({
            skill: sub.skill ?? skill,
            subSkill: sub.subSkill ?? '',
            masteryScore: sub.masteryScore ?? 0,
            practiceCount: sub.practiceCount ?? 0,
            mistakeCount: sub.mistakeCount ?? 0,
            correctCount: sub.correctCount ?? 0,
            updatedAt: typeof sub.updatedAt === 'object' && sub.updatedAt?.toISOString ? sub.updatedAt.toISOString() : (sub.updatedAt as string | undefined),
          });
        }
      }
      return {
        overallScore: profile.overallMastery,
        bySkill,
        entries,
        weakSkills: (profile.weakestSkills ?? []).map(w => w.grammarItem || w.skill || ''),
        strongSkills: (profile.strongestSkills ?? []).map(s => s.grammarItem || s.skill || ''),
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
      // Map WeaknessProfile → StudentWeakness shape (dynamic import loses type info)
       
      const topWeaknesses = (w.topWeaknesses as Array<{ grammarCategory?: string; grammarCategoryZh?: string; name?: string; nameZh?: string; mistakeCount?: number; frequency?: number; mastered?: boolean; trend?: string; recommendation?: string; recommendationZh?: string }>).map((item) => ({
        name: item.grammarCategory ?? item.name ?? '',
        nameZh: item.grammarCategoryZh ?? item.nameZh,
        frequency: item.mistakeCount ?? item.frequency ?? 0,
        accuracy: item.mastered ? 1 : ((item.mistakeCount ?? 0) > 5 ? 0.3 : 0.6),
        trend: (item.trend ?? 'stable') as 'improving' | 'stable' | 'declining',
        recommendation: item.recommendation,
        recommendationZh: item.recommendationZh,
      }));
      return {
        topWeaknesses,
        totalMistakes: (w as { totalMistakes?: number }).totalMistakes ?? 0,
        generatedAt: new Date(w.generatedAt),
      };
    } catch { return null; }
  }

  private async loadVocabulary(studentId: string): Promise<StudentVocabulary | null> {
    try {
      const { buildVocabProfile } = await import('@/modules/vocabulary/intelligence/services/vocabulary-intelligence-service');
      const v = await buildVocabProfile(studentId) as unknown as RawVocabProfile;
      const byStatus: Record<string, number> = {};
      for (const key of ['known','learning','weak','forgotten','mastered','needReview']) {
        byStatus[key] = (v[key as keyof RawVocabProfile] as unknown[] | undefined)?.length ?? 0;
      }
      return { total: v.total ?? 0, byStatus, reviewQueue: v.reviewQueue?.length ?? 0, generatedAt: new Date(v.generatedAt) };
    } catch { return null; }
  }

  private async loadEngagement(studentId: string): Promise<StudentEngagement> {
    try {
      const { findUserByIdSelect } = await import('@/modules/student/repositories/user-repo');
      const u = await findUserByIdSelect(studentId, { xp: true, streakDays: true, badgeIds: true, overallAccuracy: true }) as RawUser | null;
      let badges: string[] = [];
      try { badges = JSON.parse(u?.badgeIds ?? '[]'); } catch { /* */ }
      return {
        xp: u?.xp ?? 0,
        level: getLevelFromXp(u?.xp ?? 0),
        streakDays: u?.streakDays ?? 0,
        badges,
        overallAccuracy: u?.overallAccuracy ?? null,
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
      // 2026-08-30 audit (R6): 平台無校準投影模型 — predictedMastery 一律為目前值
      // （不杜撰 +3%/+10%/+25% 固定增長），僅保留結構供未來模型接入。
      predictedMastery: {
        '7d': { ...r },
        '30d': { ...r },
        '90d': { ...r },
      },
      strongSkills: rankSkills(r, true),
      weakSkills: rankSkills(r, false),
      estimatedHkdseLevel: estimateHkdse(r),
      estimatedCefrLevel: estimateCefr(r),
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
    return { type: type as LearningPersona['type'], typeZh: zh, description: desc, descriptionZh: desc, traits: [], traitsZh: [], recommendedApproach: '', recommendedApproachZh: '' };
  }

  private deriveMotivation(memory: StudentMemory | null, _entries: ReviewEntry[]): MotivationState {
    const m = memory?.motivation;
    const s = memory?.learningSpeed;
    const consistency = s?.consistencyScore ?? 0.5;
    const sessionsPerWeek = s?.sessionsPerWeek ?? 0;
    return {
      overallScore: m?.motivationLevel ?? 0.5, intrinsic: m?.intrinsicMotivation ?? 0.5,
      extrinsic: m?.extrinsicMotivation ?? 0.5,
      trend: (m?.motivationTrend as MotivationState['trend']) ?? 'stable',
      engagementLevel: m?.engagementScore ?? 0.5, consistencyScore: consistency,
      burnoutRisk: m?.burnoutRisk ?? 0,
      dropoutRisk: calcDropoutRisk(sessionsPerWeek, consistency, m?.burnoutRisk ?? 0),
      recentAchievements: m?.recentAchievements ?? [],
      suggestedMotivators: [], suggestedMotivatorsZh: [],
    };
  }

  private deriveConfidence(memory: StudentMemory | null, _mastery: Record<string, number>): ConfidenceState {
    const c = memory?.confidence;
    return {
      overallConfidence: c?.overallConfidence ?? 0.5,
      perSkill: c?.confidenceBySkill ?? {},
      calibrationAccuracy: c?.calibrationAccuracy ?? 0,
      overconfidentIn: [], underconfidentIn: [],
      confidenceTrend: (c?.confidenceTrend as ConfidenceState['confidenceTrend']) ?? 'stable',
      suggestedConfidenceBoosters: [], suggestedConfidenceBoostersZh: [],
    };
  }

  private deriveHabits(memory: StudentMemory | null, _entries: ReviewEntry[]): LearningHabit {
    const h = memory?.learningHabits; const s = memory?.learningSpeed;
    return {
      preferredTime: (h?.preferredTimeOfDay as LearningHabit['preferredTime']) ?? 'evening',
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
    const currentPct = Math.round(avg * 100);
    // 2026-08-30 audit (R6): 平台無校準預測模型 — 不杜撰「預測分數」±10 區間、
    // 固定 +0.1 技能預測或任意「達標天數」。一律回報目前值，confidence=0。
    return {
      predictedHkdseLevel: estimateHkdse(mastery),
      predictedExamScore: currentPct, // 目前平台掌握度 %，非考試預測
      examScoreRange: { low: currentPct, high: currentPct, confidence: 0 },
      predictedCefrLevel: estimateCefr(mastery),
      skillPredictions: Object.entries(mastery).map(([skill, score]) => ({
        skill, currentScore: score,
        predictedScore: score,
        confidence: 0,
        estimatedDaysToMastery: null,
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

  private deriveRetention(entries: ReviewEntry[], _k: KnowledgeState): RetentionState {
    const rate = entries.filter(e => (e.retentionProbability??0) > 0.5).length / Math.max(1, entries.length);
    return {
      overallRate: rate, perSkill: {},
      averageRetentionDays: Math.round(7 / Math.max(0.01, rate)),
      atRiskSkills: [], strongSkills: [],
      trend: 'stable' as Trend,
      recommendedReviewCadence: 7,
    };
  }

  private deriveForgetCurve(_entries: ReviewEntry[]): ForgetCurveState {
    return { curves: {}, composite: [], knowledgeHalfLifeDays: 7, computedAt: new Date().toISOString() };
  }

  private deriveVelocity(entries: ReviewEntry[], _knowledge: KnowledgeState): LearningVelocity {
    const mastered = entries.filter(e => e.isMastered).length;
    const total = Math.max(1, entries.length);
    const rate = mastered / total;
    return {
      weeklyMasteryRate: Math.round(rate * 100) / 100,
      improvementPerSession: Math.round(rate / Math.max(1, total) * 100) / 100,
      // 2026-08-30 audit (R7): 線性外推估算（非校準預測模型）—
      // 已達標 → 0；速率>目標時不得輸出負週數。
      estimatedWeeksToTarget: rate >= 0.8 ? 0 : Math.ceil((0.8 - rate) * 52),
      // 2026-08-30 audit (R6): 平台無全校比較證據 — peerPercentile 不再硬編 50。
      weeklyHistory: [], peerPercentile: null,
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
