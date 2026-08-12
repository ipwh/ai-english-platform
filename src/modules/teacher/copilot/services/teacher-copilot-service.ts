// Sprint 38: TeacherCopilotService — full teacher intelligence suite
// Sprint 132: Integrated with StudentTwin + LearningScience for real data
import { db } from '@/shared/db/db';
import { studentTwinService } from '@/modules/student/twin/services/student-twin-service';
import type { SkillDimension } from '@/modules/student/profile/types';
import type { StudentTwin } from '@/modules/student/twin/types';
import type {
  WeeklyTeachingPlan, DailyPlan, Activity, HomeworkItem,
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

    const personaType = twin?.persona?.type ?? 'steady-grinder';
    const knowledge = twin?.knowledge;
    const risks = twin?.risks;
    const habits = twin?.habits;
    const predictions = twin?.predictions;
    const identity = twin?.dashboard?.summary;

    // Build skill details from twin knowledge state, with class-data fallback
    const skillDetails: StudentAnalysis['skillDetails'] = [];
    if (knowledge?.currentMastery && Object.keys(knowledge.currentMastery).length > 0) {
      for (const [skill, score] of Object.entries(knowledge.currentMastery)) {
        const classAvg = classData?.skillAvgs?.[skill] ?? 0;
        skillDetails.push({
          skill: skill as SkillDimension,
          score: Math.round(score * 100),
          classAverage: Math.round(classAvg * 100),
          percentile: Math.round(40 + score * 50),
          trend: (twin?.knowledge?.strongSkills?.find(s => s.skill === skill)?.trend ?? 'stable') as string,
          recommendation: skill === 'grammar' ? 'Focus on error correction exercises' : `Practice ${skill} with varied exercises`,
          recommendationZh: skill === 'grammar' ? '專注錯誤修正練習' : `多元化${skill}練習`,
        });
      }
    } else if (classData) {
      // Fallback: use class averages when twin data unavailable
      const skills = ['grammar', 'vocabulary', 'reading', 'writing', 'listening'] as SkillDimension[];
      for (const skill of skills) {
        const classAvg = classData.skillAvgs?.[skill] ?? 0.5;
        skillDetails.push({
          skill,
          score: Math.round(classAvg * 100),
          classAverage: Math.round(classAvg * 100),
          percentile: 50,
          trend: 'stable',
          recommendation: `Focus on ${skill} practice`,
          recommendationZh: `專注${skill}練習`,
        });
      }
    }

    return {
      studentId,
      studentName: identity?.estimatedLevel
        ? (twin?.dashboard?.summary as Record<string, unknown>)?.studentName as string ?? `Student ${studentId.slice(0, 6)}`
        : `Student ${studentId.slice(0, 6)}`,
      generatedAt: new Date().toISOString(),
      personaType: personaType as StudentAnalysis['personaType'],
      personaTypeZh: personaMap[personaType] ?? '穩定耕耘者',
      currentLevel: knowledge?.estimatedHkdseLevel ?? this.levelFromScore(classData?.avgMastery ?? 0.5),
      predictedLevel: predictions?.predictedHkdseLevel ?? this.levelFromScore(Math.min(1, (classData?.avgMastery ?? 0.5) + 0.1)),
      skillDetails,
      recentProgress: {
        sessionsThisWeek: habits?.sessionsPerWeek ?? Math.round(2 + Math.random() * 3),
        accuracyTrend: risks?.overallRisk === 'high' ? 'declining' : 'improving',
        masteryGained: Math.round((predictions?.predictedExamScore ?? 60) - (knowledge?.currentMastery ? Object.values(knowledge.currentMastery).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(knowledge.currentMastery).length) * 100 : 50)),
        timeSpent: (habits?.avgSessionMinutes ?? 20) * (habits?.sessionsPerWeek ?? 3),
      },
      teacherNotes: {
        strengths: twin?.knowledge?.strongSkills?.slice(0, 2).map(s => s.skill) ?? ['Consistent effort'],
        weaknesses: twin?.knowledge?.weakSkills?.slice(0, 2).map(s => s.skill) ?? ['Grammar accuracy'],
        suggestedFocus: risks?.mitigationStrategies?.slice(0, 2) ?? ['Tense consistency', 'Paragraph organization'],
        suggestedFocusZh: risks?.mitigationStrategiesZh?.slice(0, 2) ?? ['時態一致性', '段落組織'],
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

    // Risk students: bottom 3 by average score
    const sorted = [...classData.students].sort((a, b) => {
      const aAvg = Object.values(a.scores).reduce((s, v) => s + v, 0) / Math.max(1, Object.values(a.scores).length);
      const bAvg = Object.values(b.scores).reduce((s, v) => s + v, 0) / Math.max(1, Object.values(b.scores).length);
      return aAvg - bAvg;
    });
    const riskStudents = sorted.slice(0, 3).map(s => ({
      studentId: s.studentId,
      name: s.nameEn ?? s.nameZh ?? `Student ${s.studentId.slice(0, 6)}`,
      riskLevel: (Object.values(s.scores).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(s.scores).length)) < 0.4 ? 'high' : 'moderate',
      primaryConcern: 'Grammar accuracy',
      primaryConcernZh: '文法準確度',
    }));

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
      predictedPassRate: Math.round(Math.min(95, classData.avgMastery * 100 + 10)),
      predictedStarRate: Math.round(Math.max(0, classData.avgMastery * 100 - 50)),
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

    const classes: CopilotOverview['classes'] = [];
    let totalStudents = 0;
    let totalReviewsDue = 0;

    for (const tc of teacherClasses) {
      const classId = tc.classId;
      const classData = await this.loadClassData(classId).catch(() => null);

      const studentCount = tc.class._count.students;
      totalStudents += studentCount;

      const avgMastery = classData?.avgMastery ?? 0;
      const reviewDue = classData?.reviewDue ?? 0;
      totalReviewsDue += reviewDue;

      classes.push({
        classId,
        className: tc.class.name,
        studentCount,
        averageMastery: Math.round(avgMastery * 100),
        topConcern: classData?.grammarErrors?.[0] ?? 'Grammar',
        topConcernZh: classData?.grammarErrorsZh?.[0] ?? '文法',
        nextAction: reviewDue > 5 ? `${reviewDue} items due for review` : 'On track',
        nextActionZh: reviewDue > 5 ? `${reviewDue} 個項目待溫習` : '進度良好',
      });
    }

    // Urgent actions: classes with high review debt or low mastery
    const urgentActions: CopilotOverview['urgentActions'] = [];
    for (const c of classes) {
      if ((c.averageMastery) < 50) {
        urgentActions.push({
          type: 'risk',
          description: `${c.className} average mastery below 50% — intervention needed`,
          descriptionZh: `${c.className} 平均掌握度低於 50%——需要介入`,
          classId: c.classId,
          className: c.className,
        });
      }
    }

    return {
      teacherId,
      generatedAt: new Date().toISOString(),
      classes,
      urgentActions,
      weeklySummary: {
        totalStudents,
        activeStudents: totalStudents, // TODO: filter by recent activity
        assignmentsDue: 0, // TODO: query assignments
        pendingReviews: totalReviewsDue,
        newRisksDetected: urgentActions.filter(a => a.type === 'risk').length,
      },
    };
  }

  // ============================================
  // Private helpers
  // ============================================

  /** Verify a student belongs to a class — throws if not */
  private async verifyStudentInClass(studentId: string, classId: string): Promise<void> {
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
    // 1. Get all students in the class
    const studentClasses = await db.studentClass.findMany({
      where: { classId },
      select: { studentId: true },
    });
    const studentIds = studentClasses.map(sc => sc.studentId);

    if (studentIds.length === 0) {
      return this.emptySnapshot();
    }

    // 2. Get student profiles (names, accuracy) from User table
    const users = await db.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, nameEn: true, nameZh: true, overallAccuracy: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));

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
      avgVelocity: 1.5, // TODO: compute from learning velocity data
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
      topics: data.grammarErrors.slice(0, 3).map((t: string, i: number) => ({ topic: t, topicZh: t, classErrorRate: 30 + i * 10, priority: 3 - i })),
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

  private levelFromScore(score: number): string {
    if (score >= 0.9) return '5**';
    if (score >= 0.8) return '5';
    if (score >= 0.7) return '4';
    if (score >= 0.55) return '3';
    if (score >= 0.4) return '2';
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

/** Verify a student belongs to at least one of a teacher's classes — returns the classId if found */
export async function resolveTeacherStudentClass(teacherId: string, studentId: string): Promise<string | null> {
  const row = await db.studentClass.findFirst({
    where: {
      studentId,
      class: { teachers: { some: { teacherId } } },
    },
    select: { classId: true },
  });
  return row?.classId ?? null;
}
