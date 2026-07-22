// ============================================
// 學生端 — Speaking Practice (DSE Paper 4)
// Mock 練習：生成題目 → 計時練習 → AI 分析文本
// ============================================
'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, Sparkles, Loader2, Clock, MessageCircle, ChevronDown, ChevronUp, Target, Lightbulb, Play, Square, RotateCcw, AlertTriangle } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { getGradeLabel, getDifficultyLabel } from '@/shared/utils/nav';

interface SpeakingQuestion {
  topic: string;
  scenario: string;
  discussionQuestions: string[];
  individualQuestion: string;
  vocabularyHints: string[];
  timeLimit: number;
}

interface SpeakingAnalysis {
  grammarAccuracy: { score: number; comment: string };
  vocabularyRange: { score: number; comment: string };
  contentRelevance: { score: number; comment: string };
  overallComment: string;
  improvementTips: string[];
  limitationNote: string;
}

const GRADES = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] as const;
const DIFFICULTIES = [
  { value: 'remedial' as const, zh: '補底', en: 'Remedial' },
  { value: 'core' as const, zh: '核心', en: 'Core' },
  { value: 'challenge' as const, zh: '挑戰', en: 'Challenge' },
];
const TOPICS_AREA = [
  { value: 'general', zh: '綜合', en: 'General' },
  { value: 'school', zh: '學校', en: 'School' },
  { value: 'social', zh: '社會', en: 'Social Issues' },
  { value: 'technology', zh: '科技', en: 'Technology' },
  { value: 'environment', zh: '環境', en: 'Environment' },
] as const;

