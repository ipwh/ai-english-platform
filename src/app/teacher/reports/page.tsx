// ============================================
// 教師端 — 報告與匯出
// ============================================
'use client';

import { FileText, Users, BarChart3 } from 'lucide-react';
import { useT } from '@/hooks/use-i18n';

export default function TeacherReportsPage() {
  const { t } = useT();

  const reportTypes = [
    { label: t('teacher.reports.weekly'), icon: BarChart3, desc: t('teacher.reports.weeklyDesc') },
    { label: t('teacher.reports.individual'), icon: Users, desc: t('teacher.reports.individualDesc') },
    { label: t('teacher.reports.parent'), icon: FileText, desc: t('teacher.reports.parentDesc') },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('teacher.reports.title')}</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {reportTypes.map((item, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mx-auto mb-3">
              <item.icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="font-medium text-gray-900 dark:text-white">{item.label}</h3>
            <p className="text-xs text-gray-500 mt-1">{item.desc}</p>
            <button className="mt-3 px-4 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded-lg hover:bg-gray-200 transition-colors">
              {t('teacher.reports.generate')}
            </button>
          </div>
        ))}
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{t('teacher.reports.recentWeekly')}</h2>
        <p className="text-sm text-gray-400">{t('teacher.reports.pdfSoon')}</p>
      </section>
    </div>
  );
}
