// Sprint 24: Teacher Intelligence Dashboard — all analytics services
import type {
  ClassOverview, WeakSkill, StudentRanking, StudentComparison,
  RiskPrediction, LearningSuggestion, LearningGap, AIReport,
  TeacherDashboardInput, StudentData,
} from '../types';
import type { SkillDimension } from '@/modules/student/profile/types';

// Single source: use MASTERY_SKILLS for canonical skill dimensions
const SKILLS: SkillDimension[] = ['grammar', 'vocabulary', 'reading', 'writing', 'listening', 'speaking'];
const SKILL_NAMES: Record<SkillDimension, string> = {
  grammar: '文法', vocabulary: '詞彙', reading: '閱讀', writing: '寫作', listening: '聆聽', speaking: '口語',
};

// ============================================
// Class Analytics
// ============================================

// ============================================
// Activity Monitoring (Sprint 133) — behavior-based signals
// In self-study mode, disengagement is the primary failure mode,
// so inactivity is surfaced alongside (and ahead of) low grades.
// ============================================

export type ActivityStatus = 'active' | 'low-activity' | 'inactive';

export const INACTIVE_AFTER_DAYS = 14;
export const LOW_ACTIVITY_AFTER_DAYS = 7;

/**
 * Classify a student's engagement:
 * - inactive: never started, no last-activity timestamp, or 14+ days silent
 * - low-activity: 7-13 days silent
 * - active: practiced within the last 7 days
 */
export function classifyActivity(
  totalQuestions: number,
  lastActiveDate: string | null | undefined,
  now: Date = new Date(),
): ActivityStatus {
  if (totalQuestions <= 0) return 'inactive';
  if (!lastActiveDate) return 'inactive';
  const last = new Date(lastActiveDate);
  if (Number.isNaN(last.getTime())) return 'inactive';
  const days = Math.max(0, Math.floor((now.getTime() - last.getTime()) / 86400000));
  if (days >= INACTIVE_AFTER_DAYS) return 'inactive';
  if (days >= LOW_ACTIVITY_AFTER_DAYS) return 'low-activity';
  return 'active';
}

/** Days since last activity; -1 when unknown (missing/invalid timestamp). */
export function daysSinceLastActive(lastActiveDate: string | null | undefined, now: Date = new Date()): number {
  if (!lastActiveDate) return -1;
  const last = new Date(lastActiveDate);
  if (Number.isNaN(last.getTime())) return -1;
  return Math.max(0, Math.floor((now.getTime() - last.getTime()) / 86400000));
}

export function analyzeClass(input: TeacherDashboardInput): ClassOverview {
  const { students, classId, className, academicYear } = input;
  const active = students.filter(s => s.totalQuestions > 0);
  const avgAcc = active.length > 0 ? active.reduce((s, st) => s + st.accuracy, 0) / active.length : 0;
  const avgMastery = active.length > 0 ? active.reduce((s, st) => s + st.masteryScore, 0) / active.length : 0;
  const totalSessions = active.reduce((s, st) => s + st.totalQuestions, 0);

  const skillDims = SKILLS;
  const bySkill = {} as ClassOverview['bySkill'];
  for (const dim of skillDims) {
    const withSkill = active.filter(s => s.bySkill[dim].questions > 0);
    bySkill[dim] = {
      averageAccuracy: withSkill.length > 0 ? withSkill.reduce((s, st) => s + st.bySkill[dim].accuracy, 0) / withSkill.length : 0,
      averageMastery: withSkill.length > 0 ? withSkill.reduce((s, st) => s + st.bySkill[dim].mastery, 0) / withSkill.length : 0,
      studentCount: withSkill.length,
    };
  }

  // Activity breakdown: disengagement is a first-class monitoring signal
  const activityBreakdown: ClassOverview['activityBreakdown'] = { active: 0, lowActivity: 0, inactive: 0 };
  const inactiveStudents: ClassOverview['inactiveStudents'] = [];
  for (const s of students) {
    const status = classifyActivity(s.totalQuestions, s.lastActiveDate);
    if (status === 'active') activityBreakdown.active += 1;
    else if (status === 'low-activity') activityBreakdown.lowActivity += 1;
    else {
      activityBreakdown.inactive += 1;
      inactiveStudents.push({
        studentId: s.studentId, name: s.name,
        lastActiveDate: s.lastActiveDate,
        daysSinceLastActive: daysSinceLastActive(s.lastActiveDate),
      });
    }
  }

  const sorted = [...students].sort((a, b) => b.accuracy - a.accuracy);
  const topPerformers = sorted.slice(0, 5).map(s => ({ studentId: s.studentId, name: s.name, accuracy: s.accuracy, xp: s.xp }));

  // At-risk = low accuracy with sufficient volume, PLUS disengaged students.
  // Inactivity is the stronger red flag in self-study monitoring.
  const atRiskStudents = students
    .filter(s => (s.accuracy < 0.5 && s.totalQuestions > 5) || classifyActivity(s.totalQuestions, s.lastActiveDate) === 'inactive')
    .map(s => {
      const status = classifyActivity(s.totalQuestions, s.lastActiveDate);
      return {
        studentId: s.studentId, name: s.name, accuracy: s.accuracy,
        riskLevel: status === 'inactive' ? 'inactive' : s.accuracy < 0.3 ? 'critical' : 'at-risk',
      };
    });

  return {
    classId, className, academicYear,
    studentCount: students.length, activeStudents: active.length,
    averageAccuracy: Math.round(avgAcc * 100) / 100,
    averageMastery: Math.round(avgMastery),
    totalPracticeSessions: totalSessions,
    totalQuestionsAnswered: active.reduce((s, st) => s + st.totalQuestions, 0),
    averageStreakDays: active.length > 0 ? Math.round(active.reduce((s, st) => s + st.streakDays, 0) / active.length) : 0,
    bySkill, topPerformers, atRiskStudents,
    activityBreakdown, inactiveStudents,
  };
}

