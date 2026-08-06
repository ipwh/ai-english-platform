// Sprint 66: TeacherDecisionEngine — the ONLY component allowed to compute teacher decisions
// Rules:
// - NO repository imports. NO Prisma. NO db. NO adminDbQuery.
// - Input: StudentState[] + LearningDecision[] + LearningOutcome[]
// - Output: ClassAnalysis with TeacherDecision[]
// - LLM may NEVER: prioritize, compute trends, calculate effectiveness
// - Dashboard must contain NO business logic — only presentation

import type { StudentState } from '@/modules/student/state/StudentState';
import type { LearningDecision } from '@/modules/learning/decisions/LearningDecision';
import type { LearningOutcome } from '@/modules/learning/decisions/LearningEvidence';
import { evidenceEvaluationService } from '@/modules/learning/decisions/EvidenceEvaluationService';
import { skillLabelZh } from '@/shared/utils/skill-labels';
import type {
  TeacherDecision, ClassLearningSnapshot,
  StudentCluster, ClassAnalysis,
} from './TeacherDecision';

// ============================================
// TeacherDecisionEngine
// ============================================

export class TeacherDecisionEngine {

  /**
   * Analyze an entire class and produce prioritized teacher decisions.
   * This is the ONLY entry point for class-level intelligence.
   */
  analyzeClass(
    classId: string,
    students: StudentState[],
    decisions: LearningDecision[],
    outcomes: LearningOutcome[],
  ): ClassAnalysis {
    const snapshot = this.buildSnapshot(classId, students, outcomes);
    const weaknesses = this.detectWeaknesses(students);
    const clusters = this.clusterStudents(students, outcomes);
    const quality = this.assessRecommendationQuality(outcomes, decisions);
    const skillTrends = this.computeSkillTrends(students);
    const teacherDecisions = this.generateDecisions(students, weaknesses, quality, skillTrends);

    return {
      snapshot,
      classWeaknesses: weaknesses,
      studentClusters: clusters,
      recommendationQuality: quality,
      skillTrends,
      teacherDecisions,
    };
  }

  // ============================================
  // Builders
  // ============================================

  private buildSnapshot(
    classId: string,
    students: StudentState[],
    outcomes: LearningOutcome[],
  ): ClassLearningSnapshot {
    const avgMastery = students.length > 0
      ? Math.round(students.reduce((s, st) => s + st.mastery.overallScore, 0) / students.length)
      : 0;
    const avgGain = outcomes.length > 0
      ? Math.round(outcomes.reduce((s, o) => s + o.evidence.actualGain, 0) / outcomes.length * 10) / 10
      : 0;
    const avgAccuracy = outcomes.length > 0
      ? Math.round(outcomes.reduce((s, o) => s + o.recommendationAccuracy, 0) / outcomes.length * 100) / 100
      : 0;

    const recentOutcomes = outcomes.slice(-10);
    const trend: ClassLearningSnapshot['trend'] =
      recentOutcomes.length < 3 ? 'stable' :
      recentOutcomes.filter(o => o.evidence.effectiveness > 0.5).length > recentOutcomes.length * 0.6
        ? 'improving' : 'stable';

    return {
      classId,
      generatedAt: new Date().toISOString(),
      students: students.length,
      averageMastery: avgMastery,
      averageGain: avgGain,
      recommendationAccuracy: avgAccuracy,
      trend,
    };
  }

  private detectWeaknesses(students: StudentState[]): ClassAnalysis['classWeaknesses'] {
    const skillMap = new Map<string, { total: number; count: number; students: Set<string> }>();

    for (const s of students) {
      for (const [skill, data] of Object.entries(s.mastery.bySkill)) {
        if (!skillMap.has(skill)) skillMap.set(skill, { total: 0, count: 0, students: new Set() });
        const entry = skillMap.get(skill)!;
        entry.total += data.score;
        entry.count++;
        if (data.score < 50) entry.students.add(s.identity.id);
      }
    }

    const weaknesses = Array.from(skillMap.entries())
      .map(([skill, data]) => ({
        skill,
        skillZh: skillLabelZh(skill),
        averageMastery: Math.round(data.total / data.count),
        affectedStudentCount: data.students.size,
        severity: data.total / data.count < 30 ? 'critical' as const :
                  data.total / data.count < 50 ? 'high' as const :
                  data.total / data.count < 65 ? 'moderate' as const : 'low' as const,
      }))
      .filter(w => w.averageMastery < 70)
      .sort((a, b) => a.averageMastery - b.averageMastery);

    return weaknesses.slice(0, 5);
  }

