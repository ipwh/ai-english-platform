// ============================================
// API: GET /api/vocabulary/review-suggestions
// AI 個人化複習建議 — 根據學生詞彙掌握度、錯題、SRS 排程推薦優先複習單字
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { getDailyReviewTarget } from '@/modules/vocabulary/services/srs';
import { getStudentWords } from '@/modules/vocabulary/services/vocabulary-service';
import { listMistakesByType } from '@/modules/student';

export async function GET(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    if (!studentId) {
      return NextResponse.json({ error: 'studentId required' }, { status: 400 });
    }

    // 🔒 Ownership: students can only view their own review suggestions
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能查看自己的複習建議 / You can only view your own review suggestions' }, { status: 403 });
    }

    // 1. Get all vocabulary items
    const allVocab = await getStudentWords(studentId);

    // 2. Get recent mistakes (vocabulary-related)
    const vocabMistakes = await listMistakesByType(studentId, 'vocabulary', 50);

    // 3. Calculate SRS due cards
    const now = new Date();
    const dueCards = allVocab.filter(v =>
      !v.nextReviewDate || new Date(v.nextReviewDate) <= now
    );

    // 4. Categorize into priority groups
    const urgent: typeof allVocab = [];    // Due + low mastery + has related mistakes
    const high: typeof allVocab = [];      // Due + low mastery
    const medium: typeof allVocab = [];    // Due or low mastery
    const low: typeof allVocab = [];       // Others

    const mistakeWords = new Set(
      vocabMistakes
        .map(m => {
          // Extract word from mistake context
          const answer = m.studentAnswer?.toLowerCase() || '';
          const correct = m.correctAnswer?.toLowerCase() || '';
          return [answer, correct];
        })
        .flat()
        .filter(Boolean)
    );

    for (const v of allVocab) {
      const isDue = dueCards.some(d => d.id === v.id);
      const mastery = v.masteryLevel ?? 0;

      if (isDue && mastery <= 1 && mistakeWords.has(v.word.toLowerCase())) {
        urgent.push(v);
      } else if (isDue && mastery <= 2) {
        high.push(v);
      } else if (isDue || mastery <= 1) {
        medium.push(v);
      } else {
        low.push(v);
      }
    }

    // 5. Generate smart suggestions
    const dailyTarget = getDailyReviewTarget(allVocab.length);

    const suggestions = {
      totalWords: allVocab.length,
      dueCount: dueCards.length,
      mistakeRelatedCount: urgent.length,
      dailyTarget,
      priorities: {
        urgent: urgent.slice(0, 5).map(v => ({
          id: v.id,
          word: v.word,
          meaningZh: v.meaningZh,
          partOfSpeech: v.partOfSpeech,
          masteryLevel: v.masteryLevel,
          familiarity: v.familiarity,
          reason: '與錯題相關且需立即複習',
          reasonEn: 'Related to mistakes & needs immediate review',
        })),
        high: high.slice(0, 5).map(v => ({
          id: v.id,
          word: v.word,
          meaningZh: v.meaningZh,
          partOfSpeech: v.partOfSpeech,
          masteryLevel: v.masteryLevel,
          familiarity: v.familiarity,
          reason: '掌握度低且已到複習時間',
          reasonEn: 'Low mastery & due for review',
        })),
        medium: medium.slice(0, 5).map(v => ({
          id: v.id,
          word: v.word,
          meaningZh: v.meaningZh,
          partOfSpeech: v.partOfSpeech,
          masteryLevel: v.masteryLevel,
          familiarity: v.familiarity,
          reason: '建議鞏固記憶',
          reasonEn: 'Recommended to reinforce memory',
        })),
      },
      stats: {
        mastered: allVocab.filter(v => v.familiarity === 'mastered').length,
        learning: allVocab.filter(v => v.familiarity === 'learning').length,
        new: allVocab.filter(v => v.familiarity === 'new').length,
        avgMastery: allVocab.length > 0
          ? Math.round(allVocab.reduce((sum, v) => sum + (v.masteryLevel ?? 0), 0) / allVocab.length * 10) / 10
          : 0,
        streakRecommendation: allVocab.length > 0
          ? `建議每天複習 ${dailyTarget} 個單字，約 ${Math.ceil(dailyTarget * 2)} 分鐘即可完成。`
          : '尚未加入任何生字。',
      },
    };

    return NextResponse.json(suggestions);
  } catch (err) {
    logger.error({ module: 'review-suggestions', error: err instanceof Error ? err.message : String(err) }, 'Review suggestions failed');
    return NextResponse.json({ error: 'Failed to generate review suggestions' }, { status: 500 });
  }
}
