// ============================================
// 管理員：學生個人分析總覽 — /admin/students
// 列出所有學生，支援搜尋、年級及班級篩選
// ============================================
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useT } from '@/hooks/use-i18n';
import {
  Search, ChevronLeft, ChevronRight, RefreshCw,
  BarChart3, Filter,
} from 'lucide-react';

// ---- Types ----
interface ClassInfo {
  id: string;
  name: string;
  gradeLevel: string;
}

interface StudentRecord {
  id: string;
  nameZh: string;
  nameEn: string;
  email: string;
  level: string | null;
  classNumber: string | null;
  overallAccuracy: number | null;
  streakDays: number;
  xp: number | null;
  academicYear: string | null;
  class: ClassInfo | null;
  _count: {
    sessions: number;
    mistakes: number;
    vocabItems: number;
    submissions: number;
  };
}

interface StudentsResponse {
  students: StudentRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  classes: ClassInfo[];
}

// ---- Level Badge ----
function LevelBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-gray-400">-</span>;
  const colors: Record<string, string> = {
    S1: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    S2: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    S3: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    S4: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    S5: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    S6: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[level] || 'bg-gray-100 text-gray-700'}`}>
      {level}
    </span>
  );
}

// ============================================
// Main Page
// ============================================

export default function AdminStudentsPage() {
  const { t } = useT();
  const [data, setData] = useState<StudentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const mountedRef = useRef(true);

  // Stable error message (avoid t in deps to prevent infinite loops)
  const loadFailedMsg = '載入失敗';

  const fetchStudents = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      params.set('role', 'student');
      if (search) params.set('search', search);
      if (levelFilter) params.set('level', levelFilter);
      if (classFilter) params.set('className', classFilter);

      const res = await fetch(`/api/admin/users?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || loadFailedMsg);
      if (mountedRef.current) {
        setData({
          students: json.users,
          total: json.total,
          page: json.page,
          pageSize: json.pageSize,
          totalPages: json.totalPages,
          classes: json.classes || [],
        });
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : loadFailedMsg);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    fetchStudents();
    return () => { mountedRef.current = false; };
  }, [page, search, levelFilter, classFilter]);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const classList = data?.classes || [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('admin.students.title')}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          {data ? t('admin.students.totalStudents', { n: data.total }) : t('admin.users.loading')}
        </p>
      </div>

      {/* Search & Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.users.search')}</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder={t('admin.users.searchPlaceholder')}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              />
            </div>
          </div>
          {/* Level filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.users.level')}</label>
            <select
              value={levelFilter}
              onChange={e => { setLevelFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
            >
              <option value="">{t('admin.users.all')}</option>
              {['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          {/* Class filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('admin.users.class')}</label>
            <select
              value={classFilter}
              onChange={e => { setClassFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
            >
              <option value="">{t('admin.users.all')}</option>
              {classList.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            {t('admin.users.filter')}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
          {error}
          <button onClick={() => { setPage(1); fetchStudents(); }} className="ml-3 underline">{t('admin.users.retry')}</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-6 h-6 animate-spin text-purple-500" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t('admin.users.name')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t('admin.users.email')}</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t('admin.users.level')}</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t('admin.users.class')}</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t('admin.users.accuracy')}</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t('admin.users.sessions')}</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">XP</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t('admin.users.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {data?.students.map(student => (
                  <tr key={student.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{student.nameZh}</p>
                        <p className="text-xs text-gray-500">{student.nameEn}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono text-xs">
                      {student.email}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <LevelBadge level={student.level} />
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">
                      {student.class?.name || '-'}
                      {student.classNumber && <span className="text-xs text-gray-400 ml-1">#{student.classNumber}</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {student.overallAccuracy != null ? (
                        <span className={`font-medium ${
                          student.overallAccuracy >= 70 ? 'text-green-600' :
                          student.overallAccuracy >= 50 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {Math.round(student.overallAccuracy)}%
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">
                      {student._count.sessions}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                        {(student.xp ?? 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/students/${student.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded-lg text-xs font-medium hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
                      >
                        <BarChart3 className="w-3.5 h-3.5" />
                        {t('admin.students.analyze')}
                      </Link>
                    </td>
                  </tr>
                ))}
                {data?.students.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                      {t('admin.users.noUsers')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-500">
              {t('admin.users.pageInfo', { page: data.page, total: data.totalPages })}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={data.page <= 1}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 disabled:opacity-30 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => {
                let pageNum: number;
                if (data.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (data.page <= 3) {
                  pageNum = i + 1;
                } else if (data.page >= data.totalPages - 2) {
                  pageNum = data.totalPages - 4 + i;
                } else {
                  pageNum = data.page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-8 h-8 text-sm rounded-lg ${
                      pageNum === data.page
                        ? 'bg-purple-600 text-white'
                        : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                disabled={data.page >= data.totalPages}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 disabled:opacity-30 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
