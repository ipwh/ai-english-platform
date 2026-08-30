// Sprint 38: TeacherCopilotService — full teacher intelligence suite
// Sprint 132: Integrated with StudentTwin + LearningScience for real data
import { db } from '@/shared/db/db';
import { studentTwinService } from '@/modules/student/twin/services/student-twin-service';
import type { SkillDimension } from '@/modules/student/profile/types';
import type { PersonaType } from '@/modules/student/twin/types';
import type {
  WeeklyTeachingPlan, DailyPlan,
  GrammarFocus, VocabularyFocus, WritingFocus,
  ClassAnalysis, StudentAnalysis, AssignmentRecommendation,
  ExamPrediction, CopilotOverview,
} from '../types';

// ============================================
// Internal types
// ============================================

/** Per-student data within a class snapshot */
interface StudentSnapshot {
  studentId: string;
  nameEn: string | null;
  nameZh: string | null;
  overallAccuracy: number | null;
  scores: Record<string, number>; // skill → mastery (0-1)
  /** Latest of last login / last practice — monitoring signal (Sprint 133) */
  lastActiveAt: Date | null;
}

const SKILL_LABEL_EN: Record<string, string> = {
  grammar: 'Grammar', vocabulary: 'Vocabulary', reading: 'Reading', writing: 'Writing', listening: 'Listening',
};
const SKILL_LABEL_ZH: Record<string, string> = {
  grammar: '文法', vocabulary: '詞彙', reading: '閱讀', writing: '寫作', listening: '聆聽',
};

/** Days since last activity; null when unknown. */
function daysSinceActivity(lastActiveAt: Date | null, now: Date = new Date()): number | null {
  if (!lastActiveAt) return null;
  return Math.max(0, Math.floor((now.getTime() - lastActiveAt.getTime()) / 86400000));
}

/**
 * A student is "inactive" when there is no evidence of activity at all,
 * or the latest activity was 14+ days ago (self-study disengagement signal).
 */
function isInactiveStudent(s: StudentSnapshot, now: Date = new Date()): boolean {
  const hasData = s.overallAccuracy !== null || Object.values(s.scores).some(v => v > 0);
  if (!hasData) return true;
  const days = daysSinceActivity(s.lastActiveAt, now);
  return days !== null && days >= 14;
}

interface ClassDataSnapshot {
  avgMastery: number;
  avgAccuracy: number;
  avgVelocity: number;
  participation: number;
  readingScore: number;
  writingScore: number;
  grammarErrors: string[];
  grammarErrorsZh: string[];
  reviewDue: number;
  studentCount: number;
  skillAvgs: Record<string, number>;
  studentScores: Array<Record<string, number>>;
  /** Real student identities (for rankings, risk lists) */
  students: StudentSnapshot[];
}

// ============================================
// TeacherCopilotService
// ============================================

export class TeacherCopilotService {

  /** Generate a weekly teaching plan for a class */
  async generateLessonPlan(classId: string, className: string): Promise<WeeklyTeachingPlan> {
    const classData = await this.loadClassData(classId);

    const focusSkills = this.selectFocusSkills(classData);
    const grammarFocus = this.buildGrammarFocus(classData);
    const vocabularyFocus = this.buildVocabularyFocus(classData);
    const writingFocus = this.buildWritingFocus(classData);

    const dailyPlans = this.buildDailyPlans(focusSkills, classData);

    return {
      classId, className,
      weekStart: this.nextMonday(),
      generatedAt: new Date().toISOString(),
      focusSkills,
      dailyPlans,
      grammarFocus,
      vocabularyFocus,
      writingFocus,
      materialsRecommendation: [
        `Grammar worksheets: ${grammarFocus.topics.slice(0, 2).map(t => t.topic).join(', ')}`,
        `Vocabulary themes: ${vocabularyFocus.themes.join(', ')}`,
      ],
      materialsRecommendationZh: [
        `文法練習：${grammarFocus.topics.slice(0, 2).map(t => t.topicZh).join('、')}`,
        `詞彙主題：${vocabularyFocus.themes.join('、')}`,
      ],
    };
  }

