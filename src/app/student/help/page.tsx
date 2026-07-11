// ============================================
// 學生端 — 求助與建議頁面（含 AI 問答）
// ============================================
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lightbulb, BookOpen, MessageCircle, ChevronRight, ChevronDown, ThumbsUp, Sparkles, Send, Loader2, Target, Play, ArrowRight } from 'lucide-react';
import { useT } from '@/hooks/use-i18n';

interface QAItem {
  q: string;
  a: string;
}

interface StudentProfile {
  id: string;
  level?: string | null;
  streakDays?: number | null;
  class?: { gradeLevel?: string | null } | null;
}

interface PracticeSessionLite {
  skill: string;
  skillZh: string;
  totalQuestions: number;
  correctCount: number;
  startedAt: string;
}

interface MistakeLite {
  mistakeType: string;
  questionId: string;
  createdAt: string;
}

interface WeakSkill {
  name: string;
  nameZh: string;
  accuracy: number;
}

function getStudentLevel(profile: StudentProfile | null): string {
  return profile?.level || profile?.class?.gradeLevel || 'S4';
}

function normalizeSkillName(skill: string) {
  const key = skill.toLowerCase();
  if (key.includes('read')) return { name: 'reading', nameZh: '閱讀' };
  if (key.includes('writ')) return { name: 'writing', nameZh: '寫作' };
  if (key.includes('vocab') || key.includes('phrasal')) return { name: 'vocabulary', nameZh: '詞彙' };
  return { name: 'grammar', nameZh: '文法' };
}

function buildWeakSkills(sessions: PracticeSessionLite[], mistakes: MistakeLite[]): WeakSkill[] {
  const accuracyMap = new Map<string, { nameZh: string; correct: number; total: number }>();

  for (const session of sessions) {
    const normalized = normalizeSkillName(session.skill || session.skillZh || 'grammar');
    const current = accuracyMap.get(normalized.name) || { nameZh: normalized.nameZh, correct: 0, total: 0 };
    current.correct += session.correctCount || 0;
    current.total += session.totalQuestions || 0;
    accuracyMap.set(normalized.name, current);
  }

  const penaltyMap: Record<string, number> = { grammar: 0, vocabulary: 0, reading: 0, writing: 0 };
  for (const mistake of mistakes) {
    if (mistake.mistakeType === 'grammar' || mistake.mistakeType === 'chinglish') penaltyMap.grammar += 10;
    else if (mistake.mistakeType === 'vocabulary') penaltyMap.vocabulary += 10;
    else if (mistake.mistakeType === 'comprehension') penaltyMap.reading += 10;
  }

  const base = Array.from(accuracyMap.entries()).map(([name, value]) => ({
    name,
    nameZh: value.nameZh,
    accuracy: Math.max(0, Math.round((value.correct / Math.max(1, value.total)) * 100) - (penaltyMap[name] || 0)),
  }));

  const defaults = [
    { name: 'grammar', nameZh: '文法', accuracy: 0 },
    { name: 'vocabulary', nameZh: '詞彙', accuracy: 0 },
    { name: 'reading', nameZh: '閱讀', accuracy: 0 },
    { name: 'writing', nameZh: '寫作', accuracy: 0 },
  ];

  for (const item of defaults) {
    if (!base.some(b => b.name === item.name)) base.push(item);
  }

  return base.sort((a, b) => a.accuracy - b.accuracy);
}

const helpCategories: { titleKey: string; icon: React.ElementType; items: { qKey: string; aKey: string }[]; color: string }[] = [
  {
    titleKey: 'help.catGrammar', icon: BookOpen,
    color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    items: [
      { qKey: 'help.faq.grammar.q1', aKey: 'help.faq.grammar.a1' },
      { qKey: 'help.faq.grammar.q2', aKey: 'help.faq.grammar.a2' },
      { qKey: 'help.faq.grammar.q3', aKey: 'help.faq.grammar.a3' },
    ],
  },
  {
    titleKey: 'help.catVocab', icon: BookOpen,
    color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    items: [
      { qKey: 'help.faq.vocab.q1', aKey: 'help.faq.vocab.a1' },
      { qKey: 'help.faq.vocab.q2', aKey: 'help.faq.vocab.a2' },
      { qKey: 'help.faq.vocab.q3', aKey: 'help.faq.vocab.a3' },
    ],
  },
  {
    titleKey: 'help.catWriting', icon: MessageCircle,
    color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    items: [
      { qKey: 'help.faq.writing.q1', aKey: 'help.faq.writing.a1' },
      { qKey: 'help.faq.writing.q2', aKey: 'help.faq.writing.a2' },
      { qKey: 'help.faq.writing.q3', aKey: 'help.faq.writing.a3' },
    ],
  },
  {
    titleKey: 'help.catReading', icon: BookOpen,
    color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
    items: [
      { qKey: 'help.faq.reading.q1', aKey: 'help.faq.reading.a1' },
      { qKey: 'help.faq.reading.q2', aKey: 'help.faq.reading.a2' },
      { qKey: 'help.faq.reading.q3', aKey: 'help.faq.reading.a3' },
    ],
  },
];

