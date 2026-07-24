// ============================================
// 學生端 — 作業詳情與作答頁面
// ============================================
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Send, Loader2, CheckCircle, XCircle, Clock, AlertCircle, Sparkles } from 'lucide-react';
import SkillChip from '@/components/shared/SkillChip';
import ProgressBar from '@/components/shared/ProgressBar';
import { formatDate } from '@/shared/utils/utils';
import { difficultyLabels } from '@/shared/utils/nav';
import { useT } from '@/hooks/use-i18n';

interface AssignmentQuestion {
  id: string;
  questionType: string;
  prompt: string;
  options: string[] | null;
  orderIndex: number;
  explanation?: string | null;
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
  timeLimit: number | null;
  dueDate: string | null;
  completionRate: number;
  questions: AssignmentQuestion[];
  submissionCount: number;
}

interface GradedAnswer {
  correct: boolean;
  feedback: string;
}

export default function AssignmentDetailPage() {
  const { t } = useT();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [gradedAnswers, setGradedAnswers] = useState<Record<string, GradedAnswer>>({});
  const [aiFeedback, setAiFeedback] = useState('');
  const [correctCount, setCorrectCount] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);

  // 載入作業詳情
  useEffect(() => {
    fetch(`/api/assignments/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setAssignment(data.assignment);
          // 若已有提交，載入之前的答案與成績
          if (data.submission) {
            setAnswers(data.submission.answers || {});
            setSubmitted(data.submission.status === 'submitted');
            setScore(data.submission.score);
            setAiFeedback(data.submission.aiFeedback || '');
          }
        }
      })
      .catch(() => setError(t('assignment.loadFailed')))
      .finally(() => setLoading(false));
  }, [id]);

  const handleAnswerChange = useCallback((questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  }, []);

  const handleSubmit = async () => {
    if (!assignment) return;
    // 檢查是否所有題目都已作答
    const unanswered = assignment.questions.filter(q => !answers[q.id]?.trim());
    if (unanswered.length > 0) {
      setError(t('assignment.unanswered', { n: unanswered.length }));
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`/api/assignments/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('assignment.submitFailed'));
        return;
      }

      setSubmitted(true);
      setScore(data.submission.score);
      setAiFeedback(data.submission.aiFeedback);
      setGradedAnswers(data.submission.gradedAnswers || {});
      setCorrectCount(data.submission.correctCount);
      setTotalQuestions(data.submission.totalQuestions);
    } catch {
      setError(t('assignment.networkError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  if (error && !assignment) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-gray-500">{error}</p>
        <button onClick={() => router.back()} className="mt-3 text-teal-600 hover:underline text-sm">
          {t('assignment.backToList')}
        </button>
      </div>
    );
  }

  if (!assignment) return null;

  const isOverdue = assignment.dueDate && new Date(assignment.dueDate) < new Date() && !submitted;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{assignment.title}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-gray-500">{assignment.className}</span>
            <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">
              {difficultyLabels[assignment.difficulty] || assignment.difficulty}
            </span>
            {assignment.grammarItem && (
              <SkillChip grammarItem={assignment.grammarItem} languageSkill={assignment.languageSkill || undefined} />
            )}
          </div>
        </div>
        {submitted && score !== null && (
          <div className={`text-center px-4 py-2 rounded-xl ${score >= 60 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
            <p className={`text-2xl font-bold ${score >= 60 ? 'text-green-600' : 'text-red-500'}`}>{score}%</p>
            <p className="text-xs text-gray-500">{t('assignment.scoreLabel')}</p>
          </div>
        )}
      </div>

      {/* 作業資訊卡片 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-400 text-xs">{t('assignment.questionCountLabel')}</p>
            <p className="font-medium text-gray-900 dark:text-white">{assignment.questionCount} {t('unit.questions')}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">{t('assignment.dueDateLabel')}</p>
            <p className={`font-medium flex items-center gap-1 ${isOverdue ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
              {isOverdue && <AlertCircle className="w-3 h-3" />}
              {assignment.dueDate ? formatDate(assignment.dueDate) : t('assignment.noDeadline')}
            </p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">{t('assignment.timeLimitLabel')}</p>
            <p className="font-medium text-gray-900 dark:text-white">
              {assignment.timeLimit ? `${assignment.timeLimit} ${t('assignment.minutes')}` : t('assignment.noLimit')}
            </p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">{t('assignment.submissionCountLabel')}</p>
            <p className="font-medium text-gray-900 dark:text-white">{assignment.submissionCount}</p>
          </div>
        </div>
        {assignment.description && (
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-3">
            {assignment.description}
          </p>
        )}
      </div>

      {/* 題目列表 */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {t('assignment.questionsLabel', { n: assignment.questions.length })}
        </h2>

        {assignment.questions.map((q, i) => {
          const graded = gradedAnswers[q.id];
          const isMcq = q.questionType === 'mc';
          const hasAnswer = !!answers[q.id]?.trim();

          return (
            <div
              key={q.id}
              className={`bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border transition-colors ${
                submitted && graded
                  ? graded.correct
                    ? 'border-green-300 dark:border-green-700'
                    : 'border-red-300 dark:border-red-700'
                  : 'border-gray-100 dark:border-gray-700'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  submitted && graded
                    ? graded.correct
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : hasAnswer
                      ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700'
                }`}>
                  {submitted && graded ? (graded.correct ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />) : i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  {/* 閱讀/聆聽內容 */}
                  {q.explanation && q.explanation.length > 50 && (
                    <div className="mb-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-sm text-indigo-700 dark:text-indigo-300 leading-relaxed whitespace-pre-line">
                      {q.explanation}
                    </div>
                  )}
                  <p className="text-sm font-medium text-gray-900 dark:text-white mb-3" dangerouslySetInnerHTML={{ __html: q.prompt }} />

                  {/* MC 選項 */}
                  {isMcq && q.options && (
                    <div className="space-y-2 mb-3">
                      {q.options.map((opt, j) => {
                        const optLetter = String.fromCharCode(65 + j); // A, B, C, D
                        const isSelected = answers[q.id] === optLetter;
                        const isCorrectAnswer = submitted && optLetter === graded?.feedback?.match(/[A-D]/)?.[0];

                        return (
                          <label
                            key={j}
                            className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                              submitted
                                ? isCorrectAnswer
                                  ? 'border-green-400 bg-green-50 dark:bg-green-900/10'
                                  : isSelected && !graded?.correct
                                    ? 'border-red-400 bg-red-50 dark:bg-red-900/10'
                                    : 'border-gray-200 dark:border-gray-600 opacity-60'
                                : isSelected
                                  ? 'border-teal-400 bg-teal-50 dark:bg-teal-900/10'
                                  : 'border-gray-200 dark:border-gray-600 hover:border-teal-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`q-${q.id}`}
                              value={optLetter}
                              checked={isSelected}
                              onChange={() => handleAnswerChange(q.id, optLetter)}
                              disabled={submitted}
                              className="sr-only"
                            />
                            <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                              isSelected
                                ? submitted
                                  ? graded?.correct
                                    ? 'border-green-500 bg-green-500 text-white'
                                    : 'border-red-500 bg-red-500 text-white'
                                  : 'border-teal-500 bg-teal-500 text-white'
                                : 'border-gray-300 text-gray-400'
                            }`}>
                              {optLetter}
                            </span>
                            <span className="text-sm text-gray-700 dark:text-gray-300">{opt}</span>
                            {submitted && isCorrectAnswer && <CheckCircle className="w-4 h-4 text-green-500 ml-auto" />}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* 文字輸入（填充/改錯/短寫作） */}
                  {!isMcq && (
                    <textarea
                      value={answers[q.id] || ''}
                      onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                      disabled={submitted}
                      placeholder={t('assignments.inputAnswer')}
                      rows={q.questionType === 'short-writing' ? 5 : 2}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-60 resize-none"
                    />
                  )}

                  {/* AI 反饋 */}
                  {submitted && graded && (
                    <div className={`mt-3 p-3 rounded-lg text-sm ${
                      graded.correct
                        ? 'bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-400'
                        : 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400'
                    }`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span className="font-medium">{t('assignments.submitForAI')}</span>
                      </div>
                      <p>{graded.feedback}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 提交區 */}
      {!submitted && (
        <div className="sticky bottom-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 p-4 -mx-4 lg:-mx-6">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {assignment.questions.length - Object.keys(answers).filter(k => answers[k]?.trim()).length} 題未作答
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2.5 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-medium rounded-xl flex items-center gap-2 transition-colors"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {t('assignments.grading')}</>
              ) : (
                <><Send className="w-4 h-4" /> {t('assignments.submitAssignment')}</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 錯誤提示 */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* 提交成功後的總覽 */}
      {submitted && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-500" />
            AI 批改總覽
          </h3>
          <ProgressBar value={score || 0} max={100} color={score && score >= 60 ? 'green' : 'red'} />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {correctCount}/{totalQuestions} 題正確 · 得分 {score}%
          </p>
          {aiFeedback && (
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {aiFeedback}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
