// ============================================
// 學生端 — Integrated Skills (DSE Paper 3 Part B)
// 流程：設定 → 聆聽 + 筆記 → 寫作 → AI 雙維度批改
// ============================================
'use client';

import { useState, useRef } from 'react';
import { Loader2, Play, Pause, FileText, PenLine, Send, Sparkles, RefreshCw, CheckCircle2, XCircle, Lightbulb, Target, BookOpen } from 'lucide-react';
import AudioPlayer from '@/components/shared/AudioPlayer';
import { useAppStore } from '@/store/appStore';
import { useT } from '@/hooks/use-i18n';

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

interface IntegratedTask {
  listeningContent: string;
  listeningContentZh?: string;
  noteTakingGuide: { question: string; hint: string }[];
  writingTask: string;
  writingTaskZh?: string;
  expectedContentPoints: string[];
  wordLimit?: number;
}

interface AnalysisResult {
  contentCoverage: { covered: string[]; missed: string[]; score: number };
  languageQuality: { grammarErrors: { original: string; correction: string }[]; styleFeedback: string; score: number };
  organization: { feedback: string; score: number };
  overallScore: number;
  suggestions: string[];
}

export default function IntegratedSkillsPage() {
  const { t } = useT();
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

  const [aiLoading, setAiLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  // 生成 Integrated Skills 任務
  const handleGenerate = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/ai/generate-integrated-skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradeLevel, difficulty, taskType }),
      });
      const json = await res.json();
      if (res.ok && json.task) {
        setTask(json.task);
        setStage('listening');
        setStudentNotes('');
        setStudentWriting('');
        setAnalysis(null);
      } else {
        setError(json.error || 'AI 生成失敗');
      }
    } catch {
      setError('網絡連線失敗，請重試');
    } finally {
      setLoading(false);
    }
  };

  // 提交寫作進行 AI 批改
  const handleSubmit = async () => {
    if (!studentWriting.trim() || !task) return;
    setAiLoading(true); setError('');
    try {
      const res = await fetch('/api/ai/analyze-integrated-skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listeningContent: task.listeningContent,
          noteTakingGuide: task.noteTakingGuide,
          expectedContentPoints: task.expectedContentPoints,
          writingTask: task.writingTask,
          taskType,
          studentNotes,
          studentWriting,
          gradeLevel,
        }),
      });
      const json = await res.json();
      if (res.ok && json.analysis) {
        setAnalysis(json.analysis);
        setStage('result');

        // XP
        if (store.userId) {
          fetch('/api/gamification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId: store.userId, event: { type: 'submitWriting', difficulty } }),
          }).catch((e) => { console.error("[page] fetch failed", e) });
        }
      } else {
        setError(json.error || 'AI 批改失敗');
      }
    } catch {
      setError('網絡連線失敗，請重試');
    } finally {
      setAiLoading(false);
    }
  };

  const handleReset = () => {
    setStage('config');
    setTask(null);
    setStudentNotes('');
    setStudentWriting('');
    setAnalysis(null);
    setError('');
  };

  // ====== Stage: Config ======
  if (stage === 'config') {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Integrated Skills</h1>
          <p className="text-sm text-gray-500 mt-1">DSE Paper 3 Part B 模擬 — 聆聽 → 筆記 → 寫作</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
          {/* 年級 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">年級</label>
            <div className="flex gap-2 flex-wrap">
              {GRADES.map(g => (
                <button key={g} onClick={() => setGradeLevel(g)}
                  className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${gradeLevel === g ? 'bg-teal-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* 難度 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">難度</label>
            <div className="flex gap-2 flex-wrap">
              {DIFFICULTIES.map(d => (
                <button key={d.value} onClick={() => setDifficulty(d.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${difficulty === d.value ? 'bg-teal-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>
                  {d.zh}
                </button>
              ))}
            </div>
          </div>

          {/* 任務類型 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">任務類型</label>
            <div className="space-y-2">
              {TASK_TYPES.map(tt => (
                <button key={tt.value} onClick={() => setTaskType(tt.value)}
                  className={`w-full text-left px-3 py-2 text-sm rounded-lg font-medium transition-colors ${taskType === tt.value ? 'bg-teal-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>
                  {tt.zh}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 text-sm rounded-lg">{error}</div>
          )}

          <button onClick={handleGenerate} disabled={loading}
            className="w-full py-3 bg-teal-500 hover:bg-teal-600 disabled:bg-gray-300 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            {loading ? 'AI 生成中...' : 'AI 生成 Integrated Skills 任務'}
          </button>
        </div>
      </div>
    );
  }

  if (!task) return null;

  // ====== Stage: Listening + Note-taking ======
  if (stage === 'listening') {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">📝 聆聽 + 筆記</h1>
          <span className="text-xs px-2 py-1 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-full">{TASK_TYPES.find(t => t.value === taskType)?.zh}</span>
        </div>

        {/* 情境說明 */}
        {task.listeningContentZh && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-700 dark:text-blue-300">
            💡 {task.listeningContentZh}
          </div>
        )}

        {/* 聆聽播放器 + 文字 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🎧</span>
            <h2 className="font-semibold text-gray-900 dark:text-white">聆聽內容</h2>
            <AudioPlayer text={task.listeningContent} label="播放對話" size="sm" useCloudTTS />
            <button
              onClick={() => setShowListeningText(!showListeningText)}
              className="ml-auto text-xs text-teal-600 hover:underline"
            >
              {showListeningText ? '收起文字 ▲' : '顯示文字 ▼'}
            </button>
          </div>
          {showListeningText && (
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line">{task.listeningContent}</p>
          )}
        </div>

        {/* 筆記指引 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-amber-500" /> 筆記指引
          </h3>
          <ul className="space-y-1.5">
            {task.noteTakingGuide.map((item, i) => (
              <li key={i} className="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                <span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">{item.question}</span>
                  <span className="text-gray-400 dark:text-gray-500 ml-1">— {item.hint}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* 學生筆記區 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <PenLine className="w-4 h-4 text-blue-500" /> 你的筆記
          </h3>
          <textarea
            value={studentNotes}
            onChange={e => setStudentNotes(e.target.value)}
            placeholder="邊聽邊記下關鍵資訊（日期、數字、名字、事件、原因、結果等）..."
            className="w-full min-h-[200px] p-4 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-y focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>

        {/* 寫作任務預覽 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-purple-500" /> 寫作任務預覽
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{task.writingTask}</p>
          {task.writingTaskZh && (
            <p className="text-xs text-gray-400 mt-1">{task.writingTaskZh}</p>
          )}
          {task.wordLimit && (
            <p className="text-xs text-gray-400 mt-2">建議字數：{task.wordLimit} 字</p>
          )}
        </div>

        <button onClick={() => setStage('writing')}
          className="w-full py-3 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-xl transition-colors">
          開始寫作 →
        </button>
      </div>
    );
  }

  // ====== Stage: Writing ======
  if (stage === 'writing') {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">✍️ 根據筆記寫作</h1>
          <button onClick={() => setStage('listening')} className="text-sm text-teal-600 hover:underline">← 返回聆聽</button>
        </div>

        {/* 任務 + 筆記複習 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-xs font-semibold text-gray-500 mb-2">📋 寫作任務</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">{task.writingTask}</p>
            {task.wordLimit && <p className="text-xs text-gray-400 mt-1">字數：{task.wordLimit}</p>}
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-xs font-semibold text-gray-500 mb-2">📝 你的筆記</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{studentNotes || '（未有筆記）'}</p>
          </div>
        </div>

        {/* 寫作區 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <PenLine className="w-4 h-4 text-blue-500" /> 你的寫作
          </h3>
          <textarea
            value={studentWriting}
            onChange={e => setStudentWriting(e.target.value)}
            placeholder="根據你的筆記和寫作任務，在此撰寫你的答案..."
            className="w-full min-h-[300px] p-4 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-y focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-400">{studentWriting.length} 字</span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 text-sm rounded-lg">{error}</div>
        )}

        <button onClick={handleSubmit} disabled={aiLoading || !studentWriting.trim()}
          className="w-full py-3 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
          {aiLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          {aiLoading ? 'AI 批改中...' : '提交 AI 批改'}
        </button>
      </div>
    );
  }

  // ====== Stage: Result ======
  if (stage === 'result' && analysis) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">📊 批改結果</h1>
          <button onClick={handleReset} className="flex items-center gap-1 text-sm text-teal-600 hover:underline">
            <RefreshCw className="w-4 h-4" /> 再做一次
          </button>
        </div>

        {/* 總分 */}
        <div className="bg-gradient-to-r from-purple-500 to-teal-500 rounded-2xl p-6 text-white text-center">
          <p className="text-sm opacity-80">Overall Score</p>
          <p className="text-4xl font-bold">{analysis.overallScore}<span className="text-lg font-normal opacity-80">/100</span></p>
        </div>

        {/* 三維度評分 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: '內容覆蓋', score: analysis.contentCoverage?.score ?? 0, icon: Target, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
            { label: '語言質素', score: analysis.languageQuality?.score ?? 0, icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
            { label: '組織結構', score: analysis.organization?.score ?? 0, icon: FileText, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
          ].map((dim, i) => (
            <div key={i} className={`${dim.bg} rounded-xl p-4 text-center`}>
              <dim.icon className={`w-5 h-5 ${dim.color} mx-auto mb-1`} />
              <p className="text-xs text-gray-500">{dim.label}</p>
              <p className={`text-2xl font-bold ${dim.color}`}>{dim.score}<span className="text-sm font-normal">/10</span></p>
            </div>
          ))}
        </div>

        {/* 內容覆蓋詳情 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Target className="w-5 h-5 text-amber-500" /> 內容覆蓋
          </h3>
          <div className="space-y-2">
            <p className="text-sm font-medium text-green-600">✅ 已涵蓋：</p>
            {(analysis.contentCoverage?.covered ?? []).map((pt, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" /> {pt}
              </div>
            ))}
            {(analysis.contentCoverage?.missed?.length ?? 0) > 0 && (
              <>
                <p className="text-sm font-medium text-red-500 mt-3">❌ 遺漏：</p>
                {(analysis.contentCoverage?.missed ?? []).map((pt, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" /> {pt}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* 語言質素 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-500" /> 語言質素
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{analysis.languageQuality?.styleFeedback ?? ''}</p>
          {(analysis.languageQuality?.grammarErrors?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500">文法錯誤：</p>
              {(analysis.languageQuality?.grammarErrors ?? []).map((err, i) => (
                <div key={i} className="flex items-center gap-2 text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
                  <span className="text-red-500 line-through">{err.original}</span>
                  <span className="text-gray-400">→</span>
                  <span className="text-green-600 font-medium">{err.correction}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 組織結構 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <FileText className="w-5 h-5 text-green-500" /> 組織結構
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{analysis.organization?.feedback ?? ''}</p>
        </div>

        {/* 改善建議 */}
        {(analysis.suggestions?.length ?? 0) > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-amber-500" /> 改善建議
            </h3>
            <ul className="space-y-2">
              {(analysis.suggestions ?? []).map((s, i) => (
                <li key={i} className="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">💡</span> {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 原始答案參考 */}
        <details className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <summary className="text-sm font-medium text-gray-500 cursor-pointer">查看你的原文</summary>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 whitespace-pre-line">{studentWriting}</p>
        </details>
      </div>
    );
  }

  return null;
}
