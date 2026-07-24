// ============================================
// 教師端 — 學生搜尋列表（真實資料版）
// ============================================
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Search, ChevronRight, RefreshCw, Users, X, Loader2, Check } from 'lucide-react';
import { logger } from '@/shared/logger/logger';
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
  const { t, language } = useT();
  const lang = language || 'zh';
  const [students, setStudents] = useState<RealStudent[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');

  // === 自訂組別狀態 ===
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState('');
  const [groupSuccess, setGroupSuccess] = useState(false);

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedForGroup.length === 0) return;
    setCreatingGroup(true);
    setGroupError('');
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: groupName.trim(), description: groupDesc.trim(), studentIds: selectedForGroup }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '建立失敗');
      setGroupSuccess(true);
      setTimeout(() => { setShowGroupModal(false); setGroupSuccess(false); setGroupName(''); setGroupDesc(''); setSelectedForGroup([]); }, 1500);
    } catch (err: unknown) {
      setGroupError(err instanceof Error ? err.message : '建立失敗');
    } finally { setCreatingGroup(false); }
  };

  useEffect(() => {
    Promise.all([
      fetch('/api/teacher/students').then(r => r.json()),
      fetch('/api/classes').then(r => r.json()),
    ]).then(([studentData, classData]) => {
      setStudents(studentData.students || []);
      setClasses((classData.classes || []).map((c: Record<string, unknown>) => c.name));
      setLoading(false);
    }).catch((e) => {
      logger.error({ module: 'teacher-students', error: e instanceof Error ? e.message : String(e) }, 'Failed to load students');
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
        <button
          onClick={() => { setSelectedForGroup(filtered.map(s => s.id)); setShowGroupModal(true); }}
          className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg flex items-center gap-1.5 transition-colors"
        >
          <Users className="w-4 h-4" />
          建立組別
        </button>
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

      {/* ====== 建立組別 Modal ====== */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !creatingGroup && setShowGroupModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('groups.createTitle')}</h3>
              <button onClick={() => setShowGroupModal(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {groupSuccess ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-green-600 font-medium">{lang === 'en' ? 'Group created successfully!' : '組別建立成功！'}</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t('groups.name') || '組別名稱'} *</label>
                    <input
                      type="text"
                      value={groupName}
                      onChange={e => setGroupName(e.target.value)}
                      placeholder={t('groups.namePlaceholder')}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t('groups.descPlaceholder')}</label>
                    <input
                      type="text"
                      value={groupDesc}
                      onChange={e => setGroupDesc(e.target.value)}
                      placeholder={lang === 'en' ? 'Group purpose or notes' : '組別目的或備註'}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t('groups.selectStudents')}</label>
                    <GroupStudentSelector
                      students={filtered}
                      selectedIds={selectedForGroup}
                      onSelectionChange={setSelectedForGroup}
                      language={lang}
                    />
                  </div>
                  {groupError && <p className="text-xs text-red-500">{groupError}</p>}
                </div>
                <div className="flex justify-end gap-3 mt-4">
                  <button onClick={() => setShowGroupModal(false)} disabled={creatingGroup}
                    className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                    {t('groups.cancel')}
                  </button>
                  <button onClick={handleCreateGroup} disabled={creatingGroup || !groupName.trim() || selectedForGroup.length === 0}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                    {creatingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                    {t('groups.createBtn')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// 組別學生選擇器（含搜尋、班級篩選、全選）
// ============================================
function GroupStudentSelector({
  students,
  selectedIds,
  onSelectionChange,
  language,
}: {
  students: RealStudent[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  language: string;
}) {
  const [modalSearch, setModalSearch] = useState('');
  const [modalClassFilter, setModalClassFilter] = useState('');

  const classList = [...new Set(students.map(s => s.class?.name).filter(Boolean) as string[])].sort();

  const modalFiltered = students.filter(s => {
    const searchLower = modalSearch.toLowerCase();
    if (modalSearch && !(s.nameZh || '').includes(searchLower) && !(s.nameEn || '').toLowerCase().includes(searchLower) && !s.email.toLowerCase().includes(searchLower)) return false;
    if (modalClassFilter && s.class?.name !== modalClassFilter) return false;
    return true;
  });

  const allSelected = modalFiltered.length > 0 && modalFiltered.every(s => selectedIds.includes(s.id));

  const displayName = (s: RealStudent) => {
    if (language === 'en') return s.nameEn || s.nameZh || s.email;
    return s.nameZh || s.nameEn || s.email;
  };

  const displayNameSub = (s: RealStudent) => {
    if (language === 'en' && s.nameEn && s.nameZh) return s.nameZh;
    if (language !== 'en' && s.nameZh && s.nameEn) return s.nameEn;
    return '';
  };

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
          <input
            type="text"
            value={modalSearch}
            onChange={e => setModalSearch(e.target.value)}
            placeholder={language === 'en' ? 'Search student name...' : '搜尋學生姓名...'}
            className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 outline-none"
          />
        </div>
        <select
          value={modalClassFilter}
          onChange={e => setModalClassFilter(e.target.value)}
          className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 outline-none"
        >
          <option value="">{language === 'en' ? 'All classes' : '全部班級'}</option>
          {classList.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="flex items-center justify-between mb-1">
        <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" checked={allSelected} onChange={() => {
            if (allSelected) {
              onSelectionChange(selectedIds.filter(id => !modalFiltered.find(s => s.id === id)));
            } else {
              const newIds = [...selectedIds];
              for (const s of modalFiltered) {
                if (!newIds.includes(s.id)) newIds.push(s.id);
              }
              onSelectionChange(newIds);
            }
          }} className="rounded" />
          {language === 'en' ? `Select all (${modalFiltered.length})` : `全選 (${modalFiltered.length} 位)`}
        </label>
        <span className="text-xs text-blue-600 font-medium">{language === 'en' ? `${selectedIds.length} selected` : `已選 ${selectedIds.length} 人`}</span>
      </div>
      <div className="max-h-32 overflow-y-auto space-y-1 border border-gray-100 dark:border-gray-700 rounded-lg p-1">
        {modalFiltered.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">{language === 'en' ? 'No matching students' : '無符合條件的學生'}</p>
        ) : (
          modalFiltered.map(s => (
            <label key={s.id} className="flex items-center gap-2 p-1.5 bg-gray-50 dark:bg-gray-700/50 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">
              <input
                type="checkbox"
                checked={selectedIds.includes(s.id)}
                onChange={(e) => {
                  if (e.target.checked) onSelectionChange([...selectedIds, s.id]);
                  else onSelectionChange(selectedIds.filter(id => id !== s.id));
                }}
                className="rounded"
              />
              <span className="flex-1 min-w-0 truncate">{displayName(s)}</span>
              {displayNameSub(s) && <span className="text-xs text-gray-400 hidden sm:inline">{displayNameSub(s)}</span>}
              <span className="text-xs text-gray-400 flex-shrink-0">{s.class?.name || ''}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
