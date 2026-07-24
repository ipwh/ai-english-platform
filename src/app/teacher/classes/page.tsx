// ============================================
// 教師端 — 班級進度總覽
// ============================================
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronRight, Loader2, AlertTriangle, GraduationCap } from 'lucide-react';
import { logger } from '@/shared/logger/logger';
import { useT } from '@/hooks/use-i18n';
import { gradeLabels } from '@/shared/utils/nav';

export default function TeacherClassesPage() {
  const { t } = useT();
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadClasses = () => {
    setLoading(true); setLoadError('');
    fetch('/api/classes')
      .then(r => r.json())
      .then(d => setClasses((d.classes || []).map((c: any) => ({
        ...c,
        studentCount: c._count?.students ?? 0,
        assignmentCount: c._count?.assignments ?? 0,
      }))))
      .catch((e) => { logger.error({ module: 'teacher-classes', error: e instanceof Error ? e.message : String(e) }, 'Failed to load classes'); setLoadError(t('common.somethingWrong')); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadClasses(); }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('teacher.classes.title')}</h1>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      )}

      {/* Error */}
      {!loading && loadError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300 flex-1">{loadError}</p>
          <button onClick={loadClasses} className="text-sm text-red-600 dark:text-red-400 underline hover:no-underline">
            {t('common.reloadPage')}
          </button>
        </div>
      )}

      {/* Empty */}
      {!loading && !loadError && classes.length === 0 && (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">{t('teacher.classes.noClasses')}</p>
        </div>
      )}

      {/* Class cards */}
      {!loading && !loadError && classes.length > 0 && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {classes.map((cls) => (
          <Link key={cls.id} href={`/teacher/classes/${cls.id}`}
            className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors group">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{cls.name}</h3>
              <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">{t('generic.studentCount')}</span>
                <span className="font-medium text-gray-900 dark:text-white">{cls.studentCount} {t('generic.people')}</span>
              </div>
              {cls.assignmentCount > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">{t('teacher.classes.assignmentCount')}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{cls.assignmentCount}</span>
                </div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <span className="text-xs text-gray-400">{cls.gradeLevel}（{gradeLabels[cls.gradeLevel] || cls.gradeLevel}）</span>
            </div>
          </Link>
        ))}
      </div>
      )}
    </div>
  );
}