// ============================================
// Weak Skill Detection
// ============================================

export function detectWeakSkills(input: TeacherDashboardInput): WeakSkill[] {
  const skillDims = SKILLS;
  const skillNames = SKILL_NAMES;
  const results: WeakSkill[] = [];

  for (const dim of skillDims) {
    const withSkill = input.students.filter(s => s.bySkill[dim].questions > 0);
    const weak = withSkill.filter(s => s.bySkill[dim].accuracy < 0.6);
    if (weak.length === 0 && withSkill.length > 0) continue;

    const avgAcc = withSkill.length > 0 ? withSkill.reduce((s, st) => s + st.bySkill[dim].accuracy, 0) / withSkill.length : 0;
    const affectedPercent = input.students.length > 0 ? Math.round((weak.length / input.students.length) * 100) : 0;

    // Aggregate common mistakes
    const mistakeMap = new Map<string, number>();
    for (const s of weak) {
      for (const m of s.mistakes) {
        mistakeMap.set(m.category, (mistakeMap.get(m.category) || 0) + m.count);
      }
    }
    const commonMistakes = [...mistakeMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([desc, freq]) => ({ description: desc, descriptionZh: desc, frequency: freq }));

    if (affectedPercent >= 20 || avgAcc < 0.6) {
      results.push({
        skill: dim, skillNameZh: skillNames[dim],
        affectedStudentCount: weak.length, affectedPercent, averageAccuracy: Math.round(avgAcc * 100) / 100,
        commonMistakes,
        recommendedActions: [
          { action: `Focus on ${dim} fundamentals`, actionZh: `專注於${skillNames[dim]}基礎`, priority: 'high' },
          { action: `Assign targeted ${dim} exercises`, actionZh: `指派針對性${skillNames[dim]}練習`, priority: 'medium' },
        ],
      });
    }
  }
  return results.sort((a, b) => b.affectedPercent - a.affectedPercent);
}

// ============================================
// Rankings
// ============================================

export function rankWriting(input: TeacherDashboardInput): StudentRanking[] {
  return rankBy(input, s => s.bySkill.writing.mastery, 'writing');
}

export function rankReading(input: TeacherDashboardInput): StudentRanking[] {
  return rankBy(input, s => s.bySkill.reading.mastery, 'reading');
}

function rankBy(input: TeacherDashboardInput, getScore: (s: StudentData) => number, _skill: string): StudentRanking[] {
  const sorted = [...input.students]
    .filter(s => getScore(s) > 0 || s.totalQuestions > 0)
    .sort((a, b) => getScore(b) - getScore(a));
  return sorted.map((s, i) => ({
    studentId: s.studentId, name: s.name,
    score: Math.round(getScore(s)),
    rank: i + 1,
    totalStudents: sorted.length,
    percentile: sorted.length > 1 ? Math.round((1 - (i / (sorted.length - 1))) * 100) : 100,
    change: 0,
  }));
}

