// Sprint 33: Recommendation Engine 2.0 — orchestration service
// Integrates StudentMastery (Sprint 31) + MistakeIntelligence (Sprint 32)
import type {
  RecommendationCandidate,
  RecommendationResult,
  ScoredRecommendation,
  RecommendationType,
} from '../types';
import { DSE_GRAMMAR_WEIGHTS, EXAM_WEIGHT_MAP } from '../types';
import { rankCandidates, getTopRecommendations } from './recommendation-formula';

// ============================================
// Candidate Builders — convert mastery/weakness data into candidates
// ============================================

/**
 * Build grammar recommendation candidates from mastery + weakness data.
 */
async function buildGrammarCandidates(
  studentId: string,
): Promise<RecommendationCandidate[]> {
  // Lazy imports to avoid Prisma in tests
  const { getStudentMastery } = await import(
    '@/modules/student-mastery/repositories/student-mastery-repo'
  );
  const { getStudentSummaries } = await import(
    '@/modules/mistake-intelligence/repositories/mistake-intelligence-repo'
  );

  const [masteryEntries, mistakeSummaries] = await Promise.all([
    getStudentMastery(studentId),
    getStudentSummaries(studentId),
  ]);

  // Build a map of grammarCategory → mastery data
  const masteryMap = new Map<string, { masteryScore: number; lastPracticedAt: Date | null; practiceCount: number }>();
  for (const entry of masteryEntries) {
    if (entry.skill === 'grammar') {
      const existing = masteryMap.get(entry.subSkill);
      if (!existing || entry.masteryScore < existing.masteryScore) {
        masteryMap.set(entry.subSkill, {
          masteryScore: entry.masteryScore,
          lastPracticedAt: entry.lastPracticedAt,
          practiceCount: entry.practiceCount,
        });
      }
    }
  }

  // Build a map of grammarCategory → mistake data
  const mistakeMap = new Map<string, { mistakeCount: number }>();
  for (const summary of mistakeSummaries) {
    mistakeMap.set(summary.grammarCategory, { mistakeCount: summary.mistakeCount });
  }

  // Create candidates for each DSE grammar weight entry
  const now = Date.now();
  const candidates: RecommendationCandidate[] = [];

  for (const weight of DSE_GRAMMAR_WEIGHTS) {
    const mastery = masteryMap.get(weight.grammarCategory);
    const mistakes = mistakeMap.get(weight.grammarCategory);

    const daysSinceLastPractice = mastery?.lastPracticedAt
      ? Math.floor((now - mastery.lastPracticedAt.getTime()) / 86400000)
      : MAX_RETENTION_DAYS_FALLBACK;

    candidates.push({
      id: `grammar:${weight.grammarCategory}`,
      label: weight.grammarCategory,
      labelZh: weight.grammarCategoryZh,
      type: 'grammar',
      masteryScore: mastery?.masteryScore ?? 50, // Default to 50 if no data
      mistakeCount: mistakes?.mistakeCount ?? 0,
      examWeight: weight.normalizedWeight,
      daysSinceLastPractice,
      practiceCount: mastery?.practiceCount ?? 0,
    });
  }

  return candidates;
}

const MAX_RETENTION_DAYS_FALLBACK = 30;

/**
 * Build vocabulary recommendation candidates.
 */
async function buildVocabularyCandidates(
  _studentId: string,
): Promise<RecommendationCandidate[]> {
  // Vocabulary recommendations: focus on low-mastery vocabulary categories
  // Currently returns a generic vocabulary review recommendation
  return [
    {
      id: 'vocab:general',
      label: 'general-vocabulary',
      labelZh: '一般詞彙',
      type: 'vocabulary',
      masteryScore: 50,
      mistakeCount: 0,
      examWeight: 0.6,
      daysSinceLastPractice: 7,
      practiceCount: 0,
    },
  ];
}

/**
 * Build writing topic recommendation candidates.
 */
async function buildWritingCandidates(
  _studentId: string,
): Promise<RecommendationCandidate[]> {
  return [
    {
      id: 'writing:argumentative',
      label: 'argumentative-essay',
      labelZh: '議論文',
      type: 'writing',
      masteryScore: 50,
      mistakeCount: 0,
      examWeight: 0.9,
      daysSinceLastPractice: 14,
      practiceCount: 0,
    },
    {
      id: 'writing:discursive',
      label: 'discursive-essay',
      labelZh: '討論文',
      type: 'writing',
      masteryScore: 50,
      mistakeCount: 0,
      examWeight: 0.85,
      daysSinceLastPractice: 14,
      practiceCount: 0,
    },
  ];
}

// ============================================
// Public API
// ============================================

/**
 * Get the next recommended exercise focus.
 * Returns ranked candidates filtered to exercise type.
 */
export async function recommendNextExercise(
  studentId: string,
  limit = 5,
): Promise<ScoredRecommendation[]> {
  const candidates = await buildGrammarCandidates(studentId);
  return getTopRecommendations(candidates, 'grammar', limit);
}

/**
 * Get recommended grammar topics to practice.
 */
export async function recommendGrammar(
  studentId: string,
  limit = 5,
): Promise<ScoredRecommendation[]> {
  const candidates = await buildGrammarCandidates(studentId);
  return getTopRecommendations(candidates, 'grammar', limit);
}

/**
 * Get recommended vocabulary areas.
 */
export async function recommendVocabulary(
  studentId: string,
  limit = 5,
): Promise<ScoredRecommendation[]> {
  const candidates = await buildVocabularyCandidates(studentId);
  return getTopRecommendations(candidates, 'vocabulary', limit);
}

/**
 * Get recommended writing topics.
 */
export async function recommendWritingTopic(
  studentId: string,
  limit = 3,
): Promise<ScoredRecommendation[]> {
  const candidates = await buildWritingCandidates(studentId);
  return getTopRecommendations(candidates, 'writing', limit);
}

/**
 * Get full recommendation result across all types.
 */
export async function getFullRecommendations(
  studentId: string,
  limit = 5,
): Promise<RecommendationResult> {
  const [grammarCandidates, vocabCandidates, writingCandidates] = await Promise.all([
    buildGrammarCandidates(studentId),
    buildVocabularyCandidates(studentId),
    buildWritingCandidates(studentId),
  ]);

  const allCandidates = [...grammarCandidates, ...vocabCandidates, ...writingCandidates];
  const allRanked = rankCandidates(allCandidates);

  return {
    studentId,
    topRecommendations: allRanked.slice(0, limit),
    recommendedGrammar: allRanked.filter(r => r.candidate.type === 'grammar').slice(0, limit),
    recommendedVocabulary: allRanked.filter(r => r.candidate.type === 'vocabulary').slice(0, limit),
    recommendedWriting: allRanked.filter(r => r.candidate.type === 'writing').slice(0, limit),
    recommendedExercise: allRanked.filter(r => r.candidate.type === 'grammar').slice(0, limit),
    generatedAt: new Date(),
  };
}
