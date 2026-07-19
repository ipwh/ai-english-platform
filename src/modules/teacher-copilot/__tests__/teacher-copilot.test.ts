// Sprint 38: Teacher Copilot — Tests
import { describe, it, expect } from 'vitest';
import { TeacherCopilotService } from '../services/teacher-copilot-service';

const service = new TeacherCopilotService();

describe('TeacherCopilotService', () => {
  it('should generate a weekly lesson plan', async () => {
    const plan = await service.generateLessonPlan('4A', '4A');
    expect(plan.classId).toBe('4A');
    expect(plan.focusSkills.length).toBeGreaterThan(0);
    expect(plan.dailyPlans.length).toBe(5);
    expect(plan.dailyPlans[0].day).toBe('Monday');
    expect(plan.dailyPlans[0].activities.length).toBeGreaterThan(0);
    expect(plan.dailyPlans[0].homework.length).toBeGreaterThan(0);
    expect(plan.grammarFocus.topics.length).toBeGreaterThan(0);
    expect(plan.vocabularyFocus.themes.length).toBeGreaterThan(0);
    expect(plan.writingFocus.textTypes.length).toBeGreaterThan(0);
    expect(plan.materialsRecommendationZh.length).toBeGreaterThan(0);
  });

  it('should generate assignment recommendations', async () => {
    const recs = await service.generateAssignments('4A');
    expect(recs.classId).toBe('4A');
    expect(recs.assignments.length).toBeGreaterThan(0);
    expect(recs.assignments[0].title).toBeTruthy();
    expect(recs.assignments[0].titleZh).toBeTruthy();
    expect(recs.assignments[0].reason).toBeTruthy();
    expect(recs.assignments[0].reasonZh).toBeTruthy();
    expect(recs.reviewAssignments.length).toBeGreaterThan(0);
  });

  it('should analyze a student', async () => {
    const analysis = await service.analyzeStudent('student-1', '4A');
    expect(analysis.studentId).toBe('student-1');
    expect(analysis.personaType).toBeTruthy();
    expect(analysis.skillDetails.length).toBeGreaterThan(0);
    expect(analysis.teacherNotes.strengths.length).toBeGreaterThan(0);
    expect(analysis.teacherNotes.suggestedFocus.length).toBeGreaterThan(0);
    expect(analysis.teacherNotes.suggestedFocusZh.length).toBeGreaterThan(0);
  });

  it('should analyze a class', async () => {
    const analysis = await service.analyzeClass('4A', '4A');
    expect(analysis.classId).toBe('4A');
    expect(analysis.overallMetrics.averageMastery).toBeGreaterThan(0);
    expect(analysis.skillBreakdown.length).toBe(5);
    expect(analysis.weaknessSummary.topGrammarWeaknesses.length).toBeGreaterThan(0);
    expect(analysis.recommendations.length).toBeGreaterThan(0);
    expect(analysis.recommendationsZh.length).toBeGreaterThan(0);
    expect(analysis.riskStudents.length).toBeGreaterThan(0);
  });

  it('should predict exam outcomes', async () => {
    const prediction = await service.predictExam('4A');
    expect(prediction.classId).toBe('4A');
    expect(prediction.predictedClassAverage).toBeGreaterThan(0);
    expect(prediction.predictedPassRate).toBeGreaterThan(0);
    expect(prediction.studentPredictions.length).toBeGreaterThan(0);
    expect(prediction.studentPredictions[0].predictedLevel).toBeTruthy();
    expect(prediction.studentPredictions[0].confidenceBand.low).toBeLessThan(prediction.studentPredictions[0].confidenceBand.high);
    expect(prediction.paperAnalysis.length).toBe(3);
    expect(prediction.recommendations.length).toBeGreaterThan(0);
    expect(prediction.recommendationsZh.length).toBeGreaterThan(0);
  });

  it('should generate teacher overview', async () => {
    const overview = await service.getOverview('teacher-1');
    expect(overview.teacherId).toBe('teacher-1');
    expect(overview.classes.length).toBeGreaterThan(0);
    expect(overview.urgentActions.length).toBeGreaterThan(0);
    expect(overview.weeklySummary.totalStudents).toBeGreaterThan(0);
  });

  it('should generate bilingual content in all outputs', async () => {
    const plan = await service.generateLessonPlan('4A', '4A');
    // Check bilingual content exists
    const hasZh = plan.dailyPlans[0].activities.some(a => a.descriptionZh);
    expect(hasZh).toBe(true);

    const classAnalysis = await service.analyzeClass('4A', '4A');
    expect(classAnalysis.recommendationsZh.length).toBe(classAnalysis.recommendations.length);
  });

  it('should produce consistent structure for same classId', async () => {
    const plan1 = await service.generateLessonPlan('4A', '4A');
    const plan2 = await service.generateLessonPlan('4A', '4A');
    // Same classId should produce same structure (daily plan count, focus skills ordering)
    expect(plan1.dailyPlans.length).toBe(plan2.dailyPlans.length);
    expect(plan1.grammarFocus).toBeDefined();
    expect(plan2.grammarFocus).toBeDefined();
    expect(plan1.vocabularyFocus.themes).toEqual(plan2.vocabularyFocus.themes);
  });
});