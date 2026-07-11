// ============================================
// 教師端 — 班級進度總覽
// ============================================
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useT } from '@/hooks/use-i18n';
import { gradeLabels } from '@/lib/nav';

export default function TeacherClassesPage() {
  const { t } = useT();
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadClasses = () => {
    setLoading(true); setLoadError(false);
    fetch('/api/classes')
      .then(r => r.json())
      .then(d => setClasses((d.classes || []).map((c: any) => ({
        ...c,
        studentCount: c._count?.students ?? 0,
        assignmentCount: c._count?.assignments ?? 0,
      }))))
      .catch((e) => { console.error('Failed to load classes:', e); setLoadError(true); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadClasses(); }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('teacher.classes.title')}</h1>

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
    </div>
  );
}
