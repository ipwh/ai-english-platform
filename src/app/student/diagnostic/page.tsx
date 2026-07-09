// ============================================
// 學生端 — 診斷測試頁面
// 完整流程：選擇技能 → 逐題作答 → AI 分析報告
// ============================================
'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle, BookOpen, Pencil, FileText, Sparkles, Loader2, Target } from 'lucide-react';
import ProgressBar from '@/components/shared/ProgressBar';
import SkillChip from '@/components/shared/SkillChip';
import type { PracticeQuestion } from '@/lib/types';
import { useT } from '@/hooks/use-i18n';

interface DiagnosticResult {
  id: string;
  label: string;
  score: number;
  level: string;
  suggestion: string;
}

const diagnosticQuestions: PracticeQuestion[] = [];

export default function DiagnosticPage() {
  const { t } = useT();
  const [started, setStarted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [completed, setCompleted] = useState(false);
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState<string>('');

  const currentQ = diagnosticQuestions[currentStep];
  const totalSteps = diagnosticQuestions.length;

  // 技能分類
  const skills = [
    { id: 'grammar', label: '文法', icon: BookOpen, description: '時態、句型結構、詞性等' },
    { id: 'vocabulary', label: '詞彙', icon: BookOpen, description: '學術詞彙、搭配詞、片語動詞' },
    { id: 'reading', label: '閱讀', icon: FileText, description: '主旨理解、推論、詞義猜測' },
    { id: 'writing', label: '寫作', icon: Pencil, description: '句子結構、段落組織、表達能力' },
  ];

  const handleAnswer = (answer: string) => {
    setAnswers(prev => ({ ...prev, [currentQ.id]: answer }));
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // 完成所有題目，計算分數 + AI 分析
      handleComplete(answer);
    }
  };

  const handleComplete = async (lastAnswer: string) => {
    const finalAnswers = { ...answers, [currentQ.id]: lastAnswer };
    setCompleted(true);

    // 計算各技能分數
    const skillScores: Record<string, { correct: number; total: number }> = {};
    for (const q of diagnosticQuestions) {
      const key = q.grammarItem ? 'grammar' : q.languageSkill === 'reading' ? 'reading' : q.languageSkill === 'writing' ? 'writing' : 'vocabulary';
      if (!skillScores[key]) skillScores[key] = { correct: 0, total: 0 };
      skillScores[key].total++;
      const userAnswer = finalAnswers[q.id] || '';
      if (q.type === 'mc' && userAnswer.toUpperCase() === q.answer.toUpperCase()) {
        skillScores[key].correct++;
      } else if (q.type !== 'mc' && userAnswer.trim().toLowerCase() === q.answer.trim().toLowerCase()) {
        skillScores[key].correct++;
      }
    }

    const computed: DiagnosticResult[] = [
      {
        id: 'grammar', label: '文法',
        score: skillScores.grammar ? Math.round((skillScores.grammar.correct / skillScores.grammar.total) * 100) : 0,
        level: (skillScores.grammar?.correct || 0) >= 3 ? '核心' : '補底',
        suggestion: '',
      },
      {
        id: 'vocabulary', label: '詞彙',
        score: skillScores.vocabulary ? Math.round((skillScores.vocabulary.correct / skillScores.vocabulary.total) * 100) : 0,
        level: (skillScores.vocabulary?.correct || 0) >= 2 ? '核心' : '補底',
        suggestion: '',
      },
      {
        id: 'reading', label: '閱讀',
        score: skillScores.reading ? Math.round((skillScores.reading.correct / skillScores.reading.total) * 100) : 0,
        level: (skillScores.reading?.correct || 0) >= 2 ? '核心' : '補底',
        suggestion: '',
      },
      {
        id: 'writing', label: '寫作',
        score: skillScores.writing ? Math.round((skillScores.writing.correct / skillScores.writing.total) * 100) : 0,
        level: (skillScores.writing?.correct || 0) >= 1 ? '核心' : '補底',
        suggestion: '',
      },
    ];

    setResults(computed);

    // AI 分析報告
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/analyze-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentLevel: 'S4',
          overallAccuracy: Math.round(computed.reduce((s, r) => s + r.score, 0) / computed.length),
          weakSkills: computed.filter(r => r.score < 60).map(r => ({ name: r.id, nameZh: r.label, accuracy: r.score })),
          recentPerformance: [],
          streakDays: 0,
        }),
      });
      const json = await res.json();
      if (res.ok && json.analysis) {
        setAiReport(json.analysis.summary || '');
      }
    } catch { /* silent */ }
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
                  <h3 className="font-medium text-gray-900 dark:text-white">{s.label}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{s.description}</p>
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
          <p className="text-lg text-gray-900 dark:text-white mb-6">{currentQ.prompt}</p>
          {currentQ.promptZh && <p className="text-sm text-gray-500 mb-4 italic">{currentQ.promptZh}</p>}

          {currentQ.choices ? (
            <div className="space-y-3">
              {currentQ.choices.map((choice) => (
                <button key={choice.charAt(0)} onClick={() => handleAnswer(choice.charAt(0))}
                  className="w-full text-left p-4 border-2 border-gray-200 dark:border-gray-600 rounded-xl hover:border-teal-400 transition-colors text-gray-700 dark:text-gray-300">
                  <span className="font-bold mr-2">{choice.charAt(0)}.</span>{choice.slice(3)}
                </button>
              ))}
            </div>
          ) : (
            <div>
              <input type="text" placeholder={t('diagnostic.inputAnswer')} onKeyDown={(e) => { if (e.key === 'Enter') handleAnswer((e.target as HTMLInputElement).value); }}
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:border-teal-400" />
              <button onClick={() => { const el = document.querySelector('input') as HTMLInputElement; if (el) handleAnswer(el.value); }}
                className="mt-3 px-4 py-2 bg-teal-500 text-white rounded-lg text-sm">{t('diagnostic.submit')}</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ====== 結果畫面 ======
  const overallScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);

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
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.score >= 60 ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                {r.score >= 70 ? '挑戰' : r.score >= 50 ? '核心' : '補底'}
              </span>
            </div>
            <ProgressBar value={r.score} size="sm" showPercentage={true} />
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
          <p className="text-sm text-purple-700 dark:text-purple-300">{aiReport}</p>
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

      <Link href="/student/dashboard"
        className="block w-full py-3 bg-teal-500 hover:bg-teal-600 text-white font-medium rounded-xl text-center transition-colors">
        {t('diagnostic.goDashboard')} <ArrowRight className="w-4 h-4 inline ml-1" />
      </Link>
    </div>
  );
}
