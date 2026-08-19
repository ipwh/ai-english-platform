// ============================================
// 學生端 — 診斷測試頁面
// 完整流程：AI 生成題目 → 逐題作答 → AI 分析報告
// ============================================
'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowRight, CheckCircle, BookOpen, Pencil, FileText, Sparkles, Loader2, Target, Headphones } from 'lucide-react';
import { logger } from '@/shared/logger/logger';
import ProgressBar from '@/components/shared/ProgressBar';
import SkillChip from '@/components/shared/SkillChip';
import AudioPlayer from '@/components/shared/AudioPlayer';
import { CloFeedbackPanel } from '@/components/shared/CloRationaleCard';
import type { CloDimensionRationaleResult } from '@/shared/types/ai-response-types';
import type { PracticeQuestion } from '@/shared/types/types';
import { useT } from '@/hooks/use-i18n';
import { normalizeSkillName, buildWeakSkills } from '@/shared/utils/utils';
import type { PracticeSessionLite, MistakeLite, WeakSkill } from '@/shared/utils/utils';
import { toMcqLetter, stripMcqPrefix, normalizeAnswer, MCQ_LETTERS } from '@/modules/ai/services/question-validator';

interface DiagnosticResult {
  id: string;
  label: string;
  score: number;
  totalQuestions: number;
  level: string;
  suggestion: string;
}

interface PracticeRecommendation {
  grammarItem?: string;
  languageSkill?: string;
  difficulty: 'remedial' | 'core' | 'challenge';
  questionType: 'mc' | 'short-writing';
  questionCount: number;
  weakLabel: string;
}

interface StudentProfile {
  id: string;
  level?: string | null;
  streakDays?: number | null;
  class?: { gradeLevel?: string | null } | null;
}

interface DiagnosticPlan {
  grammarItem?: string;
  grammarItemZh?: string;
  languageSkill?: string;
  languageSkillZh?: string;
  skillCategory: 'grammar' | 'vocabulary' | 'reading' | 'writing' | 'listening';
  questionType: 'mc' | 'short-writing' | 'fill-blank';
  count: number;
  difficulty: 'remedial' | 'core' | 'challenge';
  topic?: string;
}

function getStudentLevel(profile: StudentProfile | null): string {
  return profile?.level || profile?.class?.gradeLevel || 'S4';
}

function getLevelLabel(scores: { correct: number; total: number } | undefined): string {
  if (!scores || scores.total === 0) return '';
  const pct = scores.correct / scores.total;
  if (pct >= 0.8) return '挑戰';
  if (pct >= 0.5) return '核心';
  return '補底';
}

function buildDiagnosticPlans(level: string, weakSkills: WeakSkill[]): DiagnosticPlan[] {
  // Diagnostic always uses 'core' difficulty for consistent baseline assessment
  const difficulty: 'remedial' | 'core' | 'challenge' = 'core';
  const junior = ['S1', 'S2', 'S3'].includes(level);

  const plans: DiagnosticPlan[] = [];

  // ── Grammar: 2 MCQ (baseline) ──
  plans.push({
    grammarItem: junior ? 'subject-verb-agreement' : 'tenses',
    grammarItemZh: junior ? '主謂一致' : '時態',
    skillCategory: 'grammar',
    questionType: 'mc',
    count: 2,
    difficulty,
  });

  // ── Vocabulary: 1 context-cloze (fill-blank) for active vocabulary ──
  plans.push({
    languageSkill: 'vocabulary',
    languageSkillZh: '詞彙應用',
    skillCategory: 'vocabulary',
    questionType: 'fill-blank',
    count: 1,
    difficulty,
  });

  // ── Reading: 2 MCQ ──
  plans.push({
    languageSkill: 'reading',
    languageSkillZh: '閱讀理解',
    skillCategory: 'reading',
    questionType: 'mc',
    count: 2,
    difficulty,
  });

  // ── Listening: 2 MCQ ──
  plans.push({
    languageSkill: 'listening',
    languageSkillZh: '聆聽理解',
    skillCategory: 'listening',
    questionType: 'mc',
    count: 2,
    difficulty,
  });

  // ── Writing: 1 task — short article ──
  plans.push({
    languageSkill: 'writing',
    languageSkillZh: '寫作（短文）',
    skillCategory: 'writing',
    questionType: 'short-writing',
    count: 1,
    difficulty,
    topic: 'short article',
  });

  // R3.10-L: 根據近期弱項調整題數 — 對準確率 < 60% 的弱項各加 1 題（上限 3 題），
  // 使診斷題組反映學生弱項而非純固定基線。難度維持 'core' 以保持基線可比性。
  // 寫作不在此加題：handleComplete 只分析第一條寫作答案，多於一題會再次產生
  // 「只分析第一題」的失效情況。
  const boostByCategory: Partial<Record<Exclude<DiagnosticPlan['skillCategory'], 'writing'>, number>> = {};
  for (const w of weakSkills) {
    if (w.accuracy >= 60) continue;
    if (w.name === 'grammar' || w.name === 'vocabulary' || w.name === 'reading' || w.name === 'listening') {
      boostByCategory[w.name] = (boostByCategory[w.name] ?? 0) + 1;
    }
  }
  return plans.map(p => {
    if (p.skillCategory === 'writing') return p;
    const boost = boostByCategory[p.skillCategory] ?? 0;
    return boost > 0 ? { ...p, count: Math.min(3, p.count + boost) } : p;
  });
}

