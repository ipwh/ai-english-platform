// ============================================
// 學生端 — 錯題庫
// ============================================
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Filter, RotateCcw, Lightbulb, BookMarked, Search, Sparkles, Loader2 } from 'lucide-react';

import SkillChip from '@/components/shared/SkillChip';
import { skillLabels } from '@/lib/nav';
import { formatDate } from '@/lib/utils';
import type { GrammarItem, LanguageSkill, MistakeType } from '@/lib/types';
import type { MistakeItem } from '@/lib/types';
import { useT } from '@/hooks/use-i18n';

const mistakeTypeLabels: Record<string, string> = {
  'grammar': '文法錯誤',
  'vocabulary': '詞彙錯誤',
  'comprehension': '理解錯誤',
  'careless': '粗心大意',
  'time-management': '時間不足',
};

export default function MistakesPage() {
  const { t } = useT();
  const [skillFilter, setSkillFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<MistakeType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [mistakes, setMistakes] = useState<MistakeItem[]>([]);

  useEffect(() => {
    fetch('/api/mistakes?studentId=student')
      .then(r => r.json())
      .then(d => { if (d.mistakes?.length) setMistakes(d.mistakes); })
      .catch(() => {});
  }, []);

  // === AI 解說狀態 ===
  const [explainingId, setExplainingId] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, {
    reasonZh: string;
    ruleExplanation: string;
    examples: { wrong: string; correct: string }[];
    memoryTip: string;
    relatedTopics: string[];
  } | null>>({});

  const handleAIExplain = async (m: MistakeItem) => {
    setExplainingId(m.id);
    try {
      const res = await fetch('/api/ai/explain-mistake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: m.questionSummary,
          correctAnswer: m.correctAnswer,
          studentAnswer: m.studentAnswer,
          grammarItemZh: m.subSkillZh,
        }),
      });
      const json = await res.json();
      if (res.ok && json.explanation) {
        setExplanations(prev => ({ ...prev, [m.id]: json.explanation }));
      }
    } catch { /* silent */ }
    finally { setExplainingId(null); }
  };

  const filtered = mistakes.filter((m) => {
    if (skillFilter !== 'all' && m.grammarItem !== skillFilter && m.languageSkill !== skillFilter) return false;
    if (typeFilter !== 'all' && m.mistakeType !== typeFilter) return false;
    if (search && !m.questionSummary.includes(search)) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('mistakes.title')}</h1>

      {/* 統計摘要 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '總錯題數', value: mistakes.length, unit: '題' },
          { label: '已溫習', value: mistakes.filter(m => m.reviewed).length, unit: '題' },
          { label: '重溫清單', value: mistakes.filter(m => m.inReviewList).length, unit: '題' },
          { label: '待溫習', value: mistakes.filter(m => !m.reviewed).length, unit: '題' },
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}<span className="text-sm font-normal text-gray-400 ml-1">{stat.unit}</span></p>
          </div>
        ))}
      </div>

      {/* 篩選列 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜尋錯題..." className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <select value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
            <option value="all">全部技能</option>
            {Object.entries(skillLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as MistakeType | 'all')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
            <option value="all">全部錯誤類型</option>
            {Object.entries(mistakeTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* 錯題列表 */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center text-gray-400">
            <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>沒有符合條件的錯題</p>
          </div>
        ) : (
          filtered.map((m) => (
            <div key={m.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <SkillChip grammarItem={m.grammarItem} languageSkill={m.languageSkill} subSkill={m.subSkill} />
                    <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
                      {mistakeTypeLabels[m.mistakeType]}
                    </span>
                    {m.inReviewList && (
                      <span className="text-xs px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-full">重溫清單</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{m.questionSummary}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span>你的答案：<span className="text-red-500 line-through">{m.studentAnswer}</span></span>
                    <span>→</span>
                    <span>正確：<span className="text-green-500 font-medium">{m.correctAnswer}</span></span>
                    <span>·</span>
                    <span>{formatDate(m.date)}</span>
                  </div>
                  {m.aiExplanation && !explanations[m.id] && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg">
                      💡 {m.aiExplanation}
                    </p>
                  )}

                  {/* AI 解說結果 */}
                  {explanations[m.id] && (
                    <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-500" />
                        <span className="font-medium text-purple-700 dark:text-purple-300">AI 錯因分析</span>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300">{explanations[m.id]!.reasonZh}</p>
                      {explanations[m.id]!.ruleExplanation && (
                        <div className="p-2 bg-white dark:bg-gray-800 rounded">
                          <p className="text-xs font-medium text-gray-500 mb-1">📘 文法規則</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{explanations[m.id]!.ruleExplanation}</p>
                        </div>
                      )}
                      {explanations[m.id]!.examples.length > 0 && (
                        <div className="p-2 bg-white dark:bg-gray-800 rounded">
                          <p className="text-xs font-medium text-gray-500 mb-1">🔁 對比例句</p>
                          {explanations[m.id]!.examples.map((ex, i) => (
                            <p key={i} className="text-xs text-gray-600 dark:text-gray-400">
                              ❌ {ex.wrong} → ✅ {ex.correct}
                            </p>
                          ))}
                        </div>
                      )}
                      {explanations[m.id]!.memoryTip && (
                        <p className="text-xs text-purple-600 dark:text-purple-400">🧠 {explanations[m.id]!.memoryTip}</p>
                      )}
                      {explanations[m.id]!.relatedTopics.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {explanations[m.id]!.relatedTopics.map((t, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 bg-purple-100 dark:bg-purple-800 text-purple-600 dark:text-purple-300 rounded-full">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <Link href={`/student/practice/${m.questionId}`} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors">
                  <RotateCcw className="w-3 h-3" /> 重做
                </Link>
                <button
                  onClick={() => handleAIExplain(m)}
                  disabled={explainingId === m.id}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50"
                >
                  {explainingId === m.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {explainingId === m.id ? '分析中...' : (explanations[m.id] ? '重新解說' : 'AI 解說')}
                </button>
                <button className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                  <BookMarked className="w-3 h-3" /> {m.inReviewList ? '移出重溫' : '加入重溫'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
