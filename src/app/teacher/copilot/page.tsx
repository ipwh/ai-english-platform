// ============================================
// 教師端 — AI Copilot（AI 教學助手）
// 功能：課堂概覽、教案生成、班級分析、考試預測、教材生成、學生分析
// ============================================
'use client';

import { useState, useEffect, useRef } from 'react';
import { useTeacherCopilot } from '@/hooks/use-teacher-copilot';
import type { LoadingMap } from '@/hooks/use-teacher-copilot';
import { useAppStore } from '@/store/appStore';
import { getSkillLabel } from '@/shared/utils/nav';
import {
  Sparkles, BookOpen, Users, BarChart3, FileText, UserCheck,
  Loader2, AlertCircle, Lightbulb, Target, Brain,
  ChevronRight, Clock, AlertTriangle,
  ArrowUp, ArrowDown, Minus,
} from 'lucide-react';

type TabKey = 'overview' | 'lesson-plan' | 'class-analysis' | 'exam-prediction' | 'generate' | 'student-analysis';

export default function TeacherCopilotPage() {
  const { language } = useAppStore();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Local UI state (inputs, selection — NOT data)
  const [classId, setClassId] = useState('');
  const [className, setClassName] = useState('');
  const [studentQuery, setStudentQuery] = useState('');
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
  const prevStudentQueryRef = useRef(studentQuery);
  useEffect(() => {
    if (activeTab !== prevTabRef.current || classId !== prevClassIdRef.current || studentQuery !== prevStudentQueryRef.current) {
      cancelPending();
      setError('');
      prevTabRef.current = activeTab;
      prevClassIdRef.current = classId;
      prevStudentQueryRef.current = studentQuery;
    }
  }, [activeTab, classId, studentQuery, cancelPending, setError]);

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
    else if (activeTab === 'student-analysis') fetchStudentAnalysis(studentQuery, classId || '');
    else if (activeTab === 'generate') generateMaterial(generationType, classId);
  };

  const selectClass = (c: { classId: string; className: string }) => {
    setClassId(c.classId);
    setClassName(c.className);
    setActiveTab('class-analysis');
  };

  const trendIcon = (trend: string) =>
    trend === 'up' || trend === 'improving' ? <ArrowUp className="w-3 h-3 text-green-500" /> :
    trend === 'down' || trend === 'declining' ? <ArrowDown className="w-3 h-3 text-red-500" /> :
    <Minus className="w-3 h-3 text-gray-400" />;

  /** Map skill identifier to display name — delegates to shared utility */
  const skillLabel = (skill: string): string => getSkillLabel(skill, language) || skill;

  /** Format a focus value that may be string or object */
  const fmtFocus = (f: unknown): string => {
    if (typeof f === 'string') return f;
    if (typeof f === 'object' && f !== null) {
      const obj = f as Record<string, unknown>;
      if (obj.topics && Array.isArray(obj.topics)) return (obj.topics as Array<{topicZh?: string; topic?: string}>).map(t => t.topicZh || t.topic).join('、');
      if (obj.themes && Array.isArray(obj.themes)) return (obj.themes as string[]).join('、');
      if (obj.textTypes && Array.isArray(obj.textTypes)) return (obj.textTypes as Array<{typeZh?: string; type?: string}>).map(t => t.typeZh || t.type).join('、');
    }
    return '';
  };

  /** Format a homework item that may be string or object */
  const fmtHw = (h: string | Record<string, unknown>): string => {
    if (typeof h === 'string') return h;
    return (h.descriptionZh as string) || (h.description as string) || '';
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-500 to-purple-600 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="w-6 h-6" /> {language === 'en' ? 'AI Copilot' : 'AI 教學助手'}
        </h1>
        <p className="text-violet-100 text-sm mt-1">
          {language === 'en' ? 'Lesson Plans, Analysis, Predictions, Materials' : '教案、分析、預測、教材生成'}
        </p>
        <div className="mt-3 pt-3 border-t border-violet-400/30 text-xs text-violet-200 space-y-1">
          {language === 'en' ? (
            <>
              <p>💡 <strong>Overview</strong>: View all class statuses · <strong>Lesson Plan</strong>: Enter class to generate weekly plan · <strong>Class Analysis</strong>: View skill distribution & at-risk students</p>
              <p>💡 <strong>Exam Prediction</strong>: Predict DSE pass rate · <strong>Generate</strong>: AI create worksheets/homework/tests · <strong>Student Analysis</strong>: Enter student name to view progress</p>
            </>
          ) : (
            <>
              <p>💡 <strong>概覽</strong>：查看所有班級狀態 · <strong>教案</strong>：輸入班級生成一週教學計劃 · <strong>班級分析</strong>：查看班級技能分佈及風險學生</p>
              <p>💡 <strong>考試預測</strong>：預測 DSE 合格率 · <strong>生成教材</strong>：AI 製作工作紙/家課/測驗卷 · <strong>學生分析</strong>：輸入學生姓名查看個人進度</p>
            </>
          )}
        </div>
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
              {tab.icon} {language === 'en' ? tab.en : tab.zh}
            </button>
          ))}
        </div>
      </div>

      {/* Class/Student Selector (shared) */}
      {activeTab !== 'overview' && activeTab !== 'generate' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border flex flex-wrap gap-3 items-end">
          {activeTab !== 'student-analysis' && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'en' ? 'Class' : '班級'}</label>
            <input value={className || classId} onChange={e => { setClassName(e.target.value); setClassId(e.target.value); }}
              className="px-3 py-2 border rounded-lg text-sm w-40" placeholder="e.g. 4A" />
          </div>
          )}
          {activeTab === 'student-analysis' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{language === 'en' ? 'Student Name' : '學生姓名'}</label>
              <input value={studentQuery} onChange={e => setStudentQuery(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm w-48" placeholder={language === 'en' ? 'e.g. Chan Tai Man' : 'e.g. 陳大文'} />
            </div>
          )}
          <button onClick={handleLoad}
            disabled={isLoading || (activeTab !== 'student-analysis' && !classId) || (activeTab === 'student-analysis' && !studentQuery)}
            className="px-4 py-2 bg-violet-500 text-white rounded-lg text-sm font-medium hover:bg-violet-600 disabled:opacity-50 transition-colors">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (language === 'en' ? 'Load' : '載入')}
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
              <p className="text-gray-500 mb-4">{language === 'en' ? 'Load AI Copilot overview to see all class statuses and urgent actions' : '載入 AI Copilot 概覽，查看所有班級狀態與緊急行動'}</p>
              <button onClick={fetchOverview} disabled={isLoading}
                className="px-6 py-2.5 bg-violet-500 text-white rounded-xl font-medium hover:bg-violet-600 disabled:opacity-50 transition-colors">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
                {language === 'en' ? 'Load Overview' : '載入概覽'}
              </button>
            </div>
          )}

          {overview && (
            <>
              {/* Weekly Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border">
                  <div className="flex items-center gap-2 text-violet-500 mb-2"><Users className="w-5 h-5" /> {language === 'en' ? 'Total Students' : '總學生'}</div>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">{overview.weeklySummary.totalStudents}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border">
                  <div className="flex items-center gap-2 text-amber-500 mb-2"><Clock className="w-5 h-5" /> {language === 'en' ? 'Pending Assignments' : '待交作業'}</div>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">{overview.weeklySummary.assignmentsDue}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border">
                  <div className="flex items-center gap-2 text-red-500 mb-2"><AlertTriangle className="w-5 h-5" /> {language === 'en' ? 'New Risks' : '新風險'}</div>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">{overview.weeklySummary.newRisksDetected}</div>
                </div>
              </div>

              {/* Classes */}
              {overview.classes.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{language === 'en' ? 'Class Overview' : '班級概覽'}</h3>
                  <div className="space-y-2">
                    {overview.classes.map(c => (
                      <button
                        key={c.classId}
                        onClick={() => selectClass(c)}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors text-left cursor-pointer"
                      >
                        <div>
                          <span className="font-medium text-gray-900 dark:text-white">{c.className}</span>
                          <span className="text-xs text-gray-500 ml-2">{language === 'en' ? `${c.studentCount} students` : `${c.studentCount} 人`}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {c.masteryEvidence
                              ? (language === 'en' ? `Mastery: ${Math.round(c.averageMastery)}%` : `掌握度: ${Math.round(c.averageMastery)}%`)
                              : (language === 'en' ? 'Insufficient data' : '數據不足')}
                          </span>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Urgent Actions */}
              {overview.urgentActions.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
                  <h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> {language === 'en' ? 'Urgent Actions' : '緊急行動'}
                  </h3>
                  <div className="space-y-2">
                    {overview.urgentActions.map((a, i) => (
                      <div key={i} className={`p-3 rounded-xl text-sm ${
                        a.type === 'risk'
                          ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                          : 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                      }`}>
                        <span className="font-medium">{a.type}:</span> {a.description}
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
          <h3 className="font-bold text-lg text-gray-900 dark:text-white">{language === 'en' ? 'Weekly Lesson Plan' : '一週教案'}</h3>
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
                  {day.activities.map((a, j) => {
                    const act = a as unknown as Record<string, unknown>;
                    return (
                    <li key={j} className="text-xs text-gray-600 dark:text-gray-400">
                      <span className="font-medium">{a.title || act.type as string || ''}</span>
                      {a.duration ? ` (${a.duration})` : act.durationMinutes != null ? ` (${act.durationMinutes}${language === 'en' ? ' min' : '分鐘'})` : ''}
                      {' — '}{a.description || act.descriptionZh as string || ''}
                    </li>
                    );
                  })}
                </ul>
                {day.homework.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                    <span className="text-xs font-medium text-gray-500">{language === 'en' ? 'Homework:' : '家課:'}</span>
                    {day.homework.map((h, j) => (
                      <span key={j} className="text-xs text-gray-600 dark:text-gray-400 ml-1">{fmtHw(h)}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-500 grid grid-cols-3 gap-2">
            <div><span className="font-medium">{language === 'en' ? 'Grammar:' : '文法:'}</span> {fmtFocus(lessonPlan.grammarFocus)}</div>
            <div><span className="font-medium">{language === 'en' ? 'Vocabulary:' : '詞彙:'}</span> {fmtFocus(lessonPlan.vocabularyFocus)}</div>
            <div><span className="font-medium">{language === 'en' ? 'Writing:' : '寫作:'}</span> {fmtFocus(lessonPlan.writingFocus)}</div>
          </div>
        </div>
      )}

      {/* ── CLASS ANALYSIS ── */}
      {activeTab === 'class-analysis' && classAnalysis && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-gray-900 dark:text-white">{language === 'en' ? 'Class Analysis' : '班級分析'}</h3>
              <span className="px-3 py-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-full text-sm font-medium">
                {classAnalysis.overallMetrics.hasData
                  ? `${language === 'en' ? `Avg ${Math.round(classAnalysis.overallMetrics.averageMastery)}%` : `平均 ${Math.round(classAnalysis.overallMetrics.averageMastery)}%`} · ${language === 'en' ? 'Est. Level' : '平台估算 Level'} ${classAnalysis.overallMetrics.classHkdseLevel}`
                  : (language === 'en' ? 'Insufficient class data' : '班級數據不足')}
              </span>
            </div>
            {/* Skill Breakdown */}
            <div className="space-y-2">
              {classAnalysis.skillBreakdown.map((sk, i) => {
                const raw = sk.averageScore ?? sk.classAverage ?? 0;
                const avg = raw > 1 ? raw : raw * 100; // API may return 0-1 or 0-100
                const trend = sk.trend || 'stable';
                const label = sk.skillZh || skillLabel(sk.skill);
                return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 dark:text-gray-300 w-20">{label}</span>
                  <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                    <div className="bg-violet-500 h-2.5 rounded-full" style={{ width: `${Math.round(avg)}%` }} />
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white w-10">{Math.round(avg)}%</span>
                  {trendIcon(trend)}
                </div>
                );
              })}
            </div>
          </div>

          {/* Risk Students */}
          {classAnalysis.riskStudents.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-2xl p-5">
              <h4 className="font-semibold text-red-800 dark:text-red-300 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> {language === 'en' ? 'At-Risk Students' : '風險學生'}
              </h4>
              <div className="space-y-2">
                {classAnalysis.riskStudents.map((rs, i) => (
                  <div key={i} className="p-3 bg-white dark:bg-gray-800 rounded-xl text-sm">
                    <span className="font-medium text-gray-900 dark:text-white">{rs.name || rs.studentName}</span>
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                      rs.riskLevel === 'high' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                        : rs.riskLevel === 'inactive' ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                    }`}>{rs.riskLevel === 'high' ? (language === 'en' ? 'High Risk' : '高風險') : rs.riskLevel === 'inactive' ? (language === 'en' ? 'Inactive' : '失聯') : (language === 'en' ? 'Moderate' : '中風險')}</span>
                    <p className="text-xs text-gray-500 mt-1">{(language === 'en' ? rs.primaryConcern : (rs as { primaryConcernZh?: string }).primaryConcernZh) || rs.reasons?.join('、') || ''}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {classAnalysis.recommendations.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-500" /> {language === 'en' ? 'Recommendations' : '建議'}</h4>
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
          <div className="bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800 rounded-xl px-4 py-3 text-xs text-violet-800 dark:text-violet-200">
            {language === 'en'
              ? '⚠️ Platform estimate based on class practice data — NOT calibrated to HKEAA grade boundaries and NOT an official exam prediction. Use for guidance only.'
              : '⚠️ 此為平台根據班級練習數據的估算（未經 HKEAA 等級校準），並非官方考試預測，僅供教學參考。'}
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border text-center">
            <div className="text-4xl font-bold text-violet-500">{examPrediction.predictedPassRate != null ? `${examPrediction.predictedPassRate}%` : '—'}</div>
            <div className="text-sm text-gray-500 mt-1">{language === 'en' ? 'Platform-Estimated Pass Rate (Level 2+)' : '平台估算合格率（Level 2 或以上）'}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">{language === 'en' ? 'Paper Averages' : '各卷平均'}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {examPrediction.paperAnalysis.map((p, i) => (
                <div key={i} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{p.paperZh}</span>
                  <span className="text-sm font-bold text-violet-600 dark:text-violet-400">{Math.round(p.classAverage)}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">{language === 'en' ? 'Student Estimates' : '學生估算'}</h4>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {examPrediction.studentPredictions.map((sp, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm">
                  <span className="font-medium text-gray-900 dark:text-white">{sp.studentName}</span>
                  <span className="text-violet-600 dark:text-violet-400 font-bold">
                    {sp.predictedLevel != null
                      ? `${language === 'en' ? 'Est.' : '平台估算'} ${sp.predictedLevel}`
                      : (language === 'en' ? 'Insufficient data' : '數據不足')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── GENERATE ── */}
      {activeTab === 'generate' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border space-y-4">
          <h3 className="font-bold text-lg text-gray-900 dark:text-white">{language === 'en' ? 'AI Generate Materials' : 'AI 生成教材'}</h3>
          <div className="flex flex-wrap gap-2">
            {['worksheet', 'homework', 'class-quiz', 'revision-paper', 'remedial-exercises'].map(gt => (
              <button key={gt} onClick={() => setGenerationType(gt)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  generationType === gt
                    ? 'bg-violet-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}>
                {gt === 'worksheet' ? (language === 'en' ? 'Worksheet' : '工作紙') :
                 gt === 'homework' ? (language === 'en' ? 'Homework' : '家課') :
                 gt === 'class-quiz' ? (language === 'en' ? 'Quiz' : '小測') :
                 gt === 'revision-paper' ? (language === 'en' ? 'Revision Paper' : '溫習卷') : (language === 'en' ? 'Remedial' : '補底練習')}
              </button>
            ))}
          </div>
          <button onClick={() => generateMaterial(generationType, classId || undefined)} disabled={isLoading}
            className="w-full py-2.5 bg-violet-500 text-white rounded-xl font-medium hover:bg-violet-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {isLoading ? (language === 'en' ? 'Generating...' : '生成中...') : (language === 'en' ? 'Generate Materials' : '生成教材')}
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
            <h3 className="font-bold text-lg text-gray-900 dark:text-white">{language === 'en' ? 'Student Analysis' : '學生分析'}</h3>
            <span className="px-3 py-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-full text-sm font-medium">
              {(() => {
                const p = studentAnalysis.personaType;
                if (!p) return language === 'en' ? 'Insufficient data' : '數據不足';
                // 2026-08-30 audit (R7): persona 鍵與 StudentStateBuilder / 服務端 personaMap 對齊。
                const map: Record<string, { zh: string; en: string }> = {
                  'steady-grinder': { zh: '穩定耕耘者', en: 'Steady Grinder' },
                  'fast-learner': { zh: '快速學習者', en: 'Fast Learner' },
                  'struggling-but-persistent': { zh: '堅持奮鬥者', en: 'Persistent Striver' },
                  'balanced-achiever': { zh: '均衡成就者', en: 'Balanced Achiever' },
                  'curious-explorer': { zh: '好奇探索者', en: 'Curious Explorer' },
                  'anxious-perfectionist': { zh: '焦慮完美主義者', en: 'Anxious Perfectionist' },
                  'high-potential-unfocused': { zh: '潛力未集中者', en: 'High Potential, Unfocused' },
                  'exam-crammer': { zh: '臨急抱佛腳者', en: 'Exam Crammer' },
                };
                const entry = map[p];
                return entry ? (language === 'en' ? entry.en : entry.zh) : p;
              })()}
            </span>
          </div>
          {studentAnalysis.skillDetails.length === 0 && (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl text-sm text-amber-700 dark:text-amber-300">
              {language === 'en'
                ? 'Not enough practice data for this student yet — skill details unavailable. (Platform does not fabricate scores when evidence is missing.)'
                : '此學生練習數據不足，暫無法顯示技能分數。（平台不會在缺乏證據時杜撰分數）'}
            </div>
          )}
          {studentAnalysis.skillDetails.map((sd, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-sm text-gray-700 dark:text-gray-300 w-24">{skillLabel(sd.skill)}</span>
              <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div className="bg-violet-500 h-2 rounded-full" style={{ width: `${sd.score}%` }} />
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white w-10">{sd.score}%</span>
              {sd.percentile != null && (
                <span className="text-xs text-gray-500" title={language === 'en' ? `Platform readiness index: ${sd.percentile}/100 (not an actual class rank)` : `平台能力指數：${sd.percentile}/100（非實際班級排名）`}>{language === 'en' ? `PI ${sd.percentile}` : `能力指數 ${sd.percentile}`}</span>
              )}
            </div>
          ))}
          {studentAnalysis.recentProgress && (
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-700 dark:text-gray-300">{language === 'en' ? 'Recent progress: ' : '近期進度:'}</span>{' '}
              {typeof studentAnalysis.recentProgress === 'string'
                ? studentAnalysis.recentProgress
                : (() => {
                    const rp = studentAnalysis.recentProgress as Record<string, unknown>;
                    const parts = [];
                    if (rp.sessionsThisWeek != null) parts.push(language === 'en' ? `${rp.sessionsThisWeek} sessions this week` : `本週 ${rp.sessionsThisWeek} 次練習`);
                    if (rp.accuracyTrend) parts.push(language === 'en' ? `Accuracy trend: ${rp.accuracyTrend}` : `準確度趨勢: ${rp.accuracyTrend}`);
                    if (rp.masteryGained != null) parts.push(language === 'en' ? `Mastery gained: ${rp.masteryGained}` : `掌握度提升: ${rp.masteryGained}`);
                    if (rp.timeSpent != null) parts.push(language === 'en' ? `Study time: ${rp.timeSpent} min` : `學習時間: ${rp.timeSpent} 分鐘`);
                    return parts.length > 0 ? parts.join(' · ') : (language === 'en' ? 'Not enough data yet' : '暫無足夠數據');
                  })()}
            </div>
          )}
          <div className="text-[11px] text-gray-400 leading-relaxed border-t pt-3 mt-2">
            {language === 'en'
              ? '💡 Score = skill mastery (0-100%). PI = platform readiness index (0-100, not an actual class rank).'
              : '💡 分數 = 該技能掌握度（0-100%）。能力指數 = 平台能力指數（0-100，非實際班級排名）。'}
          </div>
        </div>
      )}
    </div>
  );
}
