// Sprint 38: TeacherCopilotService — full teacher intelligence suite
// Sprint 132: Integrated with StudentTwin + LearningScience for real data
import { db } from '@/shared/db/db';
import { DAY_MS, hkDayKey, hkDayOfWeek, hkStartOfDay } from '@/shared/utils/hk-date';
import { classifyActivityStatus } from '@/modules/teacher/monitoring/services/activity-service';
import { studentTwinService } from '@/modules/student/twin/services/student-twin-service';
import { GRAMMAR_CATEGORY_LABELS } from '@/modules/mistake/intelligence/types';
import { bucketKeyLabelZh } from '@/modules/mistake/intelligence/services/mistake-skill-breakdown';
// 2026-08-30 audit (R7): 正典跨卷估級門檻（76/62/48/33）— 移除本地重複實作，避免漂移。
import { estimateLevelFromScore100 } from '@/modules/ai/core/level-estimation';
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

/**
 * A student is "inactive" when there is no evidence of activity at all,
 * or the latest activity was 14+ days ago (self-study disengagement signal).
 *
 * 2026-09-21：天數與門檻一律委派共用的 `classifyActivityStatus()`（單一 owner，
 * 香港日界線），Copilot 不再自帶一套 day 計算（該本地函式已刪除）。
 */
