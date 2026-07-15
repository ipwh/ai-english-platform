// ============================================
// 教師端 — 個別學生詳情與學習數據（完整版）
// ============================================
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Mail, GraduationCap, Target, BookOpen, AlertCircle,
  Loader2, TrendingUp, Clock, Hash, Zap, Star, Flame,
  FileText, Download, BarChart3, Languages, ChevronDown, ChevronUp,
} from 'lucide-react';
import ProgressBar from '@/components/shared/ProgressBar';
import { formatDate } from '@/lib/utils';
import { getGradeLabel } from '@/lib/nav';
import { useT } from '@/hooks/use-i18n';
import { useAppStore } from '@/store/appStore';
import { getAllBadges } from '@/lib/gamification';

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
  answers?: { questionIndex: number; questionType: string; questionPrompt: string;
    correctAnswer: string; studentAnswer: string; isCorrect: boolean; timeSpent?: number }[];
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

interface FullStudentData {
  student: StudentDetail;
  practiceSessions: PracticeSession[];
  mistakes: MistakeData[];
  vocab: { total: number; mastered: number };
  writingDrafts: WritingDraft[];
  xpTransactions: XpTransaction[];
  weeklySnapshots: WeeklySnapshot[];
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
    setLoading(true);
    setLoadError('');
    fetch(`/api/teacher/students/${encodeURIComponent(studentId)}`)
      .then(r => r.json())
      .then((json) => {
        if (json.error) { setLoadError(json.error); return; }
        setData(json as FullStudentData);
      })
      .catch(() => setLoadError(t('teacher.studentDetail.loadFailed')))
      .finally(() => setLoading(false));
  }, [studentId]);

  const toggleSession = (id: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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

  const { student, practiceSessions, mistakes, vocab, writingDrafts, xpTransactions, weeklySnapshots } = data;

  const totalQuestions = practiceSessions.reduce((sum, s) => sum + (s.totalQuestions || 0), 0);
  const totalCorrect = practiceSessions.reduce((sum, s) => sum + (s.correctCount || 0), 0);
  const sessionAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  // 各技能準確率
  const skillMap = new Map<string, { total: number; correct: number }>();
  practiceSessions.forEach(s => {
    const key = s.skillZh || s.skill;
    const entry = skillMap.get(key) || { total: 0, correct: 0 };
    entry.total += s.totalQuestions;
    entry.correct += s.correctCount;
    skillMap.set(key, entry);
  });
  const skillBreakdown = Array.from(skillMap.entries()).map(([name, v]) => ({
    name,
    accuracy: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
    total: v.total,
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
    badges = getAllBadges({ totalQuestions, overallAccuracy: student.overallAccuracy ?? 0, streakDays: student.streakDays ?? 0, sessionsCompleted: practiceSessions.length, wordsMastered: vocab.mastered, writingSubmissions: writingDrafts.length, diagnosticCompleted: false, skillAccuracy: {} }, unlocked)
      .filter(b => unlocked.includes(b.id));
  } catch { /* ignore */ }

  // CSV 匯出
  const exportCSV = () => {
    const name = student.nameZh || student.nameEn || 'student';
    const rows = [
      ['學生', '班級', '準確率', '練習次數', '答題數', '錯題數', '生字數', '已掌握', '寫作', 'XP', '連續天數'],
      [name, student.class?.name || '', `${student.overallAccuracy ?? 0}%`, practiceSessions.length, totalQuestions, mistakes.length, vocab.total, vocab.mastered, writingDrafts.length, student.xp ?? 0, student.streakDays ?? 0],
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
        <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-100 transition-colors">
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
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
              <p className="font-semibold text-teal-600">{student.overallAccuracy ? Math.round(student.overallAccuracy) + '%' : '—'}</p>
            </div>
          </div>
        </div>

        {/* 徽章區 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-1.5">
            <Star className="w-4 h-4 text-amber-500" /> 徽章
          </h3>
          {badges.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">尚未獲得徽章</p>
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

      {/* 練習統計 KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '練習次數', value: practiceSessions.length, unit: '次', icon: Hash },
          { label: '總答題數', value: totalQuestions, unit: '題', icon: BookOpen },
          { label: '準確率', value: sessionAccuracy, unit: '%', icon: Target },
          { label: '錯題數', value: mistakes.length, unit: '題', icon: AlertCircle },
          { label: '生字', value: vocab.total, unit: '詞', icon: Languages },
          { label: '寫作', value: writingDrafts.length, unit: '篇', icon: FileText },
          { label: '已掌握', value: vocab.mastered, unit: '詞', icon: GraduationCap },
          { label: '每週快照', value: weeklySnapshots.length, unit: '週', icon: BarChart3 },
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <stat.icon className="w-4 h-4 text-gray-400 mb-2" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}<span className="text-sm font-normal text-gray-400 ml-1">{stat.unit}</span></p>
            <p className="text-xs text-gray-500">{stat.label}</p>
          </div>
        ))}
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
            {weeklySnapshots.slice(0, 8).reverse().map(w => (
              <div key={w.weekStart} className="flex items-center gap-3 text-sm">
                <span className="w-28 text-gray-500">{w.weekStart}</span>
                <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.max(w.accuracy, 3)}%` }} />
                </div>
                <span className="font-semibold text-gray-700 dark:text-gray-300 w-10 text-right">{w.accuracy}%</span>
                <span className="text-xs text-gray-400 w-20 text-right">{w.totalQuestions}題</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 最近練習（可展開逐題） */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-500" /> 最近練習紀錄
        </h3>
        {practiceSessions.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">尚無練習紀錄</p>
        ) : (
          <div className="space-y-2">
            {practiceSessions.slice(0, 10).map((s) => (
              <div key={s.id}>
                <button
                  onClick={() => toggleSession(s.id)}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{s.skillZh || s.skill || '練習'}</p>
                    <p className="text-xs text-gray-400">{s.totalQuestions || 0} 題 · {formatDate(s.startedAt)} · {s.difficulty}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${(s.correctCount / Math.max(1, s.totalQuestions)) >= 0.7 ? 'text-teal-600' : 'text-red-500'}`}>
                      {s.totalQuestions > 0 ? Math.round((s.correctCount / s.totalQuestions) * 100) : 0}%
                    </span>
                    {s.answers && s.answers.length > 0 && (
                      expandedSessions.has(s.id) ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </button>
                {/* 逐題展開 */}
                {expandedSessions.has(s.id) && s.answers && (
                  <div className="mt-1 ml-4 border-l-2 border-blue-200 dark:border-blue-800 pl-4 space-y-1.5 py-2">
                    {s.answers.map((a, ai) => (
                      <div key={ai} className="text-xs">
                        <span className="text-gray-400">Q{a.questionIndex + 1}. </span>
                        <span className="text-gray-600 dark:text-gray-400">{a.questionPrompt.substring(0, 60)}{a.questionPrompt.length > 60 ? '…' : ''}</span>
                        {' '}
                        <span className={a.isCorrect ? 'text-teal-600 font-medium' : 'text-red-500 font-medium'}>
                          {a.isCorrect ? '✓' : `✗ (答: ${a.studentAnswer} / 正: ${a.correctAnswer})`}
                        </span>
                        {a.timeSpent && <span className="text-gray-400 ml-1">{a.timeSpent}s</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
