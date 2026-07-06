// ============================================
// 學生端 — 寫作支援頁面
// ============================================
'use client';

import { useState } from 'react';
import { Send, Lightbulb, AlertTriangle, CheckCircle, PencilLine, ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { mockWritings } from '@/lib/mock-data';
import { formatDate } from '@/lib/utils';

export default function WritingPage() {
  const [selectedDraft, setSelectedDraft] = useState(mockWritings[0]);
  const [showNewWriting, setShowNewWriting] = useState(false);
  const [newPrompt, setNewPrompt] = useState('');
  const [newDraft, setNewDraft] = useState('');

  // === AI 寫作批改狀態 ===
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{
    overallScore: number;
    strengths: string[];
    weaknesses: string[];
    grammarErrors: { original: string; correction: string; explanation: string }[];
    chinglishWarnings: { original: string; suggestion: string; explanation: string }[];
    vocabularySuggestions: { original: string; suggestion: string; reason: string }[];
    structureFeedback: string;
    revisedVersion?: string;
    generalComment: string;
  } | null>(null);
  const [aiError, setAiError] = useState('');

  const handleAIAnalyze = async () => {
    if (!newPrompt || !newDraft) return;
    setAiLoading(true);
    setAiError('');
    setAiResult(null);
    try {
      const res = await fetch('/api/ai/analyze-writing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newPrompt,
          prompt: newPrompt,
          studentDraft: newDraft,
        }),
      });
      const json = await res.json();
      if (res.ok && json.analysis) {
        setAiResult(json.analysis);
      } else {
        setAiError(json.error || 'AI 批改暫時無法使用');
      }
    } catch {
      setAiError('AI 服務連線失敗');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">✍️ 寫作支援</h1>

      {/* 新增寫作 */}
      {!showNewWriting ? (
        <button
          onClick={() => setShowNewWriting(true)}
          className="w-full py-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl text-gray-400 hover:border-teal-400 hover:text-teal-500 transition-colors flex items-center justify-center gap-2"
        >
          <PencilLine className="w-5 h-5" /> 開始新寫作
        </button>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-white">新寫作練習</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">題目 / 主題</label>
            <input
              type="text"
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="例如：Write a letter of complaint..."
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">你的寫作</label>
            <textarea
              value={newDraft}
              onChange={(e) => setNewDraft(e.target.value)}
              placeholder="在此寫下你的文章..."
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAIAnalyze}
              disabled={aiLoading || !newPrompt || !newDraft}
              className="px-4 py-2 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 disabled:opacity-50 flex items-center gap-2"
            >
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {aiLoading ? 'AI 批改中...' : '提交 AI 批改'}
            </button>
            <button onClick={() => { setShowNewWriting(false); setAiResult(null); setAiError(''); }} className="px-4 py-2 text-gray-500 text-sm">取消</button>
          </div>

          {/* AI 批改結果 */}
          {aiError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-600 dark:text-red-400">
              ⚠️ {aiError}
            </div>
          )}

          {aiResult && (
            <div className="space-y-4 mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <h3 className="font-semibold text-purple-800 dark:text-purple-200">AI 寫作分析</h3>
              </div>

              {/* 評分 */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600 dark:text-gray-400">整體評分：</span>
                <span className={`text-2xl font-bold ${aiResult.overallScore >= 70 ? 'text-green-600' : aiResult.overallScore >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {aiResult.overallScore}/100
                </span>
              </div>

              {/* 中式英文警示 */}
              {aiResult.chinglishWarnings.length > 0 && (
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 mb-2">🚨 中式英文警示</p>
                  {aiResult.chinglishWarnings.map((w, i) => (
                    <div key={i} className="text-xs text-orange-700 dark:text-orange-300 mb-1">
                      ❌ 「{w.original}」→ ✅ 「{w.suggestion}」— {w.explanation}
                    </div>
                  ))}
                </div>
              )}

              {/* 文法錯誤 */}
              {aiResult.grammarErrors.length > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="text-xs font-semibold text-red-600 mb-2">📝 文法修正</p>
                  {aiResult.grammarErrors.map((e, i) => (
                    <div key={i} className="text-xs text-red-700 dark:text-red-300 mb-1">
                      「{e.original}」→「{e.correction}」— {e.explanation}
                    </div>
                  ))}
                </div>
              )}

              {/* 總評 */}
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                <p className="text-xs font-medium text-gray-500 mb-1">AI 總評</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{aiResult.generalComment}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI 寫作工具箱 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* 句型框架 */}
        <details className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 group">
          <summary className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2 cursor-pointer list-none">
            <Lightbulb className="w-4 h-4" /> 句型框架
          </summary>
          <div className="mt-3 space-y-2 text-xs text-blue-600 dark:text-blue-400">
            <p><strong>引言段：</strong>Hook → Background → Thesis Statement</p>
            <p><strong>主體段：</strong>Topic Sentence → Example → Explanation → Link</p>
            <p><strong>結論段：</strong>Restate Thesis → Summarize → Final Thought</p>
          </div>
        </details>

        {/* 連接詞面板 */}
        <details className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
          <summary className="text-sm font-medium text-green-700 dark:text-green-300 flex items-center gap-2 cursor-pointer list-none">
            <ArrowRight className="w-4 h-4" /> 連接詞建議
          </summary>
          <div className="mt-3 space-y-1.5 text-xs text-green-600 dark:text-green-400">
            <p><strong>補充：</strong>Furthermore, Moreover, In addition, Additionally</p>
            <p><strong>轉折：</strong>However, Nevertheless, On the other hand, Although</p>
            <p><strong>因果：</strong>Therefore, As a result, Consequently, Thus</p>
            <p><strong>舉例：</strong>For instance, For example, Such as, Namely</p>
            <p><strong>總結：</strong>In conclusion, To sum up, Overall, In brief</p>
          </div>
        </details>

        {/* Chinglish 警示 */}
        <details className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4">
          <summary className="text-sm font-medium text-orange-700 dark:text-orange-300 flex items-center gap-2 cursor-pointer list-none">
            <AlertTriangle className="w-4 h-4" /> 常見 Chinglish
          </summary>
          <div className="mt-3 space-y-1.5 text-xs text-orange-600 dark:text-orange-400">
            <p>❌ according to my opinion → ✅ In my opinion</p>
            <p>❌ I very like it → ✅ I really like it</p>
            <p>❌ There have many people → ✅ There are many people</p>
            <p>❌ I am agree → ✅ I agree</p>
            <p>❌ Although...but → ✅ Although... (no but)</p>
            <p>❌ Because...so → ✅ Because... (no so)</p>
          </div>
        </details>
      </div>

      {/* 寫作草稿列表 */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">我的寫作草稿</h2>
        <div className="space-y-4">
          {mockWritings.map((w) => (
            <div key={w.id} className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border cursor-pointer transition-colors ${
              selectedDraft.id === w.id ? 'border-teal-400 ring-1 ring-teal-400' : 'border-gray-100 dark:border-gray-700 hover:border-gray-300'
            }`} onClick={() => setSelectedDraft(w)}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-900 dark:text-white">{w.title}</h3>
                <span className="text-xs text-gray-400">{formatDate(w.submittedAt)}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{w.prompt}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 選中草稿詳情 */}
      {selectedDraft && (
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-white">{selectedDraft.title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{selectedDraft.prompt}</p>

          {/* 草稿 vs 修正對照 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
              <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">📝 你的原文</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{selectedDraft.draft}</p>
            </div>
            {selectedDraft.revisedVersion && (
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4">
                <h3 className="text-xs font-medium text-green-600 dark:text-green-400 mb-2">✅ AI 修正版</h3>
                <p className="text-sm text-green-800 dark:text-green-200 whitespace-pre-wrap">{selectedDraft.revisedVersion}</p>
              </div>
            )}
          </div>

          {/* AI 建議 */}
          {selectedDraft.aiSuggestions && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
              <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">🤖 AI 寫作建議</h3>
              <ul className="space-y-1">
                {selectedDraft.aiSuggestions.map((s, i) => (
                  <li key={i} className="text-sm text-blue-600 dark:text-blue-400 flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Chinglish 警示 */}
          {selectedDraft.chinglishWarnings && selectedDraft.chinglishWarnings.length > 0 && (
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4">
              <h3 className="text-sm font-medium text-orange-700 dark:text-orange-300 mb-2">⚠️ 中式英文警示</h3>
              <ul className="space-y-1">
                {selectedDraft.chinglishWarnings.map((w, i) => (
                  <li key={i} className="text-sm text-orange-600 dark:text-orange-400">{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 教師評語 */}
          {selectedDraft.teacherComment && (
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4">
              <h3 className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-1">👩‍🏫 教師評語</h3>
              <p className="text-sm text-purple-600 dark:text-purple-400">{selectedDraft.teacherComment}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
