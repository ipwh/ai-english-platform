// Sprint 37: Student Digital Twin — barrel exports
export type {
  StudentTwin, LearningPersona, PersonaType,
  KnowledgeState, SkillRank,
  MotivationState, ConfidenceState, LearningHabit,
  TwinPredictions, RiskAssessment, DashboardData,
} from './types';

export { StudentTwinService, studentTwinService } from './services/student-twin-service';
