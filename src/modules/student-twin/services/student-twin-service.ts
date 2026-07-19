// Sprint 37: StudentTwinService — builds the complete digital twin
// Uses lazy imports for modules that require DB (Prisma)
import type {
  StudentTwin, LearningPersona, PersonaType,
  KnowledgeState, MotivationState, ConfidenceState, LearningHabit,
  TwinPredictions, RiskAssessment, DashboardData, SkillRank,
} from '../types';

// ============================================
// Internal types (replace :any annotations)
// ============================================

interface MemoryData {
  learningSpeed?: {
    consistencyScore?: number; sessionsPerWeek?: number;
    averageSessionDuration?: number; completionRate?: number;
  };
  motivation?: {
    motivationLevel?: number; intrinsicMotivation?: number;
    extrinsicMotivation?: number; motivationTrend?: string;
    engagementScore?: number; burnoutRisk?: number;
    recentAchievements?: string[];
  };
  confidence?: {
    overallConfidence?: number; confidenceBySkill?: Record<string, number>;
    calibrationAccuracy?: number; confidenceTrend?: string;
  };
  learningHabits?: {
    procrastinationIndex?: number; preferredTimeOfDay?: string;
    avgSessionLength?: number; distractionTendency?: number;
    preferredStudyTime?: string; focusLevel?: number;
    distractionPatterns?: string[];
  };
}

interface ReviewEntry {
  skillDimension?: string; itemType?: string; itemId?: string;
  estimatedMastery: number; isMastered?: boolean;
  evidenceCount?: number; retentionProbability?: number;
}

// ============================================
// StudentTwinService
// ============================================

export class StudentTwinService {

  /** Build the complete digital twin for a student */
  async buildTwin(studentId: string): Promise<StudentTwin> {
    const now = new Date().toISOString();
    const [memory, reviewEntries] = await Promise.all([
      this.loadMemory(studentId),
      this.loadReviewEntries(studentId),
    ]);

    const masteryScores = this.buildMasteryScores(reviewEntries);
    const persona = this.buildPersona(memory, reviewEntries);
    const knowledge = this.buildKnowledge(masteryScores, reviewEntries);
    const motivation = this.buildMotivation(memory, reviewEntries);
    const confidence = this.buildConfidence(memory, masteryScores);
    const habits = this.buildHabits(memory, reviewEntries);
    const predictions = this.buildPredictions(masteryScores, reviewEntries, knowledge);
    const risks = this.buildRisks(motivation, knowledge, reviewEntries);
    const dashboard = this.buildDashboard(persona, knowledge, motivation, confidence, habits, predictions, risks);

    return {
      studentId, generatedAt: now,
      persona, knowledge, motivation, confidence, habits,
      predictions, risks, dashboard,
    };
  }

  /** Get just the knowledge state */
  async getKnowledgeState(studentId: string): Promise<KnowledgeState> {
    const entries = await this.loadReviewEntries(studentId);
    return this.buildKnowledge(this.buildMasteryScores(entries), entries);
  }

  /** Get predictions */
  async getPredictions(studentId: string): Promise<TwinPredictions> {
    const entries = await this.loadReviewEntries(studentId);
    const mastery = this.buildMasteryScores(entries);
    const knowledge = this.buildKnowledge(mastery, entries);
    return this.buildPredictions(mastery, entries, knowledge);
  }

  /** Get risk assessment */
  async getRiskAssessment(studentId: string): Promise<RiskAssessment> {
    const memory = await this.loadMemory(studentId);
    const entries = await this.loadReviewEntries(studentId);
    const mastery = this.buildMasteryScores(entries);
    const knowledge = this.buildKnowledge(mastery, entries);
    const motivation = this.buildMotivation(memory, entries);
    return this.buildRisks(motivation, knowledge, entries);
  }

  // ============================================
  // Lazy loaders (avoid top-level Prisma imports)
  // ============================================

  private async loadMemory(studentId: string): Promise<MemoryData | null> {
    try {
      const { memoryEngine } = await import('@/modules/learning-memory/services/memory-engine');
      return await memoryEngine.get(studentId);
    } catch { return null; }
  }

