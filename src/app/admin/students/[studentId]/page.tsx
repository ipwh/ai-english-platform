// ============================================
// 管理員：學生個人分析儀表板 — /admin/students/[studentId]
// 追蹤個別學生的學習表現、掌握度、弱點、趨勢
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@/hooks/use-i18n';
import {
  ArrowLeft, RefreshCw, TrendingUp, Target, AlertTriangle,
  BookOpen, Zap, Award, Clock,
  BarChart3, CheckCircle2, ChevronRight,
  FileText, Volume2, MessageSquare, ClipboardList,
} from 'lucide-react';

// ============================================
// Types
// ============================================

interface StudentAnalytics {
  student: {
    id: string;
    email: string;
    nameZh: string | null;
    nameEn: string | null;
    level: string | null;
    classNumber: string | null;
    overallAccuracy: number | null;
    streakDays: number;
    xp: number;
    academicYear: string | null;
    badgeIds: string[];
    createdAt: string;
    class: { id: string; name: string; gradeLevel: string; academicYear: string } | null;
    counts: {
      sessions: number;
      mistakes: number;
      vocabItems: number;
      submissions: number;
      writingDrafts: number;
      listeningSessions: number;
      spellingSessions: number;
    };
  };
  mastery: {
    overallMastery: number;
    bySkill: Record<string, {
      skill: string;
      overallScore: number;
      totalPractices: number;
      totalMistakes: number;
      subSkillCount: number;
    }>;
    weakestSkills: Array<{ skill: string; subSkill: string; masteryScore: number }>;
    strongestSkills: Array<{ skill: string; subSkill: string; masteryScore: number }>;
  } | null;
  /**
   * 正典 WeaknessProfile（`mistake/intelligence/types`）。
   * 2026-09-15: 舊型別宣告成 frequency / recommendationZh 等不存在的欄位，
   * 令畫面顯示原始 bucket key（reading:unclassified）且次數永遠是空的。
   */
  weakness: {
    topWeaknesses: Array<{
      grammarCategory: string;
      grammarCategoryZh: string;
      mistakeCount: number;
      severity: string;
      trend: string;
      mastered: boolean;
      lastSeen: string;
    }>;
    improvementTrend: string;
    recommendations: string[];
    mostFrequentMistakes: Array<{
      grammarCategory: string;
      grammarCategoryZh: string;
      mistakeCount: number;
      severity: string;
      trend: string;
      mastered: boolean;
      lastSeen: string;
    }>;
  } | null;
  trends: {
    learningTrend: Array<{ date: string; value: number; label: string }>;
    masteryTrend: Record<string, Array<{ date: string; value: number; label: string }>>;
    overallDirection: string;
  } | null;
  stats: {
    totalPractices: number;
    totalMistakes: number;
    overallMastery: number;
    streak: number;
  } | null;
  recentSessions: Array<{
    id: string;
    type: string;
    skill: string;
    skillZh: string;
    difficulty: string;
    totalQuestions: number;
    correctCount: number;
    recordedTotalQuestions: number;
    recordedCorrectCount: number;
    accuracy: number | null;
    startedAt: string;
    completedAt: string | null;
    source?: string;
    verified?: { status: string } | null;
  }>;
  recentMistakes: Array<{
    id: string;
    questionSummary: string;
    studentAnswer: string;
    correctAnswer: string;
    mistakeType: string;
    createdAt: string;
    /** 技能／題型（正典解析結果）— 錯題的可複習單位 */
    languageSkill: string | null;
    grammarItem: string | null;
    questionType: string | null;
    bucketKey?: string;
    skillLabelZh?: string | null;
    skillLabelEn?: string | null;
    typeLabelZh?: string | null;
    typeLabelEn?: string | null;
    /** false = 題目依附篇章（閱讀／聆聽）→ 不可重考同一題 */
    replayable?: boolean;
    /** 題目定義是否存在於正典題庫 */
    canonical?: boolean;
    choices?: string[] | null;
    explanationZh?: string | null;
    explanationEn?: string | null;
  }>;
  vocabStats: Array<{ familiarity: string; count: number }>;
  writingStats: Array<{
    id: string;
    hasRevision: boolean;
    hasComment: boolean;
    createdAt: string;
    preview: string;
  }>;
  weeklySnapshots: Array<{
    weekStart: string;
    totalQuestions: number;
    correctCount: number;
    accuracy: number;
    sessionsCount: number;
    xpGained: number;
  }>;
  sessionStatsBySkill: Array<{
    skill: string;
    sessions: number;
    totalQuestions: number;
    correctCount: number;
    accuracy: number | null;
  }>;
  diagnosticResults: Array<{
    skill: string;
    skillZh: string;
    accuracy: number;
    weakAreas: string;
  }>;
  generatedAt: string;
}

