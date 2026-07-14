// ============================================
// 學生端 — Integrated Skills (DSE Paper 3 Part B)
// 流程：設定 → 聆聽+筆記 → 寫作 → AI 雙維度批改
// v2.0: 步驟指示器 + 自動儲存草稿 + 行動裝置優化
// ============================================
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, FileText, PenLine, Send, Sparkles, RefreshCw, CheckCircle2, XCircle, Lightbulb, Target, BookOpen, AlertTriangle, Award, ChevronRight, ChevronLeft, Save, Headphones, Edit3 } from 'lucide-react';
import AudioPlayer from '@/components/shared/AudioPlayer';
import { useAppStore } from '@/store/appStore';
import { useT } from '@/hooks/use-i18n';
import type { IntegratedSkillsAnalysis } from '@/lib/ai-service';

type Stage = 'config' | 'listening' | 'writing' | 'result';

const TASK_TYPES = [
  { value: 'summary', zh: '摘要寫作 (Summary)', en: 'Summary' },
  { value: 'email-reply', zh: '電郵回覆 (Email Reply)', en: 'Email Reply' },
  { value: 'short-article', zh: '短文寫作 (Short Article)', en: 'Short Article' },
  { value: 'report', zh: '報告寫作 (Report)', en: 'Report' },
] as const;

const DIFFICULTIES = [
  { value: 'remedial', zh: '基礎', en: 'Remedial' },
  { value: 'core', zh: '核心', en: 'Core' },
  { value: 'challenge', zh: '挑戰', en: 'Challenge' },
] as const;

const GRADES = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] as const;

const STEPS = [
  { key: 'config' as const, label: '設定', labelEn: 'Setup', icon: Sparkles },
  { key: 'listening' as const, label: '聆聽+筆記', labelEn: 'Listen & Note', icon: Headphones },
  { key: 'writing' as const, label: '寫作', labelEn: 'Write', icon: Edit3 },
  { key: 'result' as const, label: '結果', labelEn: 'Result', icon: Award },
];

interface IntegratedTask {
  listeningContent: string;
  listeningContentZh?: string;
  noteTakingGuide: { question: string; hint: string }[];
  writingTask: string;
  writingTaskZh?: string;
  expectedContentPoints: string[];
  wordLimit?: number;
}

const DRAFT_KEY = 'integrated-skills-draft';