  private async loadReviewEntries(studentId: string): Promise<ReviewEntry[]> {
    try {
      const { learningScienceRepo } = await import('@/modules/learning-science/repositories/learning-science-repository');
      return await learningScienceRepo.getByStudentId(studentId);
    } catch { return []; }
  }

  // ============================================
  // Builders
  // ============================================

  private buildMasteryScores(entries: ReviewEntry[]): Record<string, number> {
    const scores: Record<string, number> = {};
    for (const e of entries) {
      const key = e.skillDimension || e.itemType || 'general';
      scores[key] = Math.max(scores[key] || 0, e.estimatedMastery);
      if (e.itemId) scores[e.itemId] = e.estimatedMastery;
    }
    return scores;
  }

  private buildPersona(memory: MemoryData | null, entries: ReviewEntry[]): LearningPersona {
    const mastered = entries.filter(e => e.isMastered).length;
    const total = Math.max(1, entries.length);
    const masteryRate = mastered / total;
    const consistency = memory?.learningSpeed?.consistencyScore ?? 0.5;
    const motivation = memory?.motivation?.motivationLevel ?? 0.5;
    const burnoutRisk = memory?.motivation?.burnoutRisk ?? 0;

    let type: PersonaType;
    if (burnoutRisk > 0.5) type = 'anxious-perfectionist';
    else if (masteryRate > 0.8 && consistency > 0.7) type = 'balanced-achiever';
    else if (masteryRate > 0.6 && consistency < 0.4) type = 'high-potential-unfocused';
    else if (masteryRate < 0.4 && consistency > 0.6) type = 'struggling-but-persistent';
    else if (consistency < 0.2 && entries.length < 10) type = 'exam-crammer';
    else if (motivation > 0.7 && masteryRate > 0.5) type = 'fast-learner';
    else if (consistency > 0.5) type = 'steady-grinder';
    else type = 'curious-explorer';

    const personas: Record<PersonaType, { zh: string; desc: string; descZh: string; traits: string[]; traitsZh: string[]; approach: string; approachZh: string; }> = {
      'steady-grinder': { zh: '穩定耕耘者', desc: 'Consistent effort with gradual improvement', descZh: '持續穩定努力，逐步進步', traits: ['Consistent', 'Disciplined', 'Methodical'], traitsZh: ['穩定', '自律', '有條理'], approach: 'Maintain routine with incremental challenges', approachZh: '保持規律，逐步增加挑戰' },
      'fast-learner': { zh: '快速學習者', desc: 'Quick mastery with high motivation', descZh: '快速掌握，積極性高', traits: ['Quick', 'Motivated', 'Adaptable'], traitsZh: ['快速', '積極', '適應力強'], approach: 'Provide advanced content and stretch goals', approachZh: '提供進階內容和延伸目標' },
      'struggling-but-persistent': { zh: '努力不懈者', desc: 'Faces challenges but keeps trying', descZh: '面對困難但堅持不懈', traits: ['Persistent', 'Resilient', 'Hardworking'], traitsZh: ['堅持', '堅韌', '勤奮'], approach: 'Focus on fundamentals with high encouragement', approachZh: '著重基礎，多加鼓勵' },
      'high-potential-unfocused': { zh: '高潛力未專注', desc: 'Strong ability but inconsistent effort', descZh: '能力強但不夠穩定', traits: ['Able', 'Inconsistent', 'Needs Structure'], traitsZh: ['有能力', '不穩定', '需要結構'], approach: 'Add structure and short-term goals', approachZh: '增加結構化和短期目標' },
      'exam-crammer': { zh: '考前衝刺型', desc: 'Low regular activity, peaks before exams', descZh: '平時較少練習，考前集中衝刺', traits: ['Reactive', 'Deadline-driven', 'Capable'], traitsZh: ['被動', '期限驅動', '有能力'], approach: 'Encourage regular micro-sessions', approachZh: '鼓勵規律微型練習' },
      'balanced-achiever': { zh: '均衡成就者', desc: 'Well-rounded with strong results', descZh: '全面發展，成績優異', traits: ['Balanced', 'Achieving', 'Independent'], traitsZh: ['均衡', '優秀', '獨立'], approach: 'Provide enrichment and leadership opportunities', approachZh: '提供增潤和領導機會' },
      'curious-explorer': { zh: '好奇探索者', desc: 'Diverse interests, exploratory learning', descZh: '興趣廣泛，探索式學習', traits: ['Curious', 'Diverse', 'Exploratory'], traitsZh: ['好奇', '多元', '探索型'], approach: 'Connect topics to real-world applications', approachZh: '將主題與現實應用連結' },
      'anxious-perfectionist': { zh: '焦慮完美主義者', desc: 'High standards but prone to burnout', descZh: '標準高但容易倦怠', traits: ['Diligent', 'Anxious', 'Perfectionist'], traitsZh: ['勤奮', '焦慮', '完美主義'], approach: 'Celebrate progress, reduce pressure', approachZh: '讚賞進步，減輕壓力' },
    };

    const p = personas[type];
    return { type, typeZh: p.zh, description: p.desc, descriptionZh: p.descZh, traits: p.traits, traitsZh: p.traitsZh, recommendedApproach: p.approach, recommendedApproachZh: p.approachZh };
  }

