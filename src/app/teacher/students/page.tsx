// ============================================
// 教師端 — 學生搜尋列表（真實資料版）
// ============================================
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Search, ChevronRight, RefreshCw, Users, X, Loader2, Check } from 'lucide-react';
import { logger } from '@/shared/logger/logger';
import { useT } from '@/hooks/use-i18n';
import { gradeLabels, getDifficultyLabel } from '@/shared/utils/nav';

interface RealStudent {
  id: string;
  email: string;
  nameZh: string;
  nameEn: string;
  level: string;
  overallAccuracy: number | null;
  class?: { name: string; gradeLevel: string } | null;
  studentClasses?: Array<{ class: { name: string; gradeLevel: string } }>;
  classNumber?: string;
  lastActiveAt?: string | null;
  /** 2026-09-21：由伺服器計算（單一門檻 owner） */
  daysInactive?: number | null;
  activityStatus?: 'never-started' | 'inactive' | 'low' | 'active';
  dominantDifficulty?: string | null;
  shortWritingCount?: number;
  _count?: { sessions: number; mistakes: number; writingDrafts: number };
}

type ActivityFilter = 'all' | 'active' | 'low' | 'inactive' | 'never-started';
type AccuracyFilter = 'all' | 'low' | 'mid' | 'high' | 'nodata';
type SortKey = 'class' | 'activity' | 'accuracy-asc' | 'accuracy-desc' | 'mistakes' | 'short-writing';

/** 教師主頁「查看全部 N 人」帶入的 ?risk= 篩選（僅接受已知值）。 */
function readRiskParam(): ActivityFilter {
  if (typeof window === 'undefined') return 'all';
  const risk = new URLSearchParams(window.location.search).get('risk');
  return risk === 'inactive' || risk === 'low' || risk === 'never-started' ? risk : 'all';
}

/**
 * 班別篩選的初值（`?class=<班名>`；未帶則「全部班別」）。
 * 讀取 window 於初始化進行（與 `readRiskParam` 相同做法）。
 */
function readClassParam(): string {
  if (typeof window === 'undefined') return 'all';
  return new URLSearchParams(window.location.search).get('class') || 'all';
}

/**
 * 同步班別篩選到 URL（`history.replaceState`：不觸發導航、不重新抓資料）。
 *
 * 2026-10-07（使用者回報）：點入學生詳情再返回時，列表原本會重設成「全部班別」。
 * 班別篩選一律寫回 URL，故詳情頁的 `router.back()`（或瀏覽器上一頁）會回到同一個
 * 帶 `?class=` 的網址，篩選得以保留。
 */
function syncClassParamToUrl(value: string): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (value === 'all') params.delete('class');
  else params.set('class', value);
  const query = params.toString();
  window.history.replaceState(null, '', query ? `${window.location.pathname}?${query}` : window.location.pathname);
}

function studentClassNames(student: RealStudent): string[] {
  return [...new Set([
    student.class?.name,
    ...(student.studentClasses || []).map(({ class: studentClass }) => studentClass.name),
  ].filter((name): name is string => Boolean(name)))].sort();
}

function studentClassLabel(student: RealStudent): string {
  return studentClassNames(student).join(', ');
}

/** Days since last activity; null = unknown (never active / no data). */
function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return null;
  return Math.floor((Date.now() - d) / 86400000);
}

/**
 * 活動狀態：優先用伺服器計算的 `activityStatus`（單一門檻 owner）；
 * 只在舊 API 回應缺少該欄位時以天數回退，且**從未活動**必須與
 * **長期未活動**分開（教學處理不同）。
 */
function activityStatusOf(s: RealStudent): 'never-started' | 'inactive' | 'low' | 'active' {
  if (s.activityStatus) return s.activityStatus;
  const days = s.daysInactive ?? daysSince(s.lastActiveAt);
  if (days === null || days === undefined) {
    return (s._count?.sessions ?? 0) === 0 ? 'never-started' : 'active';
  }
  if (days >= 14) return 'inactive';
  if (days >= 7) return 'low';
  return 'active';
}