  /** Generate homework/assignment recommendations */
  async generateAssignments(classId: string): Promise<AssignmentRecommendation> {
    const classData = await this.loadClassData(classId);

    const assignments = [
      {
        title: 'Grammar Practice', titleZh: '文法練習',
        type: 'grammar' as const, skill: 'grammar' as SkillDimension,
        difficulty: 'core', questionCount: 10, estimatedMinutes: 15,
        targetStudents: 'struggling' as const,
        reason: `${classData.grammarErrors[0] || 'grammar'} needs reinforcement`,
        reasonZh: `${classData.grammarErrors[0] || '文法'}需要加強`,
      },
      {
        title: 'Vocabulary Building', titleZh: '詞彙建立',
        type: 'vocabulary' as const, skill: 'vocabulary' as SkillDimension,
        difficulty: 'core', questionCount: 15, estimatedMinutes: 12,
        targetStudents: 'all' as const,
        reason: 'Weekly vocabulary expansion',
        reasonZh: '每週詞彙擴展',
      },
      {
        title: 'Reading Comprehension', titleZh: '閱讀理解',
        type: 'reading' as const, skill: 'reading' as SkillDimension,
        difficulty: classData.avgMastery > 0.7 ? 'challenge' : 'core',
        questionCount: 5, estimatedMinutes: 20,
        targetStudents: 'all' as const,
        reason: `Reading skills at ${Math.round(classData.readingScore * 100)}%`,
        reasonZh: `閱讀能力 ${Math.round(classData.readingScore * 100)}%`,
      },
    ];

    const reviewAssignments = [
      {
        topic: classData.grammarErrors[0] || 'Tenses', topicZh: classData.grammarErrors[0] || '時態',
        dueCount: classData.reviewDue, urgency: classData.reviewDue > 10 ? 'high' : 'medium',
      },
    ];

    return { classId, generatedAt: new Date().toISOString(), assignments, reviewAssignments };
  }

  /** Analyze an individual student — powered by StudentTwin + LearningScience */
  async analyzeStudent(studentIdOrName: string, classId: string): Promise<StudentAnalysis> {
    // Resolve name to ID via StudentTwinService (student module owns name lookup)
    const studentId = await studentTwinService.resolveStudentId(studentIdOrName);

    // Verify student belongs to this class
    await this.verifyStudentInClass(studentId, classId);

    const [twin, classData] = await Promise.all([
      studentTwinService.buildTwin(studentId).catch(() => null),
      this.loadClassData(classId).catch(() => null),
    ]);

    const personaMap: Record<string, string> = {
      'steady-grinder': '穩定耕耘者', 'fast-learner': '快速學習者',
      'struggling-but-persistent': '堅持奮鬥者', 'balanced-achiever': '均衡成就者',
      'curious-explorer': '好奇探索者', 'anxious-perfectionist': '焦慮完美主義者',
      'high-potential-unfocused': '潛力未集中者', 'exam-crammer': '臨急抱佛腳者',
    };

    // 2026-08-30 audit (R5): twin 不可用時絕不杜撰 persona / 技能分數 / 百分位。
    const personaType: PersonaType | null = twin?.persona?.type ?? null;
    const knowledge = twin?.knowledge;
    const risks = twin?.risks;
    const habits = twin?.habits;
    const predictions = twin?.predictions;

    // Build skill details from twin knowledge state ONLY — 沒有證據就不出分數
    const skillDetails: StudentAnalysis['skillDetails'] = [];
    if (knowledge?.currentMastery && Object.keys(knowledge.currentMastery).length > 0) {
      for (const [skill, score] of Object.entries(knowledge.currentMastery)) {
        skillDetails.push({
          skill: skill as SkillDimension,
          score: Math.round(score * 100),
          classAverage: classData ? Math.round((classData.skillAvgs?.[skill] ?? 0) * 100) : null,
          percentile: null, // 平台不聲稱班級百分位（缺乏全校比較證據）
          trend: (twin?.knowledge?.strongSkills?.find(s => s.skill === skill)?.trend ?? 'stable') as string,
          recommendation: skill === 'grammar' ? 'Focus on error correction exercises' : `Practice ${skill} with varied exercises`,
          recommendationZh: skill === 'grammar' ? '專注錯誤修正練習' : `多元化${skill}練習`,
        });
      }
    }

    const avgMastery100 = knowledge?.currentMastery && Object.keys(knowledge.currentMastery).length > 0
      ? Object.values(knowledge.currentMastery).reduce((a, b) => a + b, 0) / Object.keys(knowledge.currentMastery).length * 100
      : null;

    return {
      studentId,
      // 2026-08-30 audit: 原 `identity?.estimatedLevel` 分支永遠為 false
      // （StudentIdentity 無此欄位）→ 改用 twin 快照中的學生姓名。
      studentName: ((twin?.dashboard?.summary as Record<string, unknown> | undefined)?.studentName as string | undefined)
        ?? `Student ${studentId.slice(0, 6)}`,
      generatedAt: new Date().toISOString(),
      personaType,
      personaTypeZh: personaType ? (personaMap[personaType] ?? '穩定耕耘者') : '',
      // 無 twin 證據時不套用班級平均冒充學生等級
      currentLevel: knowledge?.estimatedHkdseLevel ?? '-',
      predictedLevel: predictions?.predictedHkdseLevel ?? '-',
      skillDetails,
      recentProgress: {
        sessionsThisWeek: habits?.sessionsPerWeek ?? null,
        accuracyTrend: risks ? (risks.overallRisk === 'high' ? 'declining' : 'improving') : null,
        masteryGained: predictions?.predictedExamScore != null && avgMastery100 != null
          ? Math.round(predictions.predictedExamScore - avgMastery100)
          : null,
        timeSpent: habits ? (habits.avgSessionMinutes ?? 0) * (habits.sessionsPerWeek ?? 0) : null,
      },
      teacherNotes: {
        strengths: twin?.knowledge?.strongSkills?.slice(0, 2).map(s => s.skill) ?? [],
        weaknesses: twin?.knowledge?.weakSkills?.slice(0, 2).map(s => s.skill) ?? [],
        suggestedFocus: risks?.mitigationStrategies?.slice(0, 2) ?? [],
        suggestedFocusZh: risks?.mitigationStrategiesZh?.slice(0, 2) ?? [],
      },
    };
  }