// ============================================
// Student Comparison
// ============================================

export function compareStudent(input: TeacherDashboardInput, studentId: string): StudentComparison | null {
  const student = input.students.find(s => s.studentId === studentId);
  if (!student) return null;

  const others = input.students.filter(s => s.studentId !== studentId && s.totalQuestions > 0);
  if (others.length === 0) return null;

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const skillDims = SKILLS;
  const bySkill = {} as StudentComparison['bySkill'];
  const strengths: SkillDimension[] = [];
  const weaknesses: SkillDimension[] = [];

  for (const dim of skillDims) {
    const classAvg = avg(others.map(s => s.bySkill[dim].mastery));
    const diff = student.bySkill[dim].mastery - classAvg;
    bySkill[dim] = { value: student.bySkill[dim].mastery, average: Math.round(classAvg), difference: Math.round(diff) };
    if (diff > 5) strengths.push(dim);
    else if (diff < -5) weaknesses.push(dim);
  }

  const classAcc = avg(others.map(s => s.accuracy));
  const classMastery = avg(others.map(s => s.masteryScore));
  const classQuestions = avg(others.map(s => s.totalQuestions));
  const classStreak = avg(others.map(s => s.streakDays));
  const classVocab = avg(others.map(s => s.vocabularySize));

  return {
    studentId: student.studentId, name: student.name, comparedTo: 'class-average',
    metrics: {
      accuracy: { value: student.accuracy, average: Math.round(classAcc * 100) / 100, difference: Math.round((student.accuracy - classAcc) * 100) / 100 },
      mastery: { value: student.masteryScore, average: Math.round(classMastery), difference: Math.round(student.masteryScore - classMastery) },
      questionsAnswered: { value: student.totalQuestions, average: Math.round(classQuestions), difference: student.totalQuestions - Math.round(classQuestions) },
      streakDays: { value: student.streakDays, average: Math.round(classStreak), difference: student.streakDays - Math.round(classStreak) },
      vocabularySize: { value: student.vocabularySize, average: Math.round(classVocab), difference: student.vocabularySize - Math.round(classVocab) },
    },
    bySkill, strengths, weaknesses,
  };
}

// ============================================
// Risk Prediction
// ============================================

export function predictRisks(input: TeacherDashboardInput): RiskPrediction[] {
  return input.students.map(s => {
    const activity = classifyActivity(s.totalQuestions, s.lastActiveDate);

    // Disengagement is the highest-priority risk in self-study mode.
    // Zero-activity students were previously invisible to risk prediction.
    if (activity === 'inactive') {
      const isZeroActivity = s.totalQuestions <= 0;
      return {
        studentId: s.studentId, name: s.name,
        riskLevel: 'critical',
        riskScore: isZeroActivity ? 100 : 70,
        factors: [isZeroActivity
          ? { factor: 'No activity', factorZh: '零活動', impact: 'negative' as const, weight: 100 }
          : { factor: 'Inactive (14+ days)', factorZh: '超過14天未活動', impact: 'negative' as const, weight: 70 }],
        predictedAccuracy: 0,
        interventionNeeded: true,
        suggestedActions: [
          { action: 'Re-engage with the student', actionZh: '主動聯繫學生' },
          { action: 'Assign a low-barrier activity', actionZh: '指派低門檻練習' },
        ],
      };
    }

    if (s.totalQuestions < 3) {
      return {
        studentId: s.studentId, name: s.name,
        riskLevel: 'medium',
        riskScore: 20,
        factors: [{ factor: 'Low practice volume', factorZh: '練習量低', impact: 'negative' as const, weight: 20 }],
        predictedAccuracy: s.accuracy,
        interventionNeeded: false,
        suggestedActions: [{ action: 'Encourage first practices', actionZh: '鼓勵完成首次練習' }],
      };
    }

    let riskScore = 0;
    const factors: RiskPrediction['factors'] = [];

    if (s.accuracy < 0.5) { riskScore += 30; factors.push({ factor: 'Low accuracy', factorZh: '正確率低', impact: 'negative', weight: 30 }); }
    if (s.recentTrend === 'declining') { riskScore += 25; factors.push({ factor: 'Declining trend', factorZh: '趨勢下滑', impact: 'negative', weight: 25 }); }
    if (s.streakDays === 0) { riskScore += 15; factors.push({ factor: 'No active streak', factorZh: '無連續學習', impact: 'negative', weight: 15 }); }
    if (activity === 'low-activity') { riskScore += 15; factors.push({ factor: 'No recent activity (7+ days)', factorZh: '近7天未活動', impact: 'negative', weight: 15 }); }
    if (s.accuracy > 0.8) { factors.push({ factor: 'Strong performance', factorZh: '表現良好', impact: 'positive', weight: 20 }); }

    const riskLevel: RiskPrediction['riskLevel'] = riskScore >= 60 ? 'critical' : riskScore >= 40 ? 'high' : riskScore >= 20 ? 'medium' : 'low';
    const predictedAccuracy = Math.max(0, Math.min(1, s.accuracy + (s.recentTrend === 'improving' ? 0.05 : s.recentTrend === 'declining' ? -0.05 : 0)));

    return {
      studentId: s.studentId, name: s.name, riskLevel, riskScore,
      factors, predictedAccuracy: Math.round(predictedAccuracy * 100) / 100,
      interventionNeeded: riskLevel === 'high' || riskLevel === 'critical',
      suggestedActions: riskLevel === 'high' || riskLevel === 'critical'
        ? [{ action: 'Schedule one-on-one review', actionZh: '安排個別輔導' }, { action: 'Assign remedial exercises', actionZh: '指派補底練習' }]
        : [{ action: 'Continue current pace', actionZh: '保持目前進度' }],
    };
  });
}

