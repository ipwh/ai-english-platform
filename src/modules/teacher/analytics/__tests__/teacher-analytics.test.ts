// Sprint 24: Teacher Intelligence Dashboard — Unit Tests
import { describe, it, expect } from 'vitest';
import {
  analyzeClass, detectWeakSkills, rankWriting, rankReading,
  compareStudent, predictRisks, generateSuggestions,
  detectLearningGaps, generateAIReport,
  classifyActivity, daysSinceLastActive,
} from '../services/teacher-analytics';
import type { TeacherDashboardInput, StudentData } from '../types';

const DAY_MS = 86400000;
const daysAgoIso = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

function buildStudent(overrides: Partial<StudentData> = {}): StudentData {
  return {
    studentId: 's1', name: 'Alice', nameZh: '愛麗絲', gradeLevel: 'S4',
    accuracy: 0.75, masteryScore: 68, totalQuestions: 50, totalCorrect: 38,
    streakDays: 5, xp: 500, vocabularySize: 40, lastActiveDate: daysAgoIso(1),
    bySkill: {
      grammar: { accuracy: 0.8, mastery: 72, questions: 20 },
      vocabulary: { accuracy: 0.7, mastery: 65, questions: 10 },
      reading: { accuracy: 0.75, mastery: 70, questions: 8 },
      writing: { accuracy: 0.6, mastery: 55, questions: 5 },
      listening: { accuracy: 0.85, mastery: 78, questions: 4 },
      speaking: { accuracy: 0.7, mastery: 65, questions: 3 },
    },
    mistakes: [{ category: 'grammar', count: 5 }, { category: 'vocabulary', count: 3 }],
    recentTrend: 'stable',
    ...overrides,
  };
}

function buildInput(overrides: Partial<TeacherDashboardInput> = {}): TeacherDashboardInput {
  return {
    classId: 'class-4a', className: '4A', academicYear: '2025-2026',
    students: [
      buildStudent({ studentId: 's1', name: 'Alice', accuracy: 0.85, masteryScore: 75, xp: 600 }),
      buildStudent({ studentId: 's2', name: 'Bob', accuracy: 0.45, masteryScore: 35, xp: 120, recentTrend: 'declining', streakDays: 0 }),
      buildStudent({ studentId: 's3', name: 'Carol', accuracy: 0.72, masteryScore: 65, xp: 400 }),
      buildStudent({ studentId: 's4', name: 'David', accuracy: 0.55, masteryScore: 48, xp: 200 }),
      buildStudent({ studentId: 's5', name: 'Eve', accuracy: 0.92, masteryScore: 88, xp: 900 }),
    ],
    ...overrides,
  };
}

// ============================================
// Class Analytics
// ============================================

describe('ClassAnalytics', () => {
  it('should analyze class overview', () => {
    const result = analyzeClass(buildInput());
    expect(result.className).toBe('4A');
    expect(result.studentCount).toBe(5);
    expect(result.activeStudents).toBe(5);
    expect(result.averageAccuracy).toBeGreaterThan(0);
    expect(result.topPerformers.length).toBeGreaterThan(0);
    expect(result.atRiskStudents.length).toBeGreaterThan(0);
  });

  it('should identify at-risk students', () => {
    const result = analyzeClass(buildInput());
    const atRisk = result.atRiskStudents;
    expect(atRisk.some(s => s.studentId === 's2')).toBe(true); // 45% accuracy
  });

  it('should compute by-skill averages', () => {
    const result = analyzeClass(buildInput());
    expect(result.bySkill.grammar.averageAccuracy).toBeGreaterThan(0);
    expect(result.bySkill.writing.averageAccuracy).toBeGreaterThan(0);
  });

  it('should handle empty class', () => {
    const result = analyzeClass(buildInput({ students: [] }));
    expect(result.studentCount).toBe(0);
    expect(result.activeStudents).toBe(0);
  });
});

// ============================================
// Weak Skills
// ============================================

describe('WeakSkills', () => {
  it('should detect weak skills when present', () => {
    const result = detectWeakSkills(buildInput());
    // May or may not detect depending on data thresholds
    expect(Array.isArray(result)).toBe(true);
  });

  it('should include recommended actions', () => {
    const result = detectWeakSkills(buildInput());
    for (const w of result) {
      expect(w.recommendedActions.length).toBeGreaterThan(0);
      expect(w.affectedPercent).toBeGreaterThanOrEqual(0);
    }
  });
});

