// Sprint 66: Teacher Decision Support — canonical types
// TeacherDashboard must contain NO business logic. Only presentation.
// All aggregation, prioritization, and inference belongs to TeacherDecisionEngine.

import type { LearningEvidence } from '@/modules/learning/decisions/LearningEvidence';

// ============================================
// TeacherDecision — actionable class-level intervention
// ============================================

export interface TeacherDecision {
  type:
    | 'class_intervention'
    | 'group_intervention'
    | 'individual_intervention'
    | 'curriculum_adjustment'
    | 'assessment';

  /** Priority score (0-1, higher = more urgent) */
  priority: number;

  /** Confidence in this recommendation (0-1) */
  confidence: number;

  /** WHY this decision (bilingual, evidence-based, never LLM) */
  reason: string;
  reasonZh: string;

  /** Scope of impact */
  affectedStudents: number;
  affectedSkills: string[];

  /** Evidence supporting this decision */
  evidence: {
    averageMastery: number;
    averageGain: number;
    recommendationSuccessRate: number;
    strugglingStudents: number;
    improvingStudents: number;
  };

  /** What improvement to expect */
  expectedImpact: string;
  expectedImpactZh: string;

  /** Specific actions the teacher can take */
  suggestedActions: string[];
  suggestedActionsZh: string[];
}

// ============================================
// ClassLearningSnapshot — one-number overview
// ============================================

export interface ClassLearningSnapshot {
  classId: string;
  generatedAt: string;
  students: number;
  averageMastery: number;
  averageGain: number;
  recommendationAccuracy: number;
  trend: 'improving' | 'stable' | 'declining';
}

// ============================================
// StudentCluster — group students by learning profile
// ============================================

export interface StudentCluster {
  label: string;
  labelZh: string;
  studentIds: string[];
  count: number;
  averageMastery: number;
  characteristic: string;
  characteristicZh: string;
  recommendedAction: string;
  recommendedActionZh: string;
}

// ============================================
// ClassAnalysis — complete class-level intelligence
// ============================================

export interface ClassAnalysis {
  snapshot: ClassLearningSnapshot;

  /** Top 5 class-wide weaknesses (by skill) */
  classWeaknesses: Array<{
    skill: string;
    skillZh: string;
    averageMastery: number;
    affectedStudentCount: number;
    severity: 'critical' | 'high' | 'moderate' | 'low';
  }>;

  /** Student clusters by learning profile */
  studentClusters: StudentCluster[];

  /** Recommendation quality metrics */
  recommendationQuality: {
    averageAccuracy: number;
    averageGain: number;
    mostEffectiveAction: string;
    leastEffectiveAction: string;
    totalDecisions: number;
    successfulDecisions: number;
  };

  /** Skill-level trends */
  skillTrends: Array<{
    skill: string;
    skillZh: string;
    averageMastery: number;
    averageGain: number;
    trend: 'improving' | 'stable' | 'declining';
    studentCount: number;
  }>;

  /** Prioritized teacher actions */
  teacherDecisions: TeacherDecision[];
}