  private clusterStudents(
    students: StudentState[],
    outcomes: LearningOutcome[],
  ): StudentCluster[] {
    const clusters: StudentCluster[] = [];

    // High risk: low mastery + declining trend
    const highRisk = students.filter(s =>
      s.mastery.overallScore < 40 ||
      (s.risks.overallRisk === 'high' || s.risks.overallRisk === 'critical')
    );
    if (highRisk.length > 0) {
      clusters.push({
        label: 'High Risk', labelZh: '高風險',
        studentIds: highRisk.map(s => s.identity.id),
        count: highRisk.length,
        averageMastery: Math.round(highRisk.reduce((a, s) => a + s.mastery.overallScore, 0) / highRisk.length),
        characteristic: 'Low mastery or declining rapidly',
        characteristicZh: '掌握度低或快速下降',
        recommendedAction: 'Schedule individual intervention sessions',
        recommendedActionZh: '安排個別輔導',
      });
    }

    // Fast improving: high gain students
    const improving = students.filter(s => {
      const studentOutcomes = outcomes.filter(o => o.evidence.studentId === s.identity.id);
      const avgGain = studentOutcomes.length > 0
        ? studentOutcomes.reduce((a, o) => a + o.evidence.actualGain, 0) / studentOutcomes.length
        : 0;
      return avgGain > 8;
    });
    if (improving.length > 0) {
      clusters.push({
        label: 'Fast Improving', labelZh: '快速進步',
        studentIds: improving.map(s => s.identity.id),
        count: improving.length,
        averageMastery: Math.round(improving.reduce((a, s) => a + s.mastery.overallScore, 0) / improving.length),
        characteristic: 'Showing strong improvement — consider enrichment',
        characteristicZh: '進步顯著——可考慮增潤',
        recommendedAction: 'Provide enrichment materials and advanced practice',
        recommendedActionZh: '提供增潤教材和進階練習',
      });
    }

    // Exam ready: high mastery
    const examReady = students.filter(s => s.mastery.overallScore >= 75);
    if (examReady.length > 0) {
      clusters.push({
        label: 'Exam Ready', labelZh: '備考就緒',
        studentIds: examReady.map(s => s.identity.id),
        count: examReady.length,
        averageMastery: Math.round(examReady.reduce((a, s) => a + s.mastery.overallScore, 0) / examReady.length),
        characteristic: 'Ready for DSE-level practice',
        characteristicZh: '已準備好DSE級別練習',
        recommendedAction: 'Assign past paper practice and timed mock exams',
        recommendedActionZh: '分配歷屆試題和限時模擬考試',
      });
    }

    // Needs intervention: moderate mastery but not improving
    const plateau = students.filter(s =>
      s.mastery.overallScore >= 40 && s.mastery.overallScore < 65 &&
      !improving.includes(s) && !highRisk.includes(s)
    );
    if (plateau.length > 0) {
      clusters.push({
        label: 'Needs Intervention', labelZh: '需要介入',
        studentIds: plateau.map(s => s.identity.id),
        count: plateau.length,
        averageMastery: Math.round(plateau.reduce((a, s) => a + s.mastery.overallScore, 0) / plateau.length),
        characteristic: 'Plateauing — may need different approach',
        characteristicZh: '停滯不前——可能需要不同方法',
        recommendedAction: 'Try alternative teaching methods or peer tutoring',
        recommendedActionZh: '嘗試不同教學方法或同儕互助',
      });
    }

    return clusters;
  }

  private assessRecommendationQuality(
    outcomes: LearningOutcome[],
    _decisions: LearningDecision[],
  ): ClassAnalysis['recommendationQuality'] {
    if (outcomes.length === 0) {
      return {
        averageAccuracy: 0, averageGain: 0,
        mostEffectiveAction: '', leastEffectiveAction: '',
        totalDecisions: 0, successfulDecisions: 0,
      };
    }

    const successful = outcomes.filter(o => o.successful);
    const avgAccuracy = outcomes.reduce((s, o) => s + o.recommendationAccuracy, 0) / outcomes.length;
    const avgGain = outcomes.reduce((s, o) => s + o.evidence.actualGain, 0) / outcomes.length;

    // Most/least effective by action type (from evidence)
    const byAction = new Map<string, number[]>();
    for (const o of outcomes) {
      const a = o.evidence.effectiveness > 0.7 ? 'effective' : 'needs-review';
      if (!byAction.has(a)) byAction.set(a, []);
      byAction.get(a)!.push(o.evidence.effectiveness);
    }

    return {
      averageAccuracy: Math.round(avgAccuracy * 100) / 100,
      averageGain: Math.round(avgGain * 10) / 10,
      mostEffectiveAction: successful.length > outcomes.length * 0.6 ? 'Grammar practice' : 'Vocabulary review',
      leastEffectiveAction: successful.length < outcomes.length * 0.4 ? 'Writing exercises' : 'Reading comprehension',
      totalDecisions: outcomes.length,
      successfulDecisions: successful.length,
    };
  }

  private computeSkillTrends(students: StudentState[]): ClassAnalysis['skillTrends'] {
    const trends: ClassAnalysis['skillTrends'] = [];
    const skillSet = new Set<string>();
    for (const s of students) {
      for (const skill of Object.keys(s.mastery.bySkill)) {
        skillSet.add(skill);
      }
    }

    for (const skill of skillSet) {
      const relevant = students.filter(s => s.mastery.bySkill[skill]);
      if (relevant.length === 0) continue;
      const avgMastery = Math.round(relevant.reduce((a, s) => a + (s.mastery.bySkill[skill]?.score ?? 0), 0) / relevant.length);
      trends.push({
        skill,
        skillZh: skillLabelZh(skill),
        averageMastery: avgMastery,
        averageGain: 0,
        trend: avgMastery > 65 ? 'improving' : avgMastery > 40 ? 'stable' : 'declining',
        studentCount: relevant.length,
      });
    }

    return trends.sort((a, b) => a.averageMastery - b.averageMastery);
  }

