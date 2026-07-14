// ============================================
// 學生端 — Integrated Skills (DSE Paper 3 Part B)
// v3.0: Zustand 狀態管理 + 單頁垂直佈局 + 可收合區塊
// 流程：設定 → 聆聽 → 筆記 → 寫作（全在同一頁）
// ============================================
'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  Loader2, Send, Sparkles, RefreshCw, CheckCircle2, XCircle, Lightbulb,
  Target, BookOpen, AlertTriangle, Award, ChevronDown, ChevronUp,
  Save, Headphones, Edit3, Play, Pause, RotateCcw, ChevronRight, PenLine, FileText,
} from 'lucide-react';
import AudioPlayer from '@/components/shared/AudioPlayer';
import { useAppStore } from '@/store/appStore';
import { useIntegratedSkillsStore } from '@/store/integratedSkillsStore';
import { useT } from '@/hooks/use-i18n';

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

export default function IntegratedSkillsPage() {
  const { language } = useT();
  const appStore = useAppStore();
  const s = useIntegratedSkillsStore();
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // === Auto-save draft ===
  const saveDraft = useCallback(() => {
    if (s.task && (s.studentNotes || s.studentWriting)) {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          gradeLevel: s.gradeLevel, difficulty: s.difficulty, taskType: s.taskType,
          studentNotes: s.studentNotes, studentWriting: s.studentWriting, savedAt: Date.now(),
        }));
        s.setDraftSaved(true);
        setTimeout(() => s.setDraftSaved(false), 2000);
      } catch { /* ignore */ }
    }
  }, [s.task, s.studentNotes, s.studentWriting, s.gradeLevel, s.difficulty, s.taskType]);

  useEffect(() => {
    if (s.stage === 'listening' || s.stage === 'writing') {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(saveDraft, 5000);
      return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
    }
  }, [s.studentNotes, s.studentWriting, s.stage, saveDraft]);

  // === Load draft ===
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

  // === Generate ===
  const handleGenerate = async () => {
    s.setLoading(true); s.setError('');
    try {
      const res = await fetch('/api/ai/generate-integrated-skills', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradeLevel: s.gradeLevel, difficulty: s.difficulty, taskType: s.taskType }),
      });
      const json = await res.json();
      if (res.ok && json.task) {
        s.setTask(json.task);
        s.setStage('listening');
        s.setStudentNotes(''); s.setStudentWriting(''); s.setAnalysis(null);
        try {
          const raw = localStorage.getItem(DRAFT_KEY);
          if (raw) { const d = JSON.parse(raw); if (d.studentNotes) s.setStudentNotes(d.studentNotes); if (d.studentWriting) s.setStudentWriting(d.studentWriting); }
        } catch { /* ignore */ }
      } else { s.setError(json.error || 'AI 生成失敗'); }
    } catch { s.setError('網絡連線失敗'); }
    finally { s.setLoading(false); }
  };

  // === Submit ===
  const handleSubmit = async () => {
    if (!s.studentWriting.trim() || !s.task) return;
    if (!s.studentNotes.trim()) { s.setShowNotesWarning(true); return; }
    s.setShowNotesWarning(false);
    s.setAiLoading(true); s.setError('');
    try {
      const res = await fetch('/api/ai/analyze-integrated-skills', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listeningContent: s.task.listeningContent,
          noteTakingGuide: s.task.noteTakingGuide,
          expectedContentPoints: s.task.expectedContentPoints,
          writingTask: s.task.writingTask, taskType: s.taskType,
          studentNotes: s.studentNotes, studentWriting: s.studentWriting,
          gradeLevel: s.gradeLevel,
        }),
      });
      const json = await res.json();
      if (res.ok && json.analysis) {
        s.setAnalysis(json.analysis); s.setStage('result');
        localStorage.removeItem(DRAFT_KEY);
        if (appStore.userId) {
          fetch('/api/gamification', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId: appStore.userId, event: { type: 'submitWriting', difficulty: s.difficulty } }) }).catch(() => {});
        }
      } else { s.setError(json.error || 'AI 批改失敗'); }
    } catch { s.setError('網絡連線失敗'); }
    finally { s.setAiLoading(false); }
  };

  // === Step Indicator ===
  const currentStep = s.stage === 'config' ? 0 : s.stage === 'listening' ? 1 : s.stage === 'writing' ? 2 : 3;
  const stepLabels = [
    { zh: '設定', en: 'Setup', icon: Sparkles },
    { zh: '聆聽+筆記', en: 'Listen & Note', icon: Headphones },
    { zh: '寫作', en: 'Write', icon: Edit3 },
    { zh: '結果', en: 'Result', icon: Award },
  ];

  // ====== CONFIG VIEW ======
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

  // ====== RESULT VIEW ======
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

  // ====== MAIN TASK VIEW (listening + writing combined on one page) ======
  const wordCount = (s.studentWriting.match(/[A-Za-z0-9][A-Za-z0-9'\-]*/g) || []).length;
  const showWriting = s.stage === 'writing' || (s.stage === 'listening' && s.studentNotes.trim().length > 20);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {stepLabels.map((sl, i) => { const Icon = sl.icon; const isActive = i === currentStep; const isDone = i < currentStep;
          return (<div key={i} className="flex items-center gap-1 sm:gap-2 shrink-0">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium ${isActive ? 'bg-teal-500 text-white shadow' : isDone ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}><Icon className="w-3.5 h-3.5" /><span className="hidden sm:inline">{language === 'en' ? sl.en : sl.zh}</span></div>
            {i < stepLabels.length - 1 && <ChevronRight className={`w-3 h-3 ${i < currentStep ? 'text-teal-400' : 'text-gray-300'}`} />}
          </div>);
        })}</div>

      {/* Context */}
      {s.task.listeningContentZh && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-700 dark:text-blue-300 flex items-start gap-2"><Lightbulb className="w-4 h-4 mt-0.5 shrink-0" /><span>{s.task.listeningContentZh}</span></div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* ===== MAIN COLUMN (3/4) ===== */}
        <div className="lg:col-span-3 space-y-4">

          {/* ── SECTION 1: Listening ── */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
            <button onClick={s.toggleListeningText} className="w-full flex items-center justify-between text-left">
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex items-center justify-center text-xs font-bold">1</span>
                聆聽內容
              </h2>
              <div className="flex items-center gap-2">
                {s.draftSaved && <span className="text-xs text-green-500 flex items-center gap-0.5"><Save className="w-3 h-3" />已儲存</span>}
                {s.showListeningText ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </button>
            {s.showListeningText && (
              <div className="mt-3 space-y-3">
                <AudioPlayer text={s.task.listeningContent} label="播放對話" size="md" useCloudTTS />
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg max-h-48 overflow-y-auto">{s.task.listeningContent}</p>
              </div>
            )}
          </div>

          {/* ── SECTION 2: Note-taking ── */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
            <button onClick={s.toggleNotesGuide} className="w-full flex items-center justify-between text-left mb-3">
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs font-bold">2</span>
                筆記 <span className="text-xs text-gray-400 font-normal">{s.studentNotes.length} 字</span>
              </h2>
              {s.showNotesGuide ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {s.showNotesGuide && s.task.noteTakingGuide.length > 0 && (
              <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1.5">📋 筆記指引：</p>
                <ul className="space-y-1">{s.task.noteTakingGuide.map((item, i) => (<li key={i} className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5"><span className="font-bold">{i + 1}.</span><span><span className="font-medium">{item.question}</span><span className="text-amber-500/70 ml-1">— {item.hint}</span></span></li>))}</ul>
              </div>
            )}
            <textarea value={s.studentNotes} onChange={e => s.setStudentNotes(e.target.value)}
              placeholder="邊聽邊記下關鍵資訊（日期、數字、名字、事件、原因、結果等）..."
              className="w-full min-h-[180px] p-4 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-y focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            <div className="flex items-center justify-between mt-2">
              <button onClick={saveDraft} className="text-xs text-teal-600 hover:underline flex items-center gap-1"><Save className="w-3 h-3" />儲存草稿</button>
              {s.stage === 'listening' && s.studentNotes.trim().length > 20 && (
                <button onClick={() => s.setStage('writing')} className="text-xs text-teal-600 hover:underline flex items-center gap-1">完成筆記，開始寫作 <ChevronRight className="w-3 h-3" /></button>
              )}
            </div>
          </div>

          {/* ── SECTION 3: Writing ── */}
          {showWriting && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xs font-bold">3</span>
                  寫作 <span className="text-xs text-gray-400 font-normal">{wordCount} 詞{s.task.wordLimit ? ` / ${s.task.wordLimit}` : ''}</span>
                </h2>
              </div>
              <div className="mb-3 p-3 bg-purple-50 dark:bg-purple-900/10 rounded-lg">
                <p className="text-xs font-medium text-purple-700 dark:text-purple-400 mb-1">📝 寫作任務：</p>
                <p className="text-sm text-purple-700 dark:text-purple-400">{s.task.writingTask}</p>
              </div>
              <textarea value={s.studentWriting} onChange={e => s.setStudentWriting(e.target.value)}
                placeholder="根據你的筆記和寫作任務，在此撰寫你的答案..."
                className="w-full min-h-[280px] p-4 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-y focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <div className="flex items-center justify-between mt-2">
                <span className={`text-xs ${s.task.wordLimit && wordCount > s.task.wordLimit ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                  {s.task.wordLimit && wordCount > s.task.wordLimit && '⚠️ 超出建議字數 '}
                </span>
                <button onClick={saveDraft} className="text-xs text-teal-600 hover:underline flex items-center gap-1"><Save className="w-3 h-3" />儲存草稿</button>
              </div>

              {s.showNotesWarning && (<div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg text-sm text-amber-700 flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>請先完成筆記再提交。良好的筆記是寫作的基礎。</span></div>)}
              {s.error && <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 text-sm rounded-lg">{s.error}</div>}

              <button onClick={handleSubmit} disabled={s.aiLoading || !s.studentWriting.trim()}
                className="mt-4 w-full py-3 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
                {s.aiLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                {s.aiLoading ? 'AI 批改中...' : '提交 AI 批改'}
              </button>
            </div>
          )}
        </div>

        {/* ===== SIDEBAR (1/4) ===== */}
        <div className="space-y-4">
          {/* Writing Task */}
          <div className="bg-purple-50 dark:bg-purple-900/10 rounded-2xl p-4 border border-purple-200 dark:border-purple-800">
            <h3 className="font-semibold text-purple-800 dark:text-purple-300 mb-2 text-sm flex items-center gap-2"><FileText className="w-4 h-4" />寫作任務</h3>
            <p className="text-sm text-purple-700 dark:text-purple-400 leading-relaxed">{s.task.writingTask}</p>
            {s.task.wordLimit && <p className="text-xs text-purple-500 mt-2">📏 建議 {s.task.wordLimit} 字</p>}
          </div>

          {/* Expected Points */}
          <div className="bg-green-50 dark:bg-green-900/10 rounded-2xl border border-green-200 dark:border-green-800 overflow-hidden">
            <button onClick={s.toggleContentPoints} className="w-full p-4 flex items-center justify-between text-left">
              <h3 className="font-semibold text-green-800 dark:text-green-300 text-sm flex items-center gap-2"><Target className="w-4 h-4" />預期要點</h3>
              {s.showContentPoints ? <ChevronUp className="w-4 h-4 text-green-400" /> : <ChevronDown className="w-4 h-4 text-green-400" />}
            </button>
            {s.showContentPoints && (
              <ul className="px-4 pb-4 space-y-1">
                {s.task.expectedContentPoints.map((pt, i) => (<li key={i} className="text-xs text-green-700 dark:text-green-400 flex items-start gap-1.5"><span className="text-green-500 mt-0.5 font-bold">{i + 1}.</span>{pt}</li>))}
              </ul>
            )}
          </div>

          {/* Your Notes Summary */}
          <div className="bg-amber-50 dark:bg-amber-900/10 rounded-2xl p-4 border border-amber-200 dark:border-amber-800">
            <h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-2 text-sm flex items-center gap-2"><PenLine className="w-4 h-4" />你的筆記</h3>
            <p className="text-xs text-amber-700 dark:text-amber-400 whitespace-pre-line max-h-32 overflow-y-auto">{s.studentNotes || <span className="text-gray-400 italic">（請在上方筆記區輸入）</span>}</p>
          </div>

          {/* Progress summary */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-2">進度</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between"><span>聆聽</span><span className={s.showListeningText ? 'text-green-500' : 'text-gray-400'}>{s.showListeningText ? '✓' : '⋯'}</span></div>
              <div className="flex items-center justify-between"><span>筆記 ({s.studentNotes.length}字)</span><span className={s.studentNotes.trim() ? 'text-green-500' : 'text-gray-400'}>{s.studentNotes.trim() ? '✓' : '⋯'}</span></div>
              <div className="flex items-center justify-between"><span>寫作 ({wordCount}詞)</span><span className={s.studentWriting.trim() ? 'text-green-500' : 'text-gray-400'}>{s.studentWriting.trim() ? '✓' : '⋯'}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
