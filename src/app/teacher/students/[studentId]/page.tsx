// ============================================
// 教師端 — 個別學生詳情與學習數據（完整版）
// ============================================
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Mail, GraduationCap, Target, BookOpen, AlertCircle,
  Loader2, TrendingUp, Clock, Hash, Zap, Star, Flame,
  FileText, Download, BarChart3, Languages, ChevronDown, ChevronUp,
} from 'lucide-react';
import { getGradeLabel } from '@/shared/utils/nav';
import { useT } from '@/hooks/use-i18n';
import { useAppStore } from '@/store/appStore';
import { hkMonthKey, nextMonthKey, previousMonthKey } from '@/shared/utils/hk-date';
import { formatHistoryMonthLabel, formatHistoryDayLabel, formatHistoryTime } from '@/shared/utils/practice-history-format';
import { getAllBadges } from '@/modules/student/progress/services/gamification';

interface StudentDetail {
  id: string; email: string; nameZh?: string; nameEn?: string;
  level?: string; overallAccuracy?: number; classNumber?: number;
  xp?: number; badgeIds?: string; streakDays?: number; academicYear?: string;
  class?: { id: string; name: string; gradeLevel: string } | null;
}

interface PracticeSession {
  id: string; skill: string; skillZh: string; difficulty: string;
  totalQuestions: number; correctCount: number; source: string;
  startedAt: string; completedAt?: string;
  verified?: {
    status: 'verified' | 'unverifiable';
    totalQuestions?: number;
    correctCount?: number;
  } | null;
  /**
   * 逐題顯示資料。全部欄位皆為 optional：API 只保證回傳「題目身分 + 評分證據」，
   * 顯示層必須對缺漏欄位 fail-safe，絕不對 undefined 呼叫 String 方法。
   */
  answers?: {
    questionIndex?: number;
    questionType?: string;
    questionPrompt?: string;
    correctAnswer?: string;
    studentAnswer?: string;
    isCorrect?: boolean;
    timeSpent?: number | null;
    result?: string | null;
  }[];
}

interface MistakeData {
  id: string; studentAnswer: string; correctAnswer: string;
  mistakeType: string; aiExplanation?: string;
  reviewed: boolean; inReviewList: boolean; createdAt: string;
}

interface WritingDraft {
  id: string; title: string; prompt: string; status: string;
  aiSuggestions?: string; teacherComment?: string;
  createdAt: string; updatedAt: string;
}

interface XpTransaction { id: string; event: string; xpAmount: number; createdAt: string; metadata?: string; }

interface WeeklySnapshot {
  id: string; weekStart: string; totalQuestions: number; correctCount: number;
  accuracy: number; sessionsCount: number; xpGained: number; streakDays: number; wordsLearned: number;
}

interface CumulativeSkillTotalView {
  skill: string;
  skillZh: string;
  /** 全歷史累積已驗證題數 */
  questions: number;
  /** 全歷史累積答對題數 */
  correct: number;
}

interface FullStudentData {
  student: StudentDetail;
  practiceSessions: PracticeSession[];
  /** 2026-09-23：全歷史累積技能投影（累積數字唯一來源） */
  cumulativeSkillTotals: CumulativeSkillTotalView[];
  /** 2026-10-01：全歷史「練習次數」（單列 SQL 聚合；讀取失敗為 null → 顯示「—」） */
  sessionsCount: number | null;
  mistakes: MistakeData[];
  vocab: { total: number; mastered: number };
  writingDrafts: WritingDraft[];
  xpTransactions: XpTransaction[];
  weeklySnapshots: WeeklySnapshot[];
}

// === 練習歷史（逐日回顧；2026-10-01）===
// 教師端原本只能看到最新 10 場（資料取最新 50 場）；改與學生端共用
// /api/practice/history：月＝DB 端（每日 × 技能）聚合、日＝單日有界查詢。
// 教師檢視帶 includeAnswers=1 取得逐題答案（僅教師／管理員可用）。
interface HistoryDaySkill {
  skill: string;
  skillZh: string;
  sessionsCount: number;
  questionsTotal: number;
}