export default function SpeakingPracticePage() {
  const { language, userId } = useAppStore();

  const [grade, setGrade] = useState<string>('S4');
  const [difficulty, setDifficulty] = useState<string>('core');
  const [topic, setTopic] = useState<string>('general');

  // Auto-load grade from student profile
  useEffect(() => {
    fetch('/api/auth/profile')
      .then(r => r.json())
      .then(data => {
        const studentLevel = data?.user?.level || data?.user?.class?.gradeLevel;
        if (studentLevel && ['S1','S2','S3','S4','S5','S6'].includes(studentLevel)) {
          setGrade(studentLevel);
        }
      })
      .catch(() => { /* silent */ });
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState<SpeakingQuestion | null>(null);
  const [transcript, setTranscript] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<SpeakingAnalysis | null>(null);
  const [showHints, setShowHints] = useState(false);
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(10);

  // Timer
  const [timerRunning, setTimerRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function startTimer(seconds: number) {
    setTimeLeft(seconds);
    setTimerRunning(true);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerRunning(false);
  }

  async function generateQuestion() {
    setLoading(true); setError(''); setAnalysis(null); setTranscript('');
    try {
      const res = await fetch('/api/speaking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradeLevel: grade, difficulty, topic, mode: 'mock' }),
      });
      const json = await res.json();
      if (res.ok && json.mockQuestion) {
        setQuestion(json.mockQuestion);
      } else {
        setError(json.error || 'Generation failed');
      }
    } catch {
      setError(language === 'en' ? 'Network error' : '網絡錯誤');
    } finally {
      setLoading(false);
    }
  }

  async function analyzeTranscript() {
    if (!transcript.trim()) return;
    setAnalyzing(true);
    try {
      const res = await fetch('/api/speaking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, gradeLevel: grade, difficulty, mode: 'practice' }),
      });
      const json = await res.json();
      if (res.ok && json.analysis) {
        setAnalysis(json.analysis);
        // 儲存練習記錄到學生分析
        if (userId) {
          fetch('/api/practice', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              studentId: userId, skill: 'speaking', skillZh: '會話練習',
              difficulty, totalQuestions: 1, correctCount: 1, source: 'dse-speaking',
            }),
          }).catch(() => {});
        }
      } else {
        setError(json.error || 'Analysis failed');
      }
    } catch {
      setError(language === 'en' ? 'Network error' : '網絡錯誤');
    } finally {
      setAnalyzing(false);
    }
  }

  function resetAll() {
    if (timerRef.current) clearInterval(timerRef.current);
    setQuestion(null);
    setTranscript('');
    setAnalysis(null);
    setTimerRunning(false);
    setTimeLeft(0);
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-500 to-rose-600 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Mic className="w-6 h-6" /> {language === 'en' ? 'Speaking Practice' : '會話練習'}
        </h1>
        <p className="text-pink-100 text-sm mt-1">
          {language === 'en' ? 'DSE Paper 4 — Group Discussion & Individual Response' : 'DSE Paper 4 — 小組討論與個人回應'}
        </p>
      </div>

      {/* ⚠️ Limitation Notice */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="text-sm text-amber-800 dark:text-amber-300">
          <p className="font-medium mb-1">
            {language === 'en' ? '⚠️ Current Limitations' : '⚠️ 目前限制'}
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-amber-700 dark:text-amber-400">
            <li>{language === 'en' ? 'Cannot simulate real-time human-machine conversation' : '未能做到即時人機對答'}</li>
            <li>{language === 'en' ? 'Cannot fully simulate a live DSE Paper 4 oral exam (Group Discussion + Individual Response)' : '未能完整模擬 DSE Paper 4 口語考試（小組討論 + 個人回應）'}</li>
            <li>{language === 'en' ? 'Practice by typing your response; AI will analyze your text for grammar, vocabulary, and content quality' : '請以文字輸入你的回應，AI 將分析你的文法、詞彙及內容質素'}</li>
          </ul>
        </div>
      </div>

      {/* Config */}
      {!question && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'en' ? 'Grade' : '年級'}</label>
              <div className="flex flex-wrap gap-1">
                {GRADES.map(g => (
                  <button key={g} onClick={() => setGrade(g)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${grade === g ? 'bg-pink-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                    {getGradeLabel(g, language)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'en' ? 'Difficulty' : '難度'}</label>
              <div className="flex flex-wrap gap-1">
                {DIFFICULTIES.map(d => (
                  <button key={d.value} onClick={() => setDifficulty(d.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${difficulty === d.value ? 'bg-pink-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                    {getDifficultyLabel(d.value, language)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'en' ? 'Topic Area' : '話題範圍'}</label>
              <div className="flex flex-wrap gap-1">
                {TOPICS_AREA.map(tp => (
                  <button key={tp.value} onClick={() => setTopic(tp.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${topic === tp.value ? 'bg-pink-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                    {language === 'en' ? tp.en : tp.zh}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button onClick={generateQuestion} disabled={loading}
            className="w-full py-3 bg-pink-500 text-white rounded-xl font-medium hover:bg-pink-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? (language === 'en' ? 'Generating...' : '生成中...') : (language === 'en' ? 'Generate Speaking Question' : '生成會話題目')}
          </button>
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
        </div>
      )}

      {/* Question Display */}
      {question && (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border space-y-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{question.topic}</h2>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-sm text-gray-700 dark:text-gray-300">
              {question.scenario}
            </div>

            {/* Discussion Questions */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase">
                {language === 'en' ? 'Discussion Questions' : '討論問題'}
              </p>
              {question.discussionQuestions.map((q, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-pink-500 font-bold">{i + 1}.</span>
                  <span>{q}</span>
                </div>
              ))}
            </div>

            {/* Individual Question */}
            <div className="bg-pink-50 dark:bg-pink-900/20 rounded-xl p-4 border border-pink-200 dark:border-pink-800">
              <p className="text-xs font-medium text-pink-600 dark:text-pink-400 mb-1">
                {language === 'en' ? 'Individual Response' : '個人回應'}
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{question.individualQuestion}</p>
            </div>

            {/* Vocabulary Hints */}
            <button onClick={() => setShowHints(!showHints)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors">
              <Lightbulb className="w-3 h-3" />
              {language === 'en' ? 'Vocabulary Hints' : '詞彙提示'} ({question.vocabularyHints.length})
              {showHints ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showHints && (
              <div className="flex flex-wrap gap-1.5">
                {question.vocabularyHints.map((h, i) => (
                  <span key={i} className="px-2 py-0.5 bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300 rounded-full text-xs border border-pink-200 dark:border-pink-800">
                    {h}
                  </span>
                ))}
              </div>
            )}

            {/* Prep Time + Timer */}
            <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <Clock className={`w-5 h-5 ${timerRunning ? 'text-pink-500 animate-pulse' : 'text-gray-400'}`} />
                <span className="text-2xl font-mono font-bold text-gray-900 dark:text-white">
                  {timerRunning ? formatTime(timeLeft) : formatTime(prepTimeMinutes * 60)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {!timerRunning && (
                  <div className="flex items-center gap-1 bg-white dark:bg-gray-600 rounded-lg px-2 py-1">
                    <button onClick={() => setPrepTimeMinutes(p => Math.max(1, p - 1))}
                      className="w-6 h-6 rounded text-xs font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-500 transition-colors">−</button>
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300 w-8 text-center">{prepTimeMinutes} min</span>
                    <button onClick={() => setPrepTimeMinutes(p => Math.min(30, p + 1))}
                      className="w-6 h-6 rounded text-xs font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-500 transition-colors">+</button>
                  </div>
                )}
                <div className="flex gap-2">
                  {!timerRunning ? (
                    <button onClick={() => startTimer(prepTimeMinutes * 60)}
                      className="p-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors">
                      <Play className="w-4 h-4" />
                    </button>
                  ) : (
                    <button onClick={stopTimer}
                      className="p-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors">
                      <Square className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => { stopTimer(); setTimeLeft(prepTimeMinutes * 60); }}
                    className="p-2 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Transcript Input */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-pink-500" />
              {language === 'en' ? 'Your Speaking Transcript' : '你的口語記錄'}
            </h3>
            <p className="text-xs text-gray-500">
              {language === 'en'
                ? 'Type what you said during practice (or use voice typing on your device)'
                : '輸入你在練習時說的內容（或使用裝置語音輸入）'}
            </p>
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              className="w-full min-h-[120px] p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 text-sm resize-y"
              placeholder={language === 'en' ? 'Paste your transcript here...' : '在此貼上你的說話記錄...'}
            />
            <button onClick={analyzeTranscript} disabled={analyzing || !transcript.trim()}
              className="w-full py-2.5 bg-pink-500 text-white rounded-xl font-medium hover:bg-pink-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {analyzing ? (language === 'en' ? 'Analyzing...' : '分析中...') : (language === 'en' ? 'AI Analyze My Speaking' : 'AI 分析我的口語')}
            </button>
          </div>

          {/* Analysis Results */}
          {analysis && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border space-y-4">
              {/* ⚠️ Limitation Banner */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    {language === 'en' ? '⚠️ Content-Only Analysis' : '⚠️ 僅內容分析（非完整口語評估）'}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    {analysis.limitationNote || (language === 'en'
                      ? 'AI can only analyze grammar, vocabulary, and content from your text transcript. Fluency, pronunciation, and interaction cannot be assessed without audio recording.'
                      : 'AI 只能從文字記錄分析文法、詞彙及內容相關性。由於無法聆聽錄音，無法評估流暢度、發音及互動表現。')}
                  </p>
                </div>
              </div>

              <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                {language === 'en' ? 'AI Content Analysis' : 'AI 內容分析'}
              </h3>

              {(['grammarAccuracy', 'vocabularyRange', 'contentRelevance'] as const).map(dim => (
                <div key={dim} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-600 dark:text-gray-300">
                    {analysis[dim]?.score ?? '?'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">{dim.replace(/([A-Z])/g, ' $1')}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{analysis[dim]?.comment ?? ''}</p>
                  </div>
                </div>
              ))}

              <div className="bg-pink-50 dark:bg-pink-900/20 rounded-xl p-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">{analysis.overallComment}</p>
              </div>

              {analysis.improvementTips && analysis.improvementTips.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">
                    {language === 'en' ? 'Improvement Tips' : '改善建議'}
                  </p>
                  <ul className="space-y-1">
                    {analysis.improvementTips.map((tip, i) => (
                      <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1">
                        <span className="text-pink-500">•</span> {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button onClick={resetAll}
                className="w-full py-2.5 border border-pink-200 dark:border-pink-800 text-pink-600 dark:text-pink-400 rounded-xl text-sm font-medium hover:bg-pink-50 dark:hover:bg-pink-900/20 transition-colors">
                {language === 'en' ? 'New Practice' : '新練習'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