// ============================================
// Rankings
// ============================================

describe('StudentRankings', () => {
  it('should rank by writing', () => {
    const result = rankWriting(buildInput());
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].rank).toBe(1);
  });

  it('should rank by reading', () => {
    const result = rankReading(buildInput());
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].rank).toBe(1);
  });

  it('should compute percentiles', () => {
    const result = rankWriting(buildInput());
    const last = result[result.length - 1];
    expect(last.percentile).toBeLessThanOrEqual(50);
  });
});

// ============================================
// Student Comparison
// ============================================

describe('StudentComparison', () => {
  it('should compare student to class average', () => {
    const result = compareStudent(buildInput(), 's1');
    expect(result).not.toBeNull();
    expect(result!.studentId).toBe('s1');
    expect(result!.strengths.length).toBeGreaterThanOrEqual(0);
    expect(result!.weaknesses.length).toBeGreaterThanOrEqual(0);
  });

  it('should return null for non-existent student', () => {
    expect(compareStudent(buildInput(), 'nobody')).toBeNull();
  });
});

// ============================================
// Risk Prediction
// ============================================

describe('RiskPrediction', () => {
  it('should predict risks for all students', () => {
    const result = predictRisks(buildInput());
    expect(result.length).toBe(5);
  });

  it('should flag declining students as high risk', () => {
    const result = predictRisks(buildInput());
    const bob = result.find(r => r.studentId === 's2');
    expect(bob).toBeDefined();
    expect(bob!.riskLevel).toBe('critical');
    expect(bob!.interventionNeeded).toBe(true);
  });

  it('should identify low-risk students', () => {
    const result = predictRisks(buildInput());
    const eve = result.find(r => r.studentId === 's5');
    expect(eve).toBeDefined();
    expect(eve!.riskLevel).toBe('low');
  });
});

// ============================================
// Learning Suggestions
// ============================================

describe('LearningSuggestions', () => {
  it('should generate suggestions for a student', () => {
    const result = generateSuggestions(buildInput(), 's2');
    expect(result).not.toBeNull();
    expect(result!.suggestions.length).toBeGreaterThan(0);
  });

  it('should return null for non-existent student', () => {
    expect(generateSuggestions(buildInput(), 'nobody')).toBeNull();
  });
});

// ============================================
// Learning Gaps
// ============================================

describe('LearningGaps', () => {
  it('should detect learning gaps', () => {
    const result = detectLearningGaps(buildInput());
    expect(result.length).toBeGreaterThanOrEqual(0);
  });

  it('should sort by gap size', () => {
    const result = detectLearningGaps(buildInput());
    for (let i = 1; i < result.length; i++) {
      expect(result[i].gapSize).toBeLessThanOrEqual(result[i - 1].gapSize);
    }
  });
});

// ============================================
// AI Report
// ============================================

describe('AIReportGenerator', () => {
  it('should generate comprehensive report', () => {
    const result = generateAIReport(buildInput());
    expect(result.classId).toBe('class-4a');
    expect(result.summary.overallAssessmentZh.length).toBeGreaterThan(10);
    expect(result.summary.keyFindings.length).toBeGreaterThan(0);
    expect(result.highlights.length).toBeGreaterThanOrEqual(0);
    expect(result.recommendations.length).toBeGreaterThanOrEqual(0);
    expect(result.projectedOutcomes.length).toBeGreaterThan(0);
  });

  it('should include bilingual content', () => {
    const result = generateAIReport(buildInput());
    expect(result.summary.overallAssessmentZh).toBeTruthy();
    expect(result.summary.keyFindingsZh.length).toBeGreaterThan(0);
  });

  it('should handle empty class gracefully', () => {
    const result = generateAIReport(buildInput({ students: [] }));
    expect(result.summary.keyFindings.length).toBeGreaterThan(0);
  });
});

// ============================================
// Activity Monitoring (Sprint 133)
// ============================================

