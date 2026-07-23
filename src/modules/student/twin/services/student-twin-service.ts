// Sprint 37: StudentTwinService — builds the complete digital twin
// Sprint 59: Delegates to StudentStateBuilder (canonical assembler)
// Split-brain eliminated: ALL state now comes from ONE builder
import { logger } from '@/shared/logger/logger';
import { studentStateBuilder } from '../../state/StudentStateBuilder';
import type { StudentState } from '../../state/StudentState';
import type {
  StudentTwin, LearningPersona, PersonaType,
  KnowledgeState, MotivationState, ConfidenceState, LearningHabit,
  TwinPredictions, RiskAssessment, DashboardData, SkillRank,
  RetentionState, ForgetCurve, LearningVelocity, RecoveryMetrics,
} from '../types';

// ============================================
// StudentTwinService — thin wrapper around StudentStateBuilder
// Sprint 59: No more internal builders. No more delegation methods.
// All state flows through ONE canonical path.
// ============================================

export class StudentTwinService {

  /** Build the complete digital twin — delegates to StudentStateBuilder */
  async buildTwin(studentId: string): Promise<StudentTwin> {
    const state = await studentStateBuilder.build(studentId);
    return this.mapStateToTwin(state);
  }

  /** Get just the knowledge state */
  async getKnowledgeState(studentId: string): Promise<KnowledgeState> {
    const state = await studentStateBuilder.build(studentId);
    return state.knowledge;
  }

  /** Get predictions */
  async getPredictions(studentId: string): Promise<TwinPredictions> {
    const state = await studentStateBuilder.build(studentId);
    return state.predictions;
  }

  /** Get risk assessment */
  async getRiskAssessment(studentId: string): Promise<RiskAssessment> {
    const state = await studentStateBuilder.build(studentId);
    return state.risks;
  }

  /** Canonical mastery profile — from the one builder */
  async getMasteryProfile(studentId: string) {
    const state = await studentStateBuilder.build(studentId);
    return state.mastery;
  }

  /** Canonical weakness profile — from the one builder */
  async getWeaknessProfile(studentId: string) {
    const state = await studentStateBuilder.build(studentId);
    return state.weakness;
  }

  /** Canonical vocabulary profile — from the one builder */
  async getVocabProfile(studentId: string) {
    const state = await studentStateBuilder.build(studentId);
    return state.vocabulary;
  }

  // ============================================
  // Map StudentState → StudentTwin (legacy format)
  // ============================================

  private mapStateToTwin(s: StudentState): StudentTwin {
    return {
      studentId: s.identity.id,
      generatedAt: s.generatedAt,
      persona: s.persona,
      knowledge: s.knowledge,
      motivation: s.motivation,
      confidence: s.confidence,
      habits: s.habits,
      predictions: s.predictions,
      risks: s.risks,
      dashboard: {
        summary: {
          studentId: s.identity.id,
          personaType: s.persona.type,
          personaTypeZh: s.persona.typeZh,
          estimatedLevel: s.mastery.estimatedHkdseLevel || s.knowledge.estimatedHkdseLevel,
          overallProgress: s.mastery.overallScore / 100,
        },
        strengths: s.mastery.strongSkills,
        weaknesses: s.mastery.weakSkills,
        recentActivity: [],
        suggestedActions: [],
        suggestedActionsZh: [],
      } as any,
      goals: { shortTerm: [], mediumTerm: [], targetHkdseLevel: s.mastery.estimatedHkdseLevel || '3', targetMastery: 0.6 },
      recommendations: [],
      retention: s.retention,
      forgetCurve: s.forgetCurve,
      velocity: s.velocity,
      recovery: s.recovery,
    };
  }
}

export const studentTwinService = new StudentTwinService();