// ============================================
// Learning Suggestions
// ============================================

export function generateSuggestions(input: TeacherDashboardInput, studentId: string): LearningSuggestion | null {
  const student = input.students.find(s => s.studentId === studentId);
  if (!student) return null;

  const suggestions: LearningSuggestion['suggestions'] = [];
  const skillDims = SKILLS;
  const skillNames: Record<SkillDimension, string> = { grammar: 'Grammar', vocabulary: 'Vocabulary', reading: 'Reading', writing: 'Writing', listening: 'Listening', speaking: 'Speaking' };
  const skillNamesZh: Record<SkillDimension, string> = { grammar: '文法', vocabulary: '詞彙', reading: '閱讀', writing: '寫作', listening: '聆聽', speaking: '口語' };

  for (const dim of skillDims) {
    const skill = student.bySkill[dim];
    if (skill.questions === 0) continue;

    if (skill.accuracy < 0.5) {
      suggestions.push({
        type: 'review', skill: dim, title: `${skillNames[dim]} Review`, titleZh: `${skillNamesZh[dim]}複習`,
        reason: `Accuracy below 50% in ${skillNames[dim].toLowerCase()}`,
        reasonZh: `${skillNamesZh[dim]}正確率低於50%`,
        priority: 'must-do', estimatedTimeMinutes: 20,
      });
    } else if (skill.accuracy < 0.7) {
      suggestions.push({
        type: 'practice', skill: dim, title: `${skillNames[dim]} Practice`, titleZh: `${skillNamesZh[dim]}練習`,
        reason: `${skillNames[dim]} needs more practice`,
        reasonZh: `${skillNamesZh[dim]}需要更多練習`,
        priority: 'should-do', estimatedTimeMinutes: 15,
      });
    } else if (skill.accuracy >= 0.85) {
      suggestions.push({
        type: 'challenge', skill: dim, title: `${skillNames[dim]} Challenge`, titleZh: `${skillNamesZh[dim]}挑戰`,
        reason: `Ready for advanced ${skillNames[dim].toLowerCase()} challenges`,
        reasonZh: `已準備好進階${skillNamesZh[dim]}挑戰`,
        priority: 'could-do', estimatedTimeMinutes: 25,
      });
    }
  }

  return { studentId: student.studentId, name: student.name, suggestions };
}

// ============================================
// Learning Gap Detection
// ============================================

