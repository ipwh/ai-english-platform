// ============================================
// 教師端 — AI Copilot（AI 教學助手）
// 功能：課堂概覽、教案生成、班級分析、考試預測、教材生成、學生分析
// ============================================
'use client';

import { useState, useEffect, useRef } from 'react';
import { useTeacherCopilot } from '@/hooks/use-teacher-copilot';
import type { LoadingMap } from '@/hooks/use-teacher-copilot';
import {
  Sparkles, BookOpen, Users, BarChart3, FileText, UserCheck,
  Loader2, AlertCircle, Lightbulb, Target, Brain,
  ChevronRight, Clock, AlertTriangle,
  ArrowUp, ArrowDown, Minus,
} from 'lucide-react';

type TabKey = 'overview' | 'lesson-plan' | 'class-analysis' | 'exam-prediction' | 'generate' | 'student-analysis';

export default function TeacherCopilotPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Local UI state (inputs, selection — NOT data)
  const [classId, setClassId] = useState('');
  const [className, setClassName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [generationType, setGenerationType] = useState('worksheet');

  // Data hook — all fetch logic, loading states, error, and abort handling
  const {
    loadingMap,
    error,
    setError,
    overview,
    lessonPlan,
    classAnalysis,
    examPrediction,
    studentAnalysis,
    generatedContent,
    fetchOverview,
    fetchLessonPlan,
    fetchClassAnalysis,
    fetchExamPrediction,
    fetchStudentAnalysis,
    generateMaterial,
    cancelPending,
  } = useTeacherCopilot();

  // Cancel in-flight request when user changes class/student/tab
  const prevTabRef = useRef(activeTab);
  const prevClassIdRef = useRef(classId);
  const prevStudentIdRef = useRef(studentId);
  useEffect(() => {
    if (activeTab !== prevTabRef.current || classId !== prevClassIdRef.current || studentId !== prevStudentIdRef.current) {
      cancelPending();
      setError('');
      prevTabRef.current = activeTab;
      prevClassIdRef.current = classId;
      prevStudentIdRef.current = studentId;
    }
  }, [activeTab, classId, studentId, cancelPending, setError]);

  // Determine which loading key is active for the current tab
  const tabLoadingKey: keyof LoadingMap =
    activeTab === 'overview' ? 'overview' :
    activeTab === 'lesson-plan' ? 'lessonPlan' :
    activeTab === 'class-analysis' ? 'classAnalysis' :
    activeTab === 'exam-prediction' ? 'examPrediction' :
    activeTab === 'student-analysis' ? 'studentAnalysis' :
    'generate';
  const isLoading = loadingMap[tabLoadingKey];

  const tabs: { key: TabKey; icon: React.ReactNode; zh: string; en: string }[] = [
    { key: 'overview', icon: <Sparkles className="w-4 h-4" />, zh: '概覽', en: 'Overview' },
    { key: 'lesson-plan', icon: <BookOpen className="w-4 h-4" />, zh: '教案', en: 'Lesson Plan' },
    { key: 'class-analysis', icon: <BarChart3 className="w-4 h-4" />, zh: '班級分析', en: 'Class Analysis' },
    { key: 'exam-prediction', icon: <Target className="w-4 h-4" />, zh: '考試預測', en: 'Exam Prediction' },
    { key: 'generate', icon: <FileText className="w-4 h-4" />, zh: '生成教材', en: 'Generate' },
    { key: 'student-analysis', icon: <UserCheck className="w-4 h-4" />, zh: '學生分析', en: 'Student Analysis' },
  ];

  const handleLoad = () => {
    if (activeTab === 'lesson-plan') fetchLessonPlan(classId, className);
    else if (activeTab === 'class-analysis') fetchClassAnalysis(classId, className);
    else if (activeTab === 'exam-prediction') fetchExamPrediction(classId);
    else if (activeTab === 'student-analysis') fetchStudentAnalysis(studentId, classId);
  };

  const trendIcon = (trend: string) =>
    trend === 'up' ? <ArrowUp className="w-3 h-3 text-green-500" /> :
    trend === 'down' ? <ArrowDown className="w-3 h-3 text-red-500" /> :
    <Minus className="w-3 h-3 text-gray-400" />;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-500 to-purple-600 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="w-6 h-6" /> AI Copilot
        </h1>
        <p className="text-violet-100 text-sm mt-1">
          AI 教學助手 — 教案、分析、預測、教材生成
        </p>
      </div>

      {/* Tab Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border overflow-x-auto">
        <div className="flex p-1 gap-1 min-w-max">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-violet-500 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}>
              {tab.icon} {tab.zh}
            </button>
          ))}
        </div>
      </div>

      {/* Class/Student Selector (shared) */}
      {activeTab !== 'overview' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">班級 ID</label>
            <input value={classId} onChange={e => setClassId(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm w-40" placeholder="e.g. class-001" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">班級名稱</label>
            <input value={className} onChange={e => setClassName(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm w-32" placeholder="e.g. 4A" />
          </div>
          {activeTab === 'student-analysis' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">學生 ID</label>
              <input value={studentId} onChange={e => setStudentId(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm w-48" placeholder="e.g. student-001" />
            </div>
          )}
          <button onClick={handleLoad}
            disabled={isLoading || !classId || (activeTab === 'student-analysis' && !studentId)}
            className="px-4 py-2 bg-violet-500 text-white rounded-lg text-sm font-medium hover:bg-violet-600 disabled:opacity-50 transition-colors">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '載入'}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* ── OVERVIEW ── */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {!overview && !isLoading && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-sm border text-center">
              <Sparkles className="w-12 h-12 text-violet-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-4">載入 AI Copilot 概覽，查看所有班級狀態與緊急行動</p>
              <button onClick={fetchOverview} disabled={isLoading}
                className="px-6 py-2.5 bg-violet-500 text-white rounded-xl font-medium hover:bg-violet-600 disabled:opacity-50 transition-colors">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
                載入概覽
              </button>
            </div>
          )}

          {overview && (
            <>
              {/* Weekly Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border">
                  <div className="flex items-center gap-2 text-violet-500 mb-2"><Users className="w-5 h-5" /> 總學生</div>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">{overview.weeklySummary.totalStudents}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border">
                  <div className="flex items-center gap-2 text-amber-500 mb-2"><Clock className="w-5 h-5" /> 待交作業</div>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">{overview.weeklySummary.assignmentsDue}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border">
                  <div className="flex items-center gap-2 text-red-500 mb-2"><AlertTriangle className="w-5 h-5" /> 新風險</div>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">{overview.weeklySummary.newRisksDetected}</div>
                </div>
              </div>

              {/* Classes */}
              {overview.classes.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">班級概覽</h3>
                  <div className="space-y-2">
                    {overview.classes.map(c => (
                      <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                        <div>
                          <span className="font-medium text-gray-900 dark:text-white">{c.name}</span>
                          <span className="text-xs text-gray-500 ml-2">{c.gradeLevel} · {c.studentCount} 人</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-600 dark:text-gray-400">掌握度: {Math.round(c.averageMastery)}%</span>
                          {c.riskCount > 0 && (
                            <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full text-xs font-medium">
                              {c.riskCount} 風險
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Urgent Actions */}
              {overview.urgentActions.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
                  <h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> 緊急行動
                  </h3>
                  <div className="space-y-2">
                    {overview.urgentActions.map((a, i) => (
                      <div key={i} className={`p-3 rounded-xl text-sm ${
                        a.priority === 'high'
                          ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                          : 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                      }`}>
                        <span className="font-medium">{a.type}:</span> {a.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── LESSON PLAN ── */}
      {activeTab === 'lesson-plan' && lessonPlan && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border space-y-4">
          <h3 className="font-bold text-lg text-gray-900 dark:text-white">一週教案</h3>
          <div className="flex flex-wrap gap-2">
            {lessonPlan.focusSkills.map((s, i) => (
              <span key={i} className="px-3 py-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-full text-xs font-medium">{s}</span>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {lessonPlan.dailyPlans.map((day, i) => (
              <div key={i} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <h4 className="font-semibold text-gray-900 dark:text-white text-sm">{day.day} <span className="text-xs text-gray-500">{day.date}</span></h4>
                <ul className="mt-2 space-y-1">
                  {day.activities.map((a, j) => (
                    <li key={j} className="text-xs text-gray-600 dark:text-gray-400">
                      <span className="font-medium">{a.title}</span> ({a.duration}) — {a.description}
                    </li>
                  ))}
                </ul>
                {day.homework.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                    <span className="text-xs font-medium text-gray-500">家課:</span>
                    {day.homework.map((h, j) => (
                      <span key={j} className="text-xs text-gray-600 dark:text-gray-400 ml-1">{h}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-500 grid grid-cols-3 gap-2">
            <div><span className="font-medium">文法:</span> {lessonPlan.grammarFocus}</div>
            <div><span className="font-medium">詞彙:</span> {lessonPlan.vocabularyFocus}</div>
            <div><span className="font-medium">寫作:</span> {lessonPlan.writingFocus}</div>
          </div>
        </div>
      )}

      {/* ── CLASS ANALYSIS ── */}
      {activeTab === 'class-analysis' && classAnalysis && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-gray-900 dark:text-white">班級分析</h3>
              <span className="px-3 py-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-full text-sm font-medium">
                平均 {Math.round(classAnalysis.overallMetrics.averageMastery)}% · {classAnalysis.overallMetrics.classHkdseLevel}
              </span>
            </div>
            {/* Skill Breakdown */}
            <div className="space-y-2">
              {classAnalysis.skillBreakdown.map((sk, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 dark:text-gray-300 w-20">{sk.skillZh}</span>
                  <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                    <div className="bg-violet-500 h-2.5 rounded-full" style={{ width: `${sk.classAverage}%` }} />
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white w-10">{sk.classAverage}%</span>
                  {trendIcon(sk.trend)}
                </div>
              ))}
            </div>
          </div>

          {/* Risk Students */}
          {classAnalysis.riskStudents.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-2xl p-5">
              <h4 className="font-semibold text-red-800 dark:text-red-300 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> 風險學生
              </h4>
              <div className="space-y-2">
                {classAnalysis.riskStudents.map((rs, i) => (
                  <div key={i} className="p-3 bg-white dark:bg-gray-800 rounded-xl text-sm">
                    <span className="font-medium text-gray-900 dark:text-white">{rs.studentName}</span>
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                      rs.riskLevel === 'high' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                    }`}>{rs.riskLevel === 'high' ? '高風險' : '中風險'}</span>
                    <p className="text-xs text-gray-500 mt-1">{rs.reasons.join('、')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {classAnalysis.recommendations.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-500" /> 建議</h4>
              <ul className="space-y-1">
                {classAnalysis.recommendations.map((r, i) => (
                  <li key={i} className="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2">
                    <ChevronRight className="w-3 h-3 text-violet-500 mt-0.5" /> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── EXAM PREDICTION ── */}
      {activeTab === 'exam-prediction' && examPrediction && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border text-center">
            <div className="text-4xl font-bold text-violet-500">{examPrediction.predictedPassRate}%</div>
            <div className="text-sm text-gray-500 mt-1">預測合格率</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">各卷預測</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {examPrediction.paperAnalysis.map((p, i) => (
                <div key={i} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{p.paperZh}</span>
                  <span className="text-sm font-bold text-violet-600 dark:text-violet-400">{p.averagePredicted}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">學生預測</h4>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {examPrediction.studentPredictions.map((sp, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm">
                  <span className="font-medium text-gray-900 dark:text-white">{sp.studentName}</span>
                  <span className="text-violet-600 dark:text-violet-400 font-bold">{sp.predictedLevel}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── GENERATE ── */}
      {activeTab === 'generate' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border space-y-4">
          <h3 className="font-bold text-lg text-gray-900 dark:text-white">AI 生成教材</h3>
          <div className="flex flex-wrap gap-2">
            {['worksheet', 'homework', 'class-quiz', 'revision-paper', 'remedial-exercises'].map(gt => (
              <button key={gt} onClick={() => setGenerationType(gt)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  generationType === gt
                    ? 'bg-violet-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}>
                {gt === 'worksheet' ? '工作紙' :
                 gt === 'homework' ? '家課' :
                 gt === 'class-quiz' ? '小測' :
                 gt === 'revision-paper' ? '溫習卷' : '補底練習'}
              </button>
            ))}
          </div>
          <button onClick={() => generateMaterial(generationType, classId || undefined)} disabled={isLoading}
            className="w-full py-2.5 bg-violet-500 text-white rounded-xl font-medium hover:bg-violet-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {isLoading ? '生成中...' : '生成教材'}
          </button>
          {generatedContent && (
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-96 overflow-y-auto">
              {generatedContent}
            </div>
          )}
        </div>
      )}

      {/* ── STUDENT ANALYSIS ── */}
      {activeTab === 'student-analysis' && studentAnalysis && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg text-gray-900 dark:text-white">學生分析</h3>
            <span className="px-3 py-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-full text-sm font-medium">
              {studentAnalysis.personaType}
            </span>
          </div>
          {studentAnalysis.skillDetails.map((sd, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-sm text-gray-700 dark:text-gray-300 w-24 capitalize">{sd.skill}</span>
              <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div className="bg-violet-500 h-2 rounded-full" style={{ width: `${sd.score}%` }} />
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white w-10">{sd.score}%</span>
              <span className="text-xs text-gray-500">{sd.percentile}%ile</span>
            </div>
          ))}
          {studentAnalysis.recentProgress && (
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">近期進度:</span> {studentAnalysis.recentProgress}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
