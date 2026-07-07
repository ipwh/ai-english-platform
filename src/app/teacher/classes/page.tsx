// ============================================
// 教師端 — 班級進度總覽
// ============================================
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, TrendingUp, Target, ChevronRight, Loader2 } from 'lucide-react';
import { mockClasses } from '@/lib/mock-data';
import ProgressBar from '@/components/shared/ProgressBar';
import { useT } from '@/hooks/use-i18n';

export default function TeacherClassesPage() {
  const { t } = useT();
  const [classes, setClasses] = useState(mockClasses);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/classes')
      .then(r => r.json())
      .then(d => { if (d.classes?.length) setClasses(d.classes.map((c: { id: string; name: string; gradeLevel: string; _count?: { students: number; assignments: number } }) => ({ id: c.id, name: c.name, gradeLevel: c.gradeLevel, studentCount: c._count?.students ?? 0, avgAccuracy: 0, avgCompletionRate: 0 }))); })
      .catch(() => { /* fallback to mock */ })
      .finally(() => setLoading(false));
  }, []);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">📊 班級進度</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {mockClasses.map((cls) => (
          <Link
            key={cls.id}
            href={`/teacher/classes/${cls.id}`}
            className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors group"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{cls.name}</h3>
              <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">學生人數</span>
                <span className="font-medium text-gray-900 dark:text-white">{cls.studentCount} 人</span>
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>平均正確率</span>
                  <span>{cls.avgAccuracy}%</span>
                </div>
                <ProgressBar value={cls.avgAccuracy} size="sm" showPercentage={false} />
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>平均完成率</span>
                  <span>{cls.avgCompletionRate}%</span>
                </div>
                <ProgressBar value={cls.avgCompletionRate} size="sm" showPercentage={false} />
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <span className="text-xs text-gray-400">{cls.gradeLevel}（中{cls.gradeLevel.slice(1)}）</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