// ============================================
// Stat Card
// ============================================

function StatCard({
  label, value, icon: Icon, color, unit,
}: {
  label: string; value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string; unit?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 lg:p-5 flex items-center gap-3 lg:gap-4">
      <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5 lg:w-6 lg:h-6" />
      </div>
      <div className="min-w-0">
        <p className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white truncate">
          {typeof value === 'number' ? value.toLocaleString() : value}
          {unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</p>
      </div>
    </div>
  );
}

// ============================================
// Mastery Bar
// ============================================

function MasteryBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
        <span className={`text-sm font-medium ${score >= 70 ? 'text-green-600' : score >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
          {score}%
        </span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>
    </div>
  );
}

// ============================================
// Severity Badge
// ============================================

function SeverityBadge({ severity }: { severity: string }) {
  // 正典嚴重度為 critical | major | minor（mistake-tracker.classifySeverity）；
  // 舊值 high | medium | low 保留向後兼容。
  const config: Record<string, { color: string; label: string }> = {
    critical: { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', label: '嚴重' },
    major: { color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', label: '中等' },
    minor: { color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', label: '輕微' },
    high: { color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', label: '高' },
    medium: { color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', label: '中' },
    low: { color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', label: '低' },
  };
  const c = config[severity] || config.medium;
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${c.color}`}>{c.label}</span>;
}