  private buildKnowledge(mastery: Record<string, number>, entries: ReviewEntry[]): KnowledgeState {
    const skills = ['grammar', 'vocabulary', 'reading', 'writing', 'listening', 'speaking'];
    const skillScores: Record<string, { sum: number; count: number; predicted: number }> = {};

    for (const s of skills) {
      skillScores[s] = { sum: 0, count: 0, predicted: 0 };
    }

    for (const e of entries) {
      const sk = e.skillDimension || 'grammar';
      if (skillScores[sk]) {
        skillScores[sk].sum += e.estimatedMastery;
        skillScores[sk].count++;
        skillScores[sk].predicted += Math.min(1, e.estimatedMastery + 0.1 * ((e.evidenceCount ?? 0) > 3 ? 1 : 0.5));
      }
    }

    const currentMastery: Record<string, number> = {};
    const predicted7d: Record<string, number> = {};
    const predicted30d: Record<string, number> = {};
    const predicted90d: Record<string, number> = {};

    for (const s of skills) {
      const avg = skillScores[s].count > 0 ? skillScores[s].sum / skillScores[s].count : 0;
      currentMastery[s] = Math.round(avg * 100) / 100;
      predicted7d[s] = Math.round(Math.min(1, avg + 0.03) * 100) / 100;
      predicted30d[s] = Math.round(Math.min(1, avg + 0.10) * 100) / 100;
      predicted90d[s] = Math.round(Math.min(1, avg + 0.25) * 100) / 100;
    }

    const strongSkills = this.rankSkills(currentMastery, true);
    const weakSkills = this.rankSkills(currentMastery, false);
    const mastered = entries.filter(e => e.isMastered).length;
    const velocity = entries.length > 0 ? mastered / Math.max(1, entries.length) * 100 : 0;

    return {
      currentMastery,
      predictedMastery: { '7d': predicted7d, '30d': predicted30d, '90d': predicted90d },
      strongSkills, weakSkills,
      estimatedHkdseLevel: this.estimateHkdse(currentMastery),
      estimatedCefrLevel: this.estimateCefr(currentMastery),
      nodesMastered: mastered,
      totalNodes: entries.length,
      learningVelocity: Math.round(velocity * 10) / 10,
      retentionRate: entries.filter(e => (e.retentionProbability ?? 0) > 0.5).length / Math.max(1, entries.length),
    };
  }

  private rankSkills(mastery: Record<string, number>, descending: boolean): SkillRank[] {
    return Object.entries(mastery)
      .sort(([, a], [, b]) => descending ? b - a : a - b)
      .slice(0, 6)
      .map(([skill, score]) => ({
        skill, currentScore: score,
        predictedScore: Math.round(Math.min(1, score + 0.1) * 100) / 100,
        trend: score > 0.7 ? 'stable' : score > 0.4 ? 'improving' : 'improving' as const,
        confidence: Math.min(1, score + 0.2),
      }));
  }

