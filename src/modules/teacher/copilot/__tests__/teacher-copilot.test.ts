// Sprint 38: Teacher Copilot — Tests
// Sprint 132: Updated to mock DB after StudentTwin + LearningScience integration
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the DB module to avoid provider mismatch (postgres vs sqlite in test env)
vi.mock('@/shared/db/db', () => ({
  db: {
    studentClass: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue({ id: 'link-1' }) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    studentMastery: { findMany: vi.fn().mockResolvedValue([]) },
    learningReviewSchedule: { count: vi.fn().mockResolvedValue(0) },
    studentMistakeSummary: { findMany: vi.fn().mockResolvedValue([]) },
    teacherClass: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue({ id: 'tc-1' }) },
    loginLog: { groupBy: vi.fn().mockResolvedValue([]) },
    practiceSession: { groupBy: vi.fn().mockResolvedValue([]) },
    assignment: { count: vi.fn().mockResolvedValue(0) },
  },
}));

// Mock StudentTwinService to avoid StudentStateBuilder DB calls
vi.mock('@/modules/student/twin/services/student-twin-service', () => ({
  studentTwinService: {
    buildTwin: vi.fn().mockRejectedValue(new Error('No data')),
    resolveStudentId: vi.fn().mockImplementation(async (id: string) => id),
  },
}));

import { TeacherCopilotService } from '../services/teacher-copilot-service';
import { db } from '@/shared/db/db';
import { studentTwinService } from '@/modules/student/twin/services/student-twin-service';

const service = new TeacherCopilotService();