function TrendBadge({ trend, language }: { trend: string; language: string }) {
  // 正典趨勢為 improving | stable | worsening；舊值 up | down | declining 向後兼容。
  const isUp = trend === 'improving' || trend === 'up';
  const isDown = trend === 'worsening' || trend === 'declining' || trend === 'down';
  const label = isUp
    ? (language === 'en' ? 'Improving' : '進步中')
    : isDown
      ? (language === 'en' ? 'Worsening' : '惡化中')
      : (language === 'en' ? 'Stable' : '平穩');
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
      isUp ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
      isDown ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
      'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
    }`}>
      {isUp ? '↑' : isDown ? '↓' : '→'}
      {label}
    </span>
  );
}

/**
 * MC 選項 — 閱讀／詞彙題目沒有篇章時，選項是最起碼的語境。
 * 正解綠、學生所選（錯）紅，其餘中性。
 */
function OptionList({
  choices,
  correctAnswer,
  studentAnswer,
  label,
}: {
  choices: string[];
  correctAnswer: string;
  studentAnswer: string;
  label: string;
}) {
  const correct = (correctAnswer || '').trim().toUpperCase();
  const chosen = (studentAnswer || '').trim().toUpperCase();
  return (
    <div className="mt-1.5">
      <p className="text-[11px] text-gray-400 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {choices.map((choice, i) => {
          const key = String.fromCharCode(65 + i);
          const isCorrect = key === correct;
          const isChosenWrong = key === chosen && !isCorrect;
          return (
            <span
              key={key}
              className={`text-[11px] px-2 py-0.5 rounded-lg border ${
                isCorrect
                  ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300'
                  : isChosenWrong
                    ? 'border-red-300 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'
                    : 'border-gray-200 bg-white text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              {key}. {choice}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// Mistake Type Label
// ============================================

const MISTAKE_LABELS: Record<string, { zh: string; en: string }> = {
  grammar: { zh: '文法', en: 'Grammar' },
  vocabulary: { zh: '詞彙', en: 'Vocabulary' },
  comprehension: { zh: '理解', en: 'Comprehension' },
  careless: { zh: '粗心', en: 'Careless' },
  'time-management': { zh: '時間管理', en: 'Time Management' },
  chinglish: { zh: '中式英文', en: 'Chinglish' },
};

// ============================================
// Skill Icon Map
// ============================================

// ============================================
// Main Page
// ============================================

export default function StudentAnalyticsPage() {
  const { t, language } = useT();
  const params = useParams();
  const studentId = params.studentId as string;

  const [data, setData] = useState<StudentAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/students/${studentId}/analytics`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '載入失敗');
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAnalytics(); }, [studentId]);

  // ---- Loading ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  // ---- Error ----
  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl text-center">
          <p className="text-red-600 dark:text-red-400 mb-3">{error}</p>
          <button onClick={fetchAnalytics} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm">
            {t('admin.reports.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { student, mastery, weakness, stats, recentSessions, recentMistakes, vocabStats, writingStats, weeklySnapshots, sessionStatsBySkill, diagnosticResults } = data;

  // ---- Vocab summary ----
  const totalVocab = vocabStats.reduce((s, v) => s + v.count, 0);
  const masteredVocab = vocabStats.find(v => v.familiarity === 'mastered')?.count || 0;

  // ---- Mastery skills list ----
  const masterySkills = mastery
    ? Object.values(mastery.bySkill).filter(s => s.subSkillCount > 0).sort((a, b) => b.overallScore - a.overallScore)
    : [];

  // ---- Student display name ----
  const displayName = student.nameZh || student.nameEn || student.email;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ======== Header ======== */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/students"
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{displayName}</h1>
              {student.level && (
                <span className="px-2.5 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded-full text-xs font-medium">
                  {student.level}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {student.email}
              {student.class && <span className="ml-2">· {student.class.name}{student.classNumber ? ` #${student.classNumber}` : ''}</span>}
              {student.academicYear && <span className="ml-2">· {student.academicYear}</span>}
            </p>
          </div>
        </div>
        <button
          onClick={fetchAnalytics}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          {t('admin.reports.retry')}
        </button>
      </div>

      {/* ======== Stats Cards ======== */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 lg:gap-4">
        <StatCard
          label={t('admin.reports.avgAccuracy')}
          value={student.overallAccuracy != null ? Math.round(student.overallAccuracy) : '-'}
          icon={Target}
          color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
          unit={student.overallAccuracy != null ? '%' : undefined}
        />
        <StatCard
          label={t('admin.reports.totalSessions')}
          value={stats?.totalPractices ?? student.counts.sessions}
          icon={TrendingUp}
          color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
        />
        <StatCard
          label={t('admin.reports.totalMistakes')}
          value={student.counts.mistakes}
          icon={AlertTriangle}
          color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
        />
        <StatCard
          label={t('admin.students.analytics.streak')}
          value={student.streakDays}
          icon={Zap}
          color="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
          unit={t('admin.students.analytics.days')}
        />
        <StatCard
          label={t('admin.students.analytics.xp')}
          value={student.xp}
          icon={Award}
          color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        />
        <StatCard
          label={t('admin.students.analytics.vocabSize')}
          value={totalVocab}
          icon={BookOpen}
          color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
        />
      </div>

      {/* ======== Row: Mastery + Weakness ======== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* --- Mastery by Skill --- */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('admin.students.analytics.mastery')}
            </h3>
            {mastery && (
              <span className={`text-sm font-medium ${
                mastery.overallMastery >= 70 ? 'text-green-600' :
                mastery.overallMastery >= 50 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {t('admin.students.analytics.overview')} {mastery.overallMastery}%
              </span>
            )}
          </div>
          <div className="space-y-3">
            {masterySkills.length > 0 ? masterySkills.map(skill => {
              const colorMap: Record<string, string> = {
                grammar: 'from-blue-500 to-blue-400',
                vocabulary: 'from-green-500 to-green-400',
                reading: 'from-purple-500 to-purple-400',
                writing: 'from-orange-500 to-orange-400',
                listening: 'from-cyan-500 to-cyan-400',
                speaking: 'from-pink-500 to-pink-400',
              };
              const barColor = `bg-gradient-to-r ${colorMap[skill.skill] || 'from-purple-500 to-purple-400'}`;
              return (
                <MasteryBar
                  key={skill.skill}
                  label={skill.skill.charAt(0).toUpperCase() + skill.skill.slice(1)}
                  score={skill.overallScore}
                  color={barColor}
                />
              );
            }) : (
              <p className="text-gray-400 text-center py-8">{t('admin.students.analytics.noMastery')}</p>
            )}
          </div>
        </div>

        {/* --- Weakness Profile --- */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('admin.students.analytics.weakness')}
            </h3>
            {weakness && (
              <TrendBadge trend={weakness.improvementTrend} language={language} />
            )}
          </div>
          {weakness && (weakness.topWeaknesses ?? []).length > 0 ? (
            <div className="space-y-3">
              {(weakness.topWeaknesses ?? []).slice(0, 6).map((w) => (
                <div key={w.grammarCategory} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {/* 顯示中文標籤，永不把 `reading:inference` 這類 bucket key 直接給用戶 */}
                      {w.grammarCategoryZh || w.grammarCategory}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                      {language === 'en' ? 'Last seen' : '最近出現'}：
                      {w.lastSeen ? new Date(w.lastSeen).toLocaleDateString() : '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    <span className="text-xs text-gray-500">
                      {w.mistakeCount}{language === 'en' ? '' : '次'}
                    </span>
                    <SeverityBadge severity={w.severity} />
                    <TrendBadge trend={w.trend} language={language} />
                  </div>
                </div>
              ))}
              {(weakness.recommendations ?? []).length > 0 && (
                <ul className="pt-1 space-y-1">
                  {(weakness.recommendations ?? []).slice(0, 3).map((rec, i) => (
                    <li key={i} className="text-xs text-gray-500 dark:text-gray-400 flex gap-1.5">
                      <span className="text-purple-500 flex-shrink-0">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">{t('admin.students.analytics.noWeakness')}</p>
          )}
        </div>
      </div>

      {/* ======== Row: Weekly Trend + Session Stats ======== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* --- Weekly Activity --- */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('admin.students.analytics.weeklyTrend')}
          </h3>
          {weeklySnapshots.length > 0 ? (
            <div className="space-y-2">
              {weeklySnapshots.slice(-12).map(w => {
                // 2026-09-20 稽核：該週無已驗證題數 → 「—」，不得顯示 0%
                const hasData = (w.totalQuestions ?? 0) > 0;
                const isUp = hasData && w.accuracy >= 60;
                return (
                  <div key={w.weekStart} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-16 flex-shrink-0">
                      {w.weekStart.slice(5)}
                    </span>
                    <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden flex">
                      <div
                        className={`h-full rounded-full transition-all ${
                          hasData ? (isUp ? 'bg-green-400' : 'bg-red-400') : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        style={{ width: hasData ? `${Math.min(100, w.accuracy)}%` : '0%' }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-12 text-right flex-shrink-0">
                      {hasData ? `${w.accuracy}%` : '—'}
                    </span>
                    <span className="text-xs text-gray-400 w-10 text-right flex-shrink-0">
                      {w.sessionsCount}次
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">{t('admin.students.analytics.noWeekly')}</p>
          )}
        </div>

        {/* --- Session Stats by Skill --- */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('admin.students.analytics.skillStats')}
          </h3>
          {sessionStatsBySkill.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left pb-2 font-medium text-gray-600 dark:text-gray-400">{t('admin.students.analytics.tableSkill')}</th>
                    <th className="text-center pb-2 font-medium text-gray-600 dark:text-gray-400">{t('admin.students.analytics.tableSessions')}</th>
                    <th className="text-center pb-2 font-medium text-gray-600 dark:text-gray-400">{t('admin.students.analytics.tableQuestions')}</th>
                    <th className="text-center pb-2 font-medium text-gray-600 dark:text-gray-400">{t('admin.students.analytics.tableAccuracy')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {sessionStatsBySkill.map(s => (
                    <tr key={s.skill}>
                      <td className="py-2.5 text-gray-900 dark:text-white font-medium capitalize">{s.skill}</td>
                      <td className="py-2.5 text-center text-gray-600 dark:text-gray-400">{s.sessions}</td>
                      <td className="py-2.5 text-center text-gray-600 dark:text-gray-400">{s.totalQuestions}</td>
                      <td className="py-2.5 text-center">
                        {s.accuracy != null ? (
                          <span className={`font-medium ${
                            s.accuracy >= 70 ? 'text-green-600' :
                            s.accuracy >= 50 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {s.accuracy}%
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">{t('admin.students.analytics.unverified')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">{t('admin.students.analytics.noWritingRecords')}</p>
          )}
        </div>
      </div>

      {/* ======== Row: Recent Sessions + Mistakes ======== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* --- Recent Sessions --- */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('admin.students.analytics.recentSessions')}
          </h3>
          {recentSessions.length > 0 ? (
            <div className="space-y-2">
              {recentSessions.map(s => {
                const isAssignment = s.type === 'assignment';
                return (
                <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isAssignment
                        ? 'bg-amber-100 dark:bg-amber-900/30'
                        : 'bg-purple-100 dark:bg-purple-900/30'
                    }`}>
                      {isAssignment
                        ? <ClipboardList className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        : <BarChart3 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {isAssignment ? `📋 ${s.skillZh}` : (s.skillZh || s.skill)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {isAssignment ? t('admin.students.analytics.assignmentTask') : s.difficulty} · {new Date(s.startedAt).toLocaleDateString()}
                      </p>
                      {s.completedAt && (
                        <p className="text-xs text-gray-400">
                          <Clock className="w-3 h-3 inline mr-0.5" />
                          {t('admin.students.analytics.completedLabel')}{new Date(s.completedAt).toLocaleString('zh-HK', {
                            month: 'numeric', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    {s.accuracy != null ? (
                      <>
                        <p className={`text-sm font-medium ${
                          s.accuracy >= 70 ? 'text-green-600' :
                          s.accuracy >= 50 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {s.accuracy}%
                        </p>
                        <p className="text-xs text-gray-400">
                          {s.correctCount}/{s.totalQuestions}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-gray-400">{t('admin.students.analytics.unverified')}</p>
                        <p className="text-xs text-gray-400">
                          {t('admin.students.analytics.recordedCount', { r: s.recordedCorrectCount, t: s.recordedTotalQuestions })}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )})}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">{t('admin.students.analytics.noPracticeRecords')}</p>
          )}
        </div>

        {/* --- Recent Mistakes --- */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('admin.students.analytics.recentMistakes')}
          </h3>
          {recentMistakes.length > 0 ? (
            <div className="space-y-2">
              {recentMistakes.map(m => {
                const lang: 'zh' | 'en' = language === 'en' ? 'en' : 'zh';
                const skillLabel = lang === 'en' ? (m.skillLabelEn || m.skillLabelZh) : m.skillLabelZh;
                const typeLabel = lang === 'en' ? (m.typeLabelEn || m.typeLabelZh) : m.typeLabelZh;
                const explanation = lang === 'en'
                  ? (m.explanationEn || m.explanationZh)
                  : (m.explanationZh || m.explanationEn);
                return (
                  <div key={m.id} className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-gray-900 dark:text-white line-clamp-2 flex-1">
                        {m.questionSummary || (lang === 'en' ? 'Question text not stored' : '未儲存題目文字')}
                      </p>
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {MISTAKE_LABELS[m.mistakeType]?.[lang] || m.mistakeType}
                      </span>
                    </div>

                    {/* 技能／題型 = 錯題的可複習單位（閱讀／聆聽題依附篇章） */}
                    {(skillLabel || typeLabel || m.replayable === false) && (
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {(skillLabel || typeLabel) && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                            {[skillLabel, typeLabel].filter(Boolean).join(' · ')}
                          </span>
                        )}
                        {m.replayable === false && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            {lang === 'en'
                              ? 'Passage-bound — same item cannot be re-tested'
                              : '篇章依附題目 — 不可重考同一題'}
                          </span>
                        )}
                        {m.canonical === false && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300">
                            {lang === 'en' ? 'No canonical context stored' : '未存正典語境'}
                          </span>
                        )}
                      </div>
                    )}

                    {/* 選項 — 沒有篇章時的最起碼語境 */}
                    {m.choices && m.choices.length > 0 && (
                      <OptionList
                        choices={m.choices}
                        correctAnswer={m.correctAnswer || ''}
                        studentAnswer={m.studentAnswer || ''}
                        label={lang === 'en' ? 'Options' : '選項'}
                      />
                    )}

                    <div className="flex items-center gap-3 mt-1.5 text-xs">
                      <span className="text-red-500 line-through">{m.studentAnswer || '—'}</span>
                      <ChevronRight className="w-3 h-3 text-gray-400" />
                      <span className="text-green-600 font-medium">{m.correctAnswer || '—'}</span>
                    </div>

                    {explanation && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 bg-white dark:bg-gray-800 p-2 rounded-lg">
                        💡 {explanation}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">{t('admin.students.analytics.noMistakeRecords')}</p>
          )}
        </div>
      </div>

      {/* ======== Row: Vocabulary + Writing ======== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* --- Vocabulary Overview --- */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {t('admin.students.analytics.vocabOverview')}
          </h3>
          {totalVocab > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-6 py-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{totalVocab}</p>
                  <p className="text-xs text-gray-500">{t('admin.students.analytics.vocabTotal')}</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-600">{masteredVocab}</p>
                  <p className="text-xs text-gray-500">{t('admin.students.analytics.vocabMastered')}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {vocabStats.map(v => {
                  const pct = totalVocab > 0 ? Math.round((v.count / totalVocab) * 100) : 0;
                  const colorMap: Record<string, string> = {
                    mastered: 'bg-green-400',
                    familiar: 'bg-blue-400',
                    learning: 'bg-yellow-400',
                    new: 'bg-gray-400',
                  };
                  return (
                    <div
                      key={v.familiarity}
                      className="flex-1 h-3 rounded-full"
                      title={`${v.familiarity}: ${v.count} (${pct}%)`}
                    >
                      <div
                        className={`h-full rounded-full ${colorMap[v.familiarity] || 'bg-gray-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                {vocabStats.map(v => {
                  const labelMap: Record<string, string> = {
                    mastered: '已掌握',
                    familiar: '熟悉',
                    learning: '學習中',
                    new: '新詞',
                  };
                  return (
                    <span key={v.familiarity} className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full ${
                        v.familiarity === 'mastered' ? 'bg-green-400' :
                        v.familiarity === 'familiar' ? 'bg-blue-400' :
                        v.familiarity === 'learning' ? 'bg-yellow-400' : 'bg-gray-400'
                      }`} />
                      {labelMap[v.familiarity] || v.familiarity}: {v.count}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">{t('admin.students.analytics.noDiagnosticData')}</p>
          )}
        </div>

        {/* --- Diagnostic Results --- */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            {t('admin.students.analytics.diagnosticResults')}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            {t('admin.students.analytics.diagnosticSelfReportedNote')}
          </p>
          {diagnosticResults.length > 0 ? (
            <div className="space-y-3">
              {diagnosticResults.map((d, i) => {
                // 2026-09-20 稽核：負值／null = 未評估，不得顯示為 0%
                const assessed = typeof d.accuracy === 'number' && d.accuracy >= 0;
                return (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {d.skillZh || d.skill}
                    </span>
                    <span className={`text-sm font-medium ${
                      !assessed ? 'text-gray-400' :
                      d.accuracy >= 70 ? 'text-green-600' :
                      d.accuracy >= 50 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {assessed ? `${Math.round(d.accuracy)}%` : t('admin.students.analytics.notAssessed')}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        !assessed ? 'bg-gray-300 dark:bg-gray-600' :
                        d.accuracy >= 70 ? 'bg-green-400' :
                        d.accuracy >= 50 ? 'bg-yellow-400' : 'bg-red-400'
                      }`}
                      style={{ width: assessed ? `${Math.min(100, d.accuracy)}%` : '0%' }}
                    />
                  </div>
                  {d.weakAreas && d.weakAreas !== '[]' && d.weakAreas !== '' && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {t('admin.students.analytics.weakAreasLabel')}{d.weakAreas}
                    </p>
                  )}
                </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">{t('admin.students.analytics.noDiagnosticResults')}</p>
          )}

          {/* --- Writing Overview --- */}
          {writingStats.length > 0 && (
            <>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-6 mb-3">
                {t('admin.students.analytics.recentWritingSubmissions')}
              </h4>
              <div className="space-y-2">
                {writingStats.map(w => (
                  <div key={w.id} className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                    <div className="flex items-center gap-2 min-w-0">
                      {w.hasRevision ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <Clock className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                      )}
                      <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{w.preview}...</p>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                      {new Date(w.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ======== Generated Timestamp ======== */}
      <p className="text-center text-xs text-gray-400 pb-4">
        數據更新時間: {new Date(data.generatedAt).toLocaleString('zh-HK')}
      </p>
    </div>
  );
}
