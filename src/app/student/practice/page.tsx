// ============================================
// 學生端 — AI 練習中心
// 支援：AI 自主生成練習、篩選預設題目、進度追蹤
// ============================================
'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search, Sparkles, Zap, Clock, RotateCcw, BookOpen, ClipboardList,
  Loader2, Target, ChevronDown, Play, BarChart3,
} from 'lucide-react';
import { mockQuestions, mockStudent } from '@/lib/mock-data';
import SkillChip from '@/components/shared/SkillChip';
import { skillLabels, difficultyLabels, gradeLabels } from '@/lib/nav';
import { useAppStore, type PracticeSession } from '@/store/appStore';
import type { GrammarItem, LanguageSkill, DifficultyLevel, GradeLevel } from '@/lib/types';

// ============================================
// AI 生成練習表單
// ============================================

interface GenerateForm {
  grammarItem: string;
  languageSkill: string;
  difficulty: DifficultyLevel;
  questionType: string;
  questionCount: number;
  gradeLevel: GradeLevel;
}

const defaultForm: GenerateForm = {
  grammarItem: '',
  languageSkill: '',
  difficulty: 'core',
  questionType: 'mc',
  questionCount: 10,
  gradeLevel: 'S4',
};

// 根據學生弱項推薦的技能
const recommendedSkills = mockStudent.weakSkills;

