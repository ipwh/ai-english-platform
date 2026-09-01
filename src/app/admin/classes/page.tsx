// ============================================
// 管理員班級管理頁面 — /admin/classes
// ============================================
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useT } from '@/hooks/use-i18n';
import { Plus, Trash2, Save, Loader2, RefreshCw, Users, BookOpen } from 'lucide-react';

interface ClassRecord {
  id: string;
  name: string;
  gradeLevel: string;
  academicYear: string;
  studentCount: number;
  assignmentCount: number;
  createdAt: string;
}

export default function AdminClassesPage() {
  const { t } = useT();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add form
  const [newName, setNewName] = useState('');
  const [newGrade, setNewGrade] = useState('S4');
  const [newYear, setNewYear] = useState('2026-2027');

  const fetchClasses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/classes');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("admin.classes.loadFailed"));
      setClasses(json.classes || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("admin.classes.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClasses(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), gradeLevel: newGrade, academicYear: newYear }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("admin.classes.addFailed"));
      setNewName('');
      setShowAdd(false);
      fetchClasses();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : t('admin.users.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(t('admin.classes.confirmDelete', { name }))) return;
    try {
      const res = await fetch(`/api/admin/classes?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(t("admin.classes.deleteFailed"));
      fetchClasses();
    } catch {
      const msg = t('admin.classes.deleteFailed');
      alert(msg);
    }
  };

  const totalStudents = classes.reduce((sum, c) => sum + c.studentCount, 0);
  const levels = [...new Set(classes.map(c => c.gradeLevel))].sort();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('admin.classes.title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {classes.length} {t('admin.classes.classCount')} · {totalStudents} {t('admin.classes.studentCount')}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('admin.classes.addClass')}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
          {error}
          <button onClick={fetchClasses} className="ml-3 underline">{t("admin.classes.retry")}</button>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">{t("admin.classes.addClass")}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t("admin.classes.className")}</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. 4A"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t("admin.classes.gradeLevel")}</label>
              <select
                value={newGrade}
                onChange={e => setNewGrade(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              >
                {['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t("admin.classes.academicYear")}</label>
              <input
                value={newYear}
                onChange={e => setNewYear(e.target.value)}
                placeholder="2026-2027"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleAdd}
                disabled={saving || !newName.trim()}
                className="w-full px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t('admin.classes.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary by level */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {levels.map(level => {
          const levelClasses = classes.filter(c => c.gradeLevel === level);
          const levelStudents = levelClasses.reduce((s, c) => s + c.studentCount, 0);
          return (
            <div key={level} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
              <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{level}</p>
              <p className="text-xs text-gray-500">{levelClasses.length} {t('admin.classes.classUnit')} · {levelStudents} {t('admin.classes.studentUnit')}</p>
            </div>
          );
        })}
      </div>

      {/* Class table */}
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
                  <th className="text-left px-6 py-3 font-medium text-gray-600 dark:text-gray-300">{t("admin.classes.className")}</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-600 dark:text-gray-300">{t("admin.classes.gradeLevel")}</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-600 dark:text-gray-300">{t("admin.classes.academicYear")}</th>
                  <th className="text-center px-6 py-3 font-medium text-gray-600 dark:text-gray-300">{t("admin.classes.studentCount")}</th>
                  <th className="text-center px-6 py-3 font-medium text-gray-600 dark:text-gray-300">{t("admin.classes.assignmentCount")}</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-600 dark:text-gray-300">{t("admin.classes.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {classes.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-6 py-3 font-medium text-gray-900 dark:text-white">{c.name}</td>
                    <td className="px-6 py-3 text-gray-600 dark:text-gray-400">{c.gradeLevel}</td>
                    <td className="px-6 py-3 text-gray-500 text-xs">{c.academicYear}</td>
                    <td className="px-6 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400">
                        <Users className="w-3.5 h-3.5" />
                        {c.studentCount}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400">
                        <BookOpen className="w-3.5 h-3.5" />
                        {c.assignmentCount}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={() => handleDelete(c.id, c.name)}
                        disabled={c.studentCount > 0}
                        className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title={c.studentCount > 0 ? t("admin.classes.cannotDelete") : t("admin.classes.delete")}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {classes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                      {t("admin.classes.noClasses")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
