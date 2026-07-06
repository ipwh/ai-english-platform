// ============================================
// 教師端 — 教材中心
// TODO: connect to API — 上傳、OCR、RAG 由後端處理
// ============================================
'use client';

import { useState } from 'react';
import { Upload, FileText, File, Image, Sparkles, Search, Tag, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { mockMaterials } from '@/lib/mock-data';
import { formatDate } from '@/lib/utils';

const typeIcons: Record<string, React.ElementType> = {
  'pdf': FileText,
  'docx': File,
  'image': Image,
  'ppt': File,
};

export default function TeacherMaterialsPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // === AI 教材分析 ===
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<Record<string, {
    summary: string;
    keyVocabulary: { word: string; meaningZh: string }[];
    keyGrammarPoints: { point: string; explanationZh: string }[];
    suggestedQuestions: { type: string; prompt: string; answer: string }[];
    difficultyLevel: string;
    suggestedGrade: string;
  } | null>>({});

  const handleAIAnalyze = async (materialId: string, title: string) => {
    setAnalyzingId(materialId);
    try {
      const res = await fetch('/api/ai/analyze-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content: `教材名稱：${title}\n這是一份香港中學英文科教材，內容涵蓋相關文法、詞彙及語言技能訓練。`,
          gradeLevel: 'S4',
        }),
      });
      const json = await res.json();
      if (res.ok && json.analysis) {
        setAiResults(prev => ({ ...prev, [materialId]: json.analysis }));
      }
    } catch { /* silent fail */ }
    finally { setAnalyzingId(null); }
  };

  const filtered = mockMaterials.filter(m => {
    if (search && !m.title.includes(search) && !m.tags.some(t => t.includes(search))) return false;
    return true;
  });

  const statusLabel: Record<string, { label: string; color: string }> = {
    'pending': { label: '待處理', color: 'bg-gray-100 text-gray-600' },
    'processing': { label: '處理中', color: 'bg-yellow-100 text-yellow-700' },
    'completed': { label: '已完成', color: 'bg-green-100 text-green-700' },
    'failed': { label: '失敗', color: 'bg-red-100 text-red-700' },
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">📁 教材中心</h1>

      {/* 上傳區 */}
      <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer">
        <Upload className="w-10 h-10 text-gray-300 dark:text-gray-500 mx-auto mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">拖放檔案至此，或點擊上傳</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">支援 PDF、DOCX、PPT、圖片（最大 20MB）</p>
        {/* TODO: connect to API — 檔案上傳至後端 */}
      </div>

      {/* 搜尋 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋教材..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 教材列表 */}
      <div className="space-y-3">
        {filtered.map((m) => {
          const Icon = typeIcons[m.type] || File;
          const isExpanded = expandedId === m.id;
          return (
            <div key={m.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50" onClick={() => setExpandedId(isExpanded ? null : m.id)}>
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">{m.title}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {m.tags.map(tag => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-500 flex items-center gap-1">
                        <Tag className="w-2 h-2" /> {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 flex-shrink-0">
                  <span>{m.fileSize}</span>
                  <span>{formatDate(m.uploadedAt)}</span>
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>

              {/* 展開詳情 */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-xs text-gray-400">OCR 狀態</span>
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${statusLabel[m.ocrStatus].color}`}>{statusLabel[m.ocrStatus].label}</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">RAG 狀態</span>
                      <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${statusLabel[m.ragStatus].color}`}>{statusLabel[m.ragStatus].label}</span>
                    </div>
                  </div>

                  {/* AI 教材分析 */}
                  {!aiResults[m.id] ? (
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
                      <Sparkles className="w-6 h-6 text-purple-300 mx-auto mb-2" />
                      <p className="text-xs text-gray-500 mb-3">使用 AI 分析教材內容，提取關鍵詞彙及文法點</p>
                      <button
                        onClick={() => handleAIAnalyze(m.id, m.title)}
                        disabled={analyzingId === m.id}
                        className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white text-sm rounded-lg font-medium inline-flex items-center gap-2"
                      >
                        {analyzingId === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {analyzingId === m.id ? 'AI 分析中...' : 'AI 分析教材'}
                      </button>
                    </div>
                  ) : (
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 space-y-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-500" />
                        <span className="font-medium text-purple-700 dark:text-purple-300">AI 分析結果</span>
                      </div>
                      <p className="text-gray-600 dark:text-gray-400">{aiResults[m.id]!.summary}</p>
                      {aiResults[m.id]!.keyVocabulary.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {aiResults[m.id]!.keyVocabulary.slice(0, 5).map((v, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 bg-white dark:bg-gray-800 rounded-full text-gray-600">
                              {v.word} — {v.meaningZh}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 從教材建立練習 */}
                  <button className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg font-medium flex items-center justify-center gap-2">
                    <Sparkles className="w-4 h-4" /> 從此教材生成練習題目
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