  private buildMotivation(memory: MemoryData | null, _entries: ReviewEntry[]): MotivationState {
    const m = memory?.motivation;
    const consistency = memory?.learningSpeed?.consistencyScore ?? 0.5;
    const recentSessions = memory?.learningSpeed?.sessionsPerWeek ?? 0;

    const dropoutRisk = this.calcDropoutRisk(recentSessions, consistency, m?.burnoutRisk ?? 0);
    const burnoutRisk = m?.burnoutRisk ?? 0;

    return {
      overallScore: m?.motivationLevel ?? 0.5,
      intrinsic: m?.intrinsicMotivation ?? 0.5,
      extrinsic: m?.extrinsicMotivation ?? 0.5,
      trend: (m?.motivationTrend as MotivationState['trend']) ?? 'stable',
      engagementLevel: m?.engagementScore ?? 0.5,
      consistencyScore: consistency,
      burnoutRisk,
      dropoutRisk,
      recentAchievements: m?.recentAchievements ?? [],
      suggestedMotivators: this.suggestMotivators(dropoutRisk, burnoutRisk, 'en'),
      suggestedMotivatorsZh: this.suggestMotivators(dropoutRisk, burnoutRisk, 'zh'),
    };
  }

  private buildConfidence(memory: MemoryData | null, mastery: Record<string, number>): ConfidenceState {
    const c = memory?.confidence;
    const perSkill: Record<string, number> = {};
    const overconfidentIn: string[] = [];
    const underconfidentIn: string[] = [];

    for (const [skill, score] of Object.entries(mastery)) {
      const conf = c?.confidenceBySkill?.[skill] ?? 0.5;
      perSkill[skill] = conf;
      if (conf > score + 0.2) overconfidentIn.push(skill);
      if (conf < score - 0.2) underconfidentIn.push(skill);
    }

    return {
      overallConfidence: c?.overallConfidence ?? 0.5,
      perSkill,
      calibrationAccuracy: c?.calibrationAccuracy ?? 0,
      overconfidentIn, underconfidentIn,
      confidenceTrend: (c?.confidenceTrend as ConfidenceState['confidenceTrend']) ?? 'stable',
      suggestedConfidenceBoosters: underconfidentIn.length > 0
        ? ['Focus on your strengths — you know more than you think!', 'Review past successes to build confidence']
        : ['Continue challenging yourself', 'Your self-assessment is accurate'],
      suggestedConfidenceBoostersZh: underconfidentIn.length > 0
        ? ['專注你的強項——你比想像中懂得更多！', '回顧過去成功經驗以建立信心']
        : ['繼續挑戰自己', '你的自我評估很準確'],
    };
  }

  private buildHabits(memory: MemoryData | null, _entries: ReviewEntry[]): LearningHabit {
    const h = memory?.learningHabits;
    const s = memory?.learningSpeed;
    const procrastination = h?.procrastinationIndex ?? 0.5;
    const consistency = s?.consistencyScore ?? 0.5;
    const sessionsPerWeek = s?.sessionsPerWeek ?? 2;

    // Fatigue: higher if many sessions but low consistency (cramming pattern)
    const fatigue = sessionsPerWeek > 5 ? 0.7 : sessionsPerWeek > 3 ? 0.4 : 0.2;

    const suggestions: string[] = [];
    const suggestionsZh: string[] = [];
    if (procrastination > 0.6) {
      suggestions.push('Break study into 15-minute micro-sessions');
      suggestionsZh.push('將學習分為 15 分鐘微型時段');
    }
    if (consistency < 0.4) {
      suggestions.push('Set a fixed daily study time to build routine');
      suggestionsZh.push('設定固定每日學習時間以建立習慣');
    }
    if (fatigue > 0.5) {
      suggestions.push('Take regular breaks — try the Pomodoro technique');
      suggestionsZh.push('定時休息——嘗試番茄工作法');
    }

    return {
      preferredTime: (h?.preferredStudyTime as LearningHabit['preferredTime']) ?? 'afternoon',
      sessionsPerWeek,
      avgSessionMinutes: s?.averageSessionDuration ?? 15,
      completionRate: s?.completionRate ?? 0,
      consistencyScore: consistency,
      procrastinationIndex: procrastination,
      focusLevel: h?.focusLevel ?? 0.5,
      fatigueEstimation: Math.round(fatigue * 100) / 100,
      optimalSessionLength: fatigue > 0.5 ? 15 : 25,
      distractionPatterns: h?.distractionPatterns ?? [],
      improvementSuggestions: suggestions.length > 0 ? suggestions : ['Your study habits are on track!'],
      improvementSuggestionsZh: suggestionsZh.length > 0 ? suggestionsZh : ['你的學習習慣良好！'],
    };
  }