export default function IntegratedSkillsPage() {
  const { t, language } = useT();
  const store = useAppStore();

  const [stage, setStage] = useState<Stage>('config');
  const [gradeLevel, setGradeLevel] = useState<string>('S4');
  const [difficulty, setDifficulty] = useState<string>('core');
  const [taskType, setTaskType] = useState<string>('summary');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [task, setTask] = useState<IntegratedTask | null>(null);

  const [showListeningText, setShowListeningText] = useState(false);
  const [studentNotes, setStudentNotes] = useState('');
  const [studentWriting, setStudentWriting] = useState('');
  const [draftSaved, setDraftSaved] = useState(false);
  const [showNotesWarning, setShowNotesWarning] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [analysis, setAnalysis] = useState<IntegratedSkillsAnalysis | null>(null);

  // === Auto-save draft (every 5s while in listening/writing) ===
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveDraft = useCallback(() => {
    if (task && (studentNotes || studentWriting)) {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          gradeLevel, difficulty, taskType, studentNotes, studentWriting,
          savedAt: Date.now(),
        }));
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
      } catch { /* localStorage full */ }
    }
  }, [task, studentNotes, studentWriting, gradeLevel, difficulty, taskType]);

  useEffect(() => {
    if (stage === 'listening' || stage === 'writing') {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(saveDraft, 5000);
      return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
    }
  }, [studentNotes, studentWriting, stage, saveDraft]);

  // === Load draft on mount ===
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.savedAt && Date.now() - draft.savedAt < 24 * 60 * 60 * 1000) {
          setGradeLevel(draft.gradeLevel || 'S4');
          setDifficulty(draft.difficulty || 'core');
          setTaskType(draft.taskType || 'summary');
        }
      }
    } catch { /* ignore */ }
  }, []);

  const handleGenerate = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/ai/generate-integrated-skills', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradeLevel, difficulty, taskType }),
      });
      const json = await res.json();
      if (res.ok && json.task) {
        setTask(json.task); setStage('listening');
        setStudentNotes(''); setStudentWriting(''); setAnalysis(null);
        try {
          const raw = localStorage.getItem(DRAFT_KEY);
          if (raw) { const draft = JSON.parse(raw); if (draft.studentNotes) setStudentNotes(draft.studentNotes); if (draft.studentWriting) setStudentWriting(draft.studentWriting); }
        } catch { /* ignore */ }
      } else { setError(json.error || 'AI 生成失敗'); }
    } catch { setError('網絡連線失敗，請重試'); }
    finally { setLoading(false); }
  };

  const handleSubmit = async () => {
    if (!studentWriting.trim() || !task) return;
    // 驗證：筆記不可空白
    if (!studentNotes.trim()) {
      setShowNotesWarning(true);
      return;
    }
    setShowNotesWarning(false);
    setAiLoading(true); setError('');
    try {
      const res = await fetch('/api/ai/analyze-integrated-skills', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listeningContent: task.listeningContent, noteTakingGuide: task.noteTakingGuide, expectedContentPoints: task.expectedContentPoints, writingTask: task.writingTask, taskType, studentNotes, studentWriting, gradeLevel }),
      });
      const json = await res.json();
      if (res.ok && json.analysis) {
        setAnalysis(json.analysis); setStage('result');
        localStorage.removeItem(DRAFT_KEY);
        if (store.userId) { fetch('/api/gamification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: store.userId, event: { type: 'submitWriting', difficulty } }) }).catch(() => {}); }
      } else { setError(json.error || 'AI 批改失敗'); }
    } catch { setError('網絡連線失敗，請重試'); }
    finally { setAiLoading(false); }
  };

  const handleReset = () => { setStage('config'); setTask(null); setStudentNotes(''); setStudentWriting(''); setAnalysis(null); setError(''); };

  const StepIndicator = () => {
    const currentIdx = STEPS.findIndex(s => s.key === stage);
    return (
      <div className="flex items-center gap-1 sm:gap-2 mb-6 overflow-x-auto pb-1">
        {STEPS.map((s, i) => { const Icon = s.icon; const isActive = i === currentIdx; const isDone = i < currentIdx;
          return (<div key={s.key} className="flex items-center gap-1 sm:gap-2 shrink-0">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${isActive ? 'bg-teal-500 text-white shadow' : isDone ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}>
              <Icon className="w-3.5 h-3.5" /><span className="hidden sm:inline">{language === 'en' ? s.labelEn : s.label}</span>
            </div>
            {i < STEPS.length - 1 && <ChevronRight className={`w-3 h-3 ${i < currentIdx ? 'text-teal-400' : 'text-gray-300'}`} />}
          </div>);
        })}
      </div>
    );
  };

  // ====== Stage: Config ======
  if (stage === 'config') {
    return (<div className="max-w-xl mx-auto space-y-6">
      <div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Integrated Skills</h1><p className="text-sm text-gray-500 mt-1">DSE Paper 3 Part B 模擬 — 聆聽 → 筆記 → 寫作</p></div>
      <StepIndicator />
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">年級</label><div className="flex gap-2 flex-wrap">{GRADES.map(g => (<button key={g} onClick={() => setGradeLevel(g)} className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${gradeLevel === g ? 'bg-teal-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>{g}</button>))}</div></div>
        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">難度</label><div className="flex gap-2 flex-wrap">{DIFFICULTIES.map(d => (<button key={d.value} onClick={() => setDifficulty(d.value)} className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${difficulty === d.value ? 'bg-teal-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>{d.zh}</button>))}</div></div>
        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">任務類型</label><div className="space-y-2">{TASK_TYPES.map(tt => (<button key={tt.value} onClick={() => setTaskType(tt.value)} className={`w-full text-left px-3 py-2 text-sm rounded-lg font-medium transition-colors ${taskType === tt.value ? 'bg-teal-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>{tt.zh}</button>))}</div></div>
        {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 text-sm rounded-lg">{error}</div>}
        <button onClick={handleGenerate} disabled={loading} className="w-full py-3 bg-teal-500 hover:bg-teal-600 disabled:bg-gray-300 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">{loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}{loading ? 'AI 生成中...' : '✨ AI 生成 Integrated Skills 任務'}</button>
      </div>
    </div>);
  }

  if (!task) return null;

  // ====== Stage: Listening + Note-taking ======
  if (stage === 'listening') {
    return (<div className="max-w-4xl mx-auto space-y-6">
      <StepIndicator />
      {task.listeningContentZh && (<div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-700 dark:text-blue-300 flex items-start gap-2"><Lightbulb className="w-4 h-4 mt-0.5 shrink-0" /><span>{task.listeningContentZh}</span></div>)}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-3"><span className="text-xl">🎧</span><h2 className="font-semibold text-gray-900 dark:text-white">聆聽內容</h2><div className="ml-auto">{draftSaved && <span className="text-xs text-green-500 flex items-center gap-0.5"><Save className="w-3 h-3" />已儲存</span>}</div></div>
            <AudioPlayer text={task.listeningContent} label="播放對話" size="md" useCloudTTS />
            <button onClick={() => setShowListeningText(!showListeningText)} className="mt-3 text-xs text-teal-600 hover:underline">{showListeningText ? '▲ 收起文字' : '▼ 顯示聆聽文字'}</button>
            {showListeningText && (<p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line max-h-48 overflow-y-auto p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">{task.listeningContent}</p>)}
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2"><PenLine className="w-4 h-4 text-blue-500" />你的筆記</h3>
            <textarea value={studentNotes} onChange={e => setStudentNotes(e.target.value)} placeholder="邊聽邊記下關鍵資訊..." className="w-full min-h-[220px] p-4 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-y focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
            <div className="flex items-center justify-between mt-2"><span className="text-xs text-gray-400">{studentNotes.length} 字</span><button onClick={saveDraft} className="text-xs text-teal-600 hover:underline flex items-center gap-1"><Save className="w-3 h-3" />手動儲存</button></div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-900/10 rounded-2xl p-5 border border-amber-200 dark:border-amber-800"><h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-3 flex items-center gap-2 text-sm"><Target className="w-4 h-4" />筆記指引</h3><ul className="space-y-2">{task.noteTakingGuide.map((item, i) => (<li key={i} className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2"><span className="text-amber-500 mt-0.5 font-bold">{i + 1}.</span><span><span className="font-medium">{item.question}</span><span className="text-amber-500/70 ml-1 text-xs">— {item.hint}</span></span></li>))}</ul></div>
          <div className="bg-purple-50 dark:bg-purple-900/10 rounded-2xl p-5 border border-purple-200 dark:border-purple-800"><h3 className="font-semibold text-purple-800 dark:text-purple-300 mb-2 flex items-center gap-2 text-sm"><FileText className="w-4 h-4" />寫作任務</h3><p className="text-sm text-purple-700 dark:text-purple-400 leading-relaxed">{task.writingTask}</p>{task.wordLimit && <p className="text-xs text-purple-500 mt-2">📏 建議 {task.wordLimit} 字</p>}</div>
          <button onClick={() => setStage('writing')} className="w-full py-3 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">開始寫作 <ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
    </div>);
  }

  // ====== Stage: Writing ======
  if (stage === 'writing') {
    const wordCount = (studentWriting.match(/[A-Za-z0-9][A-Za-z0-9'\-]*/g) || []).length;
    return (<div className="max-w-4xl mx-auto space-y-6">
      <StepIndicator />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3"><h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Edit3 className="w-4 h-4 text-blue-500" />你的寫作</h3><div className="flex items-center gap-2"><button onClick={() => setStage('listening')} className="text-xs text-teal-600 hover:underline flex items-center gap-1"><ChevronLeft className="w-3 h-3" />返回重聽</button>{draftSaved && <span className="text-xs text-green-500 flex items-center gap-0.5"><Save className="w-3 h-3" />已儲存</span>}</div></div>
            <textarea value={studentWriting} onChange={e => setStudentWriting(e.target.value)} placeholder="根據你的筆記和寫作任務，在此撰寫你的答案..." className="w-full min-h-[350px] p-4 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-y focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
            <div className="flex items-center justify-between mt-2"><span className={`text-xs ${task.wordLimit && wordCount > task.wordLimit ? 'text-red-500 font-medium' : 'text-gray-400'}`}>{wordCount} 詞 {task.wordLimit ? `/ ${task.wordLimit} (建議)` : ''}{task.wordLimit && wordCount > task.wordLimit && ' ⚠️ 超出建議字數'}</span><button onClick={saveDraft} className="text-xs text-teal-600 hover:underline flex items-center gap-1"><Save className="w-3 h-3" />儲存草稿</button></div>
          </div>
          {showNotesWarning && (<div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg text-sm text-amber-700 flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>請先在聆聽階段完成筆記再提交。良好的筆記是寫作的基礎。</span></div>)}
          {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 text-sm rounded-lg">{error}</div>}
          <button onClick={handleSubmit} disabled={aiLoading || !studentWriting.trim()} className="w-full py-3 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">{aiLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}{aiLoading ? 'AI 批改中...' : '提交 AI 批改'}</button>
        </div>
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-900/10 rounded-2xl p-5 border border-amber-200 dark:border-amber-800"><h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-2 text-sm flex items-center gap-2"><PenLine className="w-4 h-4" />你的筆記</h3><p className="text-sm text-amber-700 dark:text-amber-400 whitespace-pre-line max-h-48 overflow-y-auto">{studentNotes || <span className="text-gray-400 italic">（未有筆記）</span>}</p></div>
          <div className="bg-purple-50 dark:bg-purple-900/10 rounded-2xl p-5 border border-purple-200 dark:border-purple-800"><h3 className="font-semibold text-purple-800 dark:text-purple-300 mb-2 text-sm flex items-center gap-2"><FileText className="w-4 h-4" />寫作任務</h3><p className="text-sm text-purple-700 dark:text-purple-400 leading-relaxed">{task.writingTask}</p></div>
          <div className="bg-green-50 dark:bg-green-900/10 rounded-2xl p-5 border border-green-200 dark:border-green-800"><h3 className="font-semibold text-green-800 dark:text-green-300 mb-2 text-sm flex items-center gap-2"><Target className="w-4 h-4" />預期要點</h3><ul className="space-y-1">{task.expectedContentPoints.map((pt, i) => (<li key={i} className="text-xs text-green-700 dark:text-green-400 flex items-start gap-1.5"><span className="text-green-500 mt-0.5">•</span>{pt}</li>))}</ul></div>
        </div>
      </div>
    </div>);
  }

  // ====== Stage: Result ======
  if (stage === 'result' && analysis) {
    return (<div className="max-w-3xl mx-auto space-y-6">
      <StepIndicator />
      <div className="flex items-center justify-between"><h1 className="text-xl font-bold text-gray-900 dark:text-white">📊 批改結果</h1><button onClick={handleReset} className="flex items-center gap-1 text-sm text-teal-600 hover:underline"><RefreshCw className="w-4 h-4" />再做一次</button></div>
      <div className="bg-gradient-to-r from-purple-500 to-teal-500 rounded-2xl p-6 text-white text-center"><p className="text-sm opacity-80">Overall Score</p><p className="text-4xl font-bold">{analysis.overallScore}<span className="text-lg font-normal opacity-80">/100</span></p>{analysis.estimatedLevel && <p className="text-sm mt-2 opacity-90 flex items-center justify-center gap-1"><Award className="w-4 h-4" />估計 HKDSE Level：{analysis.estimatedLevel}</p>}</div>
      <div className="grid grid-cols-2 gap-3"><div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 text-center"><p className="text-xs text-gray-500">🎧 Listening 提取準確度</p><p className="text-2xl font-bold text-amber-600">{analysis.listeningAccuracy}<span className="text-sm font-normal">/100</span></p></div><div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-center"><p className="text-xs text-gray-500">✍️ Writing 品質</p><p className="text-2xl font-bold text-blue-600">{analysis.writingQuality}<span className="text-sm font-normal">/100</span></p></div></div>
      <div className="grid grid-cols-3 gap-3">
        {[{ label: '內容完整度', score: analysis.contentCompleteness, icon: Target, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },{ label: '語言準確度', score: analysis.languageAccuracy, icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },{ label: '組織清晰度', score: analysis.organizationClarity, icon: FileText, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' }].map((dim, i) => (<div key={i} className={`${dim.bg} rounded-xl p-4 text-center`}><dim.icon className={`w-5 h-5 ${dim.color} mx-auto mb-1`} /><p className="text-xs text-gray-500">{dim.label}</p><p className={`text-2xl font-bold ${dim.color}`}>{dim.score}<span className="text-sm font-normal">/100</span></p></div>))}
      </div>
      {analysis.generalComment && (<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700"><h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2"><Sparkles className="w-5 h-5 text-purple-500" />總評</h3><p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{analysis.generalComment}</p></div>)}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700"><h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2"><Target className="w-5 h-5 text-amber-500" />內容要點分析</h3><div className="space-y-2"><p className="text-sm font-medium text-green-600">✅ 已提取的要點：</p>{(analysis.capturedPoints ?? []).map((pt, i) => (<div key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"><CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />{pt}</div>))}{(analysis.missedPoints?.length ?? 0) > 0 && (<><p className="text-sm font-medium text-red-500 mt-3">❌ 遺漏的要點：</p>{(analysis.missedPoints ?? []).map((pt, i) => (<div key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"><XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />{pt}</div>))}</>)}</div></div>
      {(analysis.overCopyWarnings?.length ?? 0) > 0 && (<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-red-200 dark:border-red-800"><h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />過度抄襲警告</h3>{(analysis.overCopyWarnings ?? []).map((w, i) => (<div key={i} className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-sm"><p className="text-red-600 dark:text-red-400 line-through mb-1">{w.original}</p><p className="text-green-600 dark:text-green-400">💡 {w.suggestion}</p></div>))}</div>)}
      <button onClick={handleReset} className="w-full py-3 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" />再做一次</button>
    </div>);
  }

  return null;
}
