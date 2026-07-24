// ============================================
// 教師端 — 建立新任務
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Sparkles, Loader2, Search } from 'lucide-react';
import { logger } from '@/shared/logger/logger';

import { skillLabels, difficultyLabels, gradeLabels, getSkillLabel, getDifficultyLabel, getGradeLabel } from '@/shared/utils/nav';
import Modal from '@/components/shared/Modal';
import { useT } from '@/hooks/use-i18n';

export default function NewAssignmentPage() {
  const { t, language } = useT();
  const router = useRouter();
  const [showSuccess, setShowSuccess] = useState(false);
  const [step, setStep] = useState<'config' | 'preview'>('config');
  const [form, setForm] = useState({
    title: '',
    classId: '',
    targetType: 'class' as 'class' | 'group' | 'students',
    gradeLevel: 'S4' as string,
    skill: 'tenses' as string,
    difficulty: 'core' as string,
    questionType: 'mc' as string,
    questionCount: 10,
    dueDate: '',
  });

  // === AI 生成狀態 ===
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [genError, setGenError] = useState('');
  const [generatedQuestions, setGeneratedQuestions] = useState<{ prompt: string; choices?: string[]; answer: string }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string; memberCount: number }[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [students, setStudents] = useState<{ id: string; name: string; className: string }[]>([]);
  const [teacherId, setTeacherId] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/classes').then(r => r.json()),
      fetch('/api/auth/profile').then(r => r.json()),
    ])
      .then(([classData, profileData]) => {
        setClasses(classData.classes || []);
        if (profileData?.user?.id) setTeacherId(profileData.user.id);
      })
      .catch((e) => { logger.error({ module: 'teacher-assignments-new', error: e instanceof Error ? e.message : String(e) }, 'Failed to load data'); });
  }, []);

  // 當 targetType 變更時載入對應選項
  useEffect(() => {
    if (form.targetType === 'group') {
      fetch('/api/groups').then(r => r.json()).then(d => setGroups(d.groups || [])).catch(() => {});
    } else if (form.targetType === 'students') {
      fetch('/api/teacher/students').then(r => r.json()).then(d =>
        setStudents((d.students || []).map((s: Record<string, unknown>) => ({
          id: s.id, name: s.nameZh || s.name || s.email, className: s.className || '',
        })))
      ).catch(() => {});
    }
  }, [form.targetType]);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenError('');
    try {
      const res = await fetch('/api/ai/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grammarItem: form.skill,
          grammarItemZh: skillLabels[form.skill] || form.skill,
          difficulty: form.difficulty,
          gradeLevel: form.gradeLevel,
          count: form.questionCount,
          questionType: form.questionType,
        }),
      });
      const json = await res.json();
      if (res.ok && json.questions?.length) {
        setGeneratedQuestions(json.questions);
        setStep('preview');
      } else {
        setGenError(json.error || t('teacher.assignmentNew.genFailed'));
      }
    } catch {
      setGenError(t('teacher.assignmentNew.aiFailed'));
    } finally { setGenerating(false); }
  };

  const handlePublish = async () => {
    if (!generatedQuestions.length || publishing) return;
    setPublishing(true);
    setGenError('');
    try {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title || `${skillLabels[form.skill] || form.skill} — ${form.gradeLevel}`,
          className: form.targetType === 'class' ? (form.classId || classes[0]?.name || '') : '',
          classId: form.targetType === 'class' ? (form.classId || classes[0]?.id || '') : undefined,
          targetType: form.targetType,
          gradeLevel: form.gradeLevel,
          strand: 'knowledge',
          grammarItem: form.skill,
          difficulty: form.difficulty,
          questionCount: generatedQuestions.length,
          createdBy: teacherId || 'teacher',
          dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
          groupIds: form.targetType === 'group' ? selectedGroupIds : undefined,
          studentIds: form.targetType === 'students' ? selectedStudentIds : undefined,
          questions: generatedQuestions.map((q, i) => ({
            questionType: form.questionType,
            prompt: q.prompt,
            options: q.choices ? JSON.stringify(q.choices) : null,
            answer: q.answer,
            explanation: (q as { readingContent?: string; listeningContent?: string }).readingContent || (q as { readingContent?: string; listeningContent?: string }).listeningContent || null,
            orderIndex: i,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || t('teacher.assignmentNew.publishFailed'));
      }
      setShowSuccess(true);
    } catch (err: unknown) {
      setGenError(err instanceof Error ? err.message : t('teacher.assignmentNew.publishFailed'));
    } finally { setPublishing(false); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('teacher.assignmentNew.title')}</h1>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleGenerate(); }} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-5">
        {/* 基本設定 */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{t('teacher.assignmentNew.basicSettings')}</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('teacher.assignmentNew.taskName')}</label>
              <input type="text" value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} placeholder={t('teacher.assignmentNew.taskNamePlaceholder')} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('teacher.assignmentNew.targetType')}</label>
                <select value={form.targetType} onChange={(e) => setForm({...form, targetType: e.target.value as typeof form.targetType})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
                  <option value="class">{t('teacher.assignments.new.targetClass')}</option>
                  <option value="group">{t('teacher.assignments.new.targetGroup')}</option>
                  <option value="students">{t('teacher.assignments.new.targetStudent')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('teacher.assignmentNew.dueDate')}</label>
                <input type="date" value={form.dueDate} onChange={(e) => setForm({...form, dueDate: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none" required />
              </div>
            </div>

            {/* 班級選擇 */}
            {form.targetType === 'class' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('teacher.assignmentNew.class')}</label>
                <select value={form.classId} onChange={(e) => setForm({...form, classId: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none" required>
                  <option value="">{t('teacher.assignmentNew.selectClass')}</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            {/* 組別選擇 */}
            {form.targetType === 'group' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('teacher.assignmentNew.selectGroups')}</label>
                {groups.length === 0 ? (
                  <p className="text-xs text-gray-400">{t('teacher.assignments.new.noGroups')}</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {groups.map(g => (
                      <label key={g.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedGroupIds.includes(g.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedGroupIds([...selectedGroupIds, g.id]);
                            else setSelectedGroupIds(selectedGroupIds.filter(id => id !== g.id));
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">{g.name}</span>
                        <span className="text-xs text-gray-400">({g.memberCount} 人)</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 個別學生選擇（含搜尋及篩選） */}
            {form.targetType === 'students' && (
              <StudentSelector
                students={students}
                selectedIds={selectedStudentIds}
                onSelectionChange={setSelectedStudentIds}
              />
            )}
          </div>
        </div>

        {/* 練習設定 */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{t('teacher.assignmentNew.practiceSettings')}</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('teacher.assignmentNew.grade')}</label>
              <select value={form.gradeLevel} onChange={(e) => setForm({...form, gradeLevel: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
                {Object.keys(gradeLabels).map(k => <option key={k} value={k}>{getGradeLabel(k, language)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('teacher.assignmentNew.skill')}</label>
              <select value={form.skill} onChange={(e) => setForm({...form, skill: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
                {Object.keys(skillLabels).slice(0, 18).map(k => <option key={k} value={k}>{getSkillLabel(k, language)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('teacher.assignmentNew.level')}</label>
              <select value={form.difficulty} onChange={(e) => setForm({...form, difficulty: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
                {Object.keys(difficultyLabels).map(k => <option key={k} value={k}>{getDifficultyLabel(k, language)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('teacher.assignmentNew.type')}</label>
              <select value={form.questionType} onChange={(e) => setForm({...form, questionType: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
                <option value="mc">{t('teacher.assignmentNew.typeMc')}</option>
                <option value="fill-blank">{t('teacher.assignmentNew.typeFill')}</option>
                {/* error-correction removed — underline rendering not supported in UI */}
                <option value="short-writing">{t('teacher.assignmentNew.typeWriting')}</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('teacher.assignmentNew.count')}</label>
              <input type="number" value={form.questionCount} onChange={(e) => setForm({...form, questionCount: parseInt(e.target.value)})} min={1} max={50} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none" />
            </div>
          </div>
        </div>

        {genError && <div className="p-3 bg-red-50 rounded-lg text-sm text-red-600">{genError}</div>}

        {/* AI 生成按鈕 */}
        <button type="submit" disabled={generating}
          className="w-full py-3 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors">
          {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('teacher.assignmentNew.generating')}</> : <><Sparkles className="w-4 h-4" /> {t('teacher.assignmentNew.generateBtn', { n: form.questionCount })}</>}
        </button>
      </form>

      {/* ====== 預覽 Modal ====== */}
      <Modal open={step === 'preview'} onClose={() => setStep('config')} title={t('teacher.assignmentNew.preview', { n: generatedQuestions.length })} size="lg">
        <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
          {generatedQuestions.map((q, i) => {
            const readingContent = (q as { readingContent?: string }).readingContent;
            return (
            <div key={i} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm">
              {readingContent && (
                <div className="mb-2 p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded text-xs text-indigo-700 dark:text-indigo-300">
                  📖 {readingContent.slice(0, 150)}{readingContent.length > 150 ? '...' : ''}
                </div>
              )}
              <p className="font-medium text-gray-900 dark:text-white">{i + 1}. {q.prompt}</p>
              {q.choices && (
                <div className="mt-1 space-y-0.5">
                  {q.choices.map((c, j) => (
                    <span key={j} className={`inline-block mr-3 text-xs ${c.startsWith(q.answer) ? 'text-green-600 font-bold' : 'text-gray-500'}`}>{c}</span>
                  ))}
                </div>
              )}
              {!q.choices && <p className="text-xs text-green-600 mt-1">{t('teacher.assignmentNew.answer')}{q.answer}</p>}
            </div>
          )})}
        </div>
        <div className="flex gap-3">
          <button onClick={() => setStep('config')} className="flex-1 py-2 text-sm text-gray-600 border rounded-lg">{t('teacher.assignmentNew.back')}</button>
          <button onClick={handlePublish} disabled={publishing} className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm rounded-lg font-medium flex items-center justify-center gap-2">
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {publishing ? t('teacher.assignmentNew.publishing') : t('teacher.assignmentNew.confirm')}
          </button>
        </div>
      </Modal>

      {/* 成功提示 Modal */}
      <Modal open={showSuccess} onClose={() => { setShowSuccess(false); router.push('/teacher/assignments'); }} title={t('teacher.assignmentNew.success')} size="sm">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('teacher.assignmentNew.successMsg', { title: form.title || t('teacher.assignments.unnamed') })}</p>
        <p className="text-xs text-gray-500 dark:text-gray-500">{t('teacher.assignmentNew.notifyMsg')}</p>
      </Modal>
    </div>
  );
}

// ============================================
// 學生選擇器（含搜尋、年級及班級篩選、全選）
// ============================================
function StudentSelector({
  students,
  selectedIds,
  onSelectionChange,
}: {
  students: { id: string; name: string; className: string }[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}) {  const { t } = useT();  const [searchText, setSearchText] = useState('');
  const [classFilter, setClassFilter] = useState('');

  // 提取不重複班級列表
  const classList = [...new Set(students.map(s => s.className).filter(Boolean))].sort();

  // 根據搜尋及班級篩選
  const filtered = students.filter(s => {
    if (searchText && !s.name.toLowerCase().includes(searchText.toLowerCase())) return false;
    if (classFilter && s.className !== classFilter) return false;
    return true;
  });

  const allFilteredSelected = filtered.length > 0 && filtered.every(s => selectedIds.includes(s.id));

  const toggleAll = () => {
    if (allFilteredSelected) {
      onSelectionChange(selectedIds.filter(id => !filtered.find(s => s.id === id)));
    } else {
      const newIds = [...selectedIds];
      for (const s of filtered) {
        if (!newIds.includes(s.id)) newIds.push(s.id);
      }
      onSelectionChange(newIds);
    }
  };

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{t('teacher.assignments.new.selectStudents')}</label>
      {/* 搜尋 + 班級篩選 */}
      <div className="flex gap-2 mb-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder={t('teacher.assignments.new.searchStudents')}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 outline-none"
          />
        </div>
        <select
          value={classFilter}
          onChange={e => setClassFilter(e.target.value)}
          className="px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 outline-none"
        >
          <option value="">全部班級</option>
          {classList.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {/* 全選 + 已選計數 */}
      <div className="flex items-center justify-between mb-1.5">
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} className="rounded" />
          全選 ({filtered.length} 位)
        </label>
        <span className="text-xs text-blue-600 font-medium">已選 {selectedIds.length} 人</span>
      </div>
      {/* 學生列表 */}
      {students.length === 0 ? (
        <p className="text-xs text-gray-400">載入中...</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">無符合條件的學生</p>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-100 dark:border-gray-700 rounded-lg p-1">
          {filtered.map(s => (
            <label key={s.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <input
                type="checkbox"
                checked={selectedIds.includes(s.id)}
                onChange={(e) => {
                  if (e.target.checked) onSelectionChange([...selectedIds, s.id]);
                  else onSelectionChange(selectedIds.filter(id => id !== s.id));
                }}
                className="rounded"
              />
              <span className="text-sm flex-1 min-w-0 truncate">{s.name}</span>
              <span className="text-xs text-gray-400 flex-shrink-0">{s.className}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