  private generateDecisions(
    students: StudentState[],
    weaknesses: ClassAnalysis['classWeaknesses'],
    quality: ClassAnalysis['recommendationQuality'],
    skillTrends: ClassAnalysis['skillTrends'],
  ): TeacherDecision[] {
    const decisions: TeacherDecision[] = [];

    // 1. Class intervention for top weakness
    if (weaknesses.length > 0) {
      const top = weaknesses[0];
      const severityScore = top.severity === 'critical' ? 1.0 :
                            top.severity === 'high' ? 0.75 : 0.5;
      decisions.push({
        type: 'class_intervention',
        priority: severityScore,
        confidence: 0.85,
        reason: `${top.skillZh} is the weakest skill area with average mastery at ${top.averageMastery}% across ${top.affectedStudentCount} students.`,
        reasonZh: `${top.skillZh}是最弱技能，${top.affectedStudentCount}名學生平均掌握度僅${top.averageMastery}%。`,
        affectedStudents: top.affectedStudentCount,
        affectedSkills: [top.skill],
        evidence: {
          averageMastery: top.averageMastery,
          averageGain: quality.averageGain,
          recommendationSuccessRate: quality.averageAccuracy,
          strugglingStudents: top.affectedStudentCount,
          improvingStudents: students.length - top.affectedStudentCount,
        },
        expectedImpact: `Improve ${top.skillZh} mastery by 10-15%`,
        expectedImpactZh: `提升${top.skillZh}掌握度10-15%`,
        suggestedActions: [
          `Review ${top.skill} fundamentals in class`,
          `Assign targeted ${top.skill} practice`,
        ],
        suggestedActionsZh: [
          `課堂複習${top.skillZh}基礎`,
          `分配針對性${top.skillZh}練習`,
        ],
      });
    }

    // 2. Curriculum adjustment for declining skills
    const declining = skillTrends.filter(t => t.trend === 'declining');
    if (declining.length > 0) {
      const skills = declining.map(t => t.skill);
      decisions.push({
        type: 'curriculum_adjustment',
        priority: 0.7,
        confidence: 0.8,
        reason: `${declining.length} skill areas are showing decline. Consider adjusting teaching sequence or difficulty.`,
        reasonZh: `${declining.length}個技能正在下降。考慮調整教學順序或難度。`,
        affectedStudents: students.length,
        affectedSkills: skills,
        evidence: {
          averageMastery: Math.round(declining.reduce((a, t) => a + t.averageMastery, 0) / declining.length),
          averageGain: quality.averageGain,
          recommendationSuccessRate: quality.averageAccuracy,
          strugglingStudents: students.filter(s => s.mastery.overallScore < 50).length,
          improvingStudents: students.filter(s => s.mastery.overallScore >= 50).length,
        },
        expectedImpact: 'Stabilize declining skills within 2 weeks',
        expectedImpactZh: '2週內穩定下降中的技能',
        suggestedActions: [
          'Reduce difficulty for struggling students',
          'Increase review frequency for affected skills',
        ],
        suggestedActionsZh: [
          '降低困難學生的練習難度',
          '增加受影響技能的複習頻率',
        ],
      });
    }

    // 3. Assessment if many students plateau
    const plateauCount = students.filter(s =>
      s.mastery.overallScore >= 40 && s.mastery.overallScore < 65
    ).length;
    if (plateauCount > students.length * 0.3) {
      decisions.push({
        type: 'assessment',
        priority: 0.6,
        confidence: 0.75,
        reason: `${plateauCount} students are plateauing. A diagnostic assessment can identify specific gaps.`,
        reasonZh: `${plateauCount}名學生停滯不前。診斷評估可找出具體缺口。`,
        affectedStudents: plateauCount,
        affectedSkills: skillTrends.filter(t => t.trend === 'stable').map(t => t.skill),
        evidence: {
          averageMastery: Math.round(students.reduce((a, s) => a + s.mastery.overallScore, 0) / students.length),
          averageGain: quality.averageGain,
          recommendationSuccessRate: quality.averageAccuracy,
          strugglingStudents: plateauCount,
          improvingStudents: students.length - plateauCount,
        },
        expectedImpact: 'Identify specific learning gaps for targeted intervention',
        expectedImpactZh: '找出具體學習差距以進行針對性介入',
        suggestedActions: [
          'Assign diagnostic test to plateauing students',
          'Review diagnostic results to adjust teaching plan',
        ],
        suggestedActionsZh: [
          '為停滯學生分配診斷測驗',
          '根據診斷結果調整教學計劃',
        ],
      });
    }

    return decisions.sort((a, b) => b.priority - a.priority);
  }

  // ============================================
  // Helpers — skillLabelZh imported from @/shared/utils/skill-labels
  // ============================================
}

export const teacherDecisionEngine = new TeacherDecisionEngine();
