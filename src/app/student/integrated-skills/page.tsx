// ============================================
// 學生端 — Integrated Skills (DSE Paper 3 Part B)
// v3.1: 使用 IntegratedSkillsTaskView 獨立元件 + AudioPlayer 進度條
// ============================================
'use client';

import { useEffect } from 'react';
import { Loader2, Sparkles, RefreshCw, CheckCircle2, XCircle, BookOpen, AlertTriangle, Award, FileText, Target, ChevronRight } from 'lucide-react';
import { useIntegratedSkillsStore } from '@/store/integratedSkillsStore';
import { useT } from '@/hooks/use-i18n';
import IntegratedSkillsTaskView from '@/components/integrated-skills/IntegratedSkillsTaskView';

const TASK_TYPES = [
  { value: 'summary', zh: '摘要寫作', en: 'Summary' },
  { value: 'email-reply', zh: '電郵回覆', en: 'Email Reply' },
  { value: 'short-article', zh: '短文寫作', en: 'Short Article' },
  { value: 'report', zh: '報告寫作', en: 'Report' },
] as const;

const DIFFICULTIES = [
  { value: 'remedial', zh: '基礎', en: 'Remedial' },
  { value: 'core', zh: '核心', en: 'Core' },
  { value: 'challenge', zh: '挑戰', en: 'Challenge' },
] as const;

const GRADES = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] as const;

const DRAFT_KEY = 'integrated-skills-draft-v3';

const stepLabels = [
  { zh: '設定', en: 'Setup', icon: Sparkles },
  { zh: '聆聽+筆記', en: 'Listen & Note', icon: Sparkles },
  { zh: '寫作', en: 'Write', icon: Sparkles },
  { zh: '結果', en: 'Result', icon: Award },
];