  /** Analyze a whole class — powered by StudentTwin + LearningScience */
  async analyzeClass(classId: string, className: string): Promise<ClassAnalysis> {
    const classData = await this.loadClassData(classId);

    // Use real student identities for rankings
    const studentRankings = classData.students.slice(0, 10).map(s => {
      const scores = Object.values(s.scores);
      const overallScore = scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100)
        : 0;
      const entries = Object.entries(s.scores);
      const strongest = entries.sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'grammar';
      const weakest = entries.sort(([, a], [, b]) => a - b)[0]?.[0] ?? 'grammar';
      return {
        studentId: s.studentId,
        name: s.nameEn ?? s.nameZh ?? `Student ${s.studentId.slice(0, 6)}`,
        overallScore,
        strongestSkill: strongest,
        weakestSkill: weakest,
        trend: 'stable' as const,
      };
    });

    // Risk students: disengaged first, then bottom 3 by average score.
    // In self-study monitoring, inactivity is the strongest red flag.
    const now = new Date();
    const sorted = [...classData.students].sort((a, b) => {
      const aAvg = Object.values(a.scores).reduce((s, v) => s + v, 0) / Math.max(1, Object.values(a.scores).length);
      const bAvg = Object.values(b.scores).reduce((s, v) => s + v, 0) / Math.max(1, Object.values(b.scores).length);
      return aAvg - bAvg;
    });
    const inactive = sorted.filter(s => isInactiveStudent(s, now));
    const scored = sorted.filter(s => !isInactiveStudent(s, now));
    const riskStudents = [...inactive, ...scored].slice(0, 3).map(s => {
      const name = s.nameEn ?? s.nameZh ?? `Student ${s.studentId.slice(0, 6)}`;
      if (isInactiveStudent(s, now)) {
        return {
          studentId: s.studentId,
          name,
          riskLevel: 'inactive',
          primaryConcern: 'No recent activity',
          primaryConcernZh: '近期無活動',
        };
      }
      const entries = Object.entries(s.scores);
      const avg = entries.reduce((sum, [, v]) => sum + v, 0) / Math.max(1, entries.length);
      const weakest = [...entries].sort(([, a], [, b]) => a - b)[0]?.[0] ?? 'grammar';
      return {
        studentId: s.studentId,
        name,
        riskLevel: avg < 0.4 ? 'high' : 'moderate',
        primaryConcern: `Weakest skill: ${SKILL_LABEL_EN[weakest] ?? weakest}`,
        primaryConcernZh: `最弱技能：${SKILL_LABEL_ZH[weakest] ?? weakest}`,
      };
    });

