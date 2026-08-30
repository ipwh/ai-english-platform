// ============================================
// 學生端 — 求助與建議頁面（含 AI 問答）
// ============================================
'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Lightbulb, BookOpen, MessageCircle, ChevronRight, ChevronDown, ThumbsUp, Sparkles, Send, Loader2, Target, Play, ArrowRight } from 'lucide-react';
import { useT } from '@/hooks/use-i18n';
import { normalizeSkillName, buildWeakSkills } from '@/shared/utils/utils';
import type { PracticeSessionLite, MistakeLite, WeakSkill } from '@/shared/utils/utils';

interface StudentProfile {
  id: string;
  level?: string | null;
  streakDays?: number | null;
  class?: { gradeLevel?: string | null } | null;
}

function getStudentLevel(profile: StudentProfile | null): string {
  return profile?.level || profile?.class?.gradeLevel || 'S4';
}

/** 計算建議信心度（0-100）及數據豐富度 */
function calculateConfidence(
  totalSessions: number,
  totalQuestions: number,
  totalMistakes: number,
  skillCount: number,
  streakDays: number
): { score: number; level: 'high' | 'medium' | 'low' | 'insufficient'; totalQuestions: number; totalSessions: number; totalMistakes: number; skillCount: number } {
  // Sessions: max 30 points (at 30+ sessions)
  const sessionScore = Math.min(30, Math.round((totalSessions / 30) * 30));
  // Questions: max 30 points (at 300+ questions)
  const questionScore = Math.min(30, Math.round((totalQuestions / 300) * 30));
  // Skills covered: max 20 points (5 per skill, max 4 skills)
  const skillScore = Math.min(20, skillCount * 5);
  // Streak: max 20 points (at 30+ days)
  const streakScore = Math.min(20, Math.round((streakDays / 30) * 20));
  
  const score = sessionScore + questionScore + skillScore + streakScore;
  
  let level: 'high' | 'medium' | 'low' | 'insufficient';
  if (totalSessions < 3 || totalQuestions < 30) {
    level = 'insufficient';
  } else if (score >= 60) {
    level = 'high';
  } else if (score >= 30) {
    level = 'medium';
  } else {
    level = 'low';
  }

  return { score, level, totalQuestions, totalSessions, totalMistakes, skillCount };
}

