// ============================================
// 教師端 — 建立新任務
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Sparkles, Loader2 } from 'lucide-react';

import { skillLabels, difficultyLabels, gradeLabels } from '@/lib/nav';
import Modal from '@/components/shared/Modal';
import { useT } from '@/hooks/use-i18n';

export default function NewAssignmentPage() {
  const { t } = useT();
  const router = useRouter();
  const [showSuccess, setShowSuccess] = useState(false);
  const [step, setStep] = useState<'config' | 'preview'>('config');
  const [form, setForm] = useState({
    title: '',
    classId: '',
    gradeLevel: 'S4' as string,
    skill: 'tenses' as string,
    difficulty: 'core' as string,
    questionType: 'mc' as string,
    questionCount: 10,
    dueDate: '',
  });

  // === AI 生成狀態 ===
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [generatedQuestions, setGeneratedQuestions] = useState<{ prompt: string; choices?: string[]; answer: string }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
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
      .catch((e) => { console.error('Failed to load data:', e); });
  }, []);

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
        setGenError(json.error || 'AI 生成失敗');
      }
    } catch {
      setGenError('AI 服務連線失敗');
    } finally { setGenerating(false); }
  };

  const handlePublish = async () => {
    if (!generatedQuestions.length) return;
    setGenError('');
    try {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title || `${skillLabels[form.skill] || form.skill} — ${form.gradeLevel}`,
          className: form.classId || classes[0]?.name || '',
          gradeLevel: form.gradeLevel,
          strand: 'knowledge',
          grammarItem: form.skill,
          difficulty: form.difficulty,
          questionCount: generatedQuestions.length,
          createdBy: teacherId || 'teacher',
          questions: generatedQuestions.map((q, i) => ({
            questionType: form.questionType,
            prompt: q.prompt,
            options: q.choices ? JSON.stringify(q.choices) : null,
            answer: q.answer,
            explanation: (q as any).readingContent || (q as any).listeningContent || null,
            orderIndex: i,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '發布失敗');
      }
      setShowSuccess(true);
    } catch (err: unknown) {
      setGenError(err instanceof Error ? err.message : '發布失敗');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">建立新任務</h1>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleGenerate(); }} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-5">
        {/* 基本設定 */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">📌 基本設定</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">任務名稱</label>
              <input type="text" value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} placeholder="例如：文法練習：條件句" className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">班別</label>
                <select value={form.classId} onChange={(e) => setForm({...form, classId: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none" required>
                  <option value="">選擇班別</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">截止日期</label>
                <input type="date" value={form.dueDate} onChange={(e) => setForm({...form, dueDate: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none" required />
              </div>
            </div>
          </div>
        </div>

        {/* 練習設定 */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">📝 練習設定</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">年級</label>
              <select value={form.gradeLevel} onChange={(e) => setForm({...form, gradeLevel: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
                {Object.entries(gradeLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">技能</label>
              <select value={form.skill} onChange={(e) => setForm({...form, skill: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
                {Object.entries(skillLabels).slice(0, 18).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">程度</label>
              <select value={form.difficulty} onChange={(e) => setForm({...form, difficulty: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
                {Object.entries(difficultyLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">題型</label>
              <select value={form.questionType} onChange={(e) => setForm({...form, questionType: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
                <option value="mc">選擇題</option>
                <option value="fill-blank">填充題</option>
                <option value="error-correction">改錯題</option>
                <option value="short-writing">短文寫作</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">題數</label>
              <input type="number" value={form.questionCount} onChange={(e) => setForm({...form, questionCount: parseInt(e.target.value)})} min={1} max={50} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none" />
            </div>
          </div>
        </div>

        {genError && <div className="p-3 bg-red-50 rounded-lg text-sm text-red-600">{genError}</div>}

        {/* AI 生成按鈕 */}
        <button type="submit" disabled={generating}
          className="w-full py-3 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors">
          {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> AI 正在生成題目...</> : <><Sparkles className="w-4 h-4" /> AI 生成 {form.questionCount} 題並預覽</>}
        </button>
      </form>

      {/* ====== 預覽 Modal ====== */}
      <Modal open={step === 'preview'} onClose={() => setStep('config')} title={`📋 題目預覽（${generatedQuestions.length} 題）`} size="lg">
        <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
          {generatedQuestions.map((q, i) => (
            <div key={i} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm">
              {(q as any).readingContent && (
                <div className="mb-2 p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded text-xs text-indigo-700 dark:text-indigo-300">
                  📖 {(q as any).readingContent.slice(0, 150)}{(q as any).readingContent.length > 150 ? '...' : ''}
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
              {!q.choices && <p className="text-xs text-green-600 mt-1">答案：{q.answer}</p>}
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={() => setStep('config')} className="flex-1 py-2 text-sm text-gray-600 border rounded-lg">返回修改</button>
          <button onClick={handlePublish} className="flex-1 py-2 bg-blue-500 text-white text-sm rounded-lg font-medium flex items-center justify-center gap-2">
            <Send className="w-4 h-4" /> 確認派發
          </button>
        </div>
      </Modal>

      {/* 成功提示 Modal */}
      <Modal open={showSuccess} onClose={() => { setShowSuccess(false); router.push('/teacher/assignments'); }} title="✅ 任務已派發" size="sm">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">任務「{form.title || '未命名任務'}」已成功派發至所選班別。</p>
        <p className="text-xs text-gray-500 dark:text-gray-500">學生將在下次登入時收到通知。</p>
      </Modal>
    </div>
  );
}