export default function TeacherStudentsPage() {
  const { t, language } = useT();
  const lang = language || 'zh';
  const [students, setStudents] = useState<RealStudent[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>(readClassParam);
  const [levelFilter, setLevelFilter] = useState('all');
  // 2026-09-21：教師辨識工具 — 活動／準確率篩選 + 排序（原本只有搜尋／班別／年級，
  // 排序硬編碼為班別→班號，老師只能在整張表上用肉眼找紅標）。
  // 活動篩選的初值由 ?risk= 帶入（教師主頁「查看全部 N 人」的深層連結）；
  // 此頁在 loading 期間只渲染 spinner，故讀取 window 不會造成 hydration 不一致。
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>(readRiskParam);
  const [accuracyFilter, setAccuracyFilter] = useState<AccuracyFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('class');

  // === 自訂組別狀態 ===
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState('');
  const [groupSuccess, setGroupSuccess] = useState(false);

  /** 套用班別篩選並同步 URL（令「列表 → 學生詳情 → 返回」保留所在班別）。 */
  const applyClassFilter = (value: string) => {
    setClassFilter(value);
    syncClassParamToUrl(value);
  };

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
    fetch('/api/teacher/students').then(r => r.json()).then(studentData => {
      setStudents(studentData.students || []);
      const classNames = (studentData.classes || []).map((c: Record<string, unknown>) => String(c.name));
      setClasses(classNames);
      // URL 帶入的班別若已不在名單（班別已刪除／非任教班別）⇒ 回退「全部班別」，
      // 避免出現永遠空白的列表。
      const requested = readClassParam();
      if (requested !== 'all' && !classNames.includes(requested)) {
        setClassFilter('all');
        syncClassParamToUrl('all');
      }
      setLoading(false);
    }).catch((e) => {
      logger.error({ module: 'teacher-students', error: e instanceof Error ? e.message : String(e) }, 'Failed to load students');
      setLoadError('無法載入學生資料，請檢查網絡後重試。');
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const rows = students.filter(s => {
      if (search && !(s.nameZh || '').includes(search) && !(s.nameEn || '').toLowerCase().includes(search.toLowerCase()) && !s.email.includes(search.toLowerCase())) return false;
      if (classFilter !== 'all' && !studentClassNames(s).includes(classFilter)) return false;
      if (levelFilter !== 'all' && s.level !== levelFilter) return false;
      if (activityFilter !== 'all' && activityStatusOf(s) !== activityFilter) return false;
      if (accuracyFilter !== 'all') {
        const acc = s.overallAccuracy;
        if (accuracyFilter === 'nodata' && acc != null) return false;
        if (accuracyFilter === 'low' && !(acc != null && acc < 50)) return false;
        if (accuracyFilter === 'mid' && !(acc != null && acc >= 50 && acc < 70)) return false;
        if (accuracyFilter === 'high' && !(acc != null && acc >= 70)) return false;
      }
      return true;
    });

    const classThenNumber = (a: RealStudent, b: RealStudent) => {
      const classCmp = studentClassLabel(a).localeCompare(studentClassLabel(b));
      if (classCmp !== 0) return classCmp;
      const na = parseInt(a.classNumber || '999', 10);
      const nb = parseInt(b.classNumber || '999', 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return (a.classNumber || '').localeCompare(b.classNumber || '');
    };

    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'activity': {
          // 最久未活動優先；從未開始排最前（最需要介入）
          const rank = (s: RealStudent) => {
            const status = activityStatusOf(s);
            if (status === 'never-started') return Number.POSITIVE_INFINITY;
            return s.daysInactive ?? daysSince(s.lastActiveAt) ?? -1;
          };
          return rank(b) - rank(a) || classThenNumber(a, b);
        }
        case 'accuracy-asc': {
          // 無資料（null）排在最後，不得當成 0% 參與排序
          const acc = (s: RealStudent) => (s.overallAccuracy == null ? Number.POSITIVE_INFINITY : s.overallAccuracy);
          return acc(a) - acc(b) || classThenNumber(a, b);
        }
        case 'accuracy-desc': {
          const acc = (s: RealStudent) => (s.overallAccuracy == null ? Number.NEGATIVE_INFINITY : s.overallAccuracy);
          return acc(b) - acc(a) || classThenNumber(a, b);
        }
        case 'mistakes':
          return (b._count?.mistakes ?? 0) - (a._count?.mistakes ?? 0) || classThenNumber(a, b);
        case 'short-writing':
          return (b.shortWritingCount ?? 0) - (a.shortWritingCount ?? 0) || classThenNumber(a, b);
        default:
          return classThenNumber(a, b);
      }
    });
  }, [students, search, classFilter, levelFilter, activityFilter, accuracyFilter, sortKey]);

  // Sprint 133: behavior-based activity badge（未開始 / 失聯 分開）
  const activityBadge = (s: RealStudent): { text: string; cls: string } => {
    const status = activityStatusOf(s);
    const days = s.daysInactive ?? daysSince(s.lastActiveAt);
    switch (status) {
      case 'never-started':
        return { text: t('teacher.students.notStarted'), cls: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' };
      case 'inactive':
        return { text: days != null ? `${t('teacher.students.inactive')} · ${t('teacher.students.daysInactive', { n: days })}` : t('teacher.students.inactive'), cls: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' };
      case 'low':
        return { text: days != null ? `${t('teacher.students.lowActivity')} · ${t('teacher.students.daysInactive', { n: days })}` : t('teacher.students.lowActivity'), cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' };
      default:
        return { text: t('teacher.students.active'), cls: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' };
    }
  };

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
        <select value={classFilter} onChange={e => applyClassFilter(e.target.value)}
          aria-label={t('admin.users.class')}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm">
          <option value="all">{t('admin.users.all')} {t('admin.users.class')}</option>
          {classes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
          aria-label={t('admin.users.level')}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm">
          <option value="all">{t('admin.users.all')} {t('admin.users.level')}</option>
          {['S1','S2','S3','S4','S5','S6'].map(l => <option key={l} value={l}>{gradeLabels[l] || l}</option>)}
        </select>
        {/* 2026-09-21：活動狀態篩選 — 一鍵列出長期未使用／從未開始的學生 */}
        <select value={activityFilter} onChange={e => setActivityFilter(e.target.value as ActivityFilter)}
          aria-label={t('teacher.students.filterActivity')}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm">
          <option value="all">{t('teacher.students.filterActivity')}：{t('teacher.students.filterAll')}</option>
          <option value="never-started">{t('teacher.students.notStarted')}</option>
          <option value="inactive">{t('teacher.students.inactive')}</option>
          <option value="low">{t('teacher.students.lowActivity')}</option>
          <option value="active">{t('teacher.students.active')}</option>
        </select>
        {/* 2026-09-21：準確率篩選 — 找出成績需要照顧的學生（無資料 ≠ 0%） */}
        <select value={accuracyFilter} onChange={e => setAccuracyFilter(e.target.value as AccuracyFilter)}
          aria-label={t('teacher.students.filterAccuracy')}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm">
          <option value="all">{t('teacher.students.filterAccuracy')}：{t('teacher.students.filterAll')}</option>
          <option value="low">{t('teacher.students.accuracyLow')}</option>
          <option value="mid">{t('teacher.students.accuracyMid')}</option>
          <option value="high">{t('teacher.students.accuracyHigh')}</option>
          <option value="nodata">{t('teacher.students.accuracyNoData')}</option>
        </select>
        <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
          aria-label={t('teacher.students.sortBy')}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm">
          <option value="class">{t('teacher.students.sortClass')}</option>
          <option value="activity">{t('teacher.students.sortActivity')}</option>
          <option value="accuracy-asc">{t('teacher.students.sortAccuracyAsc')}</option>
          <option value="accuracy-desc">{t('teacher.students.sortAccuracyDesc')}</option>
          <option value="mistakes">{t('teacher.students.sortMistakes')}</option>
          <option value="short-writing">{t('teacher.students.sortShortWriting')}</option>
        </select>
        <span className="self-center text-xs text-gray-500">{filtered.length} {t('admin.classes.studentCount')}</span>
        <button
          onClick={() => { setSelectedForGroup(filtered.map(s => s.id)); setShowGroupModal(true); }}
          className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg flex items-center gap-1.5 transition-colors"
        >
          <Users className="w-4 h-4" />
          {t('groups.createTitle')}
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
                <th className="text-center py-3 px-4 text-gray-500 font-medium">{t('teacher.students.lastActive')}</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium hidden xl:table-cell">{t('teacher.students.dominantDifficulty')}</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium hidden lg:table-cell">{t('teacher.students.writingCount')}</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium">{t('teacher.classes.action')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
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
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{studentClassLabel(s) || '-'}</td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{s.level || '-'}</td>
                  <td className="text-center py-3 px-4">
                    {s.overallAccuracy != null ? (
                      <span className={s.overallAccuracy >= 70 ? 'text-green-600 font-medium' : s.overallAccuracy >= 50 ? 'text-yellow-600 font-medium' : 'text-red-600 font-medium'}>
                        {Math.round(s.overallAccuracy)}%
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="text-center py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${activityBadge(s).cls}`}>{activityBadge(s).text}</span>
                  </td>
                  {/* 2026-09-21：主要練習難度（舊碼已回傳但從未顯示）—— 讓老師一眼看到
                      「一直只做 remedial／太易的題」這種高準確率但低挑戰的模式。 */}
                  <td className="text-center py-3 px-4 text-xs text-gray-500 hidden xl:table-cell">
                    {s.dominantDifficulty ? getDifficultyLabel(s.dominantDifficulty, lang) : '—'}
                  </td>
                  <td className="text-center py-3 px-4 text-xs text-gray-500 hidden lg:table-cell">
                    {s._count?.writingDrafts ?? 0}
                    {(s.shortWritingCount ?? 0) > 0 && (
                      <span className="text-amber-600 ml-1">（{s.shortWritingCount} {t('teacher.students.shortWriting')}）</span>
                    )}
                  </td>
                  <td className="text-right py-3 px-4">
                    <Link href={`/teacher/students/${s.id}`} className="text-blue-600 text-xs hover:underline flex items-center justify-end gap-1">
                      {t('generic.details')} <ChevronRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="py-10 text-center text-gray-400">{t('generic.noData')}</td></tr>
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

  const classList = [...new Set(students.flatMap(studentClassNames))].sort();

  const modalFiltered = students.filter(s => {
    const searchLower = modalSearch.toLowerCase();
    if (modalSearch && !(s.nameZh || '').includes(searchLower) && !(s.nameEn || '').toLowerCase().includes(searchLower) && !s.email.toLowerCase().includes(searchLower)) return false;
    if (modalClassFilter && !studentClassNames(s).includes(modalClassFilter)) return false;
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
              <span className="text-xs text-gray-400 flex-shrink-0">{studentClassLabel(s)}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
