// ============================================
// 管理員t("admin.users.title")頁面 — /admin/users
// 分頁、搜尋、篩選、編輯、匯出
// ============================================
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useT } from '@/hooks/use-i18n';
import {
  Search, Filter, ChevronLeft, ChevronRight,
  Edit3, Download, Users, GraduationCap, Shield,
  X, Save, Loader2, RefreshCw, UserPlus,
} from 'lucide-react';

// ---- Types ----
interface ClassInfo {
  id: string;
  name: string;
  gradeLevel: string;
  academicYear?: string;
}

interface UserRecord {
  id: string;
  email: string;
  nameZh: string;
  nameEn: string;
  role: string;
  level?: string;
  classNumber?: string;
  overallAccuracy?: number;
  streakDays: number;
  academicYear?: string;
  subjects?: string;
  department?: string;
  createdAt: string;
  updatedAt: string;
  class?: ClassInfo | null;
  _count: {
    sessions: number;
    mistakes: number;
    vocabItems: number;
    submissions: number;
  };
}

interface UsersResponse {
  users: UserRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  classes: ClassInfo[];
}

// ---- Edit Modal ----
function EditModal({
  user,
  classes,
  onClose,
  onSaved,
}: {
  user: UserRecord;
  classes: ClassInfo[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useT();
  const [form, setForm] = useState({
    nameZh: user.nameZh || '',
    nameEn: user.nameEn || '',
    email: user.email || '',
    role: user.role,
    level: user.level || '',
    className: user.class?.name || '',
    classNumber: user.classNumber || '',
    academicYear: user.academicYear || '',
    subjects: (() => {
      try { return JSON.parse(user.subjects || '[]').join(', '); } catch { return user.subjects || ''; }
    })(),
    department: user.department || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          subjects: form.subjects
            ? form.subjects.split(',').map((s: string) => s.trim()).filter(Boolean)
            : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('admin.users.saveFailed'));
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('admin.users.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            t("admin.users.editUser")
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">t("admin.users.nameZh")</label>
              <input
                value={form.nameZh}
                onChange={e => setForm({ ...form, nameZh: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">t("admin.users.nameEn")</label>
              <input
                value={form.nameEn}
                onChange={e => setForm({ ...form, nameEn: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t("admin.users.email")}</label>
              <input
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t("admin.users.role")}</label>
              <select
                value={form.role}
                onChange={e => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              >
                <option value="student">{t('admin.users.roleStudent')}</option>
                <option value="teacher">{t('admin.users.roleTeacher')}</option>
                <option value="admin">{t('admin.users.roleAdmin')}</option>
              </select>
            </div>
          </div>

          {form.role === 'student' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t("admin.users.level")}</label>
                  <select
                    value={form.level}
                    onChange={e => setForm({ ...form, level: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                  >
                    <option value="">—</option>
                    {['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t("admin.users.class")}</label>
                  <select
                    value={form.className}
                    onChange={e => setForm({ ...form, className: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                  >
                    <option value="">—</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t("admin.users.classNumber")}</label>
                  <input
                    value={form.classNumber}
                    onChange={e => setForm({ ...form, classNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t("admin.users.academicYear")}</label>
                  <input
                    value={form.academicYear}
                    onChange={e => setForm({ ...form, academicYear: e.target.value })}
                    placeholder="2025-2026"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                  />
                </div>
              </div>
            </>
          )}

          {form.role === 'teacher' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">t("admin.users.subjects")</label>
                <input
                  value={form.subjects}
                  onChange={e => setForm({ ...form, subjects: e.target.value })}
                  placeholder="English Language, English Literature"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t("admin.users.department")}</label>
                <input
                  value={form.department}
                  onChange={e => setForm({ ...form, department: e.target.value })}
                  placeholder="English"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            儲存
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Create User Modal ----
function CreateUserModal({
  classes,
  onClose,
  onCreated,
}: {
  classes: ClassInfo[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useT();
  const [form, setForm] = useState({
    email: '',
    password: '',
    nameZh: '',
    nameEn: '',
    role: 'student' as string,
    level: '',
    className: '',
    classNumber: '',
    academicYear: '',
    subjects: '',
    department: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        email: form.email,
        nameZh: form.nameZh,
        nameEn: form.nameEn || undefined,
        role: form.role,
      };
      if (form.password) payload.password = form.password;
      if (form.role === 'student') {
        if (form.level) payload.level = form.level;
        if (form.className) payload.className = form.className;
        if (form.classNumber) payload.classNumber = form.classNumber;
        if (form.academicYear) payload.academicYear = form.academicYear;
      }
      if (form.role === 'teacher') {
        if (form.subjects) payload.subjects = form.subjects.split(',').map((s: string) => s.trim()).filter(Boolean);
        if (form.department) payload.department = form.department;
      }
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('admin.users.createFailed'));
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('admin.users.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            t("admin.users.addUser")
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">t("admin.users.nameZh") *</label>
              <input
                value={form.nameZh}
                onChange={e => setForm({ ...form, nameZh: e.target.value })}
                placeholder="Chan Tai Man"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">t("admin.users.nameEn")</label>
              <input
                value={form.nameEn}
                onChange={e => setForm({ ...form, nameEn: e.target.value })}
                placeholder="Chan Tai Man"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="student@school.edu.hk"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">t("admin.users.role")+" *"</label>
              <select
                value={form.role}
                onChange={e => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              >
                <option value="student">{t('admin.users.roleStudent')}</option>
                <option value="teacher">{t('admin.users.roleTeacher')}</option>
                <option value="admin">{t('admin.users.roleAdmin')}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              t("admin.users.password") <span className="text-gray-400"></span>
            </label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder="最少 6 個字元"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
            />
          </div>

          {form.role === 'student' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t("admin.users.level")}</label>
                  <select
                    value={form.level}
                    onChange={e => setForm({ ...form, level: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                  >
                    <option value="">—</option>
                    {['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t("admin.users.class")}</label>
                  <select
                    value={form.className}
                    onChange={e => setForm({ ...form, className: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                  >
                    <option value="">—</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t("admin.users.classNumber")}</label>
                  <input
                    value={form.classNumber}
                    onChange={e => setForm({ ...form, classNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t("admin.users.academicYear")}</label>
                  <input
                    value={form.academicYear}
                    onChange={e => setForm({ ...form, academicYear: e.target.value })}
                    placeholder="2025-2026"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                  />
                </div>
              </div>
            </>
          )}

          {form.role === 'teacher' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">t("admin.users.subjects")</label>
                <input
                  value={form.subjects}
                  onChange={e => setForm({ ...form, subjects: e.target.value })}
                  placeholder="English Language, English Literature"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t("admin.users.department")}</label>
                <input
                  value={form.department}
                  onChange={e => setForm({ ...form, department: e.target.value })}
                  placeholder="English"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !form.email || !form.nameZh}
            className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            建立帳號
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Role Badge ----
function RoleBadge({ role }: { role: string }) {
  const config = {
    student: { icon: Users, label: '學生', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    teacher: { icon: GraduationCap, label: '教師', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
    admin: { icon: Shield, label: '管理員', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  };
  const c = config[role as keyof typeof config] || config.student;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.color}`}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  );
}

// ============================================
// Main Page
// ============================================

export default function AdminUsersPage() {
  const { t } = useT();
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Edit modal
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Export loading
  const [exporting, setExporting] = useState<'students' | 'teachers' | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      if (levelFilter) params.set('level', levelFilter);
      if (classFilter) params.set('className', classFilter);

      const res = await fetch(`/api/admin/users?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t('admin.users.loadFailed'));
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('admin.users.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, levelFilter, classFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleExport = async (type: 'students' | 'teachers') => {
    setExporting(type);
    try {
      const res = await fetch(`/api/admin/export/${type}?format=csv`);
      if (!res.ok) throw new Error('匯出失敗');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_export.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('匯出失敗，請稍後再試。');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">t("admin.users.title")</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {data ? `共 ${data.total} 位使用者` : '載入中...'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            t("admin.users.addUser")
          </button>
          <button
            onClick={() => handleExport('students')}
            disabled={exporting === 'students'}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {exporting === 'students' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            匯出學生數據
          </button>
          <button
            onClick={() => handleExport('teachers')}
            disabled={exporting === 'teachers'}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {exporting === 'teachers' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            匯出教師數據
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">{t("admin.users.search")}</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="姓名或 email..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              />
            </div>
          </div>

          {/* Role filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t("admin.users.role")}</label>
            <select
              value={roleFilter}
              onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
            >
              <option value="">{t("admin.users.all")}</option>
              <option value="student">{t('admin.users.roleStudent')}</option>
              <option value="teacher">{t('admin.users.roleTeacher')}</option>
              <option value="admin">{t('admin.users.roleAdmin')}</option>
            </select>
          </div>

          {/* Level filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t("admin.users.level")}</label>
            <select
              value={levelFilter}
              onChange={e => { setLevelFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
            >
              <option value="">{t("admin.users.all")}</option>
              {['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          {/* Class filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t("admin.users.class")}</label>
            <select
              value={classFilter}
              onChange={e => { setClassFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
            >
              <option value="">{t("admin.users.all")}</option>
              {data?.classes.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            篩選
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
          {error}
          <button onClick={fetchUsers} className="ml-3 underline">{t("admin.users.retry")}</button>
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
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">使用者</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t("admin.users.email")}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t("admin.users.role")}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t("admin.users.class")}</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t("admin.users.accuracy")}</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">t("admin.users.sessions")</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t("admin.users.academicYear")}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{t("admin.users.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {data?.users.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{user.nameZh}</p>
                        <p className="text-xs text-gray-500">{user.nameEn}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono text-xs">
                      {user.email}
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {user.class?.name || '-'}
                      {user.classNumber && <span className="text-xs text-gray-400 ml-1">#{user.classNumber}</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {user.overallAccuracy != null ? (
                        <span className={`font-medium ${user.overallAccuracy >= 70 ? 'text-green-600' : user.overallAccuracy >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {Math.round(user.overallAccuracy)}%
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">
                      {user._count.sessions}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500 text-xs">
                      {user.academicYear || user.class?.academicYear || '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditingUser(user)}
                        className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                        title="編輯"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {data?.users.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                      沒有符合條件的使用者
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
              第 {data.page} / {data.totalPages} 頁
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

      {/* Edit Modal */}
      {editingUser && (
        <EditModal
          user={editingUser}
          classes={data?.classes || []}
          onClose={() => setEditingUser(null)}
          onSaved={fetchUsers}
        />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateUserModal
          classes={data?.classes || []}
          onClose={() => setShowCreateModal(false)}
          onCreated={fetchUsers}
        />
      )}
    </div>
  );
}
