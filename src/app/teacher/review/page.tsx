// ============================================
// 教師端 — AI 批改覆核
// 教師可查看 AI 評分、修正分數/評語、接受或退回
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { Check, X, RotateCcw, MessageSquare, Sparkles, Loader2 } from 'lucide-react';

import { formatDate } from '@/shared/utils/utils';
import EmptyState from '@/components/shared/EmptyState';
import type { ReviewStatus, ReviewItem } from '@/shared/types/types';
import { useT } from '@/hooks/use-i18n';

export default function TeacherReviewPage() {
  const { t, language } = useT();
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [selectedReview, setSelectedReview] = useState<ReviewItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reviews')
      .then(r => r.json())
      .then(d => {
        setReviews(d.reviews || []);
        if (d.reviews?.length > 0) setSelectedReview(d.reviews[0]);
      })
      .catch((e) => { console.error('Failed to load reviews:', e); })
      .finally(() => setLoading(false));
  }, []);
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed'>('all');
  const [teacherScore, setTeacherScore] = useState<number | undefined>(undefined);
  const [teacherFeedback, setTeacherFeedback] = useState('');

  // Sync teacherScore/teacherFeedback when selectedReview changes
  useEffect(() => {
    setTeacherScore(selectedReview?.teacherScore);
    setTeacherFeedback(selectedReview?.teacherFeedback || '');
  }, [selectedReview?.id]);

  // === AI 重新分析 ===
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [actionLoading, setActionLoading] = useState<'accept' | 'return' | null>(null);

  const filtered = reviews.filter(r => filter === 'all' ? true : r.status === filter);

  const updateReview = async (id: string, updates: Partial<ReviewItem>) => {
    setReviews((prev) => prev.map((r) => r.id === id ? { ...r, ...updates } : r));
    if (selectedReview?.id === id) {
      setSelectedReview((prev) => prev ? { ...prev, ...updates } : prev);
    }
    // Persist to API (await to ensure completion before resetting loading state)
    try {
      await fetch(`/api/reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch { /* non-blocking */ }
  };

  const handleAccept = async () => {
    if (!selectedReview || actionLoading) return;
    setActionLoading('accept');
    const updated = {
      ...selectedReview,
      status: 'reviewed' as ReviewStatus,
      teacherScore: teacherScore ?? selectedReview.aiScore,
      teacherFeedback: teacherFeedback || selectedReview.aiFeedback,
    };
    await updateReview(selectedReview.id, updated);
    setActionLoading(null);
  };

  const handleReturn = async () => {
    if (!selectedReview || actionLoading) return;
    setActionLoading('return');
    await updateReview(selectedReview.id, {
      status: 'returned' as ReviewStatus,
      teacherScore,
      teacherFeedback,
    });
    setActionLoading(null);
  };

  // === AI 重新批改 ===
  const handleAIReAnalyze = async () => {
    if (!selectedReview) return;
    setAiLoading(true);
    setAiError('');
    try {
      const res = await fetch('/api/ai/analyze-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: selectedReview.questionPrompt,
          questionType: selectedReview.questionType || 'mc',
          studentAnswer: selectedReview.studentAnswer,
        }),
      });
      const json = await res.json();
      if (res.ok && json.analysis) {
        updateReview(selectedReview.id, {
          aiScore: json.analysis.score,
          aiFeedback: json.analysis.feedbackZh,
          aiMistakeType: json.analysis.mistakeType,
        });
      } else {
        setAiError(json.error || (language === 'en' ? 'AI re-analysis failed' : 'AI 重新批改失敗'));
      }
    } catch {
      setAiError(language === 'en' ? 'AI connection failed' : 'AI 連線失敗');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('teacher.review.title')}</h1>

      <div className="flex gap-2">
        {[
          { key: 'all', label: t('teacher.review.all') },
          { key: 'pending', label: t('teacher.review.pending') },
          { key: 'reviewed', label: t('teacher.review.reviewed') },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key as typeof filter)}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              filter === f.key ? 'bg-blue-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 border border-gray-200 dark:border-gray-700'
            }`}
          >
            {f.label} ({reviews.filter(r => f.key === 'all' ? true : r.status === f.key).length})
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左：覆核列表 */}
        <div className="lg:col-span-1 space-y-2 max-h-[600px] overflow-y-auto">
          {filtered.map((r) => (
            <button
              key={r.id}
              onClick={() => { setSelectedReview(r); setTeacherScore(r.teacherScore); setTeacherFeedback(r.teacherFeedback || ''); }}
              className={`w-full text-left p-3 rounded-xl transition-colors ${
                selectedReview?.id === r.id ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{r.studentName}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  r.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                  r.status === 'reviewed' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                }`}>
                  {r.status === 'pending' ? t('teacher.review.pending') : r.status === 'reviewed' ? t('teacher.review.reviewed') : t('teacher.review.returned')}
                </span>
              </div>
              <p className="text-xs text-gray-500 truncate">{r.assignmentTitle}</p>
              <p className="text-xs text-gray-400 mt-1">{formatDate(r.submittedAt)}</p>
            </button>
          ))}
        </div>

        {/* 右：詳情 + 教師修正 */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedReview ? (
            <EmptyState title={t('teacher.review.selectPrompt')} icon={<MessageSquare className="w-8 h-8" />} />
          ) : (
            <>
              {/* 題目與學生答案 */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{selectedReview.assignmentTitle}</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">{t('teacher.review.question')}</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{selectedReview.questionPrompt}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">{t('teacher.review.studentAnswer')}</p>
                    <p className="text-sm text-gray-900 dark:text-white">{selectedReview.studentAnswer}</p>
                  </div>
                </div>
              </div>

              {/* AI 批改結果 */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{t('teacher.review.aiGrading')}</span>
                    <span className={`text-sm font-bold ${selectedReview.aiScore >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                      {selectedReview.aiScore}{language === 'en' ? ' pts' : ' 分'}
                    </span>
                  </div>
                  <button
                    onClick={handleAIReAnalyze}
                    disabled={aiLoading}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-purple-600 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:bg-purple-100 disabled:opacity-50"
                  >
                    {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    {aiLoading ? t('teacher.analyzing') : t('teacher.review.reanalyze')}
                  </button>
                </div>
                {aiError && <p className="text-xs text-red-500 mb-2">{aiError}</p>}
                <p className="text-sm text-gray-600 dark:text-gray-400">{selectedReview.aiFeedback}</p>
                {selectedReview.aiMistakeType && (
                  <span className="inline-block mt-2 text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-800 text-purple-600 rounded-full">
                    {selectedReview.aiMistakeType}
                  </span>
                )}
              </div>

              {/* 教師修正區 */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{t('teacher.review.teacherCorrection')}</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t('teacher.review.scoreCorrection')}</label>
                    <input
                      type="number"
                      value={teacherScore ?? ''}
                      onChange={(e) => setTeacherScore(e.target.value ? parseInt(e.target.value) : undefined)}
                      min={0}
                      max={100}
                      placeholder="0-100"
                      className="w-24 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">{t('teacher.review.commentCorrection')}</label>
                    <textarea
                      value={teacherFeedback}
                      onChange={(e) => setTeacherFeedback(e.target.value)}
                      rows={3}
                      placeholder={t('teacher.review.commentPlaceholder')}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                </div>

                {/* 操作按鈕 */}
                <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <button onClick={handleAccept} disabled={actionLoading !== null} className="flex items-center gap-1 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm rounded-lg font-medium">
                    {actionLoading === 'accept' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {t('teacher.review.acceptAi')}
                  </button>
                  <button onClick={handleReturn} disabled={actionLoading !== null} className="flex items-center gap-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm rounded-lg font-medium">
                    {actionLoading === 'return' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} {t('teacher.review.returnForRedo')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