  private buildPredictions(
    mastery: Record<string, number>,
    entries: ReviewEntry[],
    knowledge: KnowledgeState,
  ): TwinPredictions {
    const avgMastery = Object.values(mastery).reduce((s, v) => s + v, 0) / Math.max(1, Object.values(mastery).length);
    const velocity = knowledge.learningVelocity / 100;
    const predicted90d = Math.min(100, Math.round((avgMastery * 100) + velocity * 90));
    const confidence = Math.min(0.95, entries.length / 20);

    const skillPredictions = Object.entries(mastery).slice(0, 6).map(([skill, score]) => {
      const entry = entries.find(e => e.skillDimension === skill || e.itemType === skill);
      const daysToMastery = score >= 0.8 ? null : Math.round((0.8 - score) / Math.max(0.001, velocity / 7));
      return {
        skill,
        currentScore: Math.round(score * 100) / 100,
        predictedScore: Math.round(Math.min(1, score + 0.1) * 100) / 100,
        confidence: Math.min(1, (entry?.evidenceCount ?? 0) / 10),
        estimatedDaysToMastery: daysToMastery,
      };
    });

    return {
      predictedHkdseLevel: this.estimateHkdse(mastery),
      predictedExamScore: predicted90d,
      examScoreRange: { low: Math.max(0, predicted90d - 15), high: Math.min(100, predicted90d + 10), confidence },
      predictedCefrLevel: knowledge.estimatedCefrLevel,
      skillPredictions,
      trajectory: velocity > 3 ? 'accelerating' : velocity > 1 ? 'steady' : velocity > 0.3 ? 'plateauing' : 'declining',
      recommendedWeeklyMinutes: Math.round(entries.length * 5 * (1 - avgMastery)),
    };
  }

  private buildRisks(motivation: MotivationState, knowledge: KnowledgeState, _entries: ReviewEntry[]): RiskAssessment {
    const dropoutRisk = motivation.dropoutRisk;
    const burnoutRisk = motivation.burnoutRisk;
    const plateauRisk = knowledge.learningVelocity < 0.5 ? 0.7 : knowledge.learningVelocity < 2 ? 0.4 : 0.1;
    const regressionRisk = 1 - knowledge.retentionRate;
    const examReadiness = Object.values(knowledge.currentMastery).reduce((s, v) => s + v, 0) / Math.max(1, Object.values(knowledge.currentMastery).length);

    let overallRisk: RiskAssessment['overallRisk'] = 'low';
    if (dropoutRisk > 0.5 || burnoutRisk > 0.6) overallRisk = 'critical';
    else if (dropoutRisk > 0.3 || burnoutRisk > 0.4 || regressionRisk > 0.5) overallRisk = 'high';
    else if (plateauRisk > 0.5) overallRisk = 'moderate';

    const riskFactors: string[] = [];
    const riskFactorsZh: string[] = [];
    if (dropoutRisk > 0.3) { riskFactors.push('Dropout risk elevated'); riskFactorsZh.push('退學風險偏高'); }
    if (burnoutRisk > 0.4) { riskFactors.push('Burnout risk detected'); riskFactorsZh.push('偵測到倦怠風險'); }
    if (plateauRisk > 0.5) { riskFactors.push('Learning plateau detected'); riskFactorsZh.push('學習高原期'); }
    if (regressionRisk > 0.4) { riskFactors.push('Skill regression risk'); riskFactorsZh.push('技能退化風險'); }

    const strategies: string[] = [];
    const strategiesZh: string[] = [];
    if (dropoutRisk > 0.3) { strategies.push('Schedule a check-in conversation'); strategiesZh.push('安排關懷對話'); }
    if (burnoutRisk > 0.4) { strategies.push('Reduce workload temporarily, add gamification'); strategiesZh.push('暫時減輕工作量，增加遊戲化元素'); }
    if (plateauRisk > 0.5) { strategies.push('Introduce new challenge type or interleaving'); strategiesZh.push('引入新挑戰類型或交叉練習'); }

    return {
      overallRisk,
      dropoutRisk: Math.round(dropoutRisk * 100) / 100,
      burnoutRisk: Math.round(burnoutRisk * 100) / 100,
      plateauRisk: Math.round(plateauRisk * 100) / 100,
      regressionRisk: Math.round(regressionRisk * 100) / 100,
      examReadiness: Math.round(examReadiness * 100) / 100,
      riskFactors, riskFactorsZh,
      mitigationStrategies: strategies.length > 0 ? strategies : ['No immediate risks detected'],
      mitigationStrategiesZh: strategiesZh.length > 0 ? strategiesZh : ['未偵測到即時風險'],
      requiresIntervention: overallRisk === 'critical' || overallRisk === 'high',
      interventionSuggestions: strategies,
      interventionSuggestionsZh: strategiesZh,
    };
  }

