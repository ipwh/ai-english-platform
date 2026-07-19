// Sprint 35: ChallengeCurator — generates appropriate challenges
import type {
  PersonalizationContext, TutorOutput,
} from '../types';
import { weaknessLocator } from '@/modules/knowledge-graph/services/weakness-locator';
import { learningPathGenerator } from '@/modules/knowledge-graph/services/learning-path-generator';

// ============================================
// ChallengeCurator
// ============================================

export class ChallengeCurator {

  /** Generate a personalized challenge */
  curate(ctx: PersonalizationContext): {
    challenge: string;
    challengeZh: string;
    difficulty: 'remedial' | 'core' | 'challenge';
    skill: string;
    timeEstimate: number;
  } {
    // Find weakest skill area
    const weaknesses = weaknessLocator.locate({
      studentId: ctx.studentId,
      masteryScores: ctx.masteryScores,
    });

    const weakestSkill = weaknesses.skillBreakdown[0];
    const skill = weakestSkill?.skill || 'grammar';
    const avgGap = weakestSkill?.averageGap || 30;

    // Determine difficulty: challenge them just above current level
    const difficulty = avgGap > 40 ? 'remedial' :
      avgGap > 20 ? 'core' : 'challenge';

    const challenge = this.buildChallenge(skill, difficulty, ctx);
    const challengeZh = this.buildChallengeZh(skill, difficulty, ctx);

    return {
      challenge,
      challengeZh,
      difficulty,
      skill,
      timeEstimate: difficulty === 'challenge' ? 15 : difficulty === 'core' ? 10 : 8,
    };
  }

  private buildChallenge(skill: string, difficulty: string, ctx: PersonalizationContext): string {
    const challenges: Record<string, Record<string, string>> = {
      grammar: {
        remedial: 'Complete 5 fill-in-the-blank questions about basic tenses. Can you get all 5 correct?',
        core: 'Correct 3 sentences with tense errors. Explain why each correction is needed.',
        challenge: 'Write a short paragraph using at least 4 different tenses correctly.',
      },
      vocabulary: {
        remedial: 'Match 10 words to their definitions. Aim for 80% accuracy!',
        core: 'Use 5 new vocabulary words in original sentences that show you understand the meaning.',
        challenge: 'Write a paragraph using 8 new words naturally. Make sure each word fits the context perfectly.',
      },
      reading: {
        remedial: 'Read a short passage and answer 3 comprehension questions.',
        core: 'Read a passage and identify the main idea, supporting details, and author\'s purpose.',
        challenge: 'Read a complex passage and write a critical summary in your own words.',
      },
      writing: {
        remedial: 'Write 3 sentences about your daily routine. Check your grammar!',
        core: 'Write a 100-word paragraph with a clear topic sentence and supporting details.',
        challenge: 'Write a 200-word essay arguing for or against a topic. Include counterarguments.',
      },
      listening: {
        remedial: 'Listen to a short dialogue and answer 3 simple questions.',
        core: 'Listen to a conversation and identify the speakers\' attitudes and intentions.',
        challenge: 'Listen to a lecture excerpt and summarize the key points in your own words.',
      },
      speaking: {
        remedial: 'Practice reading 5 sentences aloud with correct pronunciation.',
        core: 'Prepare and deliver a 1-minute speech about your favorite topic.',
        challenge: 'Record a 2-minute argument on a debate topic with clear structure.',
      },
    };

    return challenges[skill]?.[difficulty]
      || `Complete a ${difficulty}-level exercise in ${skill}. Push yourself a little further today!`;
  }

  private buildChallengeZh(skill: string, difficulty: string, ctx: PersonalizationContext): string {
    const challenges: Record<string, Record<string, string>> = {
      grammar: {
        remedial: '完成 5 題基礎時態填充題。你能全對嗎？',
        core: '修正 3 句含時態錯誤的句子，並解釋每項修正的原因。',
        challenge: '寫一段短文，正確運用至少 4 種不同時態。',
      },
      vocabulary: {
        remedial: '配對 10 個詞彙及其定義。目標 80% 正確率！',
        core: '用 5 個新詞彙創作原創句子，展示你理解詞義。',
        challenge: '寫一段文字，自然運用 8 個新詞彙。確保每個詞都完美切合上下文。',
      },
      reading: {
        remedial: '閱讀短文並回答 3 題理解問題。',
        core: '閱讀文章，找出主旨、支持細節和作者目的。',
        challenge: '閱讀複雜文章，用自己的文字寫評論摘要。',
      },
      writing: {
        remedial: '寫 3 句關於日常生活的句子。檢查文法！',
        core: '寫一段 100 字的段落，有清晰的主題句和支持細節。',
        challenge: '寫一篇 200 字的文章，支持或反對一個議題，包含反駁論點。',
      },
      listening: {
        remedial: '聆聽一段簡短對話，回答 3 題簡單問題。',
        core: '聆聽對話，辨識說話者的態度和意圖。',
        challenge: '聆聽講座摘錄，用自己的文字總結要點。',
      },
    };

    return challenges[skill]?.[difficulty]
      || `完成一個 ${difficulty === 'challenge' ? '挑戰' : difficulty === 'core' ? '核心' : '補底'}級別的${skill}練習。今天再進一步！`;
  }
}

export const challengeCurator = new ChallengeCurator();
