// ============================================
// IntegratedSkillsTaskView — 聆聽+筆記+寫作 單頁元件
// 可嵌入任何頁面重複使用
// ============================================
'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  Loader2, Send, Sparkles, CheckCircle2, XCircle, Lightbulb,
  Target, BookOpen, AlertTriangle, Award, ChevronDown, ChevronUp,
  Save, Headphones, Edit3, ChevronRight, PenLine, FileText,
} from 'lucide-react';
import AudioPlayer from '@/components/shared/AudioPlayer';
import { useAppStore } from '@/store/appStore';
import { useIntegratedSkillsStore, type IntegratedTaskData } from '@/store/integratedSkillsStore';
import { useT } from '@/hooks/use-i18n';

const DRAFT_KEY = 'integrated-skills-draft-v3';

interface Props {
  task: IntegratedTaskData;
}

export default function IntegratedSkillsTaskView({ task }: Props) {
  const { language } = useT();
  const appStore = useAppStore();
  const s = useIntegratedSkillsStore();
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // === Auto-save ===
  const saveDraft = useCallback(() => {
    if (s.studentNotes || s.studentWriting) {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          gradeLevel: s.gradeLevel, difficulty: s.difficulty, taskType: s.taskType,
          studentNotes: s.studentNotes, studentWriting: s.studentWriting, savedAt: Date.now(),
        }));
        s.setDraftSaved(true);
        setTimeout(() => s.setDraftSaved(false), 2000);
      } catch { /* ignore */ }
    }
  }, [s.studentNotes, s.studentWriting, s.gradeLevel, s.difficulty, s.taskType]);

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(saveDraft, 5000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [s.studentNotes, s.studentWriting, saveDraft]);

  // === Submit ===
  const handleSubmit = async () => {
    if (!s.studentWriting.trim()) return;
    if (!s.studentNotes.trim()) { s.setShowNotesWarning(true); return; }
    s.setShowNotesWarning(false);
    s.setAiLoading(true); s.setError('');
    try {
      const res = await fetch('/api/ai/analyze-integrated-skills', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listeningContent: task.listeningContent,
          noteTakingGuide: task.noteTakingGuide,
          expectedContentPoints: task.expectedContentPoints,
          writingTask: task.writingTask, taskType: s.taskType,
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

  const wordCount = (s.studentWriting.match(/[A-Za-z0-9][A-Za-z0-9'\-]*/g) || []).length;
  const showWriting = s.stage === 'writing' || (s.stage === 'listening' && s.studentNotes.trim().length > 20);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      {/* ===== MAIN COLUMN (3/4) ===== */}
      <div className="lg:col-span-3 space-y-4">

        {/* Section 1: Listening */}
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
              <AudioPlayer text={task.listeningContent} label="播放對話" size="md" useCloudTTS />
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg max-h-48 overflow-y-auto">{task.listeningContent}</p>
            </div>
          )}
        </div>

        {/* Section 2: Note-taking */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <button onClick={s.toggleNotesGuide} className="w-full flex items-center justify-between text-left mb-3">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs font-bold">2</span>
              筆記 <span className="text-xs text-gray-400 font-normal">{s.studentNotes.length} 字</span>
            </h2>
            {s.showNotesGuide ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {s.showNotesGuide && task.noteTakingGuide.length > 0 && (
            <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1.5">📋 筆記指引：</p>
              <ul className="space-y-1">{task.noteTakingGuide.map((item, i) => (
                <li key={i} className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5"><span className="font-bold">{i + 1}.</span><span><span className="font-medium">{item.question}</span><span className="text-amber-500/70 ml-1">— {item.hint}</span></span></li>
              ))}</ul>
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

        {/* Section 3: Writing */}
        {showWriting && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xs font-bold">3</span>
                寫作 <span className="text-xs text-gray-400 font-normal">{wordCount} 詞{task.wordLimit ? ` / ${task.wordLimit}` : ''}</span>
              </h2>
            </div>
            <div className="mb-3 p-3 bg-purple-50 dark:bg-purple-900/10 rounded-lg">
              <p className="text-xs font-medium text-purple-700 dark:text-purple-400 mb-1">📝 寫作任務：</p>
              <p className="text-sm text-purple-700 dark:text-purple-400">{task.writingTask}</p>
            </div>
            <textarea value={s.studentWriting} onChange={e => s.setStudentWriting(e.target.value)}
              placeholder="根據你的筆記和寫作任務，在此撰寫你的答案..."
              className="w-full min-h-[280px] p-4 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-y focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            <div className="flex items-center justify-between mt-2">
              <span className={`text-xs ${task.wordLimit && wordCount > task.wordLimit ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                {task.wordLimit && wordCount > task.wordLimit && '⚠️ 超出建議字數 '}
              </span>
              <button onClick={saveDraft} className="text-xs text-teal-600 hover:underline flex items-center gap-1"><Save className="w-3 h-3" />儲存草稿</button>
            </div>
            {s.showNotesWarning && (<div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg text-sm text-amber-700 flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>請先完成筆記再提交。</span></div>)}
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
        <div className="bg-purple-50 dark:bg-purple-900/10 rounded-2xl p-4 border border-purple-200 dark:border-purple-800">
          <h3 className="font-semibold text-purple-800 dark:text-purple-300 mb-2 text-sm flex items-center gap-2"><FileText className="w-4 h-4" />寫作任務</h3>
          <p className="text-sm text-purple-700 dark:text-purple-400 leading-relaxed">{task.writingTask}</p>
          {task.wordLimit && <p className="text-xs text-purple-500 mt-2">📏 建議 {task.wordLimit} 字</p>}
        </div>
        <div className="bg-green-50 dark:bg-green-900/10 rounded-2xl border border-green-200 dark:border-green-800 overflow-hidden">
          <button onClick={s.toggleContentPoints} className="w-full p-4 flex items-center justify-between text-left">
            <h3 className="font-semibold text-green-800 dark:text-green-300 text-sm flex items-center gap-2"><Target className="w-4 h-4" />預期要點</h3>
            {s.showContentPoints ? <ChevronUp className="w-4 h-4 text-green-400" /> : <ChevronDown className="w-4 h-4 text-green-400" />}
          </button>
          {s.showContentPoints && (
            <ul className="px-4 pb-4 space-y-1">{task.expectedContentPoints.map((pt, i) => (<li key={i} className="text-xs text-green-700 dark:text-green-400 flex items-start gap-1.5"><span className="text-green-500 mt-0.5 font-bold">{i + 1}.</span>{pt}</li>))}</ul>
          )}
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-2xl p-4 border border-amber-200 dark:border-amber-800">
          <h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-2 text-sm flex items-center gap-2"><PenLine className="w-4 h-4" />你的筆記</h3>
          <p className="text-xs text-amber-700 dark:text-amber-400 whitespace-pre-line max-h-32 overflow-y-auto">{s.studentNotes || <span className="text-gray-400 italic">（請在上方筆記區輸入）</span>}</p>
        </div>
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
  );
}