function buildPracticeRecommendation(results: DiagnosticResult[], level: string): PracticeRecommendation {
  const weakest = [...results].sort((a, b) => a.score - b.score)[0] || results[0];
  const difficulty: 'remedial' | 'core' | 'challenge' = weakest.score < 50 ? 'remedial' : weakest.score < 75 ? 'core' : 'challenge';

  if (weakest?.id === 'reading') {
    return { languageSkill: 'reading', difficulty, questionType: 'mc', questionCount: 5, weakLabel: weakest.label };
  }
  if (weakest?.id === 'writing') {
    return { languageSkill: 'writing', difficulty: difficulty === 'challenge' ? 'core' : difficulty, questionType: 'short-writing', questionCount: 3, weakLabel: weakest.label };
  }
  if (weakest?.id === 'vocabulary') {
    return { grammarItem: 'phrasal-verbs', difficulty, questionType: 'mc', questionCount: 5, weakLabel: weakest.label };
  }

  const junior = ['S1', 'S2', 'S3'].includes(level);
  return {
    grammarItem: junior ? 'subject-verb-agreement' : 'tenses',
    difficulty,
    questionType: 'mc',
    questionCount: 5,
    weakLabel: weakest?.label || '文法',
  };
}

export default function DiagnosticPage() {
  const { t, language } = useT();
  const lang = language || 'zh';
  const inputRef = useRef<HTMLInputElement>(null);
  const answersRef = useRef<Record<string, string>>({}); // ✅ ref avoids stale closure

  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [weakSkills, setWeakSkills] = useState<WeakSkill[]>([]);
  const [recentPerformance, setRecentPerformance] = useState<{ date: string; accuracy: number; questionsDone: number }[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [genError, setGenError] = useState('');
  const [started, setStarted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState<string>('');
  const [writingAnalysis, setWritingAnalysis] = useState<{
    overallScore: number; contentScore?: number; languageScore?: number; organizationScore?: number;
    dseLevel?: string; strengths?: string[]; weaknesses?: string[]; overallCommentZh?: string;
    cloRationales?: CloDimensionRationaleResult[];
  } | null>(null);
  const [writingLoading, setWritingLoading] = useState(false);
  const [writingAnswer, setWritingAnswer] = useState('');
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [answeredCurrent, setAnsweredCurrent] = useState(false);
  const [peerAverages, setPeerAverages] = useState<Record<string, { avg: number; count: number }> | null>(null);

  /** 答案比對（使用 canonical question-validator 正規化） */
  function checkAnswer(student: string, correct: string, type: string, choices?: string[]): boolean {
    if (type === 'mc') {
      const s = student.trim().toUpperCase();
      const c = correct.trim().toUpperCase();
      if (s === c) return true;
      const letterIdx = MCQ_LETTERS.indexOf(c as typeof MCQ_LETTERS[number]);
      if (choices && letterIdx >= 0 && letterIdx < choices.length) {
        if (normalizeAnswer(student) === normalizeAnswer(choices[letterIdx])) return true;
      }
      return false;
    }
    // short-writing / writing skill: accept any non-empty answer (qualitative assessment)
    if (type === 'short-writing' || type === 'writing') return student.trim().length > 0;
    // fill-blank: normalized comparison
    return normalizeAnswer(student) === normalizeAnswer(correct);
  }

  // 🔥 載入時根據學生年級與弱項自動生成診斷題目
  useEffect(() => {
    setLoadingQuestions(true);
    fetch('/api/auth/profile')
      .then(async profileRes => {
        const profileJson = await profileRes.json();
        if (!profileRes.ok || !profileJson.user?.id) throw new Error(profileJson.error || '未能取得學生資料');

        const profile = profileJson.user as StudentProfile;
        setStudentProfile(profile);
        const studentLevel = getStudentLevel(profile);

        const [practiceJson, mistakeJson] = await Promise.all([
          fetch(`/api/practice?studentId=${profile.id}`).then(r => r.json()),
          fetch(`/api/mistakes?studentId=${profile.id}`).then(r => r.json()),
        ]);

        const sessions = (practiceJson.sessions || []) as PracticeSessionLite[];
        const mistakes = (mistakeJson.mistakes || []) as MistakeLite[];
        const derivedWeakSkills = buildWeakSkills(sessions, mistakes);
        const plans = buildDiagnosticPlans(studentLevel, derivedWeakSkills);

        setWeakSkills(derivedWeakSkills);
        // R3.10-C.2: 近期表現只使用 verified row-derived 證據；
        // 不可驗證 session 絕不用原始 totalQuestions/correctCount 計算準確率。
        setRecentPerformance(
          sessions.slice(0, 10).flatMap(s => {
            const v = s.verified;
            if (!v || v.status !== 'verified') return [];
            return [{
              date: new Date(s.startedAt).toISOString().split('T')[0],
              accuracy: Math.round(((v.correctCount ?? 0) / Math.max(1, v.totalQuestions ?? 0)) * 100),
              questionsDone: v.totalQuestions ?? 0,
            }];
          })
        );

        // 🔥 If no weak skills found (new student or insufficient data), show dedicated message
        if (plans.length === 0) {
          setGenError(t('diagnostic.notEnoughData'));
          setLoadingQuestions(false);
          return;
        }

        const aiResponses = await Promise.all(
          plans.map(plan =>
            fetch('/api/ai/generate-questions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                grammarItem: plan.grammarItem,
                grammarItemZh: plan.grammarItemZh,
                languageSkill: plan.languageSkill,
                languageSkillZh: plan.languageSkillZh,
                difficulty: plan.difficulty,
                gradeLevel: studentLevel,
                count: plan.count,
                questionType: plan.questionType,
                topic: plan.topic,
              }),
            })
              .then(r => r.json())
              .then(data => ({ ...data, __skill: plan.languageSkill, __skillCategory: plan.skillCategory, __grammar: plan.grammarItem, __grammarZh: plan.grammarItemZh }))
          )
        );

        const allQuestions: PracticeQuestion[] = [];
        let questionId = 0;

        const addQuestions = (res: { questions?: Array<{ id?: string; prompt: string; choices?: string[]; answer: string; type?: string; listeningContent?: string; listeningContentZh?: string; readingContent?: string; readingContentZh?: string; explanationZh?: string; explanationEn?: string; commonMistake?: string }> }, skill?: string, skillCategory?: string, grammar?: string, grammarZh?: string) => {
          (res.questions || []).forEach((q) => {
            // R3.10-L: 保留伺服器回傳的題目 id（GrammarQuestion 持久化 id），
            // 只有非文法技能沒有伺服器 id 時才用本地 diag-N 後備。
            allQuestions.push({
              id: q.id || `diag-${++questionId}`,
              type: (q.type || 'mc') as PracticeQuestion['type'],
              strand: 'knowledge',
              prompt: q.prompt,
              choices: q.choices || undefined,
              answer: q.answer,
              grammarItem: grammar as PracticeQuestion['grammarItem'],
              languageSkill: skill as PracticeQuestion['languageSkill'],
              subSkill: skillCategory || grammar || skill || 'diagnostic',
              subSkillZh: grammarZh || (grammar === 'tenses' ? '時態' : grammar === 'phrasal-verbs' ? '詞彙' : skill === 'reading' ? '閱讀理解' : skill === 'writing' ? '寫作' : skill === 'listening' ? '聆聽理解' : skill === 'vocabulary' ? '詞彙應用' : '診斷測試'),
              difficulty: 'core',
              gradeLevel: 'S4',
              keyStage: 'KS4',
              explanationZh: q.explanationZh || '',
              explanationEn: q.explanationEn || '',
              commonMistake: q.commonMistake || '',
              hintLevels: [],
              listeningContent: q.listeningContent,
              listeningContentZh: q.listeningContentZh,
              readingContent: q.readingContent,
              readingContentZh: q.readingContentZh,
            });
          });
        };

        for (const response of aiResponses) {
          addQuestions(response, response.__skill, response.__skillCategory, response.__grammar, response.__grammarZh);
        }

        if (allQuestions.length > 0) {
          setQuestions(allQuestions);
        } else {
          setGenError(t('diagnostic.loadFailed'));
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : t('diagnostic.connectionFailed');
        setGenError(message);
      })
      .finally(() => setLoadingQuestions(false));
  }, []);

  // Update writing score when CLO analysis completes (replaces placeholder -1)
  useEffect(() => {
    if (!writingAnalysis || !completed) return;
    setResults(prev => prev.map(r => {
      if (r.id !== 'writing') return r;
      // Convert CLO scores (each /7) to percentage
      const { contentScore, languageScore, organizationScore } = writingAnalysis;
      const scores = [contentScore, languageScore, organizationScore].filter((s): s is number => typeof s === 'number' && s > 0);
      if (scores.length === 0) return r;
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const percentage = Math.round((avgScore / 7) * 100);
      return {
        ...r,
        score: percentage,
        level: percentage >= 80 ? t('diagnostic.levelChallenge') : percentage >= 50 ? t('diagnostic.levelCore') : t('diagnostic.levelRemedial'),
      };
    }));
  }, [writingAnalysis, completed, t]);

  // Fetch peer averages when results are computed
  useEffect(() => {
    if (!completed || !studentProfile) return;
    const gradeLevel = getStudentLevel(studentProfile);
    fetch(`/api/diagnostic/stats?gradeLevel=${encodeURIComponent(gradeLevel)}`)
      .then(r => r.json())
      .then(data => { if (data.averages) setPeerAverages(data.averages); })
      .catch(() => { /* non-critical */ });
  }, [completed, studentProfile]);

  // 載入中
  if (loadingQuestions) {
    return (
      <div className="text-center py-20">
        <Loader2 className="w-10 h-10 animate-spin text-teal-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('diagnostic.title')}</h2>
        <p className="text-gray-500 dark:text-gray-400">{t('diagnostic.aiGenerating')}</p>
      </div>
    );
  }

  // 生成失敗
  if (genError || questions.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('diagnostic.title')}</h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-4">
          {genError || t('diagnostic.cannotGenerate')}
        </p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-teal-500 text-white rounded-lg text-sm">
          {t('diagnostic.reload')}
        </button>
      </div>
    );
  }

  const currentQ = questions[currentStep];
  const totalSteps = questions.length;

  // 技能分類
  const skills = [
    { id: 'grammar', labelKey: 'diagnostic.skillGrammar', icon: BookOpen, descriptionKey: 'diagnostic.grammarDesc' },
    { id: 'vocabulary', labelKey: 'diagnostic.skillVocab', icon: BookOpen, descriptionKey: 'diagnostic.vocabDesc' },
    { id: 'reading', labelKey: 'diagnostic.skillReading', icon: FileText, descriptionKey: 'diagnostic.readingDesc' },
    { id: 'listening', labelKey: 'diagnostic.skillListening', icon: Headphones, descriptionKey: 'diagnostic.listeningDesc' },
    { id: 'writing', labelKey: 'diagnostic.skillWriting', icon: Pencil, descriptionKey: 'diagnostic.writingDesc' },
  ];

  const diagnosticLevelLabels: Record<string, string> = {
    '核心': 'diagnostic.levelCore',
    '補底': 'diagnostic.levelRemedial',
    '挑戰': 'diagnostic.levelChallenge',
  };

  const handleAnswer = (answer: string) => {
    if (answeredCurrent) return; // prevent double-submit
    const isCorrect = checkAnswer(answer, currentQ.answer, currentQ.type, currentQ.choices);
    answersRef.current = { ...answersRef.current, [currentQ.id]: answer };
    setLastAnswerCorrect(isCorrect);
    setShowFeedback(true);
    setAnsweredCurrent(true);
  };

  const handleNext = () => {
    setShowFeedback(false);
    setLastAnswerCorrect(null);
    setAnsweredCurrent(false);
    setWritingAnswer('');
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    const finalAnswers = answersRef.current;
    setCompleted(true);

    // 計算各技能分數 — use subSkill (skillCategory) for grammar vs vocabulary distinction
    const skillScores: Record<string, { correct: number; total: number }> = {};
    for (const q of questions) {
      const key = q.languageSkill || (q.subSkill === 'vocabulary' ? 'vocabulary' : 'grammar');
      if (!skillScores[key]) skillScores[key] = { correct: 0, total: 0 };
      skillScores[key].total++;
      const userAnswer = finalAnswers[q.id] || '';
      if (checkAnswer(userAnswer, q.answer, q.type, q.choices)) {
        skillScores[key].correct++;
      }
    }

    const computed: DiagnosticResult[] = [
      {
        id: 'grammar', label: t('diagnostic.skillGrammar'),
        score: skillScores.grammar ? Math.round((skillScores.grammar.correct / skillScores.grammar.total) * 100) : 0,
        totalQuestions: skillScores.grammar?.total ?? 0,
        level: getLevelLabel(skillScores.grammar),
        suggestion: '',
      },
      {
        id: 'vocabulary', label: t('diagnostic.skillVocab'),
        score: skillScores.vocabulary ? Math.round((skillScores.vocabulary.correct / skillScores.vocabulary.total) * 100) : 0,
        totalQuestions: skillScores.vocabulary?.total ?? 0,
        level: getLevelLabel(skillScores.vocabulary),
        suggestion: '',
      },
      {
        id: 'reading', label: t('diagnostic.skillReading'),
        score: skillScores.reading ? Math.round((skillScores.reading.correct / skillScores.reading.total) * 100) : 0,
        totalQuestions: skillScores.reading?.total ?? 0,
        level: getLevelLabel(skillScores.reading),
        suggestion: '',
      },
      {
        id: 'listening', label: t('diagnostic.skillListening'),
        score: skillScores.listening ? Math.round((skillScores.listening.correct / skillScores.listening.total) * 100) : 0,
        totalQuestions: skillScores.listening?.total ?? 0,
        level: getLevelLabel(skillScores.listening),
        suggestion: '',
      },
      {
        id: 'writing', label: t('diagnostic.skillWriting'),
        // Writing is purely CLO-based (qualitative) — show placeholder until AI analysis completes
        score: -1, // -1 = pending CLO analysis
        totalQuestions: skillScores.writing?.total ?? 0,
        level: t('diagnostic.levelPending'),
        suggestion: '',
      },
    ];

    setResults(computed);

    // 持久化診斷結果到 DB + 累積同年級統計
    if (studentProfile?.id) {
      fetch('/api/diagnostic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentProfile.id,
          results: computed.map(r => ({
            skill: r.id, skillZh: r.label, accuracy: r.score,
            weakAreas: r.score < 60 ? [r.id] : [],
            recommendedGrammar: r.id === 'grammar' ? (r.score < 60 ? 'tenses' : undefined) : undefined,
            recommendedSkill: r.id === 'reading' ? 'reading' : r.id === 'writing' ? 'writing' : undefined,
          })),
        }),
      }).catch((e) => { logger.error({ module: 'student-diagnostic', error: e instanceof Error ? e.message : String(e) }, 'Diagnostic save failed'); });

      // Accumulate scores for peer comparison
      fetch('/api/diagnostic/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gradeLevel: getStudentLevel(studentProfile),
          results: computed.map(r => ({ skill: r.id, score: r.score, totalQuestions: r.totalQuestions })),
        }),
      }).catch(() => { /* non-critical */ });
    }

    // 🎮 記錄診斷完成 XP
    if (studentProfile?.id) {
      fetch('/api/gamification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentProfile.id,
          event: { type: 'completeDiagnostic' },
        }),
      }).catch((e) => { logger.error({ module: 'student-diagnostic', error: e instanceof Error ? e.message : String(e) }, 'Gamification completeDiagnostic XP failed'); });
    }

    // AI 寫作批改（CLO 框架）
    const writingQ = questions.find(q => q.languageSkill === 'writing' || q.type === 'short-writing');
    const writingText = writingQ ? (finalAnswers[writingQ.id] || '') : '';
    let writingPercentage: number | null = null;
    if (writingText.trim()) {
      setWritingLoading(true);
      try {
        const wRes = await fetch('/api/ai/analyze-writing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: writingQ?.prompt?.slice(0, 80) || 'Diagnostic Writing',
            prompt: writingQ?.prompt || '',
            studentDraft: writingText,
            gradeLevel: getStudentLevel(studentProfile),
            difficulty: 'core',
          }),
        });
        const wJson = await wRes.json();
        if (wRes.ok && wJson.analysis) {
          setWritingAnalysis(wJson.analysis);
          // Convert CLO scores (each /7) to a percentage so the AI advice
          // matches the on-screen writing result (93% not 100%).
          const { contentScore, languageScore, organizationScore } = wJson.analysis;
          const scores = [contentScore, languageScore, organizationScore]
            .filter((s): s is number => typeof s === 'number' && s > 0);
          if (scores.length > 0) {
            writingPercentage = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length / 7) * 100);
          }
        }
      } catch { /* non-critical */ }
      finally { setWritingLoading(false); }
    }

    // AI 分析報告
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/analyze-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // No studentId: base this advice on the just-completed diagnostic
          // (narrative context). Passing studentId would make the server read
          // the trusted practice history (user.overallAccuracy), which is 0
          // for a new student and contradicts the on-screen diagnostic score.
          studentLevel: getStudentLevel(studentProfile),
          overallAccuracy: (() => {
            // Include writing once its CLO analysis is ready (score < 0 = pending).
            const tested = computed.filter(r => r.totalQuestions > 0 && r.score >= 0);
            const scores = tested.map(r => r.score);
            if (writingPercentage !== null) scores.push(writingPercentage);
            return scores.length > 0
              ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
              : 0;
          })(),
          weakSkills: (() => {
            const list = computed
              .filter(r => r.score >= 0 && r.totalQuestions > 0 && r.score < 60)
              .map(r => ({ name: r.id, nameZh: r.label, accuracy: r.score }));
            if (writingPercentage !== null && writingPercentage < 60) {
              list.push({ name: 'writing', nameZh: t('diagnostic.skillWriting'), accuracy: writingPercentage });
            }
            return list;
          })(),
          recentPerformance,
          streakDays: studentProfile?.streakDays ?? 0,
        }),
      });
      const json = await res.json();
      if (res.ok && json.analysis) {
        setAiReport(json.analysis.summary || '');
      }
    } catch (e) { logger.error({ module: 'student-diagnostic', error: e instanceof Error ? e.message : String(e) }, 'Failed to analyze diagnostic progress'); }
    finally { setAiLoading(false); }
  };

  // ====== 開始畫面 ======
  if (!started) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('diagnostic.title2')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">{t('diagnostic.title2Desc', { n: totalSteps })}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">{t('diagnostic.content')}</h2>
          <div className="space-y-3">
            {skills.map((s) => (
              <div key={s.id} className="flex gap-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div className="w-10 h-10 bg-teal-100 dark:bg-teal-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                  <s.icon className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">{t(s.labelKey)}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t(s.descriptionKey)}</p>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setStarted(true)}
            className="mt-6 w-full py-3 bg-teal-500 hover:bg-teal-600 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors">
            {t('diagnostic.startBtn')} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">{t('diagnostic.disclaimer')}</p>
        </div>
      </div>
    );
  }

  // ====== 答題畫面 ======
  if (!completed) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('diagnostic.assessment')}</h1>
          <span className="text-sm text-gray-500">{t('diagnostic.questionN', { current: currentStep + 1, total: totalSteps })}</span>
        </div>
        <ProgressBar value={currentStep + 1} max={totalSteps} size="sm" showPercentage={false} />

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <SkillChip grammarItem={currentQ.grammarItem} languageSkill={currentQ.languageSkill} subSkill={currentQ.subSkill} />
          </div>

          {/* 閱讀篇章 / 聆聽內容 / 題目內文 */}
          {(currentQ.languageSkill === 'reading' || currentQ.readingContent) && (
            <div className="mb-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-700">
              <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1">
                {currentQ.languageSkill === 'reading' ? `📖 ${t('diagnostic.skillReading')}` : '📝 題目內文'}
              </p>
              <p className="text-sm text-indigo-800 dark:text-indigo-200 leading-relaxed whitespace-pre-line">{currentQ.readingContent}</p>
              {currentQ.readingContentZh && <p className="text-xs text-indigo-500 mt-1 italic">{currentQ.readingContentZh}</p>}
            </div>
          )}
          {(currentQ.languageSkill === 'listening' || currentQ.listeningContent) && (
            <div className="mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-700">
              <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-2">
                🎧 {t('diagnostic.skillListening')}
              </p>
              <div className="mb-2">
                <AudioPlayer text={currentQ.listeningContent || ''} useCloudTTS={true} autoPlay={false} />
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 text-xs font-medium">
                  {t('diagnostic.showScript')}
                </summary>
                <div className="mt-2 pt-2 border-t border-purple-200 dark:border-purple-700">
                  <p className="text-purple-800 dark:text-purple-200 leading-relaxed whitespace-pre-line">{currentQ.listeningContent}</p>
                  {currentQ.listeningContentZh && <p className="text-xs text-purple-500 mt-1 italic">{currentQ.listeningContentZh}</p>}
                </div>
              </details>
            </div>
          )}

          <p className="text-lg text-gray-900 dark:text-white mb-6" dangerouslySetInnerHTML={{ __html: currentQ.prompt }} />

          {/* Per-question feedback with explanation */}
          {showFeedback && lastAnswerCorrect !== null && (
            <div className="mb-4 space-y-3">
              {currentQ.languageSkill === 'writing' || currentQ.type === 'short-writing' ? (
                <div className="p-4 rounded-xl text-sm bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400">
                  <p className="font-semibold mb-1">{t('diagnostic.writingSubmitted')}</p>
                  <p>{t('diagnostic.writingSubmittedDesc')}</p>
                </div>
              ) : (
                <div className={`p-4 rounded-xl text-sm ${
                  lastAnswerCorrect
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                }`}>
                  <p className="font-semibold mb-1">
                    {lastAnswerCorrect ? t('diagnostic.correctBadge') : t('diagnostic.wrongBadge')}
                  </p>
                  {!lastAnswerCorrect && (
                    <p className="mb-1">{t('diagnostic.correctAnswer')}<strong>{currentQ.answer}</strong></p>
                  )}
                  {currentQ.explanationZh && (
                    <p className="text-xs mt-2 opacity-80">{currentQ.explanationZh}</p>
                  )}
                  {currentQ.commonMistake && (
                    <p className="text-xs mt-1 italic opacity-70">⚠️ {currentQ.commonMistake}</p>
                  )}
                </div>
              )}
              <button onClick={handleNext}
                className="w-full py-2.5 bg-teal-500 hover:bg-teal-600 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2">
                {currentStep < totalSteps - 1 ? t('diagnostic.nextQuestion') : t('diagnostic.viewResults')}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {currentQ.promptZh && (
            <details className="mb-4">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">{t('diagnostic.showChineseHints')}</summary>
              <p className="text-sm text-gray-500 mt-1 italic">{currentQ.promptZh}</p>
            </details>
          )}

          {currentQ.choices && currentQ.choices.length > 0 ? (
            <div className="space-y-3">
              {currentQ.choices.map((choice, index) => {
                const choiceLetter = toMcqLetter(index) ?? '';
                const choiceText = stripMcqPrefix(choice);
                return (
                  <button key={`${index}-${choice}`} onClick={() => handleAnswer(choiceLetter)}
                    disabled={answeredCurrent}
                    className={`w-full text-left p-4 border-2 rounded-xl transition-colors text-gray-700 dark:text-gray-300 ${
                      answeredCurrent
                        ? choiceLetter === currentQ.answer?.toUpperCase()
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-600 opacity-60'
                        : 'border-gray-200 dark:border-gray-600 hover:border-teal-400'
                    }`}>
                    <span className="font-bold mr-2">{choiceLetter}.</span>{choiceText}
                  </button>
                );
              })}
            </div>
          ) : (
            <div>
              {currentQ.languageSkill === 'writing' || currentQ.type === 'short-writing' ? (
                <>
                  <textarea
                    value={writingAnswer}
                    onChange={(e) => setWritingAnswer(e.target.value)}
                    placeholder={t('diagnostic.writingPlaceholder') || 'Write your essay here...'}
                    rows={12}
                    disabled={answeredCurrent}
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:border-teal-400 resize-y disabled:opacity-50 text-base leading-relaxed"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm text-gray-500">
                      <strong>{writingAnswer.trim() ? writingAnswer.trim().split(/\s+/).length : 0}</strong> words / {writingAnswer.length} chars
                    </span>
                    {writingAnswer.trim() && writingAnswer.trim().split(/\s+/).length < 30 && (
                      <span className="text-xs text-amber-500">{t('diagnostic.minWordsSuggestion')}</span>
                    )}
                  </div>
                  <button onClick={() => handleAnswer(writingAnswer)} disabled={answeredCurrent || !writingAnswer.trim()}
                    className="mt-3 px-4 py-2 bg-teal-500 text-white rounded-lg text-sm disabled:opacity-50">{t('diagnostic.submit')}</button>
                </>
              ) : (
                <>
                  <input
                    ref={inputRef}
                    type="text"
                    disabled={answeredCurrent}
                    placeholder={t('diagnostic.inputAnswer')}
                    onKeyDown={(e) => { if (e.key === 'Enter' && inputRef.current && !answeredCurrent) handleAnswer(inputRef.current.value); }}
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:border-teal-400 disabled:opacity-50"
                  />
                  <button onClick={() => { if (inputRef.current && !answeredCurrent) handleAnswer(inputRef.current.value); }} disabled={answeredCurrent}
                    className="mt-3 px-4 py-2 bg-teal-500 text-white rounded-lg text-sm disabled:opacity-50">{t('diagnostic.submit')}</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ====== 結果畫面 ======
  const testedResults = results.filter(r => r.totalQuestions > 0);
  // Exclude writing (score === -1 means pending CLO) from overall average
  const quantResults = testedResults.filter(r => r.id !== 'writing' || r.score >= 0);
  const overallScore = quantResults.length > 0
    ? Math.round(quantResults.reduce((s, r) => s + r.score, 0) / quantResults.length)
    : 0;
  const recommendation = buildPracticeRecommendation(results, getStudentLevel(studentProfile));
  const practiceHref = `/student/practice?mode=diagnostic&grammarItem=${encodeURIComponent(recommendation.grammarItem || '')}&languageSkill=${encodeURIComponent(recommendation.languageSkill || '')}&difficulty=${recommendation.difficulty}&questionType=${recommendation.questionType}&questionCount=${recommendation.questionCount}&gradeLevel=${encodeURIComponent(getStudentLevel(studentProfile))}&weakLabel=${encodeURIComponent(recommendation.weakLabel)}`;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
          <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('diagnostic.complete')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">{t('diagnostic.completeDesc')}</p>
      </div>

      {/* 總體評分 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900 dark:text-white">{t('diagnostic.overallLevel')}</h2>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${overallScore >= 60 ? 'bg-teal-100 text-teal-700' : 'bg-orange-100 text-orange-700'}`}>
            {overallScore >= 70 ? t('diagnostic.coreToChallenge') : overallScore >= 50 ? t('diagnostic.remedialToCore') : t('diagnostic.remedial')}
          </span>
        </div>
        <ProgressBar value={overallScore} size="lg" label={t('diagnostic.comprehensive')} />
      </div>

      {/* 各技能結果 */}
      <div className="space-y-3">
        {results.map((r) => (
          <div key={r.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-900 dark:text-white">{r.label}</h3>
              {r.totalQuestions === 0 ? (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
                  {t('diagnostic.notTested')}
                </span>
              ) : (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.score >= 60 ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                  {r.score >= 70 ? t('diagnostic.challenge') : r.score >= 50 ? t('diagnostic.core') : t('diagnostic.remedial')}
                </span>
              )}
            </div>
            {r.totalQuestions === 0 ? (
              <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full">
                <div className="h-2 bg-gray-300 dark:bg-gray-600 rounded-full" style={{ width: '0%' }} />
              </div>
            ) : r.score < 0 ? (
              <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full">
                <div className="h-2 bg-blue-300 dark:bg-blue-600 rounded-full animate-pulse" style={{ width: '100%' }} />
              </div>
            ) : (
              <ProgressBar value={r.score} size="sm" showPercentage={true} />
            )}
            {peerAverages?.[r.id] && peerAverages[r.id].count > 0 && r.score >= 0 && (
              <div className="mt-1.5 flex items-center gap-2 text-xs">
                <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full relative">
                  <div
                    className="absolute top-0 h-1.5 w-0.5 bg-gray-400 dark:bg-gray-500 rounded-full"
                    style={{ left: `${Math.min(peerAverages[r.id].avg, 100)}%` }}
                    title={`同級平均: ${peerAverages[r.id].avg}%`}
                  />
                </div>
                <span className="text-gray-400 whitespace-nowrap">
                  同級均值 {peerAverages[r.id].avg}%
                  <span className="text-gray-300 ml-0.5">(n={peerAverages[r.id].count})</span>
                </span>
              </div>
            )}
            {r.id === 'writing' && (
              <div className="mt-2">
                {writingLoading ? (
                  <p className="text-xs text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> {t('diagnostic.aiGradingWriting')}</p>
                ) : writingAnalysis ? (
                  <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">{t('diagnostic.cloWritingScore')}</span>
                      {writingAnalysis.dseLevel && (
                        <span className="text-xs px-2 py-0.5 bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded-full font-bold"
                          title={lang === 'zh' ? '平台內部寫作估算，並非 HKEAA 官方等級' : 'Platform internal estimate, not official HKEAA grade'}>
                          {lang === 'zh' ? '平台估算' : 'Est.'} {writingAnalysis.dseLevel}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="bg-white dark:bg-gray-700 rounded-lg p-2">
                        <div className="font-bold text-blue-600">{writingAnalysis.contentScore ?? '—'}/7</div>
                        <div className="text-gray-400">Content</div>
                      </div>
                      <div className="bg-white dark:bg-gray-700 rounded-lg p-2">
                        <div className="font-bold text-blue-600">{writingAnalysis.languageScore ?? '—'}/7</div>
                        <div className="text-gray-400">Language</div>
                      </div>
                      <div className="bg-white dark:bg-gray-700 rounded-lg p-2">
                        <div className="font-bold text-blue-600">{writingAnalysis.organizationScore ?? '—'}/7</div>
                        <div className="text-gray-400">Organization</div>
                      </div>
                    </div>
                    {writingAnalysis.strengths && writingAnalysis.strengths.length > 0 && (
                      <p className="text-xs text-green-700 dark:text-green-400">👍 {writingAnalysis.strengths.slice(0, 2).join('；')}</p>
                    )}
                    {writingAnalysis.weaknesses && writingAnalysis.weaknesses.length > 0 && (
                      <p className="text-xs text-red-700 dark:text-red-400">💡 {writingAnalysis.weaknesses.slice(0, 2).join('；')}</p>
                    )}
                    {/* Sprint 131: CLO Dimension Rationale */}
                    <CloFeedbackPanel cloRationales={writingAnalysis.cloRationales} language={lang} />
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">{t('diagnostic.writingQualitative')}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* AI 分析報告 */}
      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-2xl p-6 border border-purple-200 dark:border-purple-800">
        <h3 className="font-semibold text-purple-800 dark:text-purple-200 mb-3 flex items-center gap-2">
          <Sparkles className="w-5 h-5" /> {t('diagnostic.aiAdvice')}
        </h3>
        {aiLoading ? (
          <div className="flex items-center gap-2 text-purple-600"><Loader2 className="w-4 h-4 animate-spin" />{t('diagnostic.analyzing')}</div>
        ) : aiReport ? (
          <>
            <p className="text-sm text-purple-700 dark:text-purple-300">{aiReport}</p>
            <p className="text-xs text-purple-500 dark:text-purple-400 mt-2">
              {language === 'en'
                ? 'This advice is based on your self-reported diagnostic results, not your verified practice history.'
                : '此建議基於你剛完成的診斷自評結果，並非已驗證的練習紀錄。'}
            </p>
          </>
        ) : (
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            {results.filter(r => r.score < 60).map(r => (
              <p key={r.id}>• <strong>{r.label}</strong>：{t('diagnostic.remedialAdvice')}</p>
            ))}
            {results.filter(r => r.score >= 60).map(r => (
              <p key={r.id}>• <strong>{r.label}</strong>：{t('diagnostic.coreAdvice')}</p>
            ))}
          </div>
        )}
      </div>

      <div className="bg-orange-50 dark:bg-orange-900/20 rounded-2xl p-5 border border-orange-200 dark:border-orange-800">
        <div className="flex items-center gap-2 mb-2 text-orange-700 dark:text-orange-300 font-semibold">
          <Target className="w-5 h-5" /> {t('diagnostic.targetedPractice')}
        </div>
        <p className="text-sm text-orange-800 dark:text-orange-200 mb-4">
          {recommendation.difficulty === 'remedial'
            ? t('diagnostic.remedialAdvice')
            : recommendation.difficulty === 'challenge'
              ? t('diagnostic.challengeAdvice')
              : t('diagnostic.coreAdvice')}
        </p>
        <a href={practiceHref}
          className="block w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-xl text-center transition-colors">
          {t('diagnostic.startPractice')} <ArrowRight className="w-4 h-4 inline ml-1" />
        </a>
      </div>

      <a href="/student/dashboard"
        className="block w-full py-3 bg-teal-500 hover:bg-teal-600 text-white font-medium rounded-xl text-center transition-colors">
        {t('diagnostic.goDashboard')} <ArrowRight className="w-4 h-4 inline ml-1" />
      </a>
    </div>
  );
}
