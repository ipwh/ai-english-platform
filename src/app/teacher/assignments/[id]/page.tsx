// ============================================
// 教師端 — 作業詳情與學生提交列表
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Users, Clock, CheckCircle, XCircle, Loader2, Sparkles, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import ProgressBar from '@/components/shared/ProgressBar';
import SkillChip from '@/components/shared/SkillChip';
import { formatDate } from '@/shared/utils/utils';
import { difficultyLabels } from '@/shared/utils/nav';
import { useT } from '@/hooks/use-i18n';

interface QuestionInfo {
  id: string;
  questionType: string;
  prompt: string;
  options: string[] | null;
  answer: string;
  orderIndex: number;
}

interface SubmissionInfo {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentClass: string;
  answers: Record<string, string>;
  score: number | null;
  aiFeedback: string | null;
  status: string;
  submittedAt: string | null;
}

interface AssignmentDetail {
  id: string;
  title: string;
  description: string | null;
  className: string;
  gradeLevel: string;
  grammarItem: string | null;
  languageSkill: string | null;
  difficulty: string;
  questionCount: number;
  dueDate: string | null;
  completionRate: number;
  questions: QuestionInfo[];
  submissions: SubmissionInfo[];
  submissionCount: number;
}

export default function TeacherAssignmentDetailPage() {
  const { t } = useT();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [savingFeedback, setSavingFeedback] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState<Record<string, string>>({});
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/assignments/${id}?teacher=true`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setAssignment(data.assignment);
        }
      })
      .catch(() => setError(t('teacher.assignmentDetail.notFound')))
      .finally(() => setLoading(false));
  }, [id]);

  const handleTeacherFeedback = async (submissionId: string, feedback: string) => {
    setSavingFeedback(submissionId);
    setFeedbackError(null);
    try {
      const res = await fetch(`/api/reviews/${submissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherFeedback: feedback }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '儲存失敗' }));
        throw new Error(data.error || '儲存失敗');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '儲存失敗，請重試';
      setFeedbackError(msg);
      setTimeout(() => setFeedbackError(null), 5000);
      console.error('Failed to save teacher feedback:', e);
    }
    finally { setSavingFeedback(null); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">{error || t('teacher.assignmentDetail.notFound')}</p>
        <button onClick={() => router.back()} className="mt-3 text-blue-600 hover:underline text-sm">{t('teacher.assignmentDetail.back')}</button>
      </div>
    );
  }

  const submittedCount = assignment.submissions.filter(s => s.status === 'submitted').length;
  const avgScore = assignment.submissions.filter(s => s.score !== null).length > 0
    ? Math.round(assignment.submissions.filter(s => s.score !== null).reduce((a, b) => a + (b.score || 0), 0) / assignment.submissions.filter(s => s.score !== null).length)
    : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Feedback error toast */}
      {feedbackError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 flex items-center gap-2 animate-in fade-in">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">{feedbackError}</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{assignment.title}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-gray-500">{assignment.className} · {assignment.gradeLevel}</span>
            <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600">{difficultyLabels[assignment.difficulty] || assignment.difficulty}</span>
            {assignment.grammarItem && <SkillChip grammarItem={assignment.grammarItem} languageSkill={assignment.languageSkill || undefined} />}
          </div>
        </div>
      </div>

      {/* 統計卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('teacher.assignmentDetail.submissions'), value: `${submittedCount}/${assignment.submissions.length}`, icon: Users, color: 'text-blue-600' },
          { label: t('teacher.assignmentDetail.avgScore'), value: avgScore !== null ? `${avgScore}%` : 'N/A', icon: CheckCircle, color: 'text-green-600' },
          { label: t('teacher.assignmentDetail.questionCount'), value: `${assignment.questionCount}`, icon: Sparkles, color: 'text-purple-600' },
          { label: t('teacher.assignmentDetail.dueDate'), value: assignment.dueDate ? formatDate(assignment.dueDate) : t('teacher.assignmentDetail.noDeadline'), icon: Clock, color: 'text-orange-600' },
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <stat.icon className={`w-5 h-5 ${stat.color} mb-2`} />
            <p className="text-lg font-bold text-gray-900 dark:text-white">{stat.value}</p>
            <p className="text-xs text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* 題目列表 */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{t('teacher.assignmentDetail.questionsAndAnswers')}</h2>
        <div className="space-y-2">
          {assignment.questions.map((q, i) => (
            <div key={q.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{i + 1}. {q.prompt}</p>
              {q.options && (
                <div className="flex gap-2 mt-1 flex-wrap">
                  {q.options.map((opt, j) => (
                    <span key={j} className={`text-xs px-2 py-0.5 rounded-full ${String.fromCharCode(65 + j) === q.answer.trim().toUpperCase() ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700'}`}>
                      {opt}
                    </span>
                  ))}
                </div>
              )}
              {!q.options && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">{t('teacher.assignmentDetail.answerPrefix')}{q.answer}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 學生提交列表 */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{t('teacher.assignmentDetail.studentSubmissions')}</h2>
        {assignment.submissions.length === 0 ? (
          <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">{t('teacher.assignmentDetail.noSubmissions')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {assignment.submissions.map((sub) => (
              <div key={sub.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                {/* 摘要列 */}
                <button
                  onClick={() => setExpandedStudent(expandedStudent === sub.id ? null : sub.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-700 dark:text-blue-300 font-medium text-sm">
                      {sub.studentName?.charAt(0) || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{sub.studentName || sub.studentEmail}</p>
                      <p className="text-xs text-gray-500">{sub.studentClass} · {sub.submittedAt ? formatDate(sub.submittedAt) : t('teacher.assignmentDetail.notSubmitted')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {sub.score !== null && (
                      <span className={`text-sm font-bold ${sub.score >= 60 ? 'text-green-600' : 'text-red-500'}`}>
                        {sub.score}%
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      sub.status === 'submitted' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {sub.status === 'submitted' ? t('teacher.assignmentDetail.submitted') : sub.status}
                    </span>
                    {expandedStudent === sub.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>

                {/* 展開的詳細內容 */}
                {expandedStudent === sub.id && (
                  <div className="border-t border-gray-100 dark:border-gray-700 p-4 space-y-4 bg-gray-50/50 dark:bg-gray-750/50">
                    {/* 各題答案 */}
                    {assignment.questions.map((q, i) => {
                      const studentAnswer = sub.answers?.[q.id] || '';
                      const isMcq = q.questionType === 'mc';
                      const isCorrect = isMcq
                        ? studentAnswer.trim().toUpperCase() === q.answer.trim().toUpperCase()
                        : null; // 文字題無法簡單判斷

                      return (
                        <div key={q.id} className="text-sm">
                          <p className="font-medium text-gray-900 dark:text-white mb-1">{i + 1}. {q.prompt}</p>
                          <div className="flex items-start gap-3">
                            <div className="flex-1">
                              <p className="text-xs text-gray-400 mb-0.5">{t('teacher.assignmentDetail.studentAnswer')}</p>
                              <p className={`text-sm ${isCorrect === true ? 'text-green-600' : isCorrect === false ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>
                                {studentAnswer || <span className="text-gray-400 italic">{t('teacher.assignmentDetail.notAnswered')}</span>}
                              </p>
                            </div>
                            <div className="flex-1">
                              <p className="text-xs text-gray-400 mb-0.5">{t('teacher.assignmentDetail.correctAnswer')}</p>
                              <p className="text-sm text-green-600 dark:text-green-400">{q.answer}</p>
                            </div>
                            {isMcq && (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {isCorrect ? '✓' : '✗'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* AI 反饋 */}
                    {sub.aiFeedback && (
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg text-sm text-blue-700 dark:text-blue-400">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span className="font-medium">AI 批改反饋</span>
                        </div>
                        <p className="whitespace-pre-wrap">{sub.aiFeedback}</p>
                      </div>
                    )}

                    {/* 教師回饋 */}
                    <div className="p-3 bg-green-50 dark:bg-green-900/10 rounded-lg">
                      <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1.5">{t('teacher.assignmentDetail.teacherFeedback')}</p>
                      <textarea
                        value={feedbackText[sub.id] || ''}
                        onChange={(e) => setFeedbackText(prev => ({ ...prev, [sub.id]: e.target.value }))}
                        placeholder={t('teacher.assignmentDetail.feedbackPlaceholder')}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-green-500 resize-none"
                      />
                      <button
                        onClick={() => handleTeacherFeedback(sub.id, feedbackText[sub.id] || '')}
                        disabled={savingFeedback === sub.id || !feedbackText[sub.id]?.trim()}
                        className="mt-2 px-3 py-1.5 text-xs font-medium bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg flex items-center gap-1"
                      >
                        {savingFeedback === sub.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        {savingFeedback === sub.id ? t('common.saving') : t('teacher.assignmentDetail.saveFeedback')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