const aiAdvice = [
  { title: '建立每日學習習慣', desc: '每天只需 15 分鐘，專注練習一個弱點技能。', icon: '📅' },
  { title: '善用錯題溫習', desc: '重做錯題比做新題更有效。建議每週重溫一次錯題庫。', icon: '🔄' },
  { title: '先理解後記憶', desc: '文法規則不要死記，多看例句，理解使用情境。', icon: '🧠' },
  { title: '多聽多讀', desc: '課餘時間多看英文影片、聽英文歌，讓英文融入生活。', icon: '🎧' },
];

const aiAdviceI18n = [
  { titleKey: 'help.advice.habit.title', descKey: 'help.advice.habit.desc', icon: '📅' },
  { titleKey: 'help.advice.review.title', descKey: 'help.advice.review.desc', icon: '🔄' },
  { titleKey: 'help.advice.understand.title', descKey: 'help.advice.understand.desc', icon: '🧠' },
  { titleKey: 'help.advice.listenread.title', descKey: 'help.advice.listenread.desc', icon: '🎧' },
];

export default function StudentHelpPage() {
  const { t } = useT();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [weakSkills, setWeakSkills] = useState<WeakSkill[]>([]);
  const [recentPerformance, setRecentPerformance] = useState<{ date: string; accuracy: number; questionsDone: number }[]>([]);
  const [recentMistakes, setRecentMistakes] = useState<MistakeLite[]>([]);
  const [adviceCards, setAdviceCards] = useState(aiAdviceI18n.map(a => ({ title: a.titleKey, desc: a.descKey, icon: a.icon })));
  const [adviceSummary, setAdviceSummary] = useState('');
  const [adviceUrgent, setAdviceUrgent] = useState<string[]>([]);
  const [adviceLoading, setAdviceLoading] = useState(true);

  // === AI 問答狀態 ===
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // === AI 生成練習 ===
  const [genLoading, setGenLoading] = useState(false);
  const [genQuestions, setGenQuestions] = useState<{ prompt: string; answer: string; explanationZh: string; type?: string; choices?: string[] }[]>([]);
  const [genError, setGenError] = useState('');
  const [genTopic, setGenTopic] = useState('');
  const [genSkill, setGenSkill] = useState('grammar');
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [revealedAnswers, setRevealedAnswers] = useState<Record<number, boolean>>({});

  const handleGeneratePractice = async () => {
    if (!aiQuestion.trim()) return;
    setGenLoading(true);
    setGenError('');
    setGenQuestions([]);
    setUserAnswers({});
    setRevealedAnswers({});
    const topic = aiQuestion.trim();
    setGenTopic(topic);

    // 根據問題關鍵字判斷技能類型
    const q = topic.toLowerCase();
    const skill = q.includes('寫') || q.includes('write') || q.includes('essay') || q.includes('作文') ? 'writing'
      : q.includes('讀') || q.includes('read') || q.includes('理解') || q.includes('comprehension') ? 'reading'
      : q.includes('聽') || q.includes('listen') ? 'listening'
      : 'grammar';
    setGenSkill(skill);

    try {
      const res = await fetch('/api/ai/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          difficulty: 'core',
          gradeLevel: getStudentLevel(studentProfile),
          count: 3,
          questionType: 'mc',
          topic,
          languageSkill: skill,
        }),
      });
      const data = await res.json();
      if (res.ok && data.questions?.length) {
        setGenQuestions(data.questions.map((q: any) => ({
          prompt: q.prompt,
          answer: q.answer,
          explanationZh: q.explanationZh || '',
          type: q.type,
          choices: q.choices || [],
        })));
      } else {
        setGenError(data.error || t('help.genFailedShort'));
      }
    } catch {
      setGenError(t('help.networkError'));
    } finally {
      setGenLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function loadPersonalizedAdvice() {
      setAdviceLoading(true);
      try {
        const profileRes = await fetch('/api/auth/profile');
        const profileJson = await profileRes.json();
        if (!profileRes.ok || !profileJson.user?.id) throw new Error(profileJson.error || '未能取得學生資料');

        const profile = profileJson.user as StudentProfile;
        if (cancelled) return;
        setStudentProfile(profile);

        const [practiceJson, mistakeJson] = await Promise.all([
          fetch(`/api/practice?studentId=${profile.id}`).then(r => r.json()),
          fetch(`/api/mistakes?studentId=${profile.id}`).then(r => r.json()),
        ]);

        const sessions = (practiceJson.sessions || []) as PracticeSessionLite[];
        const mistakes = (mistakeJson.mistakes || []) as MistakeLite[];
        const derivedWeakSkills = buildWeakSkills(sessions, mistakes);
        const derivedRecentPerformance = sessions.slice(0, 5).map(session => ({
          date: new Date(session.startedAt).toLocaleDateString('zh-HK'),
          accuracy: Math.round((session.correctCount / Math.max(1, session.totalQuestions)) * 100),
          questionsDone: session.totalQuestions,
        }));

        if (cancelled) return;
        setWeakSkills(derivedWeakSkills);
        setRecentPerformance(derivedRecentPerformance);
        setRecentMistakes(mistakes.slice(0, 5));

        const analysisRes = await fetch('/api/ai/analyze-progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentLevel: getStudentLevel(profile),
            overallAccuracy: Math.round(derivedWeakSkills.reduce((sum, item) => sum + item.accuracy, 0) / Math.max(1, derivedWeakSkills.length)),
            weakSkills: derivedWeakSkills.slice(0, 3),
            recentPerformance: derivedRecentPerformance,
            streakDays: profile.streakDays ?? 0,
          }),
        });

        const analysisJson = await analysisRes.json();
        if (!analysisRes.ok || !analysisJson.analysis) throw new Error(analysisJson.error || '無法取得個人化建議');

        if (cancelled) return;
        setAdviceSummary(analysisJson.analysis.summary || '');
        setAdviceUrgent(analysisJson.analysis.urgentAreas || []);
        setAdviceCards(
          (analysisJson.analysis.recommendedFocus || []).slice(0, 4).map((focus: { skill: string; reason: string; priority: string }, index: number) => ({
            title: `${focus.skill}${focus.priority === 'high' ? '（優先）' : ''}`,
            desc: focus.reason,
            icon: ['🎯', '📘', '🧠', '🚀'][index] || '💡',
          }))
        );
      } catch {
        if (!cancelled) {
          setAdviceSummary(t('help.fallbackAdvice'));
          setAdviceCards(aiAdviceI18n.map(a => ({ title: a.titleKey, desc: a.descKey, icon: a.icon })));
        }
      } finally {
        if (!cancelled) setAdviceLoading(false);
      }
    }

    loadPersonalizedAdvice();
    return () => { cancelled = true; };
  }, []);

  const handleAskAI = async () => {
    if (!aiQuestion.trim()) return;
    setAiLoading(true);
    setAiError('');
    setAiAnswer('');

    try {
      const res = await fetch('/api/ai/study-help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: aiQuestion.trim(),
          studentLevel: getStudentLevel(studentProfile),
          weakSkills: weakSkills.slice(0, 3),
          recentMistakes,
          recentPerformance,
        }),
      });
      const data = await res.json();
      if (res.ok && data.answer) {
        const extra = [
          ...(data.followUpTips?.length ? ['\n\n後續建議：', ...data.followUpTips.map((tip: string) => `- ${tip}`)] : []),
          ...(data.recommendedFocus?.length ? ['\n\n建議聚焦：', ...data.recommendedFocus.map((item: string) => `- ${item}`)] : []),
        ].join('\n');
        setAiAnswer(`${data.answer}${extra}`.trim());
      } else {
        setAiError(t('help.aiUnavailable'));
      }
    } catch {
      setAiError(t('help.networkCheck'));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('help.title')}</h1>

      {/* 🤖 AI 智能問答 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-teal-500" /> {t('help.aiAssistant')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          {t('help.aiIntro')}
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={aiQuestion}
            onChange={(e) => setAiQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAskAI(); }}
            placeholder={t('help.placeholder')}
            className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button
            onClick={handleAskAI}
            disabled={aiLoading || !aiQuestion.trim()}
            className="px-4 py-2.5 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-medium rounded-xl flex items-center gap-2 transition-colors"
          >
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {aiLoading ? t('help.aiQuestionLoading') : t('help.aiQuestionBtn')}
          </button>
        </div>
        {aiError && (
          <p className="mt-3 text-sm text-red-500">{aiError}</p>
        )}
        {aiAnswer && (
          <div className="mt-3 p-4 bg-teal-50 dark:bg-teal-900/20 rounded-xl text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-4 h-4 text-teal-500" />
              <span className="font-medium text-teal-700 dark:text-teal-400">{t('help.aiAnswerLabel')}</span>
            </div>
            <p className="whitespace-pre-wrap">{aiAnswer}</p>

            {/* 若問題與寫作相關，引導前往寫作支援頁面 */}
            {(['寫', '作文', 'essay', 'write', 'writing', 'article', 'letter', 'report', 'story'].some(kw =>
              aiQuestion.toLowerCase().includes(kw.toLowerCase())
            )) && (
              <div className="mt-4 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                <p className="text-xs text-purple-600 dark:text-purple-400 mb-2">
                  {t('help.writingRedirect')}
                </p>
                <Link
                  href="/student/writing"
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  {t('help.goToWriting')} <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            )}

            {/* 生成相關練習 */}
            <div className="mt-4 pt-3 border-t border-teal-200 dark:border-teal-700">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleGeneratePractice}
                  disabled={genLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {genLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {genLoading ? t('help.genPracticeLoading') : t('help.genPracticeBtn')}
                </button>
                {genQuestions.length > 0 && (
                  <Link
                    href={`/student/practice?mode=help&topic=${encodeURIComponent(genTopic)}&gradeLevel=${encodeURIComponent(getStudentLevel(studentProfile))}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-teal-600 dark:text-teal-400 hover:underline"
                  >
                    {t('help.goPractice')} <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>

              {genError && <p className="text-xs text-red-500 mt-2">{genError}</p>}

              {genQuestions.length > 0 && (
                <div className="mt-3 space-y-3">
                  <p className="text-xs font-medium text-teal-600 dark:text-teal-400">{t('help.generatedLabel')}</p>
                  {genQuestions.map((q, i) => {
                    const revealed = revealedAnswers[i];
                    const userAnswer = userAnswers[i];
                    const isMcq = q.type === 'mc' && q.choices && q.choices.length > 0;

                    // 智能答案比對
                    let isCorrect = false;
                    if (isMcq) {
                      isCorrect = (userAnswer || '').trim().toUpperCase() === (q.answer || '').trim().toUpperCase();
                    } else if (userAnswer && q.answer) {
                      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?,;:]$/, '');
                      isCorrect = norm(userAnswer) === norm(q.answer);
                    }

                    return (
                      <div key={i} className="border border-teal-200 dark:border-teal-700 rounded-lg p-3 bg-white/50 dark:bg-gray-800/50">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
                          {i + 1}. {q.prompt}
                        </p>

                        {/* MCQ 選項 — 可點擊作答 */}
                        {isMcq && !revealed && (
                          <div className="space-y-1.5">
                            {q.choices!.map((choice: string, ci: number) => {
                              const letter = String.fromCharCode(65 + ci);
                              const cleanChoice = choice.replace(/^\s*\(?\s*(?:[A-Da-d]|[1-4])\s*\)?\s*[\].:：)\-、]\s*/u, '').replace(/^\s*\(?\s*(?:[A-Da-d]|[1-4])\s*\)?\s+/u, '').trim();
                              const selected = userAnswer === letter;
                              return (
                                <button
                                  key={ci}
                                  onClick={() => setUserAnswers(prev => ({ ...prev, [i]: letter }))}
                                  className={`w-full text-left p-2 rounded-lg text-xs border transition-colors ${
                                    selected
                                      ? 'border-teal-400 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300'
                                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-teal-200'
                                  }`}
                                >
                                  <span className="font-semibold mr-1">{letter}.</span> {cleanChoice}
                                </button>
                              );
                            })}
                            {userAnswer && (
                              <button
                                onClick={() => setRevealedAnswers(prev => ({ ...prev, [i]: true }))}
                                className="mt-2 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs rounded-lg font-medium"
                              >
                                {t('common.submit')}
                              </button>
                            )}
                          </div>
                        )}

                        {/* 非 MCQ 題 — 文字輸入 */}
                        {!isMcq && !revealed && (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={userAnswer || ''}
                              onChange={e => setUserAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                              placeholder={t('assignment.inputAnswer')}
                              className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-xs outline-none focus:ring-1 focus:ring-teal-500"
                            />
                            {userAnswer && userAnswer.trim() && (
                              <button
                                onClick={() => setRevealedAnswers(prev => ({ ...prev, [i]: true }))}
                                className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs rounded-lg font-medium"
                              >
                                {t('common.submit')}
                              </button>
                            )}
                          </div>
                        )}

                        {/* 已揭曉結果 */}
                        {revealed && (
                          <div className="space-y-1 text-xs">
                            {isMcq && q.choices!.map((choice: string, ci: number) => {
                              const letter = String.fromCharCode(65 + ci);
                              const cleanChoice = choice.replace(/^\s*\(?\s*(?:[A-Da-d]|[1-4])\s*\)?\s*[\].:：)\-、]\s*/u, '').replace(/^\s*\(?\s*(?:[A-Da-d]|[1-4])\s*\)?\s+/u, '').trim();
                              const isCorrectChoice = q.answer?.trim().toUpperCase() === letter;
                              const isUserChoice = userAnswer?.toUpperCase() === letter;
                              return (
                                <p key={ci} className={`${isCorrectChoice ? 'text-green-600 dark:text-green-400 font-medium' : isUserChoice && !isCorrectChoice ? 'text-red-500 line-through' : 'text-gray-500'}`}>
                                  <span className="font-semibold">{letter}.</span> {cleanChoice}
                                  {isCorrectChoice && ' ✓'}
                                  {isUserChoice && !isCorrectChoice && ' ✗'}
                                </p>
                              );
                            })}
                            {!isMcq && (
                              <p className={isCorrect ? 'text-green-600' : 'text-red-500'}>
                                {t('mistakes.yourAnswer')}<span className={isCorrect ? '' : 'line-through'}>{userAnswer}</span>
                                {!isCorrect && <span className="text-green-600 ml-1">→ {q.answer}</span>}
                              </p>
                            )}
                            <p className="text-green-600 dark:text-green-400 mt-1">✅ {t('student.correctAnswer')}: {q.answer}</p>
                            <p className="text-gray-500 dark:text-gray-400">💡 {q.explanationZh}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* AI 學習建議卡片 */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-yellow-500" /> AI 學習建議
        </h2>
        {adviceSummary && (
          <div className="mb-3 bg-teal-50 dark:bg-teal-900/20 rounded-xl p-4 text-sm text-gray-700 dark:text-gray-300">
            <div className="flex items-center gap-2 font-medium text-teal-700 dark:text-teal-400 mb-1">
              <Target className="w-4 h-4" /> 個人化分析
            </div>
            <p>{adviceSummary}</p>
            {adviceUrgent.length > 0 && (
              <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                目前優先改善：{adviceUrgent.join('、')}
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(adviceLoading ? aiAdviceI18n.map(a => ({ icon: a.icon, title: t(a.titleKey), desc: t(a.descKey) })) : adviceCards).map((advice: any, i: number) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex gap-3">
              <span className="text-2xl">{advice.icon}</span>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white text-sm">{typeof advice.title === 'string' && advice.title.includes('.') ? t(advice.title) : advice.title}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{typeof advice.desc === 'string' && advice.desc.includes('.') ? t(advice.desc) : advice.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 常見學習困難（可展開答案） */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-teal-500" /> {t('help.commonQuestions')}
        </h2>
        <div className="space-y-3">
          {helpCategories.map((cat, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cat.color}`}>
                  <cat.icon className="w-5 h-5" />
                </div>
                <h3 className="font-medium text-gray-900 dark:text-white">{t(cat.titleKey)}</h3>
              </div>
              <div className="px-4 pb-4 space-y-1">
                {cat.items.map((item, j) => {
                  const key = `${i}-${j}`;
                  const isOpen = expanded === key;
                  return (
                    <div key={j}>
                      <button
                        onClick={() => setExpanded(isOpen ? null : key)}
                        className="w-full flex items-center justify-between p-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors text-left"
                      >
                        <span>{t(item.qKey)}</span>
                        {isOpen ? <ChevronDown className="w-4 h-4 flex-shrink-0 text-teal-500" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
                      </button>
                      {isOpen && (
                        <div className="px-3 py-2 mx-2 mb-1 bg-teal-50 dark:bg-teal-900/20 rounded-lg text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                          {t(item.aKey)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 鼓勵訊息 */}
      <div className="bg-gradient-to-r from-teal-500 to-teal-600 rounded-2xl p-6 text-white text-center">
        <ThumbsUp className="w-8 h-8 mx-auto mb-2 opacity-80" />
        <p className="text-lg font-semibold">{t('help.encouragement')}</p>
        <p className="text-sm text-teal-100 mt-1">{t('help.encouragementDesc')}</p>
      </div>
    </div>
  );
}