/** 根據弱項類別判斷 FAQ 分類的相關性分數（越高越相關） */
function getCategoryRelevanceScore(
  catTitleKey: string,
  weakSkills: WeakSkill[]
): number {
  const categorySkillMap: Record<string, string[]> = {
    'help.catGrammar': ['grammar', '文法', 'tenses', 'conditional', 'sentence'],
    'help.catVocab': ['vocabulary', 'vocab', '詞彙', '單詞', 'phrasal', 'collocation'],
    'help.catWriting': ['writing', '寫作', '作文', 'essay', 'chinglish'],
    'help.catReading': ['reading', '閱讀', 'comprehension', '理解'],
  };

  const keywords = categorySkillMap[catTitleKey] || [];
  let score = 0;
  for (const skill of weakSkills) {
    if (skill.accuracy < 0) continue; // 無證據技能不算相關性
    const nameLower = skill.name.toLowerCase();
    for (const kw of keywords) {
      if (nameLower.includes(kw)) {
        // 準確率越低，相關性分數越高（因為越需要關注）
        score += Math.round((100 - skill.accuracy) / 10);
        break;
      }
    }
  }
  return score;
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

const aiAdviceI18n = [
  { titleKey: 'help.advice.habit.title', descKey: 'help.advice.habit.desc', icon: '📅' },
  { titleKey: 'help.advice.review.title', descKey: 'help.advice.review.desc', icon: '🔄' },
  { titleKey: 'help.advice.understand.title', descKey: 'help.advice.understand.desc', icon: '🧠' },
  { titleKey: 'help.advice.listenread.title', descKey: 'help.advice.listenread.desc', icon: '🎧' },
];

export default function StudentHelpPage() {
  const { t, language } = useT();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [weakSkills, setWeakSkills] = useState<WeakSkill[]>([]);
  const [recentPerformance, setRecentPerformance] = useState<{ date: string; accuracy: number; questionsDone: number }[]>([]);
  const [recentMistakes, setRecentMistakes] = useState<MistakeLite[]>([]);
  const [adviceCards, setAdviceCards] = useState(aiAdviceI18n.map(a => ({ title: a.titleKey, desc: a.descKey, icon: a.icon })));
  const [adviceSummary, setAdviceSummary] = useState('');
  const [adviceUrgent, setAdviceUrgent] = useState<string[]>([]);
  const [adviceLoading, setAdviceLoading] = useState(true);

  // === 信心度 & 數據豐富度 ===
  const [confidence, setConfidence] = useState<ReturnType<typeof calculateConfidence> | null>(null);
  const [hasInsufficientData, setHasInsufficientData] = useState(false);

  // === 個人化 FAQ ===
  const [personalizedFaqItems, setPersonalizedFaqItems] = useState<{ q: string; a: string; skill: string; icon: string }[]>([]);

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

    // 根據問題關鍵字判斷技能類型（API 僅接受 reading|writing|listening|speaking|integrated）
    const q = topic.toLowerCase();
    const skill = q.includes('寫') || q.includes('write') || q.includes('essay') || q.includes('作文') || q.includes('writing') ? 'writing'
      : q.includes('聽') || q.includes('listen') || q.includes('listening') ? 'listening'
      : q.includes('說') || q.includes('speak') || q.includes('口語') || q.includes('speaking') ? 'speaking'
      : q.includes('讀') || q.includes('read') || q.includes('理解') || q.includes('comprehension') || q.includes('詞彙') || q.includes('vocab') ? 'reading'
      : q.includes('文法') || q.includes('grammar') ? 'writing'   // DSE grammar assessed via writing
      : 'reading';  // safe default
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
        setGenQuestions(data.questions.map((q: Record<string, unknown>) => ({
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
        // R3.10-C.2: 近期表現只使用 verified row-derived 證據；不可驗證 session
        // 絕不用原始 totalQuestions/correctCount 產生準確率資料點。
        const derivedRecentPerformance = sessions.slice(0, 5).flatMap(session => {
          const v = session.verified;
          if (!v || v.status !== 'verified') return [];
          return [{
            date: new Date(session.startedAt).toLocaleDateString('zh-HK'),
            accuracy: Math.round(((v.correctCount ?? 0) / Math.max(1, v.totalQuestions ?? 0)) * 100),
            questionsDone: v.totalQuestions ?? 0,
          }];
        });

        if (cancelled) return;
        setWeakSkills(derivedWeakSkills);
        setRecentPerformance(derivedRecentPerformance);
        setRecentMistakes(mistakes.slice(0, 5));

        // 計算信心度 & 數據豐富度（R3.10-C: 只計 verified 證據）
        const totalSessions = sessions.length;
        const totalQuestions = sessions.reduce((sum, s) => {
          const v = s.verified;
          return sum + (v?.status === 'verified' ? (v.totalQuestions ?? 0) : 0);
        }, 0);
        const totalMistakes = mistakes.length;
        const skillCount = derivedWeakSkills.filter(w => w.accuracy > 0).length;
        const confResult = calculateConfidence(totalSessions, totalQuestions, totalMistakes, skillCount, profile.streakDays ?? 0);
        setConfidence(confResult);

        // 判斷數據是否不足（少於 3 次練習 或 少於 30 題）
        if (totalSessions < 3 || totalQuestions < 30) {
          setHasInsufficientData(true);
          if (cancelled) return;
          setAdviceSummary(t('help.insufficientDataTitle'));
          setAdviceLoading(false);
          return; // 數據不足時不呼叫 AI，直接顯示基本建議
        }
        setHasInsufficientData(false);

        const analysisRes = await fetch('/api/ai/analyze-progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId: profile.id,
            studentLevel: getStudentLevel(profile),
            overallAccuracy: (() => {
              // 只計有證據（accuracy >= 0）的技能；無證據（-1）不得拉低平均
              const known = derivedWeakSkills.filter(w => w.accuracy >= 0);
              return known.length > 0
                ? Math.round(known.reduce((sum, item) => sum + item.accuracy, 0) / known.length)
                : 0;
            })(),
            weakSkills: derivedWeakSkills.filter(w => w.accuracy >= 0).slice(0, 3),
            recentPerformance: derivedRecentPerformance,
            streakDays: profile.streakDays ?? 0,
          }),
        });

        const analysisJson = await analysisRes.json();
        if (!analysisRes.ok || !analysisJson.analysis) throw new Error(analysisJson.error || '無法取得個人化建議');

        if (cancelled) return;
        const analysis = analysisJson.analysis;
        setAdviceSummary(analysis.summary || '');
        setAdviceUrgent(analysis.urgentAreas || []);
        setAdviceCards(
          (analysis.recommendedFocus || []).slice(0, 4).map((focus: { skill: string; reason: string; priority: string }, index: number) => ({
            title: `${focus.skill}${focus.priority === 'high' ? ` ${t('help.priority')}` : ''}`,
            desc: focus.reason,
            icon: ['🎯', '📘', '🧠', '🚀'][index] || '💡',
          }))
        );

        // 從 AI 分析結果生成個人化 FAQ 項目
        const faqItems: { q: string; a: string; skill: string; icon: string }[] = [];
        
        // 根據 urgentAreas 生成針對性問題
        const urgentAreas = analysis.urgentAreas || [];
        const recommendedFocus = analysis.recommendedFocus || [];
        const studyPlan = analysis.studyPlan || '';
        
        for (const area of urgentAreas.slice(0, 2)) {
          const areaLower = area.toLowerCase();
          if (areaLower.includes('grammar') || areaLower.includes('文法')) {
            faqItems.push({
              q: `如何針對性改善${area}？`,
              a: studyPlan || `建議：1) 每日做 10 題文法練習，聚焦${area}相關題型；2) 每題錯後必須查看詳解並記錄錯題；3) 每週重溫一次錯題庫；4) 兩週後自我檢測是否進步。`,
              skill: 'grammar',
              icon: '📝',
            });
          } else if (areaLower.includes('reading') || areaLower.includes('閱讀') || areaLower.includes('comprehension')) {
            faqItems.push({
              q: `如何提升${area}的成績？`,
              a: studyPlan || `建議：1) 每日閱讀一篇英文文章（15 分鐘），練習略讀及掃讀技巧；2) 每週做 1 篇 DSE 閱讀模擬，記錄時間及正確率；3) 先看題目再讀文章，每題限時 1.5 分鐘；4) 持續四週後檢視進步幅度。`,
              skill: 'reading',
              icon: '📖',
            });
          } else if (areaLower.includes('vocab') || areaLower.includes('詞彙')) {
            faqItems.push({
              q: `如何有效擴充${area}？`,
              a: studyPlan || `建議：1) 每日學習 5-10 個新詞彙，連同例句及 collocations 一起記；2) 使用平台的詞彙學習功能，啟用間隔重溫（SRS）；3) 每週做一次詞彙測驗自檢；4) 嘗試在寫作中主動使用新詞彙。`,
              skill: 'vocabulary',
              icon: '📚',
            });
          } else if (areaLower.includes('writing') || areaLower.includes('寫作') || areaLower.includes('作文')) {
            faqItems.push({
              q: `如何系統性提升${area}能力？`,
              a: studyPlan || `建議：1) 每週寫一篇 200-300 字英文短文，使用平台 AI 批改；2) 學習 PEEL 段落結構（Point→Example→Explanation→Link）；3) 每次批改後針對 AI 建議修改，記錄常見錯誤；4) 每月比較前後作文，量化進步。`,
              skill: 'writing',
              icon: '✍️',
            });
          }
        }

        // 補充 recommendedFocus 中 priority=high 的項目
        for (const focus of recommendedFocus) {
          if (focus.priority === 'high' && faqItems.length < 3) {
            const alreadyCovered = faqItems.some(f => 
              f.skill.toLowerCase().includes(focus.skill.toLowerCase()) ||
              focus.skill.toLowerCase().includes(f.skill.toLowerCase())
            );
            if (!alreadyCovered) {
              faqItems.push({
                q: `${focus.skill}方面應該如何針對性練習？`,
                a: focus.reason,
                skill: focus.skill.toLowerCase(),
                icon: '🎯',
              });
            }
          }
        }

        // 若仍不足 2 條，從 weakSkills 生成（只取有證據的技能）
        if (faqItems.length < 2 && derivedWeakSkills.length > 0) {
          const topWeak = derivedWeakSkills.find(w => w.accuracy >= 0) ?? derivedWeakSkills[0];
          const skillIcons: Record<string, string> = { grammar: '📝', vocabulary: '📚', reading: '📖', writing: '✍️' };
          faqItems.push({
            q: `我的${topWeak.nameZh}準確率只有 ${topWeak.accuracy}%，應該如何改善？`,
            a: `你的${topWeak.nameZh}目前準確率為 ${topWeak.accuracy}%，屬於薄弱環節。建議：1) 每日針對${topWeak.nameZh}做 10-15 題練習；2) 每題錯後記錄錯誤類型及原因；3) 每週末重溫該週所有${topWeak.nameZh}錯題；4) 目標：兩週內將準確率提升至 70% 以上。`,
            skill: topWeak.name,
            icon: skillIcons[topWeak.name] || '💡',
          });
        }

        setPersonalizedFaqItems(faqItems);
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

  // === 根據弱項動態排序 FAQ 分類 ===
  const sortedCategories = useMemo(() => {
    if (weakSkills.length === 0) return helpCategories.map(cat => ({ ...cat, relevanceScore: 0, isPriority: false }));
    return helpCategories.map(cat => {
      const relevanceScore = getCategoryRelevanceScore(cat.titleKey, weakSkills);
      // 分數 > 0 表示該類別與弱項相關
      return { ...cat, relevanceScore, isPriority: relevanceScore > 0 };
    }).sort((a, b) => b.relevanceScore - a.relevanceScore);
  }, [weakSkills]);

  // === 根據弱項生成建議問題 ===
  const suggestedQuestions = useMemo(() => {
    const suggestions: string[] = [];
    for (const skill of weakSkills.slice(0, 3)) {
      if (skill.accuracy < 0) continue; // 無證據技能不生成建議問題
      const name = skill.name.toLowerCase();
      const nameZh = skill.nameZh;
      if ((name.includes('grammar') || name.includes('文法')) && skill.accuracy < 70) {
        suggestions.push(`${nameZh}成日錯，點樣系統性改善？`);
      }
      if ((name.includes('reading') || name.includes('閱讀')) && skill.accuracy < 70) {
        suggestions.push(`做閱讀理解時間唔夠，有咩技巧可以加快？`);
      }
      if ((name.includes('vocab') || name.includes('詞彙')) && skill.accuracy < 70) {
        suggestions.push(`點樣可以有效記住更多英文生字？`);
      }
      if ((name.includes('writing') || name.includes('寫作')) && skill.accuracy < 70) {
        suggestions.push(`點樣避免 Chinglish，寫出更地道嘅英文？`);
      }
    }
    // Deduplicate
    return [...new Set(suggestions)].slice(0, 3);
  }, [weakSkills]);

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
          ...(data.followUpTips?.length ? [language === 'en' ? '\n\nFollow-up tips:' : '\n\n後續建議：', ...data.followUpTips.map((tip: string) => `- ${tip}`)] : []),
          ...(data.recommendedFocus?.length ? [language === 'en' ? '\n\nSuggested focus:' : '\n\n建議聚焦：', ...data.recommendedFocus.map((item: string) => `- ${item}`)] : []),
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
        {/* 根據弱項建議問題 */}
        {suggestedQuestions.length > 0 && !aiAnswer && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('help.suggestedQuestionsLabel')}</span>
            {suggestedQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => { setAiQuestion(q); }}
                className="px-3 py-1.5 text-xs bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-full border border-teal-200 dark:border-teal-700 hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
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
          <Lightbulb className="w-5 h-5 text-yellow-500" /> {t('help.aiAdvice')}
        </h2>

        {/* 數據不足時顯示提示及基本建議 */}
        {hasInsufficientData && (
          <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-5 border border-amber-200 dark:border-amber-700">
            <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400 mb-2 text-sm">
              <span className="text-lg">📊</span> {t('help.insufficientDataTitle')}
            </div>
            <p className="text-sm text-amber-600 dark:text-amber-300 mb-3">{t('help.insufficientDataDesc')}</p>
            <ul className="space-y-2 text-sm text-amber-700 dark:text-amber-300">
              <li>{t('help.insufficientDataAction1')}</li>
              <li>{t('help.insufficientDataAction2')}</li>
              <li>{t('help.insufficientDataAction3')}</li>
              <li>{t('help.insufficientDataAction4')}</li>
            </ul>
            {confidence && (
              <div className="mt-4 pt-3 border-t border-amber-200 dark:border-amber-700 flex items-center gap-2 text-xs text-amber-500">
                <span>{t('help.confidenceLabel')}：</span>
                <span className="font-medium">{confidence.score}/100 — {t('help.confidenceInsufficient')}</span>
              </div>
            )}
          </div>
        )}

        {/* 數據不足時顯示基本建議 */}
        {hasInsufficientData && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('help.basicAdviceTitle')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: '📖', text: t('help.basicAdvice1') },
                { icon: '✍️', text: t('help.basicAdvice2') },
                { icon: '🔄', text: t('help.basicAdvice3') },
                { icon: '🎧', text: t('help.basicAdvice4') },
              ].map((item, i) => (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex gap-3">
                  <span className="text-2xl">{item.icon}</span>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 有足夠數據時顯示 AI 分析 */}
        {!hasInsufficientData && adviceSummary && (
          <div className="mb-3 bg-teal-50 dark:bg-teal-900/20 rounded-xl p-4 text-sm text-gray-700 dark:text-gray-300">
            <div className="flex items-center gap-2 font-medium text-teal-700 dark:text-teal-400 mb-1">
              <Target className="w-4 h-4" /> {t('help.personalizedAnalysis')}
            </div>
            <p>{adviceSummary}</p>
            {adviceUrgent.length > 0 && (
              <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                {t('help.priorityImprove')}{adviceUrgent.join('、')}
              </div>
            )}
            {/* 信心度顯示 */}
            {confidence && (
              <div className="mt-3 pt-2 border-t border-teal-200 dark:border-teal-700 flex items-center gap-2 text-xs">
                <span className="text-teal-600 dark:text-teal-400 font-medium">{t('help.confidenceLabel')}：</span>
                <span className={`font-semibold ${
                  confidence.level === 'high' ? 'text-green-600' :
                  confidence.level === 'medium' ? 'text-yellow-600' :
                  'text-orange-500'
                }`}>
                  {confidence.score}/100 — {
                    confidence.level === 'high' ? t('help.confidenceHigh') :
                    confidence.level === 'medium' ? t('help.confidenceMedium') :
                    t('help.confidenceLow')
                  }
                </span>
                <span className="text-gray-400">|</span>
                <span className="text-gray-500">
                  {t('help.dataPoints', { sessions: confidence.totalSessions, questions: confidence.totalQuestions, mistakes: confidence.totalMistakes })}
                </span>
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(adviceLoading ? aiAdviceI18n.map(a => ({ icon: a.icon, title: t(a.titleKey), desc: t(a.descKey) })) : adviceCards).map((advice: { icon: string; title: string; desc: string }, i: number) => (
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

      {/* 常見學習困難（可展開答案）— 已按弱項動態排序 */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-teal-500" /> {t('help.commonQuestions')}
        </h2>

        {/* 個人化 FAQ — 基於 AI 分析生成 */}
        {personalizedFaqItems.length > 0 && (
          <div className="mb-5">
            <h3 className="text-sm font-medium text-teal-700 dark:text-teal-400 mb-3 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> {t('help.personalizedFaqTitle')}
            </h3>
            <div className="space-y-2">
              {personalizedFaqItems.map((item, i) => {
                const key = `personalized-${i}`;
                const isOpen = expanded === key;
                return (
                  <div key={i} className="bg-gradient-to-r from-teal-50 to-teal-50/50 dark:from-teal-900/20 dark:to-teal-900/10 rounded-xl border border-teal-200 dark:border-teal-700 overflow-hidden">
                    <button
                      onClick={() => setExpanded(isOpen ? null : key)}
                      className="w-full flex items-center gap-2 p-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-teal-100/50 dark:hover:bg-teal-800/20 transition-colors text-left"
                    >
                      <span className="text-lg">{item.icon}</span>
                      <span className="flex-1 font-medium">{item.q}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-800 text-teal-600 dark:text-teal-400">{t('help.personalized')}</span>
                      {isOpen ? <ChevronDown className="w-4 h-4 flex-shrink-0 text-teal-500" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
                    </button>
                    {isOpen && (
                      <div className="px-4 py-3 mx-2 mb-2 bg-white/80 dark:bg-gray-800/80 rounded-lg text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 排序提示 */}
        {weakSkills.length > 0 && !hasInsufficientData && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">{t('help.faqSortNotice')}</p>
        )}

        <div className="space-y-3">
          {sortedCategories.map((cat, i) => {
            const showPriority = cat.isPriority && !hasInsufficientData;
            return (
            <div key={i} className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border overflow-hidden transition-colors ${
              showPriority ? 'border-amber-300 dark:border-amber-600 ring-1 ring-amber-200 dark:ring-amber-800' : 'border-gray-100 dark:border-gray-700'
            }`}>
              <div className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cat.color}`}>
                  <cat.icon className="w-5 h-5" />
                </div>
                <h3 className="font-medium text-gray-900 dark:text-white">{t(cat.titleKey)}</h3>
                {showPriority && (
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 font-medium">
                    {t('help.priorityTag')}
                  </span>
                )}
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
            );
          })}
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
