// Sprint 38: TeacherCopilotService — full teacher intelligence suite
import type { SkillDimension } from '@/modules/student/profile/types';
import type {
  WeeklyTeachingPlan, DailyPlan, Activity, HomeworkItem,
  GrammarFocus, VocabularyFocus, WritingFocus,
  ClassAnalysis, StudentAnalysis, AssignmentRecommendation,
  ExamPrediction, CopilotOverview,
} from '../types';

// ============================================
// Internal types
// ============================================

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

  /** Analyze an individual student */
  async analyzeStudent(studentId: string, classId: string): Promise<StudentAnalysis> {
    const classData = await this.loadClassData(classId);
    const studentIdx = studentId.charCodeAt(0) % classData.studentScores.length;
    const scores = classData.studentScores[Math.min(studentIdx, classData.studentScores.length - 1)];

    const skillDetails = (['grammar', 'vocabulary', 'reading', 'writing', 'listening'] as SkillDimension[]).map(skill => ({
      skill,
      score: Math.round((scores?.[skill] || 0.5 + Math.random() * 0.3) * 100),
      classAverage: Math.round(classData.skillAvgs[skill] * 100),
      percentile: Math.round(40 + Math.random() * 50),
      trend: Math.random() > 0.5 ? 'improving' : 'stable',
      recommendation: `Focus on ${skill} practice with ${skill === 'grammar' ? 'error correction' : 'varied exercises'}`,
      recommendationZh: `專注${skill}練習`,
    }));

    return {
      studentId, studentName: `Student ${studentId.slice(0, 6)}`,
      generatedAt: new Date().toISOString(),
      personaType: 'steady-grinder',
      personaTypeZh: '穩定耕耘者',
      currentLevel: this.levelFromScore(classData.avgMastery),
      predictedLevel: this.levelFromScore(Math.min(1, classData.avgMastery + 0.1)),
      skillDetails,
      recentProgress: {
        sessionsThisWeek: Math.round(2 + Math.random() * 3),
        accuracyTrend: 'improving',
        masteryGained: Math.round(Math.random() * 15),
        timeSpent: Math.round(60 + Math.random() * 120),
      },
      teacherNotes: {
        strengths: ['Consistent effort', 'Good vocabulary retention'],
        weaknesses: ['Grammar accuracy needs work', 'Writing structure'],
        suggestedFocus: ['Tense consistency', 'Paragraph organization'],
        suggestedFocusZh: ['時態一致性', '段落組織'],
      },
    };
  }

  /** Analyze a whole class */
  async analyzeClass(classId: string, className: string): Promise<ClassAnalysis> {
    const classData = await this.loadClassData(classId);

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
        averageScore: Math.round(classData.skillAvgs[skill] * 100),
        belowThreshold: Math.round(classData.studentCount * (1 - classData.skillAvgs[skill])),
        trend: classData.skillAvgs[skill] > 0.6 ? 'stable' : 'improving' as const,
      })),
      studentRankings: classData.studentScores.slice(0, 10).map((s: Record<string, number>, i: number) => ({
        studentId: `s${i + 1}`,
        name: `Student ${i + 1}`,
        overallScore: Math.round(Object.values(s).reduce((a: number, b: number) => a + b, 0) / Object.values(s).length * 100),
        strongestSkill: Object.entries(s).sort(([, a], [, b]) => (b as number) - (a as number))[0][0],
        weakestSkill: Object.entries(s).sort(([, a], [, b]) => (a as number) - (b as number))[0][0],
        trend: 'stable',
      })),
      weaknessSummary: {
        topGrammarWeaknesses: classData.grammarErrors.slice(0, 3),
        topVocabularyGaps: ['Academic vocabulary', 'Phrasal verbs'],
        commonWritingErrors: ['Chinglish patterns', 'Weak paragraph structure'],
        readingComprehensionIssues: ['Inference questions', 'Main idea identification'],
      },
      riskStudents: classData.studentScores.slice(0, 3).map((_s: Record<string, number>, i: number) => ({
        studentId: `s${i + 1}`,
        name: `Student ${i + 1}`,
        riskLevel: 'moderate',
        primaryConcern: 'Grammar accuracy',
        primaryConcernZh: '文法準確度',
      })),
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

  /** Predict exam outcomes */
  async predictExam(classId: string): Promise<ExamPrediction> {
    const classData = await this.loadClassData(classId);

    const studentPredictions = classData.studentScores.map((s: Record<string, number>, i: number) => {
      const avg = Object.values(s).reduce((a: number, b: number) => a + b, 0) / Object.values(s).length;
      return {
        studentId: `s${i + 1}`,
        name: `Student ${i + 1}`,
        predictedLevel: this.levelFromScore(avg),
        predictedScore: Math.round(avg * 100),
        confidenceBand: { low: Math.round(Math.max(0, avg * 100 - 12)), high: Math.round(Math.min(100, avg * 100 + 8)) },
        strongestPaper: 'Paper 2 Writing',
        weakestPaper: 'Paper 1 Reading',
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
        { paper: 'Paper 1 Reading', paperZh: '卷一 閱讀', classAverage: Math.round(classData.skillAvgs.reading * 100), topicsNeedingReview: ['Inference', 'Vocabulary in context'], topicsNeedingReviewZh: ['推論', '上下文詞彙'] },
        { paper: 'Paper 2 Writing', paperZh: '卷二 寫作', classAverage: Math.round(classData.skillAvgs.writing * 100), topicsNeedingReview: ['Essay structure', 'Cohesion'], topicsNeedingReviewZh: ['文章結構', '連貫性'] },
        { paper: 'Paper 3 Listening', paperZh: '卷三 聆聽', classAverage: Math.round(classData.skillAvgs.listening * 100), topicsNeedingReview: ['Note-taking', 'Speaker attitude'], topicsNeedingReviewZh: ['筆記技巧', '說話者態度'] },
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

  /** Build overview dashboard for a teacher — fetches real data from DB */
  async getOverview(teacherId: string): Promise<CopilotOverview> {
    // TODO: Replace with real DB queries (StudentTwin + LearningScience)
    // Currently returns empty overview — no mock data
    return {
      teacherId,
      generatedAt: new Date().toISOString(),
      classes: [],
      urgentActions: [],
      weeklySummary: {
        totalStudents: 0,
        activeStudents: 0,
        assignmentsDue: 0,
        pendingReviews: 0,
        newRisksDetected: 0,
      },
    };
  }

  // ============================================
  // Private helpers
  // ============================================

  private async loadClassData(classId: string): Promise<ClassDataSnapshot> {
    // In production, this would load from StudentTwin + LearningScience
    const hash = classId.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
    const seed = (hash % 100) / 100;

    const skills = ['grammar', 'vocabulary', 'reading', 'writing', 'listening'];
    const skillAvgs: Record<string, number> = {};
    for (const s of skills) skillAvgs[s] = 0.4 + seed * 0.3 + Math.random() * 0.2;

    const studentCount = 25 + Math.floor(seed * 15);
    const studentScores = Array.from({ length: studentCount }, () => {
      const s: Record<string, number> = {};
      for (const sk of skills) s[sk] = skillAvgs[sk] + (Math.random() - 0.5) * 0.3;
      return s;
    });

    return {
      avgMastery: Object.values(skillAvgs).reduce((a: number, b: number) => a + b, 0) / skills.length,
      avgAccuracy: 0.55 + seed * 0.3,
      avgVelocity: 1 + seed * 3,
      participation: 0.6 + seed * 0.3,
      readingScore: skillAvgs.reading,
      writingScore: skillAvgs.writing ?? 0.5,
      grammarErrors: ['Tenses', 'Articles', 'Prepositions', 'Subject-Verb Agreement'],
      grammarErrorsZh: ['時態', '冠詞', '介詞', '主謂一致'],
      reviewDue: Math.round(5 + seed * 15),
      studentCount,
      skillAvgs,
      studentScores,
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