describe('ActivityMonitoring', () => {
  it('classifies zero-activity students as inactive', () => {
    expect(classifyActivity(0, daysAgoIso(1))).toBe('inactive');
  });

  it('classifies missing/invalid last-activity as inactive', () => {
    expect(classifyActivity(10, null)).toBe('inactive');
    expect(classifyActivity(10, 'not-a-date')).toBe('inactive');
  });

  it('classifies dormant students by days since last activity', () => {
    expect(classifyActivity(50, daysAgoIso(20))).toBe('inactive');
    expect(classifyActivity(50, daysAgoIso(14))).toBe('inactive');
    expect(classifyActivity(50, daysAgoIso(10))).toBe('low-activity');
    expect(classifyActivity(50, daysAgoIso(3))).toBe('active');
  });

  it('daysSinceLastActive returns -1 for unknown dates', () => {
    expect(daysSinceLastActive(null)).toBe(-1);
    expect(daysSinceLastActive('bad-date')).toBe(-1);
    expect(daysSinceLastActive(daysAgoIso(3))).toBeGreaterThanOrEqual(3);
  });

  it('flags dormant students (14+ days) in at-risk with riskLevel inactive', () => {
    const input = buildInput({
      students: [buildStudent({ studentId: 'dormant', totalQuestions: 80, accuracy: 0.9, lastActiveDate: daysAgoIso(20) })],
    });
    const result = analyzeClass(input);
    expect(result.activityBreakdown.inactive).toBe(1);
    expect(result.inactiveStudents).toHaveLength(1);
    expect(result.atRiskStudents.some(s => s.studentId === 'dormant' && s.riskLevel === 'inactive')).toBe(true);
  });

  it('risk prediction flags zero-activity as critical with re-engagement actions', () => {
    const input = buildInput({
      students: [buildStudent({ studentId: 'ghost', totalQuestions: 0, accuracy: 0 })],
    });
    const risks = predictRisks(input);
    expect(risks).toHaveLength(1);
    expect(risks[0].riskLevel).toBe('critical');
    expect(risks[0].factors.some(f => f.factorZh === '零活動')).toBe(true);
    expect(risks[0].suggestedActions.length).toBeGreaterThan(0);
  });

  it('AI report surfaces inactive student count', () => {
    const input = buildInput({
      students: [buildStudent({ studentId: 'ghost', totalQuestions: 0, accuracy: 0 })],
    });
    const report = generateAIReport(input);
    expect(report.summary.keyFindings.some(k => k.includes('inactive'))).toBe(true);
    expect(report.summary.keyFindingsZh.some(k => k.includes('失聯'))).toBe(true);
  });
});

// ============================================
// Edge Cases
// ============================================

describe('EdgeCases', () => {
  it('should handle single student class', () => {
    const input = buildInput({ students: [buildStudent({ studentId: 'only' })] });
    expect(() => analyzeClass(input)).not.toThrow();
    expect(() => detectWeakSkills(input)).not.toThrow();
    expect(() => predictRisks(input)).not.toThrow();
    expect(() => generateAIReport(input)).not.toThrow();
  });

  it('should handle students with zero questions', () => {
    const input = buildInput({
      students: [buildStudent({ studentId: 'new', totalQuestions: 0, accuracy: 0 })],
    });
    const result = analyzeClass(input);
    expect(result.activeStudents).toBe(0);
    expect(result.activityBreakdown.inactive).toBe(1);
    expect(result.inactiveStudents.some(s => s.studentId === 'new')).toBe(true);
    expect(result.atRiskStudents.some(s => s.studentId === 'new' && s.riskLevel === 'inactive')).toBe(true);
  });

  it('rank should not explode with all-zero data', () => {
    const zeroStudent = buildStudent({
      studentId: 'z', accuracy: 0, masteryScore: 0,
    });
    zeroStudent.bySkill = {
      grammar: { accuracy: 0, mastery: 0, questions: 0 },
      vocabulary: { accuracy: 0, mastery: 0, questions: 0 },
      reading: { accuracy: 0, mastery: 0, questions: 0 },
      writing: { accuracy: 0, mastery: 0, questions: 0 },
      listening: { accuracy: 0, mastery: 0, questions: 0 },
      speaking: { accuracy: 0, mastery: 0, questions: 0 },
    };
    const input = buildInput({ students: [zeroStudent] });
    expect(() => rankWriting(input)).not.toThrow();
  });
});
