// ============================================
// 教師端 — 報告與匯出
// ============================================
'use client';

import { useState } from 'react';
import { FileText, Users, BarChart3, Loader2, CheckCircle } from 'lucide-react';
import { useT } from '@/hooks/use-i18n';

export default function TeacherReportsPage() {
  const { t } = useT();
  const [generating, setGenerating] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const handleGenerate = async (type: string) => {
    setGenerating(type);
    try {
      if (type === 'weekly') {
        await fetch('/api/admin/export-sheets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      } else {
        // individual / parent: export CSV via admin export endpoint
        await fetch('/api/admin/export/students', { method: 'GET' });
      }
      setDone(type);
      setTimeout(() => setDone(null), 3000);
    } catch (e) { console.error('Failed to generate report:', e); }
    finally { setGenerating(null); }
  };

  const reportTypes = [
    { id: 'weekly', label: t('teacher.reports.weekly'), icon: BarChart3, desc: t('teacher.reports.weeklyDesc'), available: true },
    { id: 'individual', label: t('teacher.reports.individual'), icon: Users, desc: t('teacher.reports.individualDesc'), available: true },
    { id: 'parent', label: t('teacher.reports.parent'), icon: FileText, desc: t('teacher.reports.parentDesc'), available: true },
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
            <button
              onClick={() => item.available ? handleGenerate(item.id) : null}
              disabled={!item.available || generating === item.id}
              className={`mt-3 px-4 py-1.5 text-xs rounded-lg transition-colors ${
                item.available
                  ? 'bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
            >
              {generating === item.id ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
              {done === item.id ? <CheckCircle className="w-3 h-3 inline mr-1" /> : null}
              {item.available ? t('teacher.reports.generate') : t('teacher.reports.pdfSoon')}
            </button>
          </div>
        ))}
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{t('teacher.reports.recentWeekly')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          報告將以 CSV 格式匯出，可用 Excel / Google Sheets 開啟。學生個別摘要及家長面談摘要包含全班學生進度數據。
        </p>
      </section>
    </div>
  );
}