export function detectLearningGaps(input: TeacherDashboardInput): LearningGap[] {
  const skillDims = SKILLS;
  const skillNamesZh: Record<SkillDimension, string> = { grammar: '文法', vocabulary: '詞彙', reading: '閱讀', writing: '寫作', listening: '聆聽', speaking: '口語' };
  const expectedForGrade: Record<string, number> = { S1: 55, S2: 60, S3: 65, S4: 70, S5: 75, S6: 80 };
  const gaps: LearningGap[] = [];

  for (const dim of skillDims) {
    const withSkill = input.students.filter(s => s.bySkill[dim].questions > 0);
    if (withSkill.length === 0) continue;

    const avgMastery = withSkill.reduce((s, st) => s + st.bySkill[dim].mastery, 0) / withSkill.length;
    const gradeLevels = [...new Set(withSkill.map(s => s.gradeLevel))];
    const primaryGrade = gradeLevels[0] || 'S4';
    const expected = expectedForGrade[primaryGrade] || 70;
    const gapSize = expected - avgMastery;

    if (gapSize > 5) {
      gaps.push({
        skill: dim, skillNameZh: skillNamesZh[dim],
        expectedLevel: `${primaryGrade} (${expected}%)`,
        actualLevel: `${Math.round(avgMastery)}%`,
        gapSize: Math.round(gapSize),
        affectedStudents: withSkill.filter(s => s.bySkill[dim].mastery < expected).length,
        trend: 'stable',
        rootCauses: ['Insufficient practice', 'Weak foundational knowledge'],
      });
    }
  }
  return gaps.sort((a, b) => b.gapSize - a.gapSize);
}

// ============================================
// AI Report Generator
// ============================================

export function generateAIReport(input: TeacherDashboardInput): AIReport {
  const overview = analyzeClass(input);
  const weakSkills = detectWeakSkills(input);
  const risks = predictRisks(input);
  const gaps = detectLearningGaps(input);

  const atRiskCount = risks.filter(r => r.riskLevel === 'high' || r.riskLevel === 'critical').length;
  const inactiveCount = overview.inactiveStudents.length;
  const weakSkillNames = weakSkills.slice(0, 3).map(w => w.skillNameZh);

  const overallZh = overview.averageAccuracy >= 0.7
    ? `班級整體表現良好，平均正確率 ${Math.round(overview.averageAccuracy * 100)}%。${weakSkillNames.length > 0 ? `需注意${weakSkillNames.join('、')}方面的弱項。` : ''}`
    : `班級整體表現有待提升，平均正確率 ${Math.round(overview.averageAccuracy * 100)}%。建議聚焦${weakSkillNames.join('、')}等弱項。`;

  return {
    classId: input.classId,
    generatedAt: new Date().toISOString(),
    summary: {
      overallAssessment: `Class average accuracy: ${Math.round(overview.averageAccuracy * 100)}%. ${atRiskCount} students at risk. ${inactiveCount} inactive.`,
      overallAssessmentZh: overallZh,
      keyFindings: [
        `${overview.activeStudents}/${overview.studentCount} active students`,
        `${inactiveCount} students inactive (14+ days)`,
        `Top performer: ${overview.topPerformers[0]?.name || 'N/A'} (${Math.round((overview.topPerformers[0]?.accuracy || 0) * 100)}%)`,
        `${atRiskCount} students need intervention`,
      ],
      keyFindingsZh: [
        `${overview.activeStudents}/${overview.studentCount} 名活躍學生`,
        `${inactiveCount} 名學生失聯（超過14天未活動）`,
        `最佳表現：${overview.topPerformers[0]?.name || 'N/A'}（${Math.round((overview.topPerformers[0]?.accuracy || 0) * 100)}%）`,
        `${atRiskCount} 名學生需要介入`,
      ],
    },
    highlights: overview.topPerformers.slice(0, 3).map(s => ({
      title: `${s.name} — Top Performer`, titleZh: `${s.name} — 最佳表現`,
      detail: `Accuracy: ${Math.round(s.accuracy * 100)}%, XP: ${s.xp}`,
      detailZh: `正確率：${Math.round(s.accuracy * 100)}%，經驗值：${s.xp}`,
    })),
    concerns: risks.filter(r => r.riskLevel === 'critical').map(r => ({
      title: `${r.name} — Critical Risk`, titleZh: `${r.name} — 高風險`,
      detail: `Risk score: ${r.riskScore}/100`, detailZh: `風險分數：${r.riskScore}/100`,
      severity: 'critical',
    })),
    recommendations: weakSkills.slice(0, 3).map(w => ({
      action: `Assign targeted ${w.skill} practice`, actionZh: `指派針對性${w.skillNameZh}練習`,
      rationale: `${w.affectedPercent}% of students show weakness in ${w.skill}`,
      rationaleZh: `${w.affectedPercent}% 學生在${w.skillNameZh}方面表現弱`,
    })),
    projectedOutcomes: [
      { description: 'Class accuracy improvement by 5-10% within 4 weeks', descriptionZh: '4週內班級正確率提升5-10%', timeframe: '4 weeks' },
    ],
  };
}
