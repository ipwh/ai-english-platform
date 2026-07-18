// ============================================
// SRSReviewFlow — Spaced Repetition review with SM-2 scoring UI
// Used by: /student/vocabulary, /student/mistakes
// ============================================
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Check, X, RotateCcw, Loader2, Zap, Star } from 'lucide-react';
import { useT } from '@/hooks/use-i18n';

interface ReviewCard {
  id: string;
  front: string;          // word or question
  back: string;           // meaning or answer
  type: 'vocab' | 'mistake';
  metadata?: Record<string, string>;
}

interface SRSReviewFlowProps {
  studentId: string;
  reviewType: 'vocab' | 'mistakes' | 'all';
  onComplete?: (results: { id: string; outcome: 'easy' | 'hard' | 'again' }[]) => void;
}

const SM2_QUALITY_MAP = {
  easy: 5,    // perfect response
  hard: 3,    // correct with difficulty
  again: 1,   // incorrect
} as const;

export default function SRSReviewFlow({ studentId, reviewType, onComplete }: SRSReviewFlowProps) {
  const { t } = useT();
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<{ id: string; outcome: 'easy' | 'hard' | 'again' }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Load due cards
  useEffect(() => {
    fetch(`/api/srs/review?studentId=${encodeURIComponent(studentId)}&type=${reviewType}`)
      .then(r => r.json())
      .then(data => {
        const vocabCards = (data.reviewCards?.vocab || []).map((v: Record<string, unknown>) => ({
          id: v.id, front: v.word, back: v.meaningZh || v.exampleSentence || '',
          type: 'vocab' as const, metadata: v,
        }));
        const mistakeCards = (data.reviewCards?.mistakes || []).map((m: Record<string, unknown>) => ({
          id: m.id, front: m.questionPrompt || m.studentAnswer,
          back: m.correctAnswer || '', type: 'mistake' as const, metadata: m,
        }));
        setCards([...vocabCards, ...mistakeCards]);
      })
      .catch(() => setError('無法載入複習卡片'))
      .finally(() => setLoading(false));
  }, [studentId, reviewType]);

  const currentCard = cards[currentIndex];
  const progress = cards.length > 0 ? Math.round((currentIndex / cards.length) * 100) : 0;

  const handleRate = useCallback(async (outcome: 'easy' | 'hard' | 'again') => {
    if (!currentCard) return;
    const newResults = [...results, { id: currentCard.id, outcome }];
    setResults(newResults);
    setFlipped(false);

    // Submit to API
    const quality = SM2_QUALITY_MAP[outcome];
    fetch('/api/srs/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId,
        type: currentCard.type,
        id: currentCard.id,
        quality,
      }),
    }).catch(() => {});

    // Advance or complete
    if (currentIndex + 1 >= cards.length) {
      setSubmitting(true);
      // Wait for all submissions
      setTimeout(() => {
        setSubmitting(false);
        setCompleted(true);
        onComplete?.(newResults);
      }, 500);
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentCard, currentIndex, cards.length, results, studentId, onComplete]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    );
  }

  if (completed) {
    const easyCount = results.filter(r => r.outcome === 'easy').length;
    const hardCount = results.filter(r => r.outcome === 'hard').length;
    const againCount = results.filter(r => r.outcome === 'again').length;

    return (
      <div className="text-center py-12 space-y-4 animate-in fade-in duration-500">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto">
          <Zap className="w-8 h-8 text-green-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {t('srs.reviewComplete')}
        </h3>
        <div className="flex justify-center gap-6 text-sm">
          <div><Star className="w-4 h-4 text-green-500 inline mr-1" />{easyCount} {t('srs.easy')}</div>
          <div><Star className="w-4 h-4 text-amber-500 inline mr-1" />{hardCount} {t('srs.hard')}</div>
          <div><RotateCcw className="w-4 h-4 text-red-500 inline mr-1" />{againCount} {t('srs.again')}</div>
        </div>
        <p className="text-xs text-gray-500">{t('srs.nextReviewScheduled')}</p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-sm">{t('srs.noCardsDue')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-teal-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-xs text-gray-500">{currentIndex + 1}/{cards.length}</span>
      </div>

      {/* Card */}
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8 min-h-[200px] flex flex-col items-center justify-center cursor-pointer select-none transition-all hover:shadow-xl"
        onClick={() => setFlipped(!flipped)}
      >
        {!flipped ? (
          <>
            <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">
              {currentCard.type === 'vocab' ? 'Vocabulary' : 'Mistake'}
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white text-center">
              {currentCard.front}
            </p>
            <p className="text-xs text-gray-400 mt-4">{t('srs.tapToReveal')}</p>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-2">
              {currentCard.type === 'vocab' ? 'Meaning / Answer' : 'Correct Answer'}
            </p>
            <p className="text-lg text-gray-700 dark:text-gray-300 text-center">
              {currentCard.back}
            </p>
            {currentCard.metadata?.exampleSentence && (
              <p className="text-xs text-gray-400 mt-2 italic">
                &ldquo;{currentCard.metadata.exampleSentence}&rdquo;
              </p>
            )}
          </>
        )}
      </div>

      {/* Rating buttons (only visible after flip) */}
      {flipped && (
        <div className="flex gap-3 justify-center animate-in fade-in slide-in-from-bottom-4 duration-300">
          <button
            onClick={() => handleRate('again')}
            className="flex-1 py-3 bg-red-100 dark:bg-red-900/20 hover:bg-red-200 dark:hover:bg-red-900/30 text-red-700 dark:text-red-400 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <X className="w-4 h-4" /> Again 重溫
          </button>
          <button
            onClick={() => handleRate('hard')}
            className="flex-1 py-3 bg-amber-100 dark:bg-amber-900/20 hover:bg-amber-200 dark:hover:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Star className="w-4 h-4" /> Hard 困難
          </button>
          <button
            onClick={() => handleRate('easy')}
            className="flex-1 py-3 bg-green-100 dark:bg-green-900/20 hover:bg-green-200 dark:hover:bg-green-900/30 text-green-700 dark:text-green-400 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Check className="w-4 h-4" /> Easy 簡單
          </button>
        </div>
      )}
    </div>
  );
}