    return {
      classId, className,
      studentCount: classData.studentCount,
      generatedAt: new Date().toISOString(),
      overallMetrics: {
        averageMastery: Math.round(classData.avgMastery * 100),
        averageAccuracy: Math.round(classData.avgAccuracy * 100),
        averageVelocity: Math.round(classData.avgVelocity * 10) / 10,
        classHkdseLevel: this.levelFromScore(classData.avgMastery),
        participationRate: Math.round(classData.participation * 100),
      },
      skillBreakdown: (['grammar', 'vocabulary', 'reading', 'writing', 'listening'] as SkillDimension[]).map(skill => ({
        skill,
        averageScore: Math.round((classData.skillAvgs[skill] ?? 0) * 100),
        belowThreshold: Math.round(classData.studentCount * (1 - (classData.skillAvgs[skill] ?? 0))),
        trend: (classData.skillAvgs[skill] ?? 0) > 0.6 ? 'stable' : 'improving' as const,
      })),
      studentRankings,
      weaknessSummary: {
        topGrammarWeaknesses: classData.grammarErrors.slice(0, 3),
        topVocabularyGaps: ['Academic vocabulary', 'Phrasal verbs'],
        commonWritingErrors: ['Chinglish patterns', 'Weak paragraph structure'],
        readingComprehensionIssues: ['Inference questions', 'Main idea identification'],
      },
      riskStudents,
      recommendations: [
        'Focus grammar lessons on tenses and articles',
        'Introduce weekly vocabulary themes',
        'Add peer review for writing practice',
      ],
      recommendationsZh: [
        '文法課專注時態和冠詞',
        '引入每週詞彙主題',
        '增加寫作同儕互評',
      ],
    };
  }

  /** Predict exam outcomes — powered by real student data */
  async predictExam(classId: string): Promise<ExamPrediction> {
    const classData = await this.loadClassData(classId);

    const studentPredictions = classData.students.map(s => {
      const scores = Object.values(s.scores);
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.5;
      return {
        studentId: s.studentId,
        name: s.nameEn ?? s.nameZh ?? `Student ${s.studentId.slice(0, 6)}`,
        predictedLevel: this.levelFromScore(avg),
        predictedScore: Math.round(avg * 100),
        confidenceBand: { low: Math.round(Math.max(0, avg * 100 - 12)), high: Math.round(Math.min(100, avg * 100 + 8)) },
        strongestPaper: (classData.skillAvgs.writing ?? 0) > (classData.skillAvgs.reading ?? 0) ? 'Paper 2 Writing' : 'Paper 1 Reading',
        weakestPaper: (classData.skillAvgs.reading ?? 0) < (classData.skillAvgs.writing ?? 0) ? 'Paper 1 Reading' : 'Paper 2 Writing',
        readinessPercentage: Math.round(avg * 100),
      };
    });

    return {
      classId,
      generatedAt: new Date().toISOString(),
      predictedClassAverage: Math.round(classData.avgMastery * 100),
      // 2026-08-30 audit: platform-defined, transparent estimates. Pass rate =
      // fraction of students at Level 2+ and star rate = fraction at Level 5
      // under the canonical cross-paper thresholds (76/62/48/33). These are
      // UNCALIBRATED platform estimates, not HKEAA-published predictions.
      predictedPassRate: Math.round(
        (100 * studentPredictions.filter(p => ['2', '3', '4', '5'].includes(p.predictedLevel)).length) /
        Math.max(1, studentPredictions.length),
      ),
      predictedStarRate: Math.round(
        (100 * studentPredictions.filter(p => p.predictedLevel === '5').length) /
        Math.max(1, studentPredictions.length),
      ),
      studentPredictions,
      paperAnalysis: [
        { paper: 'Paper 1 Reading', paperZh: '卷一 閱讀', classAverage: Math.round((classData.skillAvgs.reading ?? 0) * 100), topicsNeedingReview: ['Inference', 'Vocabulary in context'], topicsNeedingReviewZh: ['推論', '上下文詞彙'] },
        { paper: 'Paper 2 Writing', paperZh: '卷二 寫作', classAverage: Math.round((classData.skillAvgs.writing ?? 0) * 100), topicsNeedingReview: ['Essay structure', 'Cohesion'], topicsNeedingReviewZh: ['文章結構', '連貫性'] },
        { paper: 'Paper 3 Listening', paperZh: '卷三 聆聽', classAverage: Math.round((classData.skillAvgs.listening ?? 0) * 100), topicsNeedingReview: ['Note-taking', 'Speaker attitude'], topicsNeedingReviewZh: ['筆記技巧', '說話者態度'] },
      ],
      recommendations: [
        'Focus revision on Paper 1 Reading — weakest area',
        'Run mock exam under timed conditions',
      ],
      recommendationsZh: [
        '重點溫習卷一閱讀——最弱項目',
        '進行限時模擬考試',
      ],
    };
  }

  /** Build overview dashboard for a teacher — powered by StudentTwin + LearningScience */
  async getOverview(teacherId: string): Promise<CopilotOverview> {
    // Load teacher's classes from DB
    const teacherClasses = await db.teacherClass.findMany({
      where: { teacherId },
      include: {
        class: {
          include: {
            _count: { select: { students: true } },
          },
        },
      },
    });

    const classIds = teacherClasses.map(tc => tc.classId);

    // Real assignments-due count (was TODO: 0)
    const assignmentsDue = classIds.length > 0
      ? await db.assignment.count({
          where: { classId: { in: classIds }, dueDate: { gte: new Date() } },
        }).catch(() => 0)
      : 0;

    const classes: CopilotOverview['classes'] = [];
    let totalStudents = 0;
    let totalActiveStudents = 0;
    let totalReviewsDue = 0;

    // classId → classData snapshot（避免杜撰：有證據才計算平均/失聯）
    const classDataMap = new Map<string, ClassDataSnapshot | null>();
    for (const tc of teacherClasses) {
      const classData = await this.loadClassData(tc.classId).catch(() => null);
      classDataMap.set(tc.classId, classData);
    }

    for (const tc of teacherClasses) {
      const classId = tc.classId;
      const classData = classDataMap.get(classId) ?? null;

      const studentCount = tc.class._count.students;
      totalStudents += studentCount;

      const avgMastery = classData?.avgMastery ?? 0;
      const reviewDue = classData?.reviewDue ?? 0;
      totalReviewsDue += reviewDue;

      // Real recent-activity filter (was TODO: totalStudents)
      const activeStudents = classData
        ? classData.students.filter(s => {
            const days = daysSinceActivity(s.lastActiveAt);
            return days !== null && days < 14;
          }).length
        : 0;
      totalActiveStudents += activeStudents;

      classes.push({
        classId,
        className: tc.class.name,
        studentCount,
        activeStudents,
        averageMastery: Math.round(avgMastery * 100),
        topConcern: classData?.grammarErrors?.[0] ?? 'Grammar',
        topConcernZh: classData?.grammarErrorsZh?.[0] ?? '文法',
        nextAction: reviewDue > 5 ? `${reviewDue} items due for review` : 'On track',
        nextActionZh: reviewDue > 5 ? `${reviewDue} 個項目待溫習` : '進度良好',
      });
    }

    // Urgent actions: 僅在班級有真實學生數據時發出（避免以 0 分 / 失聯杜撰警報）
    const urgentActions: CopilotOverview['urgentActions'] = [];
    for (const c of classes) {
      const classData = classDataMap.get(c.classId) ?? null;
      const hasData = classData !== null && classData.students.length > 0;
      if (hasData && c.averageMastery < 50) {
        urgentActions.push({
          type: 'risk',
          description: `${c.className} average mastery below 50% — intervention needed`,
          descriptionZh: `${c.className} 平均掌握度低於 50%——需要介入`,
          classId: c.classId,
          className: c.className,
        });
      }
      // 失聯警報必須基於真實活動數據
      if (hasData) {
        const inactiveCount = c.studentCount - c.activeStudents;
        if (inactiveCount > 0) {
          urgentActions.push({
            type: 'risk',
            description: `${c.className}: ${inactiveCount} students inactive for 14+ days`,
            descriptionZh: `${c.className}：${inactiveCount} 名學生超過14天未活動`,
            classId: c.classId,
            className: c.className,
          });
        }
      }
    }

    return {
      teacherId,
      generatedAt: new Date().toISOString(),
      classes,
      urgentActions,
      weeklySummary: {
        totalStudents,
        activeStudents: totalActiveStudents,
        assignmentsDue,
        pendingReviews: totalReviewsDue,
        newRisksDetected: urgentActions.filter(a => a.type === 'risk').length,
      },
    };
  }

  // ============================================
  // Private helpers
  // ============================================

  /** Verify a student belongs to a class (主班級 ∪ StudentClass) — throws if not */
  private async verifyStudentInClass(studentId: string, classId: string): Promise<void> {
    const primary = await db.user.findFirst({
      where: { id: studentId, role: 'student', classId },
      select: { id: true },
    });
    if (primary) return;
    const belongs = await db.studentClass.findFirst({
      where: { studentId, classId },
      select: { id: true },
    });
    if (!belongs) {
      throw new Error(`Student does not belong to class ${classId}`);
    }
  }

  /** Load real class data from DB — aggregates StudentTwin + LearningScience data */
  private async loadClassData(classId: string): Promise<ClassDataSnapshot> {
    // 1. Get all students in the class — 主班級（User.classId，admin import/sync 寫入）∪ StudentClass 混合上課
    const [primaryStudents, studentClasses] = await Promise.all([
      db.user.findMany({ where: { classId, role: 'student' }, select: { id: true } }),
      db.studentClass.findMany({ where: { classId }, select: { studentId: true } }),
    ]);
    const studentIds = Array.from(new Set([
      ...primaryStudents.map(u => u.id),
      ...studentClasses.map(sc => sc.studentId),
    ]));

    if (studentIds.length === 0) {
      return this.emptySnapshot();
    }

    // 2. Get student profiles (names, accuracy) from User table
    const users = await db.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, nameEn: true, nameZh: true, overallAccuracy: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // 2.5 Last-activity timestamps (login + practice) — monitoring signal
    const [loginAgg, practiceAgg] = await Promise.all([
      db.loginLog.groupBy({ by: ['userId'], _max: { loginAt: true }, where: { userId: { in: studentIds } } }),
      db.practiceSession.groupBy({ by: ['studentId'], _max: { startedAt: true }, where: { studentId: { in: studentIds } } }),
    ]);
    const lastActivity = new Map<string, Date>();
    for (const row of loginAgg) {
      const at = row._max.loginAt;
      if (at) lastActivity.set(row.userId, at);
    }
    for (const row of practiceAgg) {
      const at = row._max.startedAt;
      const existing = lastActivity.get(row.studentId);
      if (at && (!existing || at.getTime() > existing.getTime())) lastActivity.set(row.studentId, at);
    }

    // 3. Get mastery data from StudentMastery table
    const masteryRows = await db.studentMastery.findMany({
      where: { studentId: { in: studentIds } },
    });

    // Aggregate mastery by student and skill
    const skillKeys = ['grammar', 'vocabulary', 'reading', 'writing', 'listening'];
    const studentScoresMap = new Map<string, Record<string, number>>();
    const skillTotals: Record<string, number> = {};
    for (const sk of skillKeys) skillTotals[sk] = 0;

    for (const row of masteryRows) {
      if (!studentScoresMap.has(row.studentId)) {
        studentScoresMap.set(row.studentId, Object.fromEntries(skillKeys.map(k => [k, 0])));
      }
      const scores = studentScoresMap.get(row.studentId)!;
      // Map DB skill names to our skill keys
      const skillKey = row.skill.toLowerCase();
      if (skillKeys.includes(skillKey)) {
        // Take max mastery per skill per student
        scores[skillKey] = Math.max(scores[skillKey], row.masteryScore / 100);
      }
    }

    // Build student snapshots
    const students: StudentSnapshot[] = studentIds.map(sid => {
      const user = userMap.get(sid);
      const scores = studentScoresMap.get(sid) ?? Object.fromEntries(skillKeys.map(k => [k, 0]));
      return {
        studentId: sid,
        nameEn: user?.nameEn ?? null,
        nameZh: user?.nameZh ?? null,
        overallAccuracy: user?.overallAccuracy ?? null,
        scores,
        lastActiveAt: lastActivity.get(sid) ?? null,
      };
    });

    // Compute averages
    const studentScores: Array<Record<string, number>> = students.map(s => s.scores);
    const skillAvgs: Record<string, number> = {};
    for (const sk of skillKeys) {
      const vals = students.map(s => s.scores[sk] ?? 0);
      skillAvgs[sk] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
    const avgMastery = Object.values(skillAvgs).reduce((a, b) => a + b, 0) / Math.max(1, skillKeys.length);

    // 4. Get review due count from LearningScience
    const reviewDueCount = await db.learningReviewSchedule.count({
      where: {
        studentId: { in: studentIds },
        nextReviewAt: { lte: new Date() },
        isMastered: false,
      },
    });

    // 5. Get grammar error summaries from StudentMistakeSummary
    const mistakeRows = await db.studentMistakeSummary.findMany({
      where: { studentId: { in: studentIds } },
      orderBy: { mistakeCount: 'desc' },
      take: 5,
    });
    const grammarErrors = [...new Set(mistakeRows.map(r => r.grammarCategory))];
    const grammarErrorsZh = grammarErrors; // DB stores same values for now

    // 6. Compute accuracy and participation
    const accuracies = users.map(u => u.overallAccuracy ?? 0).filter(a => a > 0);
    const avgAccuracy = accuracies.length > 0 ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length : avgMastery;
    const participation = students.filter(s => Object.values(s.scores).some(v => v > 0)).length / Math.max(1, students.length);

    return {
      avgMastery,
      avgAccuracy,
      avgVelocity: 0, // 平台尚未量測學習速度 — 不杜撰數值
      participation,
      readingScore: skillAvgs.reading ?? 0,
      writingScore: skillAvgs.writing ?? 0,
      grammarErrors: grammarErrors.length > 0 ? grammarErrors : ['Tenses', 'Articles', 'Prepositions'],
      grammarErrorsZh: grammarErrorsZh.length > 0 ? grammarErrorsZh : ['時態', '冠詞', '介詞'],
      reviewDue: reviewDueCount,
      studentCount: students.length,
      skillAvgs,
      studentScores,
      students,
    };
  }

  /** Fallback empty snapshot when class has no students */
  private emptySnapshot(): ClassDataSnapshot {
    const skills = ['grammar', 'vocabulary', 'reading', 'writing', 'listening'];
    return {
      avgMastery: 0, avgAccuracy: 0, avgVelocity: 0, participation: 0,
      readingScore: 0, writingScore: 0,
      grammarErrors: [], grammarErrorsZh: [],
      reviewDue: 0, studentCount: 0,
      skillAvgs: Object.fromEntries(skills.map(s => [s, 0])),
      studentScores: [],
      students: [],
    };
  }

  private selectFocusSkills(data: ClassDataSnapshot): SkillDimension[] {
    const skills: SkillDimension[] = [];
    const sorted = Object.entries(data.skillAvgs).sort(([, a], [, b]) => (a as number) - (b as number));
    for (const [skill] of sorted.slice(0, 2)) skills.push(skill as SkillDimension);
    if (!skills.includes('writing')) skills.push('writing');
    return skills;
  }

  private buildDailyPlans(focusSkills: SkillDimension[], data: any): DailyPlan[] {
    const days: Array<'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday'> = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    return days.map((day, i) => {
      const skill = focusSkills[i % focusSkills.length];
      return {
        day, skill,
        topic: `${skill} practice`, topicZh: `${skill}練習`,
        activities: [
          { type: 'warm-up', description: 'Quick review quiz', descriptionZh: '快速複習測驗', durationMinutes: 5, difficulty: 'core' },
          { type: 'instruction', description: `Teach ${skill} concept`, descriptionZh: `教授${skill}概念`, durationMinutes: 15, difficulty: 'core' },
          { type: 'practice', description: 'Guided practice', descriptionZh: '指導練習', durationMinutes: 15, difficulty: 'core' },
        ],
        estimatedMinutes: 35,
        homework: [{ type: 'worksheet', description: `${skill} worksheet`, descriptionZh: `${skill}工作紙`, estimatedMinutes: 15, dueDate: this.addDays(i + 2) }],
      };
    });
  }

  private buildGrammarFocus(data: any): GrammarFocus {
    return {
      topics: data.grammarErrors.slice(0, 3).map((t: string, i: number) => ({ topic: t, topicZh: t, classErrorRate: 0, priority: 3 - i })),
      recommendedExercises: ['Fill-in-the-blank', 'Error correction'],
      recommendedExercisesZh: ['填充題', '錯誤修正'],
      commonMistakes: data.grammarErrors,
    };
  }

  private buildVocabularyFocus(data: any): VocabularyFocus {
    return {
      themes: ['Environment', 'Technology', 'Education'],
      targetWordCount: 20,
      recommendedWords: [
        { word: 'sustainable', meaning: 'able to continue over time', meaningZh: '可持續的', difficulty: 'B1' },
        { word: 'innovative', meaning: 'introducing new ideas', meaningZh: '創新的', difficulty: 'B2' },
      ],
      activities: ['Word matching', 'Sentence creation', 'Theme-based mind maps'],
      activitiesZh: ['詞彙配對', '造句練習', '主題心智圖'],
    };
  }

  private buildWritingFocus(data: any): WritingFocus {
    return {
      textTypes: [
        { type: 'Essay', typeZh: '文章', readiness: 0.6 },
        { type: 'Letter', typeZh: '書信', readiness: 0.7 },
      ],
      suggestedTopics: ['Environmental protection', 'Technology in education'],
      suggestedTopicsZh: ['環境保護', '教育科技'],
      rubricFocus: ['Content development', 'Language accuracy', 'Organization'],
    };
  }

  private nextMonday(): string {
    const d = new Date();
    d.setDate(d.getDate() + (8 - d.getDay()) % 7);
    return d.toISOString().slice(0, 10);
  }

  private addDays(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Platform-estimated level (1-5, NO stars) using the canonical cross-paper
   * thresholds (76/62/48/33 — percentage equivalents of Paper 2 CLO 16/13/10/7).
   * This is an uncalibrated platform estimate, never an official HKEAA grade.
   */
  private levelFromScore(score: number): string {
    const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
    if (pct >= 76) return '5';
    if (pct >= 62) return '4';
    if (pct >= 48) return '3';
    if (pct >= 33) return '2';
    return '1';
  }
}

export const teacherCopilotService = new TeacherCopilotService();

/** Verify that a teacher owns (teaches) a given class — used by API routes for authorization */
export async function verifyTeacherOwnsClass(teacherId: string, classId: string): Promise<boolean> {
  const row = await db.teacherClass.findFirst({
    where: { teacherId, classId },
    select: { id: true },
  });
  return row !== null;
}

/** Verify a student belongs to at least one of a teacher's classes (主班級 ∪ StudentClass) — returns the classId if found */
export async function resolveTeacherStudentClass(teacherId: string, studentId: string): Promise<string | null> {
  const primary = await db.user.findFirst({
    where: { id: studentId, role: 'student', class: { teachers: { some: { teacherId } } } },
    select: { classId: true },
  });
  if (primary?.classId) return primary.classId;
  const row = await db.studentClass.findFirst({
    where: {
      studentId,
      class: { teachers: { some: { teacherId } } },
    },
    select: { classId: true },
  });
  return row?.classId ?? null;
}
