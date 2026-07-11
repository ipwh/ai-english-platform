// ============================================
// 教師端 — 報告與匯出
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { Users, BarChart3, Loader2, CheckCircle, Download } from 'lucide-react';
import { useT } from '@/hooks/use-i18n';

export default function TeacherReportsPage() {
  const { t } = useT();
  const [generating, setGenerating] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [classes, setClasses] = useState<{ id: string; name: string; gradeLevel: string; studentCount?: number }[]>([]);
  const [selectedClass, setSelectedClass] = useState('');

  useEffect(() => {
    fetch('/api/classes')
      .then(r => r.json())
      .then(d => {
        const list = d.classes || [];
        setClasses(list);
        if (list.length > 0) setSelectedClass(list[0].name);
      })
      .catch(() => {});
  }, []);

  const handleGenerate = async (type: string) => {
    setGenerating(type);
    try {
      const classParam = selectedClass ? `&className=${encodeURIComponent(selectedClass)}` : '';
      if (type === 'weekly') {
        // Weekly report: aggregate class summary
        const res = await fetch(`/api/admin/export/students?format=csv&type=weekly${classParam}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedClass || 'all'}_weekly_report.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // Individual report: per-student detailed progress
        const res = await fetch(`/api/admin/export/students?format=csv&type=individual${classParam}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedClass || 'all'}_individual_report.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
      setDone(type);
      setTimeout(() => setDone(null), 3000);
    } catch (e) { console.error('Failed to generate report:', e); }
    finally { setGenerating(null); }
  };

  const reportTypes = [
    { id: 'weekly', label: t('teacher.reports.weekly'), icon: BarChart3, desc: t('teacher.reports.weeklyDesc'), available: true },
    { id: 'individual', label: t('teacher.reports.individual'), icon: Users, desc: t('teacher.reports.individualDesc'), available: true },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('teacher.reports.title')}</h1>

      {/* 班級選擇 */}
      {classes.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <label className="text-xs font-medium text-gray-500 mb-2 block">{t('teacher.reports.selectClass')}</label>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedClass('')}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${!selectedClass ? 'bg-teal-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}
            >
              {t('teacher.reports.allClasses')}
            </button>
            {classes.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedClass(c.name)}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${selectedClass === c.name ? 'bg-teal-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}
              >
                {c.name} {c.studentCount ? `(${c.studentCount})` : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {reportTypes.map((item, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mx-auto mb-3">
              <item.icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="font-medium text-gray-900 dark:text-white">{item.label}</h3>
            <p className="text-xs text-gray-500 mt-1">{item.desc}</p>
            <button
              onClick={() => handleGenerate(item.id)}
              disabled={generating === item.id}
              className="mt-3 px-4 py-1.5 text-xs rounded-lg transition-colors bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50"
            >
              {generating === item.id ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
              {done === item.id ? <CheckCircle className="w-3 h-3 inline mr-1" /> : <Download className="w-3 h-3 inline mr-1" />}
              {done === item.id ? t('teacher.reports.exported') : t('teacher.reports.generate')}
            </button>
          </div>
        ))}
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{t('teacher.reports.recentWeekly')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('teacher.reports.instruction')}
        </p>
      </section>
    </div>
  );
}