export default function PracticeListPage() {
  const router = useRouter();
  const store = useAppStore();
  const [tab, setTab] = useState<'generate' | 'browse'>('generate');
  const [search, setSearch] = useState('');
  const [skillFilter, setSkillFilter] = useState<string>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyLevel | 'all'>('all');
  const [gradeFilter, setGradeFilter] = useState<GradeLevel | 'all'>('all');

  // === AI 生成狀態 ===
  const [form, setForm] = useState<GenerateForm>(defaultForm);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // === 練習記錄 ===
  const recentSessions = store.getRecentSessions(5);
  const weeklyStats = store.getWeeklyStats();
  const masteryBySkill = store.getMasteryBySkill();

  // === 篩選預設題目 ===
  const filtered = mockQuestions.filter((q) => {
    if (search && !q.subSkill.includes(search) && !q.prompt.includes(search)) return false;
    if (skillFilter !== 'all' && q.grammarItem !== skillFilter && q.languageSkill !== skillFilter) return false;
    if (difficultyFilter !== 'all' && q.difficulty !== difficultyFilter) return false;
    if (gradeFilter !== 'all' && q.gradeLevel !== gradeFilter) return false;
    return true;
  });

  // === AI 生成練習 ===
  const handleGenerate = useCallback(async () => {
    if (!form.grammarItem && !form.languageSkill) {
      setGenError('請選擇至少一項文法項目或語言技能');
      return;
    }
    setGenerating(true);
    setGenError('');

    try {
      const grammarKey = form.grammarItem;
      const grammarZh = skillLabels[grammarKey] || grammarKey;
      const langKey = form.languageSkill;
      const langZh = skillLabels[langKey] || langKey;
      const skillKey = grammarKey || langKey;
      const skillZh = grammarZh || langZh;

      const res = await fetch('/api/ai/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grammarItem: grammarKey || undefined,
          grammarItemZh: grammarZh || undefined,
          languageSkill: langKey || undefined,
          languageSkillZh: langZh || undefined,
          difficulty: form.difficulty,
          gradeLevel: form.gradeLevel,
          count: form.questionCount,
          questionType: form.questionType,
        }),
      });

      const json = await res.json().catch(() => ({ error: 'AI 服務暫時無法使用，請稍後重試' }));

      if (!res.ok) {
        setGenError(json.error || `伺服器錯誤 (${res.status})，請稍後重試`);
        return;
      }

      if (!json.questions || json.questions.length === 0) {
        setGenError('AI 未能生成題目，請更換文法項目或調整設定後重試');
        return;
      }

      // 將 AI 生成的題目轉換為 PracticeQuestion 格式
      const questions = json.questions.map((q: Record<string, unknown>, i: number) => ({
        id: `ai-${Date.now()}-${i}`,
        type: q.type || form.questionType,
        strand: 'knowledge' as const,
        grammarItem: (form.grammarItem || undefined) as GrammarItem | undefined,
        languageSkill: (form.languageSkill || undefined) as LanguageSkill | undefined,
        subSkill: skillZh,
        subSkillZh: skillZh,
        difficulty: form.difficulty,
        gradeLevel: form.gradeLevel,
        keyStage: 'KS4' as const,
        prompt: q.prompt as string,
        promptZh: q.promptZh as string | undefined,
        listeningContent: q.listeningContent as string | undefined,
        listeningContentZh: q.listeningContentZh as string | undefined,
        choices: q.choices as string[] | undefined,
        answer: q.answer as string,
        explanationZh: q.explanationZh as string,
        explanationEn: q.explanationEn as string,
        commonMistake: q.commonMistake as string,
        grammarPoint: q.grammarPoint as string | undefined,
        hintLevels: ['提示1：請仔細閱讀題目。', '提示2：回想相關的文法規則。', '提示3：排除明顯錯誤的選項。', '提示4：選擇最符合語法和語境的答案。'],
      }));

      // 建立練習 session
      const session: PracticeSession = {
        id: `session-${Date.now()}`,
        startedAt: new Date().toISOString(),
        questions,
        answers: {},
        results: {},
        skill: skillKey,
        skillZh,
        difficulty: form.difficulty,
        totalQuestions: questions.length,
        correctCount: 0,
        source: 'ai-generated',
      };

      store.startSession(session);
      // 導向第一題
      router.push(`/student/practice/${questions[0].id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '連線失敗';
      console.error('AI generate error:', msg);
      setGenError(`AI 服務連線失敗：${msg}。請檢查網絡後重試。`);
    } finally {
      setGenerating(false);
    }
  }, [form, store, router]);

  // === 從推薦弱項快速生成 ===
  const handleQuickGenerate = useCallback((grammarItem: string, grammarZh: string) => {
    setForm({
      ...defaultForm,
      grammarItem,
      languageSkill: '',
      difficulty: 'remedial',
      questionCount: 5,
    });
    setTab('generate');
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🤖 AI 練習中心</h1>
        {/* 本週統計 */}
        <div className="hidden sm:flex items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1"><BarChart3 className="w-4 h-4" /> 本週 {weeklyStats.questionsDone} 題</span>
          <span className="flex items-center gap-1"><Target className="w-4 h-4" /> 正確率 {weeklyStats.accuracy}%</span>
        </div>
      </div>

      {/* ====== Tab 切換 ====== */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        <button
          onClick={() => setTab('generate')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'generate' ? 'bg-white dark:bg-gray-700 text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Sparkles className="w-4 h-4 inline mr-1" /> AI 生成練習
        </button>
        <button
          onClick={() => setTab('browse')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'browse' ? 'bg-white dark:bg-gray-700 text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <BookOpen className="w-4 h-4 inline mr-1" /> 瀏覽題目庫
        </button>
      </div>

      {/* ======================================== */}
      {/* Tab 1: AI 生成練習 */}
      {/* ======================================== */}
      {tab === 'generate' && (
        <div className="space-y-4">
          {/* 根據弱項推薦 */}
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 border border-orange-200 dark:border-orange-800">
            <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 mb-2">💡 根據你的弱項，建議練習：</p>
            <div className="flex flex-wrap gap-2">
              {recommendedSkills.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleQuickGenerate(s.grammarItem || s.languageSkill || '', s.subSkillZh)}
                  className="text-xs px-3 py-1.5 bg-white dark:bg-gray-800 rounded-full text-orange-700 dark:text-orange-300 hover:bg-orange-100 transition-colors border border-orange-200"
                >
                  {s.subSkillZh}（正確率 {s.accuracy}%）
                </button>
              ))}
            </div>
          </div>

          {/* AI 生成表單 */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" /> 自訂 AI 練習
            </h2>

            <div className="grid grid-cols-2 gap-3">
              {/* 文法項目 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">文法項目</label>
                <select
                  value={form.grammarItem}
                  onChange={(e) => setForm({ ...form, grammarItem: e.target.value, languageSkill: '' })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none"
                >
                  <option value="">不限文法</option>
                  {Object.entries(skillLabels).filter(([k]) =>
                    ['tenses','conditionals','passive-voice','reported-speech','relative-clauses','modals','prepositions','connectives','gerunds-infinitives','phrasal-verbs'].includes(k)
                  ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              {/* 語言技能 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">語言技能</label>
                <select
                  value={form.languageSkill}
                  onChange={(e) => setForm({ ...form, languageSkill: e.target.value, grammarItem: '' })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none"
                >
                  <option value="">不限技能</option>
                  <option value="reading">閱讀理解</option>
                  <option value="writing">寫作</option>
                  <option value="listening">聆聽</option>
                  <option value="speaking">說話</option>
                </select>
              </div>

              {/* 難度 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">難度</label>
                <select
                  value={form.difficulty}
                  onChange={(e) => setForm({ ...form, difficulty: e.target.value as DifficultyLevel })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none"
                >
                  <option value="remedial">🟢 補底</option>
                  <option value="core">🔵 核心</option>
                  <option value="challenge">🟣 挑戰</option>
                </select>
              </div>

              {/* 年級 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">年級</label>
                <select
                  value={form.gradeLevel}
                  onChange={(e) => setForm({ ...form, gradeLevel: e.target.value as GradeLevel })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none"
                >
                  {Object.entries(gradeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            {/* 進階設定 */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              進階設定
            </button>

            {showAdvanced && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">題型</label>
                  <select
                    value={form.questionType}
                    onChange={(e) => setForm({ ...form, questionType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none"
                  >
                    <option value="mc">選擇題</option>
                    <option value="fill-blank">填充題</option>
                    <option value="error-correction">改錯題</option>
                    <option value="short-writing">短文寫作</option>
                    <option value="matching">配對題</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">題數</label>
                  <select
                    value={form.questionCount}
                    onChange={(e) => setForm({ ...form, questionCount: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none"
                  >
                    <option value={5}>5 題（快速）</option>
                    <option value={10}>10 題（標準）</option>
                    <option value={15}>15 題（進階）</option>
                    <option value={20}>20 題（全面）</option>
                  </select>
                </div>
              </div>
            )}

            {/* 生成按鈕 */}
            {genError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-600">{genError}</div>
            )}

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full py-3 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              {generating ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> AI 正在生成題目...</>
              ) : (
                <><Sparkles className="w-5 h-5" /> 生成 {form.questionCount} 題 AI 練習</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ======================================== */}
      {/* Tab 2: 瀏覽題目庫 */}
      {/* ======================================== */}
      {tab === 'browse' && (
        <>
          {/* 搜尋與篩選 */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜尋題目..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <select value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
                <option value="all">全部技能</option>
                {Object.entries(skillLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value as DifficultyLevel | 'all')}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
                <option value="all">全部程度</option>
                {Object.entries(difficultyLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          {/* 題目列表 */}
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center text-gray-400">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>沒有符合條件的題目</p>
              </div>
            ) : (
              filtered.map((q) => (
                <Link key={q.id} href={`/student/practice/${q.id}`}
                  className="block bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-teal-300 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <SkillChip grammarItem={q.grammarItem} languageSkill={q.languageSkill} subSkill={q.subSkill} />
                        <SkillChip difficulty={q.difficulty} />
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 line-clamp-2">{q.prompt}</p>
                    </div>
                    <BookOpen className="w-5 h-5 text-gray-300 flex-shrink-0" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </>
      )}

      {/* ======================================== */}
      {/* 練習記錄（兩個 Tab 都顯示） */}
      {/* ======================================== */}
      {recentSessions.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5 text-teal-500" /> 最近練習記錄
          </h2>
          <div className="space-y-2">
            {recentSessions.map((s) => (
              <div key={s.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{s.skillZh}</span>
                      {s.source === 'ai-generated' && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded-full">AI 生成</span>
                      )}
                      <SkillChip difficulty={s.difficulty} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {s.totalQuestions} 題 · 正確 {s.correctCount}/{s.totalQuestions}
                      {s.completedAt ? ` · ${new Date(s.completedAt).toLocaleDateString('zh-HK')}` : ' · 進行中'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-teal-600">
                      {s.totalQuestions > 0 ? Math.round((s.correctCount / s.totalQuestions) * 100) : 0}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 技能掌握度總覽 */}
      {masteryBySkill.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Target className="w-5 h-5 text-teal-500" /> 技能掌握度
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-2">
            {masteryBySkill.map((m) => (
              <div key={m.skill} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 dark:text-gray-400 w-24 truncate">{m.skillZh}</span>
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${m.accuracy >= 70 ? 'bg-green-500' : m.accuracy >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${m.accuracy}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-gray-500 w-10 text-right">{m.accuracy}%</span>
                <span className="text-xs text-gray-400">{m.total} 題</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
