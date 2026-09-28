// ============================================
// 學生端 — 錯題庫
// ============================================
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Filter, RotateCcw, Lightbulb, BookMarked, Search, Sparkles, Loader2, CheckCircle, Brain, Plus, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { logger } from '@/shared/logger/logger';

import SkillChip from '@/components/shared/SkillChip';
import QuickAddVocab from '@/modules/vocabulary/components/QuickAddVocab';
import { skillLabels, getSkillLabel } from '@/shared/utils/nav';
import { formatDate } from '@/shared/utils/utils';
import { useAppStore } from '@/store/appStore';
import type { GrammarItem, LanguageSkill, MistakeType } from '@/shared/types/types';
import type { MistakeItem } from '@/shared/types/types';
import type { MistakeSkillBucket } from '@/modules/mistake/intelligence/services/mistake-skill-breakdown';
import { getStrategyCard } from '@/modules/mistake/intelligence/services/mistake-strategy';
import { useT } from '@/hooks/use-i18n';

const mistakeTypeLabels: Record<string, string> = {
  'grammar': 'mistake.grammar',
  'vocabulary': 'mistake.vocabulary',
  'comprehension': 'mistake.comprehension',
  'careless': 'mistake.careless',
  'time-management': 'mistake.timeManagement',
};

export default function MistakesPage() {
  const { t } = useT();
  const store = useAppStore();
  const [skillFilter, setSkillFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<MistakeType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [mistakes, setMistakes] = useState<MistakeItem[]>([]);
  const [breakdown, setBreakdown] = useState<MistakeSkillBucket[]>([]);
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [studentId, setStudentId] = useState<string>('');
  const [gradeLevel, setGradeLevel] = useState('S4');

  // === SRS 每日錯題複習 ===
  const [srsMistakesDue, setSrsMistakesDue] = useState(0);

  useEffect(() => {
    if (!studentId) return;
    fetch(`/api/srs/review?studentId=${encodeURIComponent(studentId)}&type=mistakes`)
      .then(r => r.json())
      .then(d => {
        if (d.reviewCards?.mistakes) {
          setSrsMistakesDue(d.reviewCards.mistakes.length);
        }
      })
      .catch((e) => { logger.error({ module: 'student-mistakes', error: e instanceof Error ? e.message : String(e) }, 'SRS review fetch failed'); });
  }, [studentId]);

  useEffect(() => {
    fetch('/api/auth/profile')
      .then(r => r.json())
      .then(d => {
        const id = d?.user?.id || store.userId || '';
        if (id) setStudentId(id);
        const level = d?.user?.level || d?.user?.class?.gradeLevel;
        if (level && ['S1','S2','S3','S4','S5','S6'].includes(level)) setGradeLevel(level);
      })
      .catch((e) => { logger.error({ module: 'student-mistakes', error: e instanceof Error ? e.message : String(e) }, 'Profile fetch failed'); });
  }, [store.userId]);

  const loadMistakes = () => {
    if (!studentId) return;
    setLoadError(false);
    fetch(`/api/mistakes?studentId=${encodeURIComponent(studentId)}`)
      .then(r => r.json())
      .then(d => {
        if (d.mistakes?.length) setMistakes(d.mistakes);
        setBreakdown(Array.isArray(d.breakdown) ? d.breakdown : []);
      })
      .catch((e) => { logger.error({ module: 'student-mistakes', error: e instanceof Error ? e.message : String(e) }, 'Failed to load mistakes'); setLoadError(true); });
  };

  useEffect(() => { loadMistakes(); }, [studentId]);

  // === AI 解說狀態 ===
  const [explainingId, setExplainingId] = useState<string | null>(null);
  const [explainError, setExplainError] = useState<Record<string, string>>({});
  const [explanations, setExplanations] = useState<Record<string, {
    reasonZh: string;
    ruleExplanation: string;
    examples: { wrong: string; correct: string }[];
    memoryTip: string;
    relatedTopics: string[];
  } | null>>({});

  const handleAIExplain = async (m: MistakeItem) => {
    setExplainingId(m.id);
    setExplainError(prev => ({ ...prev, [m.id]: '' }));
    try {
      const res = await fetch('/api/ai/explain-mistake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: m.questionSummary,
          correctAnswer: m.correctAnswer,
          studentAnswer: m.studentAnswer,
          // 2026-09-14: 從未寫入的 subSkill 已移除；改傳題型／技能名稱，
          // 令 AI 解說知道是哪一類題目（例如閱讀推論題）。
          grammarItemZh: itemSkillLabel(m),
        }),
      });
      const json = await res.json();
      if (res.ok && json.explanation) {
        setExplanations(prev => ({ ...prev, [m.id]: json.explanation }));
      } else {
        setExplainError(prev => ({ ...prev, [m.id]: json.error || t('mistakes.aiExplainError') }));
      }
    } catch (e) {
      logger.error({ module: 'student-mistakes', error: e instanceof Error ? e.message : String(e) }, 'Failed to fetch AI explanation');
      setExplainError(prev => ({ ...prev, [m.id]: t('mistakes.aiExplainError') }));
    }
    finally { setExplainingId(null); }
  };

  const toggleReviewList = (id: string) => {
    setMistakes(prev =>
      prev.map(m => m.id === id ? { ...m, inReviewList: !m.inReviewList } : m)
    );
    // Persist to API
    const target = mistakes.find(m => m.id === id);
    if (target) {
      fetch('/api/mistakes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, inReviewList: !target.inReviewList }),
      }).catch((e) => { logger.error({ module: 'student-mistakes', error: e instanceof Error ? e.message : String(e) }, 'Mistake review list PATCH failed'); });
    }
  };

  const toggleReviewed = (id: string) => {
    setMistakes(prev =>
      prev.map(m => m.id === id ? { ...m, reviewed: !m.reviewed } : m)
    );
    const target = mistakes.find(m => m.id === id);
    if (target) {
      const newReviewed = !target.reviewed;
      fetch('/api/mistakes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, reviewed: newReviewed }),
      }).catch((e) => { logger.error({ module: 'student-mistakes', error: e instanceof Error ? e.message : String(e) }, 'Mistake reviewed PATCH failed'); });
      // 🎮 重溫錯題 XP（僅標記已溫習時）
      if (newReviewed && store.userId) {
        fetch('/api/gamification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: store.userId, event: { type: 'reviewMistake', metadata: { mistakeId: id } } }),
        }).catch((e) => { logger.error({ module: 'student-mistakes', error: e instanceof Error ? e.message : String(e) }, 'Gamification reviewMistake XP failed'); });
      }
    }
  };

  // Add to vocab from mistake
  const [vocabWord, setVocabWord] = useState('');
  const [showVocabAdd, setShowVocabAdd] = useState(false);
  const handleAddToVocab = (word: string) => {
    setVocabWord(word);
    setShowVocabAdd(true);
  };

  const filtered = mistakes.filter((m) => {
    if (reviewOnly && !m.inReviewList) return false;
    if (skillFilter !== 'all' && m.grammarItem !== skillFilter && m.languageSkill !== skillFilter) return false;
    if (typeFilter !== 'all' && m.mistakeType !== typeFilter) return false;
    if (search && !m.questionSummary.includes(search)) return false;
    return true;
  });

  // === 2026-09-14: 練習目標 ===
  // 閱讀／聆聽錯題依附特定篇章，不能重考同一題 → 改為同題型新題或 DSE 閱讀卷。
  const bucketLabel = (b: MistakeSkillBucket) => {
    if (store.language === 'en') return b.strategy?.labelEn || (b.grammarItem ? getSkillLabel(b.grammarItem, 'en') || b.grammarItem : b.key);
    return b.strategy?.labelZh || (b.grammarItem ? getSkillLabel(b.grammarItem, 'zh') || b.grammarItem : b.key);
  };

  const bucketHref = (b: MistakeSkillBucket): string | null => {
    if (b.practice.kind === 'reading-paper') return '/student/reading';
    if (b.practice.kind === 'vocab-book') return '/student/vocabulary';
    if (b.practice.kind !== 'targeted-drill') return null;
    if (!b.practice.grammarItem && !b.practice.languageSkill) return null;
    const params = new URLSearchParams({
      mode: 'diagnostic',
      difficulty: 'remedial',
      questionCount: '5',
      questionType: b.practice.languageSkill === 'writing' ? 'short-writing' : 'mc',
      weakLabel: bucketLabel(b),
    });
    if (b.practice.grammarItem) params.set('grammarItem', b.practice.grammarItem);
    if (b.practice.languageSkill) params.set('languageSkill', b.practice.languageSkill);
    return `/student/practice?${params.toString()}`;
  };

  /** 單條錯題的可用行動 — 不可重考的題目不再提供無效的「重做」。 */
  const itemPracticeHref = (m: MistakeItem): string | null => {
    if (m.languageSkill === 'reading') return '/student/reading';
    if (m.mistakeType === 'vocabulary' && !m.grammarItem) return '/student/vocabulary';
    if (!m.grammarItem && !m.languageSkill) return null;
    const params = new URLSearchParams({
      mode: 'diagnostic',
      difficulty: 'remedial',
      questionCount: '5',
      questionType: m.languageSkill === 'writing' ? 'short-writing' : 'mc',
      weakLabel: store.language === 'en' ? (m.questionType || 'Mistake') : (itemSkillLabel(m) || m.questionType || '錯題'),
    });
    if (m.grammarItem) params.set('grammarItem', m.grammarItem);
    if (m.languageSkill) params.set('languageSkill', m.languageSkill);
    return `/student/practice?${params.toString()}`;
  };

  /** 詞彙類錯題（含語境詞義）可直接把正確答案加入生詞簿。 */
  const isVocabExtractable = (m: MistakeItem) =>
    m.mistakeType === 'vocabulary' || m.questionType === 'vocabulary_in_context';

  /** 用於 AI 解說與練習標籤的技能名稱（題型優先，其次技能標籤）。 */
  const itemSkillLabel = (m: MistakeItem): string | undefined => {
    const card = getStrategyCard({
      languageSkill: m.languageSkill,
      questionType: m.questionType,
      grammarItem: m.grammarItem,
      mistakeType: m.mistakeType,
    });
    if (card) return store.language === 'en' ? card.labelEn : card.labelZh;
    const key = m.grammarItem || m.languageSkill;
    return key ? getSkillLabel(key, store.language) : undefined;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('mistakes.title')}</h1>

      {/* 🧠 SRS 每日錯題複習提示 */}
      {srsMistakesDue > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{t('srs.dailyReview')}</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">{t('srs.dueCards').replace('{n}', String(srsMistakesDue))}</p>
            </div>
          </div>
          <button
            onClick={() => {
              setReviewOnly(true);
              setSkillFilter('all');
              setTypeFilter('all');
              setSearch('');
              setTimeout(() => {
                const listEl = document.getElementById('mistakes-list');
                if (listEl) listEl.scrollIntoView({ behavior: 'smooth' });
              }, 100);
            }}
            className="px-3 py-1.5 text-xs font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
          >
            {t('srs.startReview')}
          </button>
        </div>
      )}

      {/* 🎯 題型弱項 — 2026-09-14：閱讀／聆聽錯題依附篇章，無法重考同一題，
          因此改以技能／題型聚合，並提供同題型新題練習。 */}
      {breakdown.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-3">
          <div className="flex items-start gap-2">
            <Target className="w-5 h-5 text-teal-500 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t('mistakes.weaknessTitle')}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('mistakes.weaknessDesc')}</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {breakdown.map((b) => {
              const href = bucketHref(b);
              const expanded = expandedBucket === b.key;
              return (
                <div key={b.key} className="rounded-lg border border-gray-100 dark:border-gray-700 p-3 space-y-2 bg-gray-50/50 dark:bg-gray-900/20">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{bucketLabel(b)}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {t('mistakes.occurrences').replace('{n}', String(b.count))}
                        {b.unreviewed > 0 && ` · ${t('mistakes.unreviewedCount').replace('{n}', String(b.unreviewed))}`}
                      </p>
                      {!b.replayable && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">{t('mistakes.notReplayable')}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {b.strategy && (
                        <button
                          onClick={() => setExpandedBucket(expanded ? null : b.key)}
                          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300 hover:bg-purple-100 transition-colors"
                        >
                          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {t('mistakes.strategyCard')}
                        </button>
                      )}
                      {href && (
                        <Link href={href} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-teal-500 text-white hover:bg-teal-600 transition-colors">
                          <RotateCcw className="w-3 h-3" />
                          {store.language === 'en' ? b.practice.labelEn : b.practice.labelZh}
                        </Link>
                      )}
                    </div>
                  </div>

                  {expanded && b.strategy && (
                    <div className="text-xs space-y-1.5 pt-1 border-t border-gray-100 dark:border-gray-700">
                      <p className="text-gray-600 dark:text-gray-300">
                        <span className="font-medium">{t('mistakes.whyMissed')}</span>
                        {store.language === 'en' ? b.strategy.whyEn : b.strategy.whyZh}
                      </p>
                      <div>
                        <span className="font-medium text-gray-600 dark:text-gray-300">{t('mistakes.nextSteps')}</span>
                        <ol className="list-decimal ml-4 mt-0.5 space-y-0.5 text-gray-600 dark:text-gray-400">
                          {(store.language === 'en' ? b.strategy.stepsEn : b.strategy.stepsZh).map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 統計摘要 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('mistakes.totalCount'), value: mistakes.length, unit: t('common.question') },
          { label: t('mistakes.reviewed'), value: mistakes.filter(m => m.reviewed).length, unit: t('common.question') },
          { label: t('mistakes.reviewList'), value: mistakes.filter(m => m.inReviewList).length, unit: t('common.question') },
          { label: t('mistakes.pendingReview'), value: mistakes.filter(m => !m.reviewed).length, unit: t('common.question') },
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}<span className="text-sm font-normal text-gray-400 ml-1">{stat.unit}</span></p>
          </div>
        ))}
      </div>

      {/* 🧠 溫習模式提示 */}
      {reviewOnly && (
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 border border-amber-200 dark:border-amber-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-amber-600" />
            <span className="text-sm text-amber-700 dark:text-amber-300">{t('srs.reviewMode')} — {filtered.length} {t('common.question')}</span>
          </div>
          <button onClick={() => setReviewOnly(false)} className="text-xs text-amber-600 dark:text-amber-400 underline">
            {t('srs.showAll')}
          </button>
        </div>
      )}

      {/* 篩選列 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('mistakes.search')} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <select value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
            <option value="all">{t('practice.filterAllSkills')}</option>
            {Object.entries(skillLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as MistakeType | 'all')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
            <option value="all">{t('mistakes.filterAllTypes')}</option>
            {Object.entries(mistakeTypeLabels).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
        </div>
      </div>

      {/* 錯題列表 */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center text-gray-400">
            <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{t('mistakes.noMatchingMistakes')}</p>
          </div>
        ) : (
          filtered.map((m) => (
            <div key={m.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <SkillChip grammarItem={m.grammarItem} languageSkill={m.languageSkill} />
                    <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
                      {t(mistakeTypeLabels[m.mistakeType] || 'mistake.grammar')}
                    </span>
                    {m.inReviewList && (
                      <span className="text-xs px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-full">{t('mistakes.reviewListBadge')}</span>
                    )}
                  </div>
                  <p className={`text-sm mt-1 ${m.questionSummary ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 italic'}`}>
                    {m.questionSummary || t('mistakes.summaryMissing')}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span>{t('mistakes.yourAnswer')}<span className="text-red-500 line-through">{m.studentAnswer}</span></span>
                    <span>→</span>
                    <span>{t('mistakes.correctPrefix')}<span className="text-green-500 font-medium">{m.correctAnswer}</span></span>
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
                        <span className="font-medium text-purple-700 dark:text-purple-300">{t('mistakes.aiErrorTitle')}</span>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300">{explanations[m.id]!.reasonZh}</p>
                      {explanations[m.id]!.ruleExplanation && (
                        <div className="p-2 bg-white dark:bg-gray-800 rounded">
                          <p className="text-xs font-medium text-gray-500 mb-1">{t('mistakes.grammarRule')}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{explanations[m.id]!.ruleExplanation}</p>
                        </div>
                      )}
                      {explanations[m.id]!.examples.length > 0 && (
                        <div className="p-2 bg-white dark:bg-gray-800 rounded">
                          <p className="text-xs font-medium text-gray-500 mb-1">{t('mistakes.comparisonExamples')}</p>
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
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex-wrap">
                {/* 2026-09-14: 不再提供無效的「重做同一題」。
                    閱讀 → 練 DSE 閱讀卷（同題型已在卷內）；聆聽／文法 → 練同類新題；
                    無法歸類的錯題不顯示練習按鈕（避免靜默無效連結）。 */}
                {(() => {
                  const href = itemPracticeHref(m);
                  if (!href) return null;
                  const label = m.languageSkill === 'reading'
                    ? t('mistakes.practiceReading')
                    : m.mistakeType === 'vocabulary' && !m.grammarItem
                      ? t('mistakes.practiceVocab')
                      : m.languageSkill === 'listening'
                        ? t('mistakes.practiceListening')
                        : t('mistakes.practiceSameSkill');
                  return (
                    <Link href={href} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors">
                      <RotateCcw className="w-3 h-3" /> {label}
                    </Link>
                  );
                })()}
                <button
                  onClick={() => handleAIExplain(m)}
                  disabled={explainingId === m.id}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50"
                >
                  {explainingId === m.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {explainingId === m.id ? t('mistakes.analyzing') : (explanations[m.id] ? t('mistakes.reExplain') : t('mistakes.aiExplainBtn'))}
                </button>
                {explainError[m.id] && <p className="text-xs text-red-500 mt-1">{explainError[m.id]}</p>}
                <button onClick={() => toggleReviewList(m.id)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                  <BookMarked className="w-3 h-3" /> {m.inReviewList ? t('mistakes.removeFromReview') : t('mistakes.addToReview')}
                </button>
                {isVocabExtractable(m) && (
                  <button
                    onClick={() => handleAddToVocab(m.correctAnswer)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-teal-600 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/20 rounded-lg hover:bg-teal-100 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> {t('vocab.addWord')}
                  </button>
                )}
                <button onClick={() => toggleReviewed(m.id)} className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  m.reviewed
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200'
                }`}>
                  {m.reviewed ? <CheckCircle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                  {m.reviewed ? t('mistakes.reviewedLabel') : t('mistakes.markReviewed')}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Quick Add Vocab Modal */}
      {showVocabAdd && studentId && (
        <QuickAddVocab
          studentId={studentId}
          gradeLevel={gradeLevel}
          initialWord={vocabWord}
          onAdded={() => setShowVocabAdd(false)}
        />
      )}
    </div>
  );
}
