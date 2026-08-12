// ============================================
// 教師端 — 組別管理（自訂跨班級組別）
// ============================================
'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Users, Loader2, Sparkles, Upload, FileText } from 'lucide-react';
import { logger } from '@/shared/logger/logger';
import { useT } from '@/hooks/use-i18n';

interface GroupData {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  assignmentCount: number;
  members: { id: string; name: string; className: string; joinedAt: string }[];
}

export default function TeacherGroupsPage() {
  const { t } = useT();
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [students, setStudents] = useState<{ id: string; name: string; className: string; classNumber: string | null }[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [batchText, setBatchText] = useState('');
  const batchFileRef = useRef<HTMLInputElement>(null);
  const [classFilter, setClassFilter] = useState('');

  const fetchGroups = () => {
    fetch('/api/groups')
      .then(r => r.json())
      .then(d => setGroups(d.groups || []))
      .catch((e) => { logger.error({ module: 'teacher-groups', error: e instanceof Error ? e.message : String(e) }, 'Failed to load groups'); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchGroups(); }, []);

  // === 批量加入：透過 CSV 或貼上名單 ===
  const handleBatchImport = () => {
    const lines = batchText.split(/[\n,;]+/).map(l => l.trim()).filter(Boolean);
    const toAdd: string[] = [];
    for (const line of lines) {
      const s = students.find(s =>
        s.id === line || s.name === line || s.name.toLowerCase().includes(line.toLowerCase())
      );
      if (s && !selectedStudents.includes(s.id)) toAdd.push(s.id);
    }
    if (toAdd.length > 0) {
      setSelectedStudents([...selectedStudents, ...toAdd]);
      setBatchText('');
      setShowBatchImport(false);
    } else {
      setError(t('groups.notFound'));
    }
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setBatchText(text);
      setShowBatchImport(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim() || null,
          studentIds: selectedStudents,
        }),
      });
      if (res.ok) {
        setNewName('');
        setNewDesc('');
        setSelectedStudents([]);
        setShowCreate(false);
        fetchGroups();
      } else {
        const d = await res.json();
        setError(d.error || t('groups.createFailed'));
      }
    } catch {
      setError(t('groups.connectionFailed'));
    } finally { setCreating(false); }
  };

  // === Edit group ===
  const handleEdit = async (groupId: string) => {
    if (!editName.trim()) return;
    setError('');
    try {
      const res = await fetch('/api/groups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: groupId, name: editName.trim(), description: editDesc.trim() || null }),
      });
      if (res.ok) {
        setEditingId(null);
        fetchGroups();
      } else {
        const d = await res.json();
        setError(d.error || t('groups.editFailed'));
      }
    } catch {
      setError(t('groups.connectionFailed'));
    }
  };

  // === Delete group ===
  const handleDelete = async (groupId: string) => {
    if (!confirm(t('groups.deleteConfirm'))) return;
    setDeletingId(groupId);
    setError('');
    try {
      const res = await fetch('/api/groups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: groupId }),
      });
      if (res.ok) {
        setExpandedId(null);
        fetchGroups();
      } else {
        const d = await res.json();
        setError(d.error || t('groups.deleteFailed'));
      }
    } catch {
      setError(t('groups.connectionFailed'));
    } finally { setDeletingId(null); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('groups.title')}</h1>
        <button
          onClick={async () => {
            setShowCreate(true);
            const res = await fetch('/api/teacher/students');
            const d = await res.json();
            setStudents((d.students || []).map((s: Record<string, unknown>) => ({
              id: s.id as string,
              name: (s.nameZh || s.name || s.email) as string,
              className: ((s.class as { name?: string })?.name || (s.className as string) || '') as string,
              classNumber: (s.classNumber as string) || null,
            })).sort((a: { className: string; classNumber: string | null }, b: { className: string; classNumber: string | null }) => {
              // Sort by className then classNumber
              if (a.className !== b.className) return a.className.localeCompare(b.className);
              const numA = parseInt(a.classNumber || '999', 10);
              const numB = parseInt(b.classNumber || '999', 10);
              return numA - numB;
            }));
          }}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-xl font-medium flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> {t('groups.create')}
        </button>
      </div>

      {/* 建立組別 Modal */}
      {showCreate && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-white">{t('groups.createTitle')}</h2>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder={t('groups.namePlaceholder')}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none"
          />
          <input
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder={t('groups.descPlaceholder')}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none"
          />
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-500">{t('groups.selectStudents')}</p>
              <div className="flex gap-2">
                <input ref={batchFileRef} type="file" accept=".csv,.txt" onChange={handleCsvFile} className="hidden" />
                <button onClick={() => batchFileRef.current?.click()} className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                  <FileText className="w-3 h-3" /> CSV
                </button>
                <button onClick={() => setShowBatchImport(true)} className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                  <Upload className="w-3 h-3" /> {t('groups.paste')}
                </button>
              </div>
            </div>
            {showBatchImport && (
              <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-2">
                <p className="text-xs text-blue-600">{t('groups.pasteHint')}</p>
                <textarea value={batchText} onChange={e => setBatchText(e.target.value)}
                  rows={3} className="w-full px-3 py-2 border rounded-lg text-xs bg-white dark:bg-gray-700" placeholder={t('teacher.groups.exampleMembers')} />
                <div className="flex gap-2">
                  <button onClick={handleBatchImport} className="px-3 py-1 text-xs bg-blue-500 text-white rounded-lg">{t('groups.add')}</button>
                  <button onClick={() => setShowBatchImport(false)} className="px-3 py-1 text-xs border rounded-lg">{t('groups.cancel')}</button>
                </div>
              </div>
            )}
            {/* 班級篩選 */}
            {(() => {
              const classList = [...new Set(students.map(s => s.className).filter(Boolean))].sort();
              return classList.length > 0 ? (
                <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
                  className="w-full px-3 py-1.5 mb-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 outline-none">
                  <option value="">全部班級</option>
                  {classList.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : null;
            })()}
            <div className="max-h-48 overflow-y-auto space-y-1">
              {students.filter(s => !classFilter || s.className === classFilter).map(s => (
                <label key={s.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedStudents.includes(s.id)}
                    onChange={e => {
                      if (e.target.checked) setSelectedStudents([...selectedStudents, s.id]);
                      else setSelectedStudents(selectedStudents.filter(id => id !== s.id));
                    }}
                    className="rounded"
                  />
                  <span className="text-sm">{s.name}</span>
                  {s.classNumber && <span className="text-xs text-gray-400">#{s.classNumber}</span>}
                  <span className="text-xs text-gray-400">{s.className}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setShowCreate(false); setClassFilter(''); }} className="px-4 py-2 border rounded-lg text-sm">{t('groups.cancel')}</button>
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm rounded-lg flex items-center gap-1"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {creating ? t('groups.creating') : t('groups.createBtn')}
            </button>
          </div>
        </div>
      )}

      {/* 組別列表 */}
      {groups.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">{t('groups.empty')}</p>
          <p className="text-gray-400 text-xs mt-1">{t('groups.emptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <div key={g.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <button
                onClick={() => setExpandedId(expandedId === g.id ? null : g.id)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
              >
                <div className="flex-1">
                  {editingId === g.id ? (
                    <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        placeholder={t('groups.editNamePlaceholder')}
                        className="px-2 py-1 border rounded text-sm flex-1"
                        autoFocus
                      />
                      <input
                        value={editDesc}
                        onChange={e => setEditDesc(e.target.value)}
                        placeholder={t('groups.descPlaceholder')}
                        className="px-2 py-1 border rounded text-sm flex-1"
                      />
                      <button onClick={() => handleEdit(g.id)} className="px-2 py-1 bg-blue-500 text-white rounded text-xs">{t('groups.save')}</button>
                      <button onClick={() => setEditingId(null)} className="px-2 py-1 border rounded text-xs">{t('groups.cancel')}</button>
                    </div>
                  ) : (
                    <>
                      <p className="font-medium text-gray-900 dark:text-white">{g.name}</p>
                      {g.description && <p className="text-xs text-gray-500 mt-0.5">{g.description}</p>}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400 ml-2">
                  <span>{t('groups.members', { n: String(g.memberCount) })}</span>
                  <span>{t('groups.assignments', { n: String(g.assignmentCount) })}</span>
                  {editingId !== g.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(g.id);
                        setEditName(g.name);
                        setEditDesc(g.description || '');
                      }}
                      className="text-blue-500 hover:underline"
                      title={t('groups.edit')}
                    >
                      {t('groups.edit')}
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(g.id);
                    }}
                    disabled={deletingId === g.id}
                    className="text-red-500 hover:underline disabled:opacity-50 flex items-center gap-1"
                    title={t('groups.delete')}
                  >
                    <Trash2 className="w-3 h-3" />
                    {deletingId === g.id ? t('groups.deleting') : t('groups.delete')}
                  </button>
                </div>
              </button>
              {expandedId === g.id && (
                <div className="border-t border-gray-100 dark:border-gray-700 p-4 bg-gray-50/50 dark:bg-gray-800/50 space-y-2">
                  <p className="text-xs font-medium text-gray-500">{t('groups.memberList')}</p>
                  {g.members.length === 0 ? (
                    <p className="text-xs text-gray-400">{t('groups.noMembers')}</p>
                  ) : (
                    g.members.map(m => (
                      <div key={m.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300">{m.name}</span>
                        <span className="text-xs text-gray-400">{m.className}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
