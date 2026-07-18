// ============================================
// 教師端 — 學生搜尋列表（真實資料版）
// ============================================
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Search, ChevronRight, RefreshCw } from 'lucide-react';
import { useT } from '@/hooks/use-i18n';
import { gradeLabels } from '@/shared/utils/nav';

interface RealStudent {
  id: string;
  email: string;
  nameZh: string;
  nameEn: string;
  level: string;
  overallAccuracy: number;
  class?: { name: string; gradeLevel: string } | null;
  classNumber?: string;
}

export default function TeacherStudentsPage() {
  const { t } = useT();
  const [students, setStudents] = useState<RealStudent[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');

  useEffect(() => {
    Promise.all([
      fetch('/api/teacher/students').then(r => r.json()),
      fetch('/api/classes').then(r => r.json()),
    ]).then(([studentData, classData]) => {
      setStudents(studentData.students || []);
      setClasses((classData.classes || []).map((c: Record<string, unknown>) => c.name));
      setLoading(false);
    }).catch((e) => {
      console.error('Failed to load students:', e);
      setLoadError('無法載入學生資料，請檢查網絡後重試。');
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    return students.filter(s => {
      if (search && !(s.nameZh || '').includes(search) && !(s.nameEn || '').toLowerCase().includes(search.toLowerCase()) && !s.email.includes(search.toLowerCase())) return false;
      if (classFilter !== 'all' && s.class?.name !== classFilter) return false;
      if (levelFilter !== 'all' && s.level !== levelFilter) return false;
      return true;
    });
  }, [students, search, classFilter, levelFilter]);

  if (loading) {
    return <div className="flex items-center justify-center py-32"><RefreshCw className="w-8 h-8 animate-spin text-blue-500" /></div>;
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('teacher.students')}</h1>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
          <p className="text-sm text-red-600 dark:text-red-400 mb-3">{loadError}</p>
          <button
            onClick={() => { setLoadError(''); setLoading(true); window.location.reload(); }}
            className="px-4 py-2 bg-red-100 dark:bg-red-800/50 text-red-700 dark:text-red-300 rounded-lg text-sm hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
          >
            {t('common.reloadPage')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('teacher.students')}</h1>

      {/* Search + Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('admin.users.searchPlaceholder')}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none" />
        </div>
        <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm">
          <option value="all">{t('admin.users.all')} {t('admin.users.class')}</option>
          {classes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm">
          <option value="all">{t('admin.users.all')} {t('admin.users.level')}</option>
          {['S1','S2','S3','S4','S5','S6'].map(l => <option key={l} value={l}>{gradeLabels[l] || l}</option>)}
        </select>
        <span className="self-center text-xs text-gray-400">{filtered.length} {t('teacher.classCount').toLowerCase()}</span>
      </div>

      {/* Student table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-gray-500 font-medium w-12">{t('teacher.classDetail.colNumber')}</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">{t('teacher.classes.name')}</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">{t('admin.users.class')}</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">{t('admin.users.level')}</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium">{t('teacher.classes.accuracy')}</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium">{t('teacher.classes.action')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .sort((a, b) => {
                  const classCmp = (a.class?.name || '').localeCompare(b.class?.name || '');
                  if (classCmp !== 0) return classCmp;
                  const na = parseInt(a.classNumber || '999', 10);
                  const nb = parseInt(b.classNumber || '999', 10);
                  if (!isNaN(na) && !isNaN(nb)) return na - nb;
                  if (!isNaN(na)) return -1;
                  if (!isNaN(nb)) return 1;
                  return (a.classNumber || '').localeCompare(b.classNumber || '');
                })
                .map(s => (
                <tr key={s.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="py-3 px-4 text-gray-500 text-xs">{s.classNumber || '-'}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-300">{(s.nameZh || '?').charAt(0)}</div>
                      <div>
                        <span className="font-medium text-gray-900 dark:text-white">{s.nameZh || s.nameEn}</span>
                        {s.nameEn && s.nameZh && <span className="text-xs text-gray-400 ml-1">({s.nameEn})</span>}
                        {!s.nameZh && s.nameEn && <span className="text-xs text-gray-400 ml-1">{s.nameEn}</span>}
                        <p className="text-[10px] text-gray-400">{s.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{s.class?.name || '-'}</td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{s.level || '-'}</td>
                  <td className="text-center py-3 px-4">
                    <span className={s.overallAccuracy >= 70 ? 'text-green-600 font-medium' : s.overallAccuracy >= 50 ? 'text-yellow-600 font-medium' : 'text-red-600 font-medium'}>
                      {s.overallAccuracy != null ? Math.round(s.overallAccuracy) + '%' : '-'}
                    </span>
                  </td>
                  <td className="text-right py-3 px-4">
                    <Link href={`/teacher/students/${s.id}`} className="text-blue-600 text-xs hover:underline flex items-center justify-end gap-1">
                      {t('generic.details')} <ChevronRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-gray-400">{t('generic.noData')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