// Default mock data for a class with students
function mockClassWithStudents() {
  const mockDb = db as unknown as Record<string, { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> }>;
  mockDb.studentClass.findMany.mockResolvedValue([
    { studentId: 'student-1' }, { studentId: 'student-2' }, { studentId: 'student-3' },
  ]);
  mockDb.user.findMany.mockResolvedValue([
    { id: 'student-1', nameEn: 'Alice', nameZh: '愛麗絲', overallAccuracy: 0.75 },
    { id: 'student-2', nameEn: 'Bob', nameZh: '鮑勃', overallAccuracy: 0.62 },
    { id: 'student-3', nameEn: 'Carol', nameZh: '卡蘿', overallAccuracy: 0.58 },
  ]);
  mockDb.studentMastery.findMany.mockResolvedValue([
    { studentId: 'student-1', skill: 'grammar', masteryScore: 72 },
    { studentId: 'student-1', skill: 'reading', masteryScore: 68 },
    { studentId: 'student-1', skill: 'writing', masteryScore: 65 },
    { studentId: 'student-2', skill: 'grammar', masteryScore: 55 },
    { studentId: 'student-2', skill: 'reading', masteryScore: 60 },
    { studentId: 'student-3', skill: 'grammar', masteryScore: 45 },
  ]);
  mockDb.learningReviewSchedule.count.mockResolvedValue(3);
  mockDb.studentMistakeSummary.findMany.mockResolvedValue([
    { grammarCategory: 'Tenses', mistakeCount: 8 },
    { grammarCategory: 'Articles', mistakeCount: 5 },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockClassWithStudents();
});

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

  // NOTE: getOverview() now queries TeacherClass from DB.
  // With mocked empty teacherClass, returns structurally valid empty overview.
  it('should generate teacher overview', async () => {
    const overview = await service.getOverview('teacher-1');
    expect(overview.teacherId).toBe('teacher-1');
    expect(Array.isArray(overview.classes)).toBe(true);
    expect(Array.isArray(overview.urgentActions)).toBe(true);
    expect(overview.weeklySummary).toHaveProperty('totalStudents');
    expect(overview.weeklySummary).toHaveProperty('activeStudents');
    expect(overview.weeklySummary).toHaveProperty('assignmentsDue');
    expect(overview.generatedAt).toBeTruthy();
  });

  it('should compute real activeStudents and assignmentsDue in overview (Sprint 133)', async () => {
    const mockDb = db as unknown as Record<string, {
      findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn>; groupBy: ReturnType<typeof vi.fn>;
    }>;
    mockDb.teacherClass.findMany.mockResolvedValue([
      { classId: 'class-1', class: { name: '4A', _count: { students: 3 } } },
    ]);
    // Recent activity for all 3 students → all active
    mockDb.loginLog.groupBy.mockResolvedValue([
      { userId: 'student-1', _max: { loginAt: new Date() } },
      { userId: 'student-2', _max: { loginAt: new Date() } },
      { userId: 'student-3', _max: { loginAt: new Date() } },
    ]);
    mockDb.practiceSession.groupBy.mockResolvedValue([]);
    mockDb.assignment.count.mockResolvedValue(2);

    const overview = await service.getOverview('teacher-1');
    expect(overview.weeklySummary.activeStudents).toBe(3);
    expect(overview.weeklySummary.assignmentsDue).toBe(2);
    expect(overview.classes[0].activeStudents).toBe(3);
  });

  it('should flag zero-activity students as inactive risk (Sprint 133)', async () => {
    const mockDb = db as unknown as Record<string, {
      findMany: ReturnType<typeof vi.fn>; groupBy: ReturnType<typeof vi.fn>;
    }>;
    mockDb.studentClass.findMany.mockResolvedValue([{ studentId: 'ghost-1' }]);
    mockDb.user.findMany.mockResolvedValue([
      { id: 'ghost-1', nameEn: 'Ghost', nameZh: '幽靈', overallAccuracy: null },
    ]);
    mockDb.studentMastery.findMany.mockResolvedValue([]);
    mockDb.loginLog.groupBy.mockResolvedValue([]);
    mockDb.practiceSession.groupBy.mockResolvedValue([]);

    const analysis = await service.analyzeClass('4A', '4A');
    expect(analysis.riskStudents.length).toBeGreaterThan(0);
    expect(analysis.riskStudents[0].riskLevel).toBe('inactive');
    expect(analysis.riskStudents[0].primaryConcernZh).toBe('近期無活動');
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

  // ============================================
  // Security & authorization tests (Sprint 132)
  // ============================================

  describe('verifyTeacherOwnsClass', () => {
    it('returns true when teacher teaches the class', async () => {
      const { verifyTeacherOwnsClass } = await import('../services/teacher-copilot-service');
      const result = await verifyTeacherOwnsClass('teacher-1', '4A');
      expect(result).toBe(true);
    });

    it('returns false when teacher does not teach the class', async () => {
      const mockDb = db as unknown as Record<string, { findFirst: ReturnType<typeof vi.fn> }>;
      mockDb.teacherClass.findFirst.mockResolvedValueOnce(null);
      const { verifyTeacherOwnsClass } = await import('../services/teacher-copilot-service');
      const result = await verifyTeacherOwnsClass('teacher-2', '4B');
      expect(result).toBe(false);
    });
  });

  describe('resolveTeacherStudentClass', () => {
    it('resolves class when student belongs to teacher', async () => {
      const mockDb = db as unknown as Record<string, { findFirst: ReturnType<typeof vi.fn> }>;
      mockDb.studentClass.findFirst.mockResolvedValueOnce({ classId: '4A' });
      const { resolveTeacherStudentClass } = await import('../services/teacher-copilot-service');
      const result = await resolveTeacherStudentClass('teacher-1', 'student-1');
      expect(result).toBe('4A');
    });

    it('returns null when student does not belong to teacher', async () => {
      const mockDb = db as unknown as Record<string, { findFirst: ReturnType<typeof vi.fn> }>;
      mockDb.studentClass.findFirst.mockResolvedValueOnce(null);
      const { resolveTeacherStudentClass } = await import('../services/teacher-copilot-service');
      const result = await resolveTeacherStudentClass('teacher-1', 'student-unknown');
      expect(result).toBeNull();
    });
  });

  describe('verifyStudentInClass', () => {
    it('does not throw when student is in class', async () => {
      // Default mock returns { id: 'link-1' } — should not throw
      await expect(service.analyzeStudent('student-1', '4A')).resolves.toBeDefined();
    });

    it('throws when student is not in class', async () => {
      const mockDb = db as unknown as Record<string, { findFirst: ReturnType<typeof vi.fn> }>;
      mockDb.studentClass.findFirst.mockResolvedValueOnce(null);
      await expect(service.analyzeStudent('student-unknown', '4A'))
        .rejects.toThrow('does not belong to class');
    });
  });

  describe('resolveStudentId errors', () => {
    it('throws 404-style error when student not found', async () => {
      const mockSvc = studentTwinService as unknown as { resolveStudentId: ReturnType<typeof vi.fn> };
      mockSvc.resolveStudentId.mockRejectedValueOnce(new Error('No student found matching "Nobody"'));
      await expect(service.analyzeStudent('Nobody', '4A'))
        .rejects.toThrow('No student found');
    });

    it('throws 409-style error when multiple students match', async () => {
      const mockSvc = studentTwinService as unknown as { resolveStudentId: ReturnType<typeof vi.fn> };
      mockSvc.resolveStudentId.mockRejectedValueOnce(new Error('Multiple students matched: Alice, Bob'));
      await expect(service.analyzeStudent('Chan', '4A'))
        .rejects.toThrow('Multiple students matched');
    });
  });
});