export default function IntegratedSkillsPage() {
  const { language } = useT();
  const s = useIntegratedSkillsStore();

  // Load draft
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.savedAt && Date.now() - draft.savedAt < 24 * 60 * 60 * 1000) {
          s.setConfig(draft.gradeLevel || 'S4', draft.difficulty || 'core', draft.taskType || 'summary');
          if (draft.studentNotes) s.setStudentNotes(draft.studentNotes);
          if (draft.studentWriting) s.setStudentWriting(draft.studentWriting);
        }
      }
    } catch { /* ignore */ }
  }, []);

  const handleGenerate = async () => {
    s.setLoading(true); s.setError('');
    try {
      const res = await fetch('/api/ai/generate-integrated-skills', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradeLevel: s.gradeLevel, difficulty: s.difficulty, taskType: s.taskType }),
      });
      const json = await res.json();
      if (res.ok && json.task) {
        s.setTask(json.task); s.setStage('listening');
        s.setStudentNotes(''); s.setStudentWriting(''); s.setAnalysis(null);
        try {
          const raw = localStorage.getItem(DRAFT_KEY);
          if (raw) { const d = JSON.parse(raw); if (d.studentNotes) s.setStudentNotes(d.studentNotes); if (d.studentWriting) s.setStudentWriting(d.studentWriting); }
        } catch { /* ignore */ }
      } else { s.setError(json.error || 'AI 生成失敗'); }
    } catch { s.setError('網絡連線失敗'); }
    finally { s.setLoading(false); }
  };

  const currentStep = s.stage === 'config' ? 0 : s.stage === 'listening' ? 1 : s.stage === 'writing' ? 2 : 3;

  // ====== CONFIG ======
  if (s.stage === 'config') {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Integrated Skills</h1><p className="text-sm text-gray-500 mt-1">DSE Paper 3 Part B — 聆聽 → 筆記 → 寫作</p></div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {stepLabels.map((sl, i) => { const Icon = sl.icon;
            return <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium shrink-0 ${i === 0 ? 'bg-teal-500 text-white shadow' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}><Icon className="w-3.5 h-3.5" /><span className="hidden sm:inline">{language === 'en' ? sl.en : sl.zh}</span></div>;
          })}</div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">年級</label><div className="flex gap-2 flex-wrap">{GRADES.map(g => (<button key={g} onClick={() => s.setConfig(g, s.difficulty, s.taskType)} className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${s.gradeLevel === g ? 'bg-teal-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>{g}</button>))}</div></div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">難度</label><div className="flex gap-2 flex-wrap">{DIFFICULTIES.map(d => (<button key={d.value} onClick={() => s.setConfig(s.gradeLevel, d.value, s.taskType)} className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${s.difficulty === d.value ? 'bg-teal-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>{d.zh}</button>))}</div></div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">任務類型</label><div className="space-y-2">{TASK_TYPES.map(tt => (<button key={tt.value} onClick={() => s.setConfig(s.gradeLevel, s.difficulty, tt.value)} className={`w-full text-left px-3 py-2 text-sm rounded-lg font-medium transition-colors ${s.taskType === tt.value ? 'bg-teal-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>{tt.zh}</button>))}</div></div>
          {s.error && <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 text-sm rounded-lg">{s.error}</div>}
          <button onClick={handleGenerate} disabled={s.loading} className="w-full py-3 bg-teal-500 hover:bg-teal-600 disabled:bg-gray-300 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">{s.loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}{s.loading ? 'AI 生成中...' : '✨ AI 生成 Integrated Skills 任務'}</button>
        </div>
      </div>
    );
  }

  if (!s.task) return null;

  // ====== RESULT ======
  if (s.stage === 'result' && s.analysis) {
    const a = s.analysis;
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {stepLabels.map((sl, i) => { const Icon = sl.icon;
            return <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium shrink-0 ${i <= 3 ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}><Icon className="w-3.5 h-3.5" /><span className="hidden sm:inline">{language === 'en' ? sl.en : sl.zh}</span></div>;
          })}</div>
        <div className="flex items-center justify-between"><h1 className="text-xl font-bold text-gray-900 dark:text-white">📊 批改結果</h1><button onClick={s.reset} className="flex items-center gap-1 text-sm text-teal-600 hover:underline"><RefreshCw className="w-4 h-4" />再做一次</button></div>
        <div className="bg-gradient-to-r from-purple-500 to-teal-500 rounded-2xl p-6 text-white text-center"><p className="text-sm opacity-80">Overall Score</p><p className="text-4xl font-bold">{a.overallScore}<span className="text-lg font-normal opacity-80">/100</span></p>{a.estimatedLevel && <p className="text-sm mt-2 opacity-90 flex items-center justify-center gap-1"><Award className="w-4 h-4" />估計 HKDSE Level：{a.estimatedLevel}</p>}</div>
        <div className="grid grid-cols-2 gap-3"><div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 text-center"><p className="text-xs text-gray-500">🎧 Listening</p><p className="text-2xl font-bold text-amber-600">{a.listeningAccuracy}<span className="text-sm font-normal">/100</span></p></div><div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-center"><p className="text-xs text-gray-500">✍️ Writing</p><p className="text-2xl font-bold text-blue-600">{a.writingQuality}<span className="text-sm font-normal">/100</span></p></div></div>
        <div className="grid grid-cols-3 gap-3">
          {[{ l: '內容完整度', s: a.contentCompleteness, i: Target, c: 'text-amber-600', b: 'bg-amber-50 dark:bg-amber-900/20' },{ l: '語言準確度', s: a.languageAccuracy, i: BookOpen, c: 'text-blue-600', b: 'bg-blue-50 dark:bg-blue-900/20' },{ l: '組織清晰度', s: a.organizationClarity, i: FileText, c: 'text-green-600', b: 'bg-green-50 dark:bg-green-900/20' }].map((d, i) => { const I = d.i; return (<div key={i} className={`${d.b} rounded-xl p-4 text-center`}><I className={`w-5 h-5 ${d.c} mx-auto mb-1`} /><p className="text-xs text-gray-500">{d.l}</p><p className={`text-2xl font-bold ${d.c}`}>{d.s}<span className="text-sm font-normal">/100</span></p></div>);})}
        </div>
        {a.generalComment && (<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border"><h3 className="font-semibold mb-3 flex items-center gap-2"><Sparkles className="w-5 h-5 text-purple-500" />總評</h3><p className="text-sm text-gray-600 dark:text-gray-400">{a.generalComment}</p></div>)}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border"><h3 className="font-semibold mb-3 flex items-center gap-2"><Target className="w-5 h-5 text-amber-500" />內容要點</h3><p className="text-sm font-medium text-green-600">✅ 已提取：</p>{(a.capturedPoints ?? []).map((pt, i) => (<div key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"><CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />{pt}</div>))}{(a.missedPoints?.length ?? 0) > 0 && (<><p className="text-sm font-medium text-red-500 mt-3">❌ 遺漏：</p>{(a.missedPoints ?? []).map((pt, i) => (<div key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"><XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />{pt}</div>))}</>)}</div>
        {(a.overCopyWarnings?.length ?? 0) > 0 && (<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-red-200"><h3 className="font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />過度抄襲警告</h3>{(a.overCopyWarnings ?? []).map((w, i) => (<div key={i} className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-sm"><p className="text-red-600 dark:text-red-400 line-through mb-1">{w.original}</p><p className="text-green-600 dark:text-green-400">💡 {w.suggestion}</p></div>))}</div>)}
        <button onClick={s.reset} className="w-full py-3 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" />再做一次</button>
      </div>
    );
  }

  // ====== TASK VIEW (delegated to IntegratedSkillsTaskView) ======
  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {stepLabels.map((sl, i) => { const Icon = sl.icon; const isActive = i === currentStep; const isDone = i < currentStep;
          return (<div key={i} className="flex items-center gap-1 sm:gap-2 shrink-0">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium ${isActive ? 'bg-teal-500 text-white shadow' : isDone ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}><Icon className="w-3.5 h-3.5" /><span className="hidden sm:inline">{language === 'en' ? sl.en : sl.zh}</span></div>
            {i < stepLabels.length - 1 && <ChevronRight className={`w-3 h-3 ${i < currentStep ? 'text-teal-400' : 'text-gray-300'}`} />}
          </div>);
        })}</div>
      <IntegratedSkillsTaskView task={s.task} />
    </div>
  );
}