function isInactiveStudent(s: StudentSnapshot, now: Date = new Date()): boolean {
  const status = classifyActivityStatus(s.lastActiveAt, now).status;
  return status === 'inactive' || status === 'never-started';
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
        // 2026-08-30 audit (R7): 無錯題數據時以中性「文法溫習」為建議主題（非班級數據宣稱）。
        topic: classData.grammarErrors[0] ?? 'Grammar review', topicZh: classData.grammarErrors[0] ?? '文法溫習',
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

    // Rank only students with measured mastery; unmeasured skills are not zeroes.
    const studentRankings = classData.students
      .map(s => {
        const entries = Object.entries(s.scores).filter(([, score]) => score > 0);
        if (entries.length === 0) return null;
        const overallScore = Math.round(
          (entries.reduce((sum, [, score]) => sum + score, 0) / entries.length) * 100,
        );
        const strongest = [...entries].sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'grammar';
        const weakest = [...entries].sort(([, a], [, b]) => a - b)[0]?.[0] ?? 'grammar';
        return {
          studentId: s.studentId,
          name: s.nameEn ?? s.nameZh ?? `Student ${s.studentId.slice(0, 6)}`,
          overallScore,
          strongestSkill: strongest,
          weakestSkill: weakest,
          trend: 'stable' as const,
        };
      })
      .filter((student): student is NonNullable<typeof student> => student !== null)
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, 10);

    // Risk students: disengaged first, then bottom 3 by average score.
    // In self-study monitoring, inactivity is the strongest red flag.
    const now = new Date();
    const measuredAverage = (student: StudentSnapshot): number | null => {
      const measured = Object.values(student.scores).filter(score => score > 0);
      return measured.length > 0 ? measured.reduce((sum, score) => sum + score, 0) / measured.length : null;
    };
    const sorted = [...classData.students].sort((a, b) => {
      const aAvg = measuredAverage(a);
      const bAvg = measuredAverage(b);
      if (aAvg === null && bAvg === null) return 0;
      if (aAvg === null) return 1;
      if (bAvg === null) return -1;
      return aAvg - bAvg;
    });
    const inactive = sorted.filter(s => isInactiveStudent(s, now));
    const scored = sorted.filter(s => !isInactiveStudent(s, now) && measuredAverage(s) !== null);
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
      const entries = Object.entries(s.scores).filter(([, value]) => value > 0);
      const avg = measuredAverage(s)!;
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
        classHkdseLevel: estimateLevelFromScore100(Math.round(classData.avgMastery * 100)),
        participationRate: Math.round(classData.participation * 100),
        // 2026-08-30 audit (R7): 班級是否有真實掌握度證據 — 無數據前端顯示「數據不足」。
        hasData: classData.students.some(s => Object.values(s.scores).some(v => v > 0)),
      },
      skillBreakdown: (['grammar', 'vocabulary', 'reading', 'writing', 'listening'] as SkillDimension[]).map(skill => ({
        skill,
        averageScore: Math.round((classData.skillAvgs[skill] ?? 0) * 100),
        // 2026-08-30 audit (R7): 實際量測「有該技能數據且 <70%」的學生數 —
        // 不再以 (1 − 班級平均) × 人數 推估冒充真實人數。
        belowThreshold: classData.students.filter(s => (s.scores[skill] ?? 0) > 0 && (s.scores[skill] ?? 0) < 0.7).length,
        trend: (classData.skillAvgs[skill] ?? 0) > 0.6 ? 'stable' : 'improving' as const,
      })),
      studentRankings,
      weaknessSummary: {
        topGrammarWeaknesses: classData.grammarErrors.slice(0, 3),
        // 2026-08-30 audit (R7): 平台無詞彙/寫作/閱讀錯題聚合資料 —
        // 不再以硬編碼清單冒充班級分析結果。
        topVocabularyGaps: [],
        commonWritingErrors: [],
        readingComprehensionIssues: [],
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
      // 2026-08-30 audit (R7): 無掌握度/準確率證據的學生不再以 0.5 冒充
      // 「50% 預測分數」— 一律回傳 null，前端顯示「數據不足」。
      const hasEvidence = Object.values(s.scores).some(v => v > 0) || (s.overallAccuracy ?? 0) > 0;
      if (!hasEvidence) {
        return {
          studentId: s.studentId,
          name: s.nameEn ?? s.nameZh ?? `Student ${s.studentId.slice(0, 6)}`,
          predictedLevel: null,
          predictedScore: null,
          confidenceBand: null,
          strongestPaper: null,
          weakestPaper: null,
          readinessPercentage: null,
        };
      }
      const scores = Object.values(s.scores);
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      return {
        studentId: s.studentId,
        name: s.nameEn ?? s.nameZh ?? `Student ${s.studentId.slice(0, 6)}`,
        predictedLevel: estimateLevelFromScore100(Math.round(avg * 100)),
        predictedScore: Math.round(avg * 100),
        confidenceBand: { low: Math.round(Math.max(0, avg * 100 - 12)), high: Math.round(Math.min(100, avg * 100 + 8)) },
        strongestPaper: (classData.skillAvgs.writing ?? 0) > (classData.skillAvgs.reading ?? 0) ? 'Paper 2 Writing' : 'Paper 1 Reading',
        weakestPaper: (classData.skillAvgs.reading ?? 0) < (classData.skillAvgs.writing ?? 0) ? 'Paper 1 Reading' : 'Paper 2 Writing',
        readinessPercentage: Math.round(avg * 100),
      };
    });

    const scoredPredictions = studentPredictions.filter(p => p.predictedLevel !== null);

    // 2026-08-30 audit (R7): 「最弱卷」由真實班級數據決定（僅考慮有數據的技能）；
    // 全班無數據時不再硬編碼「卷一是最弱項」。
    const evidenceSkills = (['reading', 'writing', 'listening'] as const)
      .filter(k => (classData.skillAvgs[k] ?? 0) > 0);
    const PAPER_LABEL: Record<'reading' | 'writing' | 'listening', [string, string]> = {
      reading: ['Paper 1 Reading', '卷一 閱讀'],
      writing: ['Paper 2 Writing', '卷二 寫作'],
      listening: ['Paper 3 Listening', '卷三 聆聽'],
    };
    const weakestPaper = evidenceSkills.reduce<{ key: 'reading' | 'writing' | 'listening'; avg: number }>(
      (acc, k) => ((classData.skillAvgs[k] ?? 0) < acc.avg ? { key: k, avg: classData.skillAvgs[k] ?? 0 } : acc),
      { key: evidenceSkills[0] ?? 'reading', avg: classData.skillAvgs[evidenceSkills[0] ?? 'reading'] ?? 0 },
    ).key;

    return {
      classId,
      generatedAt: new Date().toISOString(),
      predictedClassAverage: Math.round(classData.avgMastery * 100),
      // 2026-08-30 audit: platform-defined, transparent estimates. Pass rate =
      // fraction of students at Level 2+ and star rate = fraction at Level 5
      // under the canonical cross-paper thresholds (76/62/48/33). These are
      // UNCALIBRATED platform estimates, not HKEAA-published predictions.
      predictedPassRate: scoredPredictions.length > 0
        ? Math.round((100 * scoredPredictions.filter(p => ['2', '3', '4', '5'].includes(p.predictedLevel!)).length) / scoredPredictions.length)
        : null,
      predictedStarRate: scoredPredictions.length > 0
        ? Math.round((100 * scoredPredictions.filter(p => p.predictedLevel === '5').length) / scoredPredictions.length)
        : null,
      studentPredictions,
      paperAnalysis: [
        // 2026-08-30 audit (R7): 平台無逐題型班級數據 — topicsNeedingReview
        // 不再以硬編碼清單冒充班級分析。
        { paper: 'Paper 1 Reading', paperZh: '卷一 閱讀', classAverage: Math.round((classData.skillAvgs.reading ?? 0) * 100), topicsNeedingReview: [], topicsNeedingReviewZh: [] },
        { paper: 'Paper 2 Writing', paperZh: '卷二 寫作', classAverage: Math.round((classData.skillAvgs.writing ?? 0) * 100), topicsNeedingReview: [], topicsNeedingReviewZh: [] },
        { paper: 'Paper 3 Listening', paperZh: '卷三 聆聽', classAverage: Math.round((classData.skillAvgs.listening ?? 0) * 100), topicsNeedingReview: [], topicsNeedingReviewZh: [] },
      ],
      recommendations: evidenceSkills.length > 0
        ? [
            `Focus revision on ${PAPER_LABEL[weakestPaper][0]} — lowest class average`,
            'Run mock exam under timed conditions',
          ]
        : ['Run mock exam under timed conditions'],
      recommendationsZh: evidenceSkills.length > 0
        ? [
            `重點溫習${PAPER_LABEL[weakestPaper][1]}——班級平均最低`,
            '進行限時模擬考試',
          ]
        : ['進行限時模擬考試'],
    };
  }

  /** Build overview dashboard for a teacher — powered by StudentTwin + LearningScience */
  async getOverview(teacherId: string): Promise<CopilotOverview> {
    // Load teacher's classes from DB
    const teacherClasses = await db.teacherClass.findMany({
      where: { teacherId, class: { name: { not: 'Demo' } } },
      include: {
        class: {
          include: {
            _count: { select: { students: true } },
          },
        },
      },
    });

    const classIds = teacherClasses.map(tc => tc.classId);

    // 2026-08-30 audit (R7): 掌握度證據 = 班級內至少一名學生有真實掌握度/準確率資料。
    const hasMasteryEvidence = (classData: ClassDataSnapshot | null): boolean =>
      classData !== null && classData.students.some(s =>
        Object.values(s.scores).some(v => v > 0) || (s.overallAccuracy ?? 0) > 0,
      );

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
    // 2026-09-21 稽核：改為平行載入（舊碼 `for … await` 逐班序列執行，
    // 每班 8+ 個聚合查詢 → Copilot 首頁回應時間隨班數線性增加）。
    const classDataMap = new Map<string, ClassDataSnapshot | null>();
    const snapshots = await Promise.all(
      teacherClasses.map(tc => this.loadClassData(tc.classId).catch(() => null)),
    );
    teacherClasses.forEach((tc, i) => {
      classDataMap.set(tc.classId, snapshots[i]);
    });

    for (const tc of teacherClasses) {
      const classId = tc.classId;
      const classData = classDataMap.get(classId) ?? null;

      const studentCount = classData?.studentCount ?? 0;
      totalStudents += studentCount;

      const avgMastery = classData?.avgMastery ?? 0;
      const reviewDue = classData?.reviewDue ?? 0;
      totalReviewsDue += reviewDue;

      // Real recent-activity filter (was TODO: totalStudents)
      // 2026-09-21：改用共用的門檻 owner（香港日界線），「從未開始」同樣
      // 不算活躍，但與「長期未活動」在 UI 上可分開呈現。
      const activeStudents = classData
        ? classData.students.filter(s => {
            const { status } = classifyActivityStatus(s.lastActiveAt);
            return status === 'active' || status === 'low';
          }).length
        : 0;
      totalActiveStudents += activeStudents;

      classes.push({
        classId,
        className: tc.class.name,
        studentCount,
        activeStudents,
        averageMastery: Math.round(avgMastery * 100),
        // 2026-08-30 audit (R7): 掌握度證據旗標 — 無數據班級前端顯示「數據不足」而非 0%。
        masteryEvidence: hasMasteryEvidence(classData),
        // 2026-08-30 audit (R7): 無錯題數據時不回傳「Grammar」冒充班級首要關注點。
        topConcern: classData?.grammarErrors?.[0] ?? null,
        topConcernZh: classData?.grammarErrorsZh?.[0] ?? null,
        nextAction: reviewDue > 5 ? `${reviewDue} items due for review` : 'On track',
        nextActionZh: reviewDue > 5 ? `${reviewDue} 個項目待溫習` : '進度良好',
      });
    }

    // Urgent actions: 僅在班級有真實學生數據時發出（避免以 0 分 / 失聯杜撰警報）
    const urgentActions: CopilotOverview['urgentActions'] = [];
    for (const c of classes) {
      const classData = classDataMap.get(c.classId) ?? null;
      // 2026-08-30 audit (R7): 掌握度警報必須有真實掌握度證據 —
      // 全零分（無數據）班級不得觸發「平均掌握度低於 50%」。
      if (hasMasteryEvidence(classData) && c.averageMastery < 50) {
        urgentActions.push({
          type: 'risk',
          description: `${c.className} average mastery below 50% — intervention needed`,
          descriptionZh: `${c.className} 平均掌握度低於 50%——需要介入`,
          classId: c.classId,
          className: c.className,
        });
      }
      // 失聯警報必須基於真實活動數據（無活動記錄 = 從未開始，S133 設計紅燈）
      if (classData !== null && classData.students.length > 0) {
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
      db.user.findMany({ where: { classId, role: 'student', level: { not: 'Demo' } }, select: { id: true } }),
      db.studentClass.findMany({
        where: { classId, student: { role: 'student', level: { not: 'Demo' } } },
        select: { studentId: true },
      }),
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
      // 2026-08-30 audit (R7): 無該技能數據的學生不再以 0 分拉低班級平均。
      const vals = students.map(s => s.scores[sk] ?? 0).filter(v => v > 0);
      skillAvgs[sk] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
    const measuredSkillAvgs = Object.values(skillAvgs).filter(v => v > 0);
    const avgMastery = measuredSkillAvgs.length > 0
      ? measuredSkillAvgs.reduce((a, b) => a + b, 0) / measuredSkillAvgs.length
      : 0;

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
    // 2026-09-14: 弱項類別現為技能／題型 bucket key，需解析為中文標籤後才給教師看
    const grammarErrorsZh = grammarErrors.map(k => GRAMMAR_CATEGORY_LABELS[k] ?? bucketKeyLabelZh(k) ?? k);

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
      grammarErrors: grammarErrors.length > 0 ? grammarErrors : [],
      grammarErrorsZh: grammarErrorsZh.length > 0 ? grammarErrorsZh : [],
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
    // 2026-09-20 稽核：以香港日界線計算（原本本地/UTC）
    const days = (8 - hkDayOfWeek()) % 7;
    return hkDayKey(new Date(hkStartOfDay().getTime() + days * DAY_MS));
  }

  private addDays(n: number): string {
    return hkDayKey(new Date(hkStartOfDay().getTime() + n * DAY_MS));
  }

  /**
   * 平台估算等級（1-5，不輸出星級）一律使用正典 estimateLevelFromScore100
   * （76/62/48/33 — Paper 2 CLO 16/13/10/7 的百分比等值）。
   * 未校準的平台估算，絕非官方 HKEAA 評級。
   * 2026-08-30 audit (R7): 本地重複實作已移除，統一由 ai/core/level-estimation 提供。
   */
}

export const teacherCopilotService = new TeacherCopilotService();

/** Verify that a teacher owns (teaches) a given class — used by API routes for authorization */
export async function verifyTeacherOwnsClass(teacherId: string, classId: string): Promise<boolean> {
  const row = await db.teacherClass.findFirst({
    where: { teacherId, classId, class: { name: { not: 'Demo' } } },
    select: { id: true },
  });
  return row !== null;
}

/** Verify a student belongs to at least one of a teacher's classes (主班級 ∪ StudentClass) — returns the classId if found */
export async function resolveTeacherStudentClass(teacherId: string, studentId: string): Promise<string | null> {
  const primary = await db.user.findFirst({
    where: { id: studentId, role: 'student', class: { name: { not: 'Demo' }, teachers: { some: { teacherId } } } },
    select: { classId: true },
  });
  if (primary?.classId) return primary.classId;
  const row = await db.studentClass.findFirst({
    where: {
      studentId,
      class: { name: { not: 'Demo' }, teachers: { some: { teacherId } } },
    },
    select: { classId: true },
  });
  return row?.classId ?? null;
}