  private buildDashboard(
    persona: LearningPersona, knowledge: KnowledgeState,
    motivation: MotivationState, confidence: ConfidenceState,
    habits: LearningHabit, predictions: TwinPredictions, risks: RiskAssessment,
  ): DashboardData {
    return {
      summary: {
        studentId: '',
        personaType: persona.type,
        personaTypeZh: persona.typeZh,
        estimatedLevel: knowledge.estimatedHkdseLevel,
        overallProgress: Object.values(knowledge.currentMastery).reduce((s, v) => s + v, 0) / Math.max(1, Object.values(knowledge.currentMastery).length),
      },
      kpiCards: [
        { key: 'mastery', label: 'Overall Mastery', labelZh: '整體掌握度', value: Math.round(Object.values(knowledge.currentMastery).reduce((s, v) => s + v, 0) / Math.max(1, Object.values(knowledge.currentMastery).length) * 100), unit: '%', trend: predictions.trajectory === 'accelerating' ? 'up' : 'stable', color: 'blue' },
        { key: 'predicted', label: 'Predicted Score', labelZh: '預測分數', value: predictions.predictedExamScore, unit: '/100', trend: predictions.trajectory === 'declining' ? 'down' : 'up', color: 'green' },
        { key: 'velocity', label: 'Learning Velocity', labelZh: '學習速度', value: knowledge.learningVelocity, unit: 'pts/wk', trend: knowledge.learningVelocity > 2 ? 'up' : 'stable', color: 'blue' },
        { key: 'motivation', label: 'Motivation', labelZh: '學習動機', value: Math.round(motivation.overallScore * 100), unit: '%', trend: motivation.trend === 'improving' ? 'up' : 'stable', color: 'yellow' },
        { key: 'risk', label: 'Dropout Risk', labelZh: '退學風險', value: Math.round(risks.dropoutRisk * 100), unit: '%', trend: risks.dropoutRisk > 0.3 ? 'down' : 'stable', color: risks.dropoutRisk > 0.3 ? 'red' : 'green' },
      ],
      skillRadar: Object.entries(knowledge.currentMastery).slice(0, 6).map(([skill, score]) => ({
        skill,
        skillZh: skill,
        current: Math.round(score * 100),
        predicted: Math.round((knowledge.predictedMastery['30d'][skill] || score) * 100),
        maxValue: 100,
      })),
      learningVelocity: [{ week: 'W-4', velocity: Math.max(0, knowledge.learningVelocity - 2), sessionsCompleted: habits.sessionsPerWeek - 1 },
        { week: 'W-3', velocity: Math.max(0, knowledge.learningVelocity - 1), sessionsCompleted: habits.sessionsPerWeek },
        { week: 'W-2', velocity: knowledge.learningVelocity, sessionsCompleted: habits.sessionsPerWeek },
        { week: 'W-1', velocity: knowledge.learningVelocity + 1, sessionsCompleted: habits.sessionsPerWeek + 1 },
      ],
      riskIndicators: [
        { type: 'dropout', label: 'Dropout Risk', labelZh: '退學風險', level: risks.dropoutRisk > 0.5 ? 'critical' : risks.dropoutRisk > 0.3 ? 'high' : 'low', score: risks.dropoutRisk, action: risks.mitigationStrategies[0] || '', actionZh: risks.mitigationStrategiesZh[0] || '' },
        { type: 'burnout', label: 'Burnout Risk', labelZh: '倦怠風險', level: risks.burnoutRisk > 0.6 ? 'critical' : risks.burnoutRisk > 0.4 ? 'high' : 'low', score: risks.burnoutRisk, action: risks.mitigationStrategies[1] || '', actionZh: risks.mitigationStrategiesZh[1] || '' },
        { type: 'plateau', label: 'Plateau Risk', labelZh: '高原風險', level: risks.plateauRisk > 0.7 ? 'high' : risks.plateauRisk > 0.5 ? 'moderate' : 'low', score: risks.plateauRisk, action: 'Try interleaving practice', actionZh: '嘗試交叉練習' },
      ],
      nextMilestones: [
        { milestone: `Master ${knowledge.weakSkills[0]?.skill || 'grammar'} above 80%`, milestoneZh: `將${knowledge.weakSkills[0]?.skill || '文法'}掌握度提升至 80%`, progress: knowledge.weakSkills[0]?.currentScore || 0, estimatedDays: knowledge.weakSkills[0] ? Math.round((0.8 - (knowledge.weakSkills[0]?.currentScore || 0)) * 30) : 14 },
        { milestone: 'Complete 3 sessions this week', milestoneZh: '本週完成 3 次練習', progress: Math.min(1, habits.sessionsPerWeek / 3), estimatedDays: 7 },
        { milestone: 'Reduce procrastination by 20%', milestoneZh: '將拖延指數降低 20%', progress: 1 - habits.procrastinationIndex, estimatedDays: 21 },
      ],
    };
  }