interface HistoryDay {
  dayKey: string;
  sessionsCount: number;
  questionsTotal: number;
  skills: HistoryDaySkill[];
}

interface HistorySessionAnswer {
  questionIndex: number;
  questionType: string;
  questionPrompt: string;
  correctAnswer: string;
  studentAnswer: string;
  isCorrect: boolean;
  result: string | null;
  timeSpent: number | null;
}

interface HistorySession {
  id: string;
  skill: string;
  skillZh: string;
  difficulty: string;
  totalQuestions: number;
  correctCount: number;
  source: string;
  startedAt: string;
  completedAt: string | null;
  verified:
    | { status: 'verified'; totalQuestions: number; correctCount: number; accuracy: number | null }
    | { status: 'unverifiable'; reason: string };
  answers: HistorySessionAnswer[];
}

interface HistoryDayDetailState {
  loading: boolean;
  sessions: HistorySession[] | null;
  error: boolean;
}

/**
 * 逐題題目文字 — 缺題目文字時退回題型，永不對 undefined 取 substring。
 * 2026-09-15: 舊版直接 `a.questionPrompt.substring(0, 60)`，一旦 API 未回傳
 * 題目文字即整頁被 error boundary 接住（Cannot read properties of undefined）。
 */
function displayPrompt(
  prompt: string | undefined,
  fallback: string,
  max = 60,
): string {
  const text = (prompt ?? '').trim() || fallback;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function StudentDetailPage() {
  const { t } = useT();
  const store = useAppStore();
  const params = useParams();
  const router = useRouter();
  const studentId = params.studentId as string;

  const [data, setData] = useState<FullStudentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!studentId) return;
    // Deferred to a microtask: this effect sets state (react-hooks/set-state-in-effect).
    void Promise.resolve().then(() => {
      setLoading(true);
      setLoadError('');
      return fetch(`/api/teacher/students/${encodeURIComponent(studentId)}`)
        .then(r => r.json())
        .then((json) => {
          if (json.error) { setLoadError(json.error); return; }
          setData(json as FullStudentData);
        })
        .catch(() => setLoadError(t('teacher.studentDetail.loadFailed')))
        .finally(() => setLoading(false));
    });
  }, [studentId, t]);

  const toggleSession = (id: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // === 練習歷史（逐日回顧）狀態 ===
  const [historyMonth, setHistoryMonth] = useState('');
  const [historyDays, setHistoryDays] = useState<HistoryDay[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [dayDetails, setDayDetails] = useState<Record<string, HistoryDayDetailState>>({});

  // 預設顯示香港當前月份（在 effect 設定，避免 SSR/hydration 跨月不一致）
  useEffect(() => {
    void Promise.resolve().then(() => setHistoryMonth((prev) => prev || hkMonthKey()));
  }, []);

  const loadHistoryMonth = useCallback(async (month: string) => {
    if (!studentId) return;
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const res = await fetch(`/api/practice/history?studentId=${encodeURIComponent(studentId)}&view=month&month=${month}`);
      const json = await res.json();
      if (res.ok && Array.isArray(json.days)) {
        setHistoryDays(json.days as HistoryDay[]);
      } else {
        setHistoryDays([]);
        setHistoryError(true);
      }
    } catch {
      setHistoryDays([]);
      setHistoryError(true);
    } finally {
      setHistoryLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    if (!historyMonth) return;
    // Deferred to a microtask: loadHistoryMonth sets state (react-hooks/set-state-in-effect).
    void Promise.resolve().then(() => loadHistoryMonth(historyMonth));
  }, [historyMonth, loadHistoryMonth]);

  const toggleHistoryDay = useCallback((dayKey: string) => {
    setExpandedDay((prev) => (prev === dayKey ? null : dayKey));
    const cached = dayDetails[dayKey];
    if (cached?.sessions || cached?.loading) return;
    setDayDetails((prev) => ({ ...prev, [dayKey]: { loading: true, sessions: null, error: false } }));
    void (async () => {
      try {
        // includeAnswers=1：逐題答案僅教師／管理員可取得（學生端維持精簡）
        const res = await fetch(`/api/practice/history?studentId=${encodeURIComponent(studentId)}&view=day&day=${encodeURIComponent(dayKey)}&includeAnswers=1`);
        const json = await res.json();
        if (res.ok && Array.isArray(json.sessions)) {
          setDayDetails((cur) => ({ ...cur, [dayKey]: { loading: false, sessions: json.sessions as HistorySession[], error: false } }));
        } else {
          setDayDetails((cur) => ({ ...cur, [dayKey]: { loading: false, sessions: null, error: true } }));
        }
      } catch {
        setDayDetails((cur) => ({ ...cur, [dayKey]: { loading: false, sessions: null, error: true } }));
      }
    })();
  }, [dayDetails, studentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (loadError || !data?.student) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">{loadError || t('teacher.studentDetail.notFound')}</p>
        <button onClick={() => router.back()} className="mt-3 text-blue-600 hover:underline text-sm">
          {t('teacher.studentDetail.back')}
        </button>
      </div>
    );
  }

  const { student, practiceSessions, mistakes, vocab, writingDrafts, weeklySnapshots, cumulativeSkillTotals = [], sessionsCount = null } = data;

  // 2026-09-23 稽核修正：累積數字一律採用伺服器全歷史投影。
  // 舊碼由 `practiceSessions`（最新 50 場顯示視窗）累加，卻當成總數顯示給老師
  // → 高練習量學生的「答題數／準確率」被系統性低估（違反「累積不得由最新 N 筆推算」）。
  const totalQuestions = cumulativeSkillTotals.reduce((sum, s) => sum + s.questions, 0);
  const totalCorrect = cumulativeSkillTotals.reduce((sum, s) => sum + s.correct, 0);
  const sessionAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : null;

  // 各技能準確率（R3.10-C: 只計 verified 證據；全歷史）
  const skillBreakdown = cumulativeSkillTotals.map(s => ({
    name: s.skillZh || s.skill,
    accuracy: s.questions > 0 ? Math.round((s.correct / s.questions) * 100) : 0,
    total: s.questions,
  }));

  // 錯題類型分布
  const mistakeTypeMap = new Map<string, number>();
  mistakes.forEach(m => {
    mistakeTypeMap.set(m.mistakeType, (mistakeTypeMap.get(m.mistakeType) || 0) + 1);
  });

  // 徽章解析
  let badges: { id: string; name: string; nameZh: string; icon: string }[] = [];
  try {
    const unlocked: string[] = student.badgeIds ? JSON.parse(student.badgeIds) : [];
    badges = getAllBadges({ totalQuestions, overallAccuracy: student.overallAccuracy ?? 0, streakDays: student.streakDays ?? 0, sessionsCompleted: sessionsCount ?? practiceSessions.length, wordsMastered: vocab.mastered, writingSubmissions: writingDrafts.length, diagnosticCompleted: false, skillAccuracy: {} }, unlocked)
      .filter(b => unlocked.includes(b.id));
  } catch { /* ignore */ }

  // CSV 匯出
  const exportCSV = () => {
    const name = student.nameZh || student.nameEn || 'student';
    const rows = [
      ['學生', '班級', '準確率', '練習次數', '答題數', '錯題數', '生字數', '已掌握', '寫作', 'XP', '連續天數'],
      [name, student.class?.name || '', student.overallAccuracy != null ? `${Math.round(student.overallAccuracy)}%` : '', sessionsCount ?? '', totalQuestions, mistakes.length, vocab.total, vocab.mastered, writingDrafts.length, student.xp ?? 0, student.streakDays ?? 0],
      [''],
      ['技能', '準確率', '答題數'],
      ...skillBreakdown.map(s => [s.name, `${s.accuracy}%`, s.total]),
      [''],
      ['錯題類型', '數量'],
      ...Array.from(mistakeTypeMap.entries()).map(([t, c]) => [t, c]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${name}_report.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {student.nameZh || student.nameEn || t('teacher.studentDetail.fallback')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-100 transition-colors">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* 基本資料 + 徽章 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-2xl font-bold text-blue-600">
              {(student.nameZh || student.nameEn || 'S').charAt(0)}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{student.nameZh}</h2>
              {student.nameEn && <p className="text-sm text-gray-500">{student.nameEn}</p>}
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                <Mail className="w-3 h-3" /> {student.email}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">{t('teacher.studentDetail.class')}</p>
              <p className="font-semibold text-gray-900 dark:text-white">{student.class?.name || '—'}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">{t('teacher.studentDetail.grade')}</p>
              <p className="font-semibold text-gray-900 dark:text-white">{getGradeLabel(student.level || '', store.language) || student.level || '—'}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">{t('teacher.studentDetail.studentNo')}</p>
              <p className="font-semibold text-gray-900 dark:text-white">{student.classNumber || '—'}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">{t('teacher.studentDetail.accuracy')}</p>
              <p className="font-semibold text-teal-600">{student.overallAccuracy != null ? Math.round(student.overallAccuracy) + '%' : '—'}</p>
            </div>
          </div>
        </div>

        {/* 徽章區 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1.5">
            <Star className="w-4 h-4 text-amber-500" /> 徽章
          </h3>
          {badges.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">{t('teacher.students.noBadges')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {badges.map(b => (
                <span key={b.id} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-full" title={store.language === 'en' ? b.name : b.nameZh}>
                  {b.icon} {store.language === 'en' ? b.name : b.nameZh}
                </span>
              ))}
            </div>
          )}
          {/* XP + Streak */}
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-sm">
            <div className="flex items-center gap-1 text-amber-600">
              <Zap className="w-4 h-4" /> <span className="font-bold">{student.xp ?? 0}</span> XP
            </div>
            <div className="flex items-center gap-1 text-orange-500">
              <Flame className="w-4 h-4" /> <span className="font-bold">{student.streakDays ?? 0}</span> 天
            </div>
          </div>
        </div>
      </div>

      {/* 練習統計 KPI + 學生分析 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* 2026-09-21：「無資料 ≠ 0」— 準確率無已驗證證據時顯示「—」，
            而非紅色的 0%（同一學生在其他頁面顯示「—」，不得自相矛盾）。 */}
        {[
          { label: t('teacher.studentDetail.practiceCount'), value: sessionsCount ?? '—', unit: sessionsCount == null ? '' : t('teacher.studentDetail.unitTimes'), icon: Hash },
          { label: t('teacher.studentDetail.totalAnswered'), value: totalQuestions, unit: t('teacher.studentDetail.unitQuestions'), icon: BookOpen },
          { label: t('teacher.classes.accuracy'), value: sessionAccuracy ?? '—', unit: sessionAccuracy === null ? '' : '%', icon: Target },
          { label: t('teacher.studentDetail.mistakeCount'), value: mistakes.length, unit: t('teacher.studentDetail.unitQuestions'), icon: AlertCircle },
          { label: t('teacher.studentDetail.vocab'), value: vocab.total, unit: t('teacher.studentDetail.unitWords'), icon: Languages },
          { label: t('teacher.studentDetail.writing'), value: writingDrafts.length, unit: t('teacher.studentDetail.unitPieces'), icon: FileText },
          { label: t('teacher.studentDetail.mastered'), value: vocab.mastered, unit: t('teacher.studentDetail.unitWords'), icon: GraduationCap },
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <stat.icon className="w-4 h-4 text-gray-400 mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}<span className="text-sm font-normal text-gray-400 ml-1">{stat.unit}</span></p>
            <p className="text-xs text-gray-500">{stat.label}</p>
          </div>
        ))}
        {/* 學生分析 — 顯眼 CTA */}
        <Link
          href={`/admin/students/${studentId}`}
          className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 shadow-sm border-2 border-purple-300 dark:border-purple-700 hover:border-purple-500 transition-colors flex flex-col items-center justify-center text-center gap-1.5"
        >
          <BarChart3 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          <p className="text-sm font-bold text-purple-700 dark:text-purple-400">{t('teacher.students.analytics')}</p>
          <p className="text-[10px] text-purple-500">{t('teacher.students.fullReport')}</p>
        </Link>
      </div>

      {/* 技能弱項分析 */}
      {skillBreakdown.length > 0 && (
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-500" /> 技能準確率
          </h3>
          <div className="space-y-2">
            {skillBreakdown.map(s => (
              <div key={s.name} className="flex items-center gap-3">
                <span className="w-24 text-sm text-gray-600 dark:text-gray-400 truncate">{s.name}</span>
                <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${s.accuracy >= 70 ? 'bg-teal-500' : s.accuracy >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.max(s.accuracy, 5)}%` }} />
                </div>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 w-10 text-right">{s.accuracy}%</span>
                <span className="text-xs text-gray-400 w-8 text-right">{s.total}題</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 錯題類型分布 */}
      {mistakes.length > 0 && (
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" /> 錯題類型分布
          </h3>
          <div className="flex flex-wrap gap-2">
            {Array.from(mistakeTypeMap.entries()).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <span key={type} className="px-3 py-1.5 text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-full">
                {type} ×{count}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* 每週進度趨勢 */}
      {weeklySnapshots.length > 0 && (
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-500" /> 每週進度趨勢
          </h3>
          <div className="space-y-2">
            {weeklySnapshots.slice(0, 8).reverse().map(w => {
              // 2026-09-20 稽核：該週無已驗證題數 → 「—」，不得顯示 0%
              const hasData = (w.totalQuestions ?? 0) > 0;
              const width = hasData ? Math.max(w.accuracy, 3) : 0;
              return (
                <div key={w.weekStart} className="flex items-center gap-3 text-sm">
                  <span className="w-28 text-gray-500">{w.weekStart}</span>
                  <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${width}%` }} />
                  </div>
                  <span className="font-semibold text-gray-700 dark:text-gray-300 w-10 text-right">{hasData ? `${w.accuracy}%` : '—'}</span>
                  <span className="text-xs text-gray-400 w-20 text-right">{w.totalQuestions}題</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 練習歷史 — 逐日回顧（2026-10-01：取代只列最近 10 筆的「最近練習紀錄」） */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-500" /> {t('progress.historyTitle')}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHistoryMonth(previousMonthKey(historyMonth))}
              disabled={!historyMonth || historyLoading}
              aria-label={t('progress.historyPrevMonth')}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              ‹
            </button>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[6.5rem] text-center">
              {historyMonth ? formatHistoryMonthLabel(historyMonth, store.language) : ''}
            </span>
            <button
              type="button"
              onClick={() => setHistoryMonth(nextMonthKey(historyMonth))}
              disabled={!historyMonth || historyMonth >= hkMonthKey() || historyLoading}
              aria-label={t('progress.historyNextMonth')}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              ›
            </button>
          </div>
        </div>

        {historyLoading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        )}

        {!historyLoading && historyError && (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-500 mb-3">{t('progress.loadFailed')}</p>
            <button
              type="button"
              onClick={() => historyMonth && void loadHistoryMonth(historyMonth)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm"
            >
              {t('progress.retry')}
            </button>
          </div>
        )}

        {!historyLoading && !historyError && historyDays && historyDays.length === 0 && (
          <p className="text-sm text-gray-400 py-8 text-center">{t('progress.historyEmpty')}</p>
        )}

        {!historyLoading && !historyError && historyDays && historyDays.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 mb-2">{t('progress.historyDayHint')}</p>
            {historyDays.map((day) => {
              const detail = dayDetails[day.dayKey];
              const isDayExpanded = expandedDay === day.dayKey;
              return (
                <div key={day.dayKey} className="border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleHistoryDay(day.dayKey)}
                    aria-expanded={isDayExpanded}
                    className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{formatHistoryDayLabel(day.dayKey, store.language)}</span>
                        <span className="text-xs text-gray-400">
                          {day.sessionsCount} {t('common.sessions')} · {day.questionsTotal}{t('progress.questionsSuffix')}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {day.skills.map((skill) => (
                          <span
                            key={skill.skill}
                            className="text-[11px] px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full"
                          >
                            {skill.skillZh || skill.skill} ×{skill.sessionsCount}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isDayExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {isDayExpanded && (
                    <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-2">
                      {detail?.loading && (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        </div>
                      )}
                      {!detail?.loading && detail?.error && (
                        <p className="text-xs text-gray-400 py-3 text-center">{t('progress.loadFailed')}</p>
                      )}
                      {!detail?.loading && detail?.sessions && detail.sessions.length === 0 && (
                        <p className="text-xs text-gray-400 py-3 text-center">{t('progress.historyEmptyDay')}</p>
                      )}
                      {!detail?.loading && detail?.sessions && detail.sessions.length > 0 && (
                        <div className="space-y-2">
                          {detail.sessions.map((s) => (
                            <div key={s.id}>
                              <button
                                onClick={() => toggleSession(s.id)}
                                className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                              >
                                <div className="text-left">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-gray-400">{formatHistoryTime(s.startedAt)}</span>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{s.skillZh || s.skill || '練習'}</p>
                                    {s.source === 'dse-reading' && <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded-full">DSE</span>}
                                    {s.source === 'dse-listening' && <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full">DSE</span>}
                                    {s.source === 'ai-generated' && <span className="text-[10px] px-1.5 py-0.5 bg-teal-100 text-teal-600 rounded-full">AI</span>}
                                    {s.source === 'assignment' && <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-600 rounded-full">{t('teacher.students.tasks')}</span>}
                                  </div>
                                  <p className="text-xs text-gray-400">{s.totalQuestions || 0} 題 · {s.difficulty}</p>
                                  {s.completedAt && (
                                    <p className="text-xs text-gray-400">
                                      <Clock className="w-3 h-3 inline mr-0.5" />
                                      完成: {new Date(s.completedAt).toLocaleString('zh-HK', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {s.verified?.status === 'verified' ? (
                                    <span className={`text-sm font-bold ${((s.verified.correctCount ?? 0) / Math.max(1, (s.verified.totalQuestions ?? 0))) >= 0.7 ? 'text-teal-600' : 'text-red-500'}`}>
                                      {Math.round(((s.verified.correctCount ?? 0) / Math.max(1, (s.verified.totalQuestions ?? 0))) * 100)}%
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-400">{t('progress.unverified')}</span>
                                  )}
                                  {s.answers && s.answers.length > 0 && (
                                    expandedSessions.has(s.id) ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />
                                  )}
                                </div>
                              </button>
                              {/* 逐題展開（教師檢視；includeAnswers=1） */}
                              {expandedSessions.has(s.id) && s.answers && (
                                <div className="mt-1 ml-4 border-l-2 border-blue-200 dark:border-blue-800 pl-4 space-y-1.5 py-2">
                                  {s.answers.map((a, ai) => {
                                    const isCorrect = a.isCorrect === true;
                                    const isUngradable = a.result === 'ungradable';
                                    const studentAnswer = (a.studentAnswer ?? '').trim();
                                    const correctAnswer = (a.correctAnswer ?? '').trim();
                                    return (
                                      <div key={ai} className="text-xs">
                                        <span className="text-gray-400">Q{(typeof a.questionIndex === 'number' ? a.questionIndex : ai) + 1}. </span>
                                        <span className="text-gray-600 dark:text-gray-400">
                                          {displayPrompt(
                                            a.questionPrompt,
                                            a.questionType || (store.language === 'en' ? 'Question text unavailable' : '未提供題目文字'),
                                          )}
                                        </span>
                                        {' '}
                                        {/* 開放式題目不自動評分（見 CHANGELOG 2026-09-15 (II)）→ 不顯示「回答錯誤」 */}
                                        {isUngradable ? (
                                          <span className="text-amber-600 font-medium">
                                            ◻ {store.language === 'en' ? 'Not auto-graded' : '不自動評分'}
                                          </span>
                                        ) : (
                                          <span className={isCorrect ? 'text-teal-600 font-medium' : 'text-red-500 font-medium'}>
                                            {isCorrect
                                              ? '✓'
                                              : `✗ (答: ${studentAnswer || '—'} / 正: ${correctAnswer || '—'})`}
                                          </span>
                                        )}
                                        {typeof a.timeSpent === 'number' && a.timeSpent > 0 && (
                                          <span className="text-gray-400 ml-1">{a.timeSpent}s</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
