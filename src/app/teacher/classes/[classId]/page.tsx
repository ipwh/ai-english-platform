// ============================================
// 教師端 — 單一班級詳情（真實資料版）
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Users, ChevronRight, RefreshCw } from 'lucide-react';
import { useT } from '@/hooks/use-i18n';

/** Days since last activity; null = unknown (never active / no data). */
function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return null;
  return Math.floor((Date.now() - d) / 86400000);
}

interface RealStudent {
  id: string;
  email: string;
  nameZh: string;
  nameEn: string;
  level: string;
  classNumber?: string;
  overallAccuracy: number | null;
  class?: { id: string; name: string; gradeLevel: string } | null;
  lastActiveAt?: string | null;
  shortWritingCount?: number;
  _count?: { sessions: number; mistakes: number; writingDrafts: number };
}

interface ClassDetail {
  id: string; name: string; gradeLevel: string; academicYear?: string;
  _count?: { students?: number; assignments?: number };
}

export default function ClassDetailPage() {
  const { t } = useT();
  const params = useParams();
  const classId = params.classId as string;

  const [cls, setCls] = useState<ClassDetail | null>(null);
  const [students, setStudents] = useState<RealStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/classes').then(r => r.json()),
      fetch('/api/teacher/students').then(r => r.json()),
    ]).then(([classData, studentData]) => {
      const found = (classData.classes || []).find((c: Record<string, unknown>) => c.id === classId);
      setCls(found || null);
      const classStudents = (studentData.students || []).filter(
        (s: RealStudent) => s.class?.id === classId
      );
      setStudents(classStudents);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [classId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!cls) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">{t('teacher.classDetail.notFound')}</p>
        <Link href="/teacher/classes" className="text-blue-600 hover:underline mt-2 inline-block">
          <ArrowLeft className="w-4 h-4 inline mr-1" />{t('teacher.classDetail.back')}
        </Link>
      </div>
    );
  }

  // 2026-09-20 稽核：只計「有可驗證資料」的學生（null = 無資料，不得當 0 拉低平均）
  const withAccuracy = students.filter(s => s.overallAccuracy != null);
  const avgAccuracy = withAccuracy.length > 0
    ? Math.round(withAccuracy.reduce((sum, s) => sum + (s.overallAccuracy ?? 0), 0) / withAccuracy.length)
    : null;

  const inactiveCount = students.filter(s => {
    if (!s.lastActiveAt) return (s._count?.sessions ?? 0) === 0;
    const days = daysSince(s.lastActiveAt);
    return days === null ? false : days >= 14;
  }).length;

  const activityBadge = (s: RealStudent): { text: string; cls: string } => {
    if (!s.lastActiveAt) {
      return { text: t('teacher.classDetail.notStarted'), cls: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' };
    }
    const days = daysSince(s.lastActiveAt);
    if (days === null || days >= 14) return { text: t('teacher.students.inactive'), cls: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' };
    if (days >= 7) return { text: t('teacher.students.lowActivity'), cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' };
    return { text: t('teacher.students.active'), cls: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/teacher/classes" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('teacher.classDetail.classDetail', { name: cls.name })}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {cls.gradeLevel} · {students.length}{t('teacher.classDetail.studentsCount')}
          </p>
        </div>
      </div>

      {/* 班級摘要卡 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('teacher.classDetail.studentCount'), value: students.length, unit: t('common.people'), icon: Users, color: 'text-blue-600' },
          { label: t('teacher.classDetail.avgAccuracy'), value: avgAccuracy ?? '—', unit: avgAccuracy === null ? undefined : t('common.percent'), icon: ArrowLeft, color: 'text-green-600' },
          { label: t('teacher.classDetail.totalSessions'), value: students.reduce((s, stu) => s + (stu._count?.sessions || 0), 0), unit: t('common.sessions'), icon: ChevronRight, color: 'text-teal-600' },
          { label: t('teacher.dashboard.inactiveStudents'), value: inactiveCount, unit: t('common.people'), icon: Users, color: 'text-red-600' },
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
              <span className="text-xs text-gray-500">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stat.value}<span className="text-sm text-gray-400 ml-1">{stat.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {/* 學生列表 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">{t('teacher.classDetail.studentList')}</h2>
        {students.length === 0 ? (
          <p className="text-gray-400 text-sm py-8 text-center">{t('teacher.classDetail.noStudents')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left py-2 text-gray-500 font-medium w-12">{t('teacher.classDetail.colNumber')}</th>
                  <th className="text-left py-2 text-gray-500 font-medium">{t('teacher.classDetail.colNameZh')}</th>
                  <th className="text-left py-2 text-gray-500 font-medium hidden sm:table-cell">{t('teacher.classDetail.colNameEn')}</th>
                  <th className="text-center py-2 text-gray-500 font-medium">{t('teacher.classDetail.colAccuracy')}</th>
                  <th className="text-center py-2 text-gray-500 font-medium hidden sm:table-cell">{t('teacher.classDetail.colSessions')}</th>
                  <th className="text-center py-2 text-gray-500 font-medium hidden sm:table-cell">{t('teacher.classDetail.colLastActive')}</th>
                  <th className="text-center py-2 text-gray-500 font-medium hidden sm:table-cell">{t('teacher.classDetail.colWriting')}</th>
                  <th className="text-right py-2 text-gray-500 font-medium">{t('teacher.classDetail.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {students
                  .sort((a, b) => {
                    const na = parseInt(a.classNumber || '999', 10);
                    const nb = parseInt(b.classNumber || '999', 10);
                    if (!isNaN(na) && !isNaN(nb)) return na - nb;
                    // fallback: numeric first, then string
                    if (!isNaN(na)) return -1;
                    if (!isNaN(nb)) return 1;
                    return (a.classNumber || '').localeCompare(b.classNumber || '');
                  })
                  .map((s) => (
                    <tr key={s.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="py-3 text-gray-500 text-xs">{s.classNumber || '-'}</td>
                      <td className="py-3">
                        <span className="font-medium text-gray-900 dark:text-white">{s.nameZh}</span>
                      </td>
                      <td className="py-3 text-xs text-gray-500 hidden sm:table-cell">{s.nameEn}</td>
                      <td className="text-center py-3">
                        {s.overallAccuracy != null ? (
                          <span className={`font-medium text-sm ${s.overallAccuracy >= 70 ? 'text-green-600' : s.overallAccuracy >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {Math.round(s.overallAccuracy)}%
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="text-center py-3 text-xs text-gray-500 hidden sm:table-cell">
                        {s._count?.sessions || 0}
                      </td>
                      <td className="text-center py-3 hidden sm:table-cell">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${activityBadge(s).cls}`}>{activityBadge(s).text}</span>
                      </td>
                      <td className="text-center py-3 text-xs text-gray-500 hidden sm:table-cell">
                        {s._count?.writingDrafts ?? 0}
                        {(s.shortWritingCount ?? 0) > 0 && (
                          <span className="text-amber-600 ml-1">（{s.shortWritingCount} {t('teacher.students.shortWriting')}）</span>
                        )}
                      </td>
                      <td className="text-right py-3">
                        <Link href={`/teacher/students/${s.id}`}
                          className="text-blue-600 text-xs hover:underline flex items-center justify-end gap-1">
                          {t('teacher.classDetail.detail')} <ChevronRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
