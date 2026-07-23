// Sprint 64: RecommendationFormatter — thin formatter over LearningDecisionEngine
// NO repository imports. NO Prisma. NO db. NO scoring logic.
// All priority computation is in LearningDecisionEngine.

import type { ScoredRecommendation, RecommendationResult } from '../types/recommendation-types';
import type { LearningDecision } from '@/modules/learning/decisions/LearningDecision';
import { learningDecisionEngine } from '@/modules/learning/decisions/LearningDecisionEngine';
import { studentStateBuilder } from '@/modules/student/state/StudentStateBuilder';

function decisionToScored(d: LearningDecision, rank: number): ScoredRecommendation {
  return {
    candidate: {
      id: `skill:${d.targetSkill}`, label: d.targetSkill, labelZh: d.targetSkillZh,
      type: d.action === 'review' ? 'vocabulary' :
            d.targetSkill.includes('writing') || d.targetSkill.includes('essay') ? 'writing' : 'grammar',
      masteryScore: d.evidence.masteryBefore, mistakeCount: d.evidence.mistakeCount,
      examWeight: d.evidence.dseExamWeight,
      daysSinceLastPractice: d.evidence.daysSinceLastPractice, practiceCount: 0,
    },
    totalScore: d.priority,
    breakdown: {
      weaknessScore: Math.round((1 - d.evidence.masteryBefore / 100) * 0.40 * 10000) / 10000,
      mistakeScore: Math.round(Math.min(d.evidence.mistakeCount / 20, 1) * 0.30 * 10000) / 10000,
      examScore: Math.round(d.evidence.dseExamWeight * 0.20 * 10000) / 10000,
      retentionScore: Math.round(Math.min(d.evidence.daysSinceLastPractice / 30, 1) * 0.10 * 10000) / 10000,
    },
    rank,
  };
}

export async function recommendGrammar(studentId: string, limit = 5): Promise<ScoredRecommendation[]> {
  const state = await studentStateBuilder.build(studentId);
  return learningDecisionEngine.decideAll(state)
    .filter(d => !['essay','writing','vocabulary'].some(k => d.targetSkill.includes(k)))
    .slice(0, limit).map((d, i) => decisionToScored(d, i + 1));
}

export async function recommendVocabulary(studentId: string, limit = 5): Promise<ScoredRecommendation[]> {
  const state = await studentStateBuilder.build(studentId);
  let decisions = learningDecisionEngine.decideAll(state).filter(d => d.targetSkill.includes('vocabulary'));
  if (decisions.length === 0) decisions = learningDecisionEngine.decideAll(state);
  return decisions.slice(0, limit).map((d, i) => decisionToScored(d, i + 1));
}

export async function recommendWritingTopic(studentId: string, limit = 3): Promise<ScoredRecommendation[]> {
  const state = await studentStateBuilder.build(studentId);
  let decisions = learningDecisionEngine.decideAll(state)
    .filter(d => d.targetSkill.includes('essay') || d.targetSkill.includes('writing') ||
      d.targetSkill.includes('article') || d.targetSkill.includes('letter') || d.targetSkill.includes('report'));
  if (decisions.length === 0) decisions = learningDecisionEngine.decideAll(state);
  return decisions.slice(0, limit).map((d, i) => decisionToScored(d, i + 1));
}

export async function recommendNextExercise(studentId: string, limit = 5): Promise<ScoredRecommendation[]> {
  return recommendGrammar(studentId, limit);
}

export async function getFullRecommendations(studentId: string, limit = 5): Promise<RecommendationResult> {
  const state = await studentStateBuilder.build(studentId);
  const allRanked = learningDecisionEngine.decideAll(state).map((d, i) => decisionToScored(d, i + 1));
  return {
    studentId,
    topRecommendations: allRanked.slice(0, limit),
    recommendedGrammar: allRanked.filter(r => r.candidate.type === 'grammar').slice(0, limit),
    recommendedVocabulary: allRanked.filter(r => r.candidate.type === 'vocabulary').slice(0, limit),
    recommendedWriting: allRanked.filter(r => r.candidate.type === 'writing').slice(0, limit),
    recommendedExercise: allRanked.filter(r => r.candidate.type === 'grammar').slice(0, limit),
    generatedAt: new Date(),
  };
}
