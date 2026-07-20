// ============================================
// 學生端 — AI 練習中心
// 支援：AI 自主生成練習、篩選預設題目、進度追蹤
// ============================================
'use client';

import { Suspense, useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search, Sparkles, Zap, Clock, RotateCcw, BookOpen, ClipboardList,
  Loader2, Target, ChevronDown, Play, BarChart3,
} from 'lucide-react';
import SkillChip from '@/components/shared/SkillChip';
import { cleanListeningContent } from '@/components/shared/AudioPlayer';
import { skillLabels, difficultyLabels, gradeLabels, getGradeLabel } from '@/shared/utils/nav';
import { useAppStore, type PracticeSession } from '@/store/appStore';
import { useT } from '@/hooks/use-i18n';
import { PracticePageSkeleton } from '@/components/shared/Skeleton';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import type { GrammarItem, LanguageSkill, DifficultyLevel, GradeLevel } from '@/shared/types/types';

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
  questionCount: 5,
  gradeLevel: 'S4',
};

// 根據學生弱項推薦的技能（動態從練習記錄計算）
function getRecommendedSkills(mastery: { skill: string; skillZh: string; accuracy: number; total: number }[]): { key: string; label: string; accuracy: number }[] {
  if (mastery.length === 0) return [];
  return mastery
    .filter(m => m.total >= 3 && m.accuracy < 70) // 至少練習過3題且正確率<70%
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5)
    .map(m => ({ key: m.skill, label: m.skillZh || m.skill, accuracy: m.accuracy }));
}

function PracticeListPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const store = useAppStore();
  const { t } = useT();
  const autoStartedRef = useRef(false);
  const profileLoadedRef = useRef(false);
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
  const [recommendationNote, setRecommendationNote] = useState('');

  // === 載入學生年級設定 ===
  useEffect(() => {
    if (profileLoadedRef.current) return;
    profileLoadedRef.current = true;
    fetch('/api/auth/profile')
      .then(r => r.json())
      .then(data => {
        const profile = data?.user;
        const studentLevel = profile?.level || profile?.class?.gradeLevel;
        if (studentLevel && ['S1','S2','S3','S4','S5','S6'].includes(studentLevel)) {
          setForm(prev => ({ ...prev, gradeLevel: studentLevel as GradeLevel }));
        }
      })
      .catch((e) => { console.error("[page] fetch failed", e) });
  }, []);

  // === 練習記錄 ===
  const recentSessions = store.getRecentSessions(5);
  const weeklyStats = store.getWeeklyStats();
  const masteryBySkill = store.getMasteryBySkill();
  const recommendedSkills = getRecommendedSkills(masteryBySkill);

  // === 最近練習記錄（可重新練習）===
  const recentPracticeItems = recentSessions.map(s => ({
    id: s.id,
    label: `${s.skillZh || s.skill} — ${difficultyLabels[s.difficulty] || s.difficulty}`,
    accuracy: s.totalQuestions > 0 ? Math.round((s.correctCount / s.totalQuestions) * 100) : 0,
    skill: s.skill,
    skillZh: s.skillZh,
    difficulty: s.difficulty,
  }));

  // === AI 生成練習 ===
  const handleGenerate = useCallback(async (inputForm?: GenerateForm, note?: string) => {
    const activeForm = inputForm || form;
    if (!activeForm.grammarItem && !activeForm.languageSkill) {
      setGenError(t('practice.validationSelectSkill'));
      return;
    }
    setGenerating(true);
    setGenError('');
    if (note) setRecommendationNote(note);

    try {
      const grammarKey = activeForm.grammarItem;
      const grammarZh = skillLabels[grammarKey] || grammarKey;
      const langKey = activeForm.languageSkill;
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
          difficulty: activeForm.difficulty,
          gradeLevel: activeForm.gradeLevel,
          count: activeForm.questionCount,
          questionType: activeForm.questionType,
        }),
      });

      const json = await res.json().catch(() => ({ error: t('practice.aiUnavailable') }));

      if (!res.ok) {
        setGenError(json.error || t('practice.serverError', { status: String(res.status) }));
        return;
      }

      if (!json.questions || json.questions.length === 0) {
        setGenError(t('practice.aiEmptyResult'));
        return;
      }

      // 將 AI 生成的題目轉換為 PracticeQuestion 格式（並清理 listeningContent）
      const questions = json.questions.map((q: Record<string, unknown>, i: number) => ({
        id: `ai-${Date.now()}-${i}`,
        type: q.type || activeForm.questionType,
        strand: 'knowledge' as const,
        grammarItem: (activeForm.grammarItem || undefined) as GrammarItem | undefined,
        languageSkill: (activeForm.languageSkill || undefined) as LanguageSkill | undefined,
        subSkill: skillZh,
        subSkillZh: skillZh,
        difficulty: activeForm.difficulty,
        gradeLevel: activeForm.gradeLevel,
        keyStage: 'KS4' as const,
        prompt: q.prompt as string,
        promptZh: q.promptZh as string | undefined,
        listeningContent: q.listeningContent
          ? cleanListeningContent(q.listeningContent as string)
          : undefined,
        listeningContentZh: q.listeningContentZh as string | undefined,
        readingContent: q.readingContent as string | undefined,
        readingContentZh: q.readingContentZh as string | undefined,
        choices: q.choices as string[] | undefined,
        answer: q.answer as string,
        explanationZh: q.explanationZh as string,
        explanationEn: q.explanationEn as string,
        commonMistake: q.commonMistake as string,
        grammarPoint: q.grammarPoint as string | undefined,
        hintLevels: activeForm.languageSkill === 'reading'
          ? [t('practice.hints.reading.1'), t('practice.hints.reading.2'), t('practice.hints.reading.3'), t('practice.hints.reading.4')]
          : [t('practice.hints.default.1'), t('practice.hints.default.2'), t('practice.hints.default.3'), t('practice.hints.default.4')],
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
        difficulty: activeForm.difficulty,
        totalQuestions: questions.length,
        correctCount: 0,
        source: 'ai-generated',
      };

      store.startSession(session);
      // 導向第一題
      router.push(`/student/practice/${questions[0].id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('practice.networkError');
      console.error('AI generate error:', msg);
      setGenError(t('practice.aiConnectionFailed', { msg }));
    } finally {
      setGenerating(false);
    }
  }, [form, store, router]);

  // === 從診斷頁跳轉：自動生成針對性練習 ===
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (searchParams.get('mode') !== 'diagnostic') return;

    const grammarItem = searchParams.get('grammarItem') || '';
    const languageSkill = searchParams.get('languageSkill') || '';
    const difficulty = (searchParams.get('difficulty') as DifficultyLevel | null) || 'remedial';
    const questionType = searchParams.get('questionType') || (languageSkill === 'writing' ? 'short-writing' : 'mc');
    const questionCount = Number(searchParams.get('questionCount') || '5');
    const gradeLevel = (searchParams.get('gradeLevel') as GradeLevel | null) || 'S4';
    const weakLabel = searchParams.get('weakLabel') || t('practice.weakSkillDefault');

    if (!grammarItem && !languageSkill) return;

    autoStartedRef.current = true;
    const nextForm: GenerateForm = {
      grammarItem,
      languageSkill,
      difficulty,
      questionType,
      questionCount,
      gradeLevel,
    };

    setTab('generate');
    setForm(nextForm);
    void handleGenerate(nextForm, t('practice.generatedFromDiagnostic', { label: weakLabel }));
  }, [handleGenerate, searchParams]);

  // === 從求助頁跳轉：根據學生問題自動生成練習 ===
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (searchParams.get('mode') !== 'help') return;

    const topic = searchParams.get('topic') || '';
    const gradeLevel = (searchParams.get('gradeLevel') as GradeLevel | null) || 'S4';

    if (!topic) return;

    // 根據問題關鍵字判斷技能類型
    const q = topic.toLowerCase();
    const languageSkill = q.includes('寫') || q.includes('write') || q.includes('essay') || q.includes('作文') ? 'writing'
      : q.includes('讀') || q.includes('read') || q.includes('理解') || q.includes('comprehension') ? 'reading'
      : q.includes('聽') || q.includes('listen') ? 'listening'
      : '';

    autoStartedRef.current = true;
    const nextForm: GenerateForm = {
      grammarItem: '',
      languageSkill,
      difficulty: 'core',
      questionType: 'mc',
      questionCount: 5,
      gradeLevel,
    };

    setTab('generate');
    setForm(nextForm);
    void handleGenerate(nextForm, t('practice.generatedFromHelp', { topic }));
  }, [handleGenerate, searchParams]);

  // === 從推薦弱項快速生成 ===
  const handleQuickGenerate = useCallback((grammarItem: string, grammarZh: string) => {
    const nextForm = {
      ...defaultForm,
      grammarItem,
      languageSkill: '',
      difficulty: 'remedial' as const,
      questionCount: 5,
    };
    setForm(nextForm);
    setTab('generate');
    // Auto-trigger generation for quick workflow
    void handleGenerate(nextForm, `${grammarZh} (${t('practice.recommendHint')})`);
  }, [handleGenerate, defaultForm, t]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('practice.title')}</h1>
        {/* 本週統計 */}
        <div className="hidden sm:flex items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1"><BarChart3 className="w-4 h-4" /> {t('practice.weeklyQuestions', { n: weeklyStats.questionsDone })}</span>
          <span className="flex items-center gap-1"><Target className="w-4 h-4" /> {t('practice.weeklyAccuracy', { n: weeklyStats.accuracy })}</span>
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
          <Sparkles className="w-4 h-4 inline mr-1" /> {t('practice.aiGenerate')}
        </button>
        <button
          onClick={() => setTab('browse')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'browse' ? 'bg-white dark:bg-gray-700 text-teal-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <BookOpen className="w-4 h-4 inline mr-1" /> {t('practice.browse')}
        </button>
      </div>

      {/* ======================================== */}
      {/* Tab 1: AI 生成練習 */}
      {/* ======================================== */}
      {tab === 'generate' && (
        <div className="space-y-4">
          {generating ? (
            <PracticePageSkeleton />
          ) : (
            <>
          {/* 根據弱項推薦 */}
          {recommendedSkills.length > 0 && (
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 border border-orange-200 dark:border-orange-800">
              <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 mb-2">{t('practice.recommendHint')}</p>
              <div className="flex flex-wrap gap-2">
                {recommendedSkills.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickGenerate(s.key, s.label)}
                    className="text-xs px-3 py-1.5 bg-white dark:bg-gray-800 rounded-full text-orange-700 dark:text-orange-300 hover:bg-orange-100 transition-colors border border-orange-200"
                  >
                    {s.label} ({t('progress.accuracyLabel')} {s.accuracy}%)
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* AI 生成表單 */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" /> {t('practice.customPractice')}
            </h2>

            <div className="grid grid-cols-2 gap-3">
              {/* 文法項目 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('practice.grammarItem')}</label>
                <select
                  value={form.grammarItem}
                  onChange={(e) => setForm({ ...form, grammarItem: e.target.value, languageSkill: '' })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none"
                >
                  <option value="">{t('practice.noGrammar')}</option>
                  {Object.entries(skillLabels).filter(([k]) =>
                    ['tenses','conditionals','passive-voice','reported-speech','relative-clauses','modals','prepositions','connectives','gerunds-infinitives','phrasal-verbs'].includes(k)
                  ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              {/* 語言技能 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('practice.languageSkill')}</label>
                <select
                  value={form.languageSkill}
                  onChange={(e) => {
                    const skill = e.target.value;
                    // Auto-set questionType to match language skill
                    const qType = skill === 'writing' ? 'short-writing'
                      : skill === 'listening' || skill === 'reading' ? 'mc'
                      : form.questionType;
                    setForm({ ...form, languageSkill: skill, grammarItem: '', questionType: qType });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none"
                >
                  <option value="">{t('practice.noSkill')}</option>
                  <option value="reading">{t('practice.skillReading')}</option>
                  <option value="writing">{t('practice.skillWriting')}</option>
                  <option value="listening">{t('practice.skillListening')}</option>
                  <option value="speaking">{t('practice.skillSpeaking')}</option>
                </select>
              </div>

              {/* 難度 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('practice.difficulty')}</label>
                <select
                  value={form.difficulty}
                  onChange={(e) => setForm({ ...form, difficulty: e.target.value as DifficultyLevel })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none"
                >
                  <option value="remedial">{t('practice.diffRemedial')}</option>
                  <option value="core">{t('practice.diffCore')}</option>
                  <option value="challenge">{t('practice.diffChallenge')}</option>
                </select>
              </div>

              {/* 年級 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('practice.gradeLevel')}</label>
                <select
                  value={form.gradeLevel}
                  onChange={(e) => setForm({ ...form, gradeLevel: e.target.value as GradeLevel })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none"
                >
                  {Object.keys(gradeLabels).map(k => <option key={k} value={k}>{getGradeLabel(k, store.language)}</option>)}
                </select>
              </div>
            </div>

            {/* 進階設定 */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              {t('practice.advanced')}
            </button>

            {showAdvanced && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('practice.questionType')}</label>
                  <select
                    value={form.questionType}
                    onChange={(e) => setForm({ ...form, questionType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none"
                  >
                    <option value="mc">{t('practice.typeMc')}</option>
                    <option value="fill-blank">{t('practice.typeFill')}</option>
                    <option value="error-correction">{t('practice.typeError')}</option>
                    <option value="short-writing">{t('practice.typeWriting')}</option>
                    <option value="matching">{t('practice.typeMatching')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('practice.questionCount')}</label>
                  <select
                    value={form.questionCount}
                    onChange={(e) => setForm({ ...form, questionCount: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none"
                  >
                    <option value={3}>{t('practice.count3')}</option>
                    <option value={5}>{t('practice.count5')}</option>
                    <option value={8}>{t('practice.count8')}</option>
                  </select>
                </div>
              </div>
            )}

            {/* 生成按鈕 */}
            {genError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-600">{genError}</div>
            )}

            {recommendationNote && !genError && (
              <div className="p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg text-sm text-teal-700 dark:text-teal-300">
                {recommendationNote}
              </div>
            )}

            <button
              onClick={() => handleGenerate()}
              disabled={generating}
              className="w-full py-3 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              {generating ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> {t('practice.genProgress')}</>
              ) : (
                <><Sparkles className="w-5 h-5" /> {t('practice.generateBtn', { n: String(form.questionCount) })}</>
              )}
            </button>
          </div>
            </>
          )}
        </div>
      )}

      {/* ======================================== */}
      {/* Tab 2: 瀏覽題目庫 */}
      {/* ======================================== */}
      {tab === 'browse' && (
        <>
          {/* 最近練習記錄 — 可點擊重新練習 */}
          <div className="space-y-3">
            {recentPracticeItems.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center text-gray-400">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>{t('practice.noHistory')}</p>
              </div>
            ) : (
              recentPracticeItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleQuickGenerate(item.skill, item.skillZh)}
                  className="w-full text-left block bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-teal-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs px-2 py-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-full">{item.skillZh || item.skill || ''}</span>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">{difficultyLabels[item.difficulty] || item.difficulty || ''}</span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{item.label}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-sm font-semibold ${item.accuracy >= 70 ? 'text-green-600' : item.accuracy >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>{item.accuracy}%</span>
                    </div>
                  </div>
                </button>
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
            <Clock className="w-5 h-5 text-teal-500" /> {t('common.recentSessions')}
          </h2>
          <div className="space-y-2">
            {recentSessions.map((s) => (
              <div key={s.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{s.skillZh || s.skill || ''}</span>
                      {s.source === 'ai-generated' && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded-full">AI 生成</span>
                      )}
                      <SkillChip difficulty={s.difficulty} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {s.totalQuestions} {t('common.question')} · {t('common.correctCount', { correct: String(s.correctCount), total: String(s.totalQuestions) })}
                      {s.completedAt
                        ? ` · ${new Date(s.completedAt).toLocaleString('zh-HK', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                        : ` · ${t('common.inProgress')}`}
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
            <Target className="w-5 h-5 text-teal-500" /> {t('common.skillMastery')}
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-2">
            {masteryBySkill.map((m) => (
              <div key={m.skill} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 dark:text-gray-400 w-24 truncate">{m.skillZh || ''}</span>
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

export default function PracticeListPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    }>
      <ErrorBoundary>
        <PracticeListPageContent />
      </ErrorBoundary>
    </Suspense>
  );
}