  // ============================================
  // Helpers
  // ============================================

  private calcDropoutRisk(sessionsPerWeek: number, consistency: number, burnoutRisk: number): number {
    if (sessionsPerWeek === 0) return 0.9;
    if (sessionsPerWeek < 1) return 0.6;
    const base = (1 - consistency) * 0.5 + burnoutRisk * 0.5;
    return Math.round(Math.min(1, base) * 100) / 100;
  }

  private suggestMotivators(dropoutRisk: number, burnoutRisk: number, lang: 'en' | 'zh'): string[] {
    if (lang === 'zh') {
      const items: string[] = [];
      if (dropoutRisk > 0.3) items.push('設定短期可達成的小目標');
      if (burnoutRisk > 0.4) items.push('安排趣味性學習活動');
      if (items.length === 0) items.push('維持現有良好學習習慣');
      return items;
    }
    const items: string[] = [];
    if (dropoutRisk > 0.3) items.push('Set small, achievable short-term goals');
    if (burnoutRisk > 0.4) items.push('Introduce fun, gamified learning activities');
    if (items.length === 0) items.push('Maintain current good learning habits');
    return items;
  }

  private estimateHkdse(mastery: Record<string, number>): string {
    const avg = Object.values(mastery).reduce((s, v) => s + v, 0) / Math.max(1, Object.values(mastery).length);
    if (avg >= 0.95) return '5**';
    if (avg >= 0.85) return '5*';
    if (avg >= 0.75) return '5';
    if (avg >= 0.65) return '4';
    if (avg >= 0.50) return '3';
    if (avg >= 0.35) return '2';
    return '1';
  }

  private estimateCefr(mastery: Record<string, number>): any {
    const avg = Object.values(mastery).reduce((s, v) => s + v, 0) / Math.max(1, Object.values(mastery).length);
    if (avg >= 0.9) return 'C1';
    if (avg >= 0.7) return 'B2';
    if (avg >= 0.5) return 'B1';
    if (avg >= 0.3) return 'A2';
    return 'A1';
  }
}

export const studentTwinService = new StudentTwinService();
