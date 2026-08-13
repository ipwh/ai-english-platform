// ============================================
// Tests: AI Schema Validation (Zod) — Writing Analysis & Answer Analysis
// P1: Core AI function test coverage
// ============================================

import { describe, it, expect } from 'vitest';
import {
  AnswerAnalysisSchema,
  WritingAnalysisSchema,
  GeneratedQuestionSchema,
  MistakeExplanationSchema,
} from '../schemas/ai-schema';

// ============================================
// 一、AnswerAnalysis Schema
// ============================================

describe('AnswerAnalysisSchema', () => {
  const validAnswer = {
    isCorrect: true,
    score: 85,
    feedbackZh: '回答正確，文法使用恰當。',
    feedbackEn: 'Correct answer with proper grammar.',
    mistakeType: 'none' as const,
    explanation: 'The answer correctly uses past tense.',
    improvementTip: 'Continue practicing past tense structures.',
    relatedGrammarPoint: 'Past Tense',
  };

  it('should accept a valid correct answer', () => {
    expect(() => AnswerAnalysisSchema.parse(validAnswer)).not.toThrow();
  });

  it('should accept an incorrect answer with mistake type', () => {
    const incorrect = { ...validAnswer, isCorrect: false, score: 30, mistakeType: 'grammar' as const };
    expect(() => AnswerAnalysisSchema.parse(incorrect)).not.toThrow();
  });

  it('should reject missing feedbackZh', () => {
    const { feedbackZh, ...invalid } = validAnswer;
    expect(() => AnswerAnalysisSchema.parse(invalid)).toThrow();
  });

  it('should reject score out of range', () => {
    expect(() => AnswerAnalysisSchema.parse({ ...validAnswer, score: 150 })).toThrow();
    expect(() => AnswerAnalysisSchema.parse({ ...validAnswer, score: -10 })).toThrow();
  });

  it('should reject invalid mistakeType', () => {
    expect(() =>
      AnswerAnalysisSchema.parse({ ...validAnswer, mistakeType: 'invalid_type' })
    ).toThrow();
  });

  it('should accept all valid mistake types', () => {
    const types = ['grammar', 'vocabulary', 'comprehension', 'careless', 'time-management', 'chinglish', 'none'];
    for (const t of types) {
      expect(() => AnswerAnalysisSchema.parse({ ...validAnswer, mistakeType: t })).not.toThrow();
    }
  });
});

// ============================================
// 二、WritingAnalysis Schema
// ============================================

describe('WritingAnalysisSchema', () => {
  const validWriting = {
    overallScore: 67,
    contentScore: 5,
    languageScore: 4,
    organizationScore: 5,
    cloTotalScore: 14,
    dseLevel: '4',
    strengths: ['Good vocabulary', 'Clear structure'],
    weaknesses: ['Occasional tense errors'],
    grammarErrors: [
      { original: 'He go', correction: 'He goes', explanation: 'Subject-verb agreement' },
    ],
    chinglishWarnings: [
      { original: 'I very like it', suggestion: 'I like it very much', explanation: 'Chinese word order pattern' },
    ],
    vocabularySuggestions: [
      { original: 'good', suggestion: 'excellent', reason: 'More precise adjective' },
    ],
    structureFeedback: 'Good use of topic sentences and paragraph transitions.',
    generalComment: 'Keep practicing complex sentence structures.',
  };

  it('should accept a valid writing analysis', () => {
    expect(() => WritingAnalysisSchema.parse(validWriting)).not.toThrow();
  });

  it('should require dseLevel field', () => {
    const { dseLevel, ...invalid } = validWriting;
    expect(() => WritingAnalysisSchema.parse(invalid)).toThrow();
  });

  it('should require overallScore', () => {
    const { overallScore, ...invalid } = validWriting;
    expect(() => WritingAnalysisSchema.parse(invalid)).toThrow();
  });

  it('should reject CLO scores out of 0-7 range', () => {
    expect(() => WritingAnalysisSchema.parse({ ...validWriting, contentScore: 8 })).toThrow();
    expect(() => WritingAnalysisSchema.parse({ ...validWriting, languageScore: -1 })).toThrow();
  });

  it('should accept optional CLO scores', () => {
    const { contentScore, languageScore, organizationScore, cloTotalScore, ...rest } = validWriting;
    expect(() => WritingAnalysisSchema.parse(rest)).not.toThrow();
  });

  it('should accept valid DSE levels (internal 1–5 only)', () => {
    const levels = ['1', '2', '3', '4', '5'];
    for (const lv of levels) {
      expect(() => WritingAnalysisSchema.parse({ ...validWriting, dseLevel: lv })).not.toThrow();
    }
  });

  it('should reject 5* / 5** / U / arbitrary level strings', () => {
    for (const lv of ['0', '6', '5*', '5**', 'U', 'Level 4', 'level 5']) {
      expect(() => WritingAnalysisSchema.parse({ ...validWriting, dseLevel: lv })).toThrow();
    }
  });

  it('should handle empty arrays for errors/suggestions', () => {
    const minimal = {
      ...validWriting,
      vocabularySuggestions: [],
      grammarErrors: [],
      chinglishWarnings: [],
      strengths: [],
      weaknesses: [],
    };
    expect(() => WritingAnalysisSchema.parse(minimal)).not.toThrow();
  });
});

// ============================================
// 三、GeneratedQuestion Schema
// ============================================

describe('GeneratedQuestionSchema', () => {
  const validMcq = {
    type: 'mc' as const,
    prompt: 'What is the capital of France?',
    promptZh: '法國的首都是什麼？',
    choices: ['Paris', 'London', 'Berlin', 'Madrid'],
    answer: 'A',
    explanationZh: '巴黎是法國的首都。',
    explanationEn: 'Paris is the capital of France.',
    commonMistake: 'Students may confuse it with London.',
    grammarPoint: 'Proper nouns',
  };

  it('should accept a valid MCQ question', () => {
    expect(() => GeneratedQuestionSchema.parse(validMcq)).not.toThrow();
  });

  it('should accept a fill-blank question without choices', () => {
    const fb = { ...validMcq, type: 'fill-blank' as const, choices: [] };
    expect(() => GeneratedQuestionSchema.parse(fb)).not.toThrow();
  });

  it('should reject empty answer', () => {
    expect(() => GeneratedQuestionSchema.parse({ ...validMcq, answer: '  ' })).toThrow();
  });

  it('should reject empty prompt', () => {
    expect(() => GeneratedQuestionSchema.parse({ ...validMcq, prompt: '' })).toThrow();
  });

  it('should accept questions with listening/reading content', () => {
    const withContent = {
      ...validMcq,
      listeningContent: 'Woman: Where is the museum? Man: It is on Main Street.',
      readingContent: 'The museum is located on Main Street, next to the library.',
    };
    expect(() => GeneratedQuestionSchema.parse(withContent)).not.toThrow();
  });
});

// ============================================
// 四、MistakeExplanation Schema
// ============================================

describe('MistakeExplanationSchema', () => {
  const validExplanation = {
    reasonZh: '你使用了現在式，但句子描述的是過去事件。',
    reasonEn: 'You used present tense, but the sentence describes a past event.',
    ruleExplanation: 'Past tense is used for completed actions in the past.',
    examples: [
      { wrong: 'I go to school yesterday.', correct: 'I went to school yesterday.' },
    ],
    memoryTip: 'Yesterday = past tense. Remember: time marker + ed/irregular.',
    relatedTopics: ['Simple Past Tense', 'Time Markers'],
  };

  it('should accept a valid mistake explanation', () => {
    expect(() => MistakeExplanationSchema.parse(validExplanation)).not.toThrow();
  });

  it('should reject missing reasonZh', () => {
    const { reasonZh, ...invalid } = validExplanation;
    expect(() => MistakeExplanationSchema.parse(invalid)).toThrow();
  });

  it('should accept empty examples array', () => {
    // Schema allows empty examples (min(1) is on array of objects, not array itself)
    expect(() => MistakeExplanationSchema.parse({ ...validExplanation, examples: [] })).not.toThrow();
  });

  it('should reject malformed examples', () => {
    expect(() =>
      MistakeExplanationSchema.parse({ ...validExplanation, examples: [{ wrong: 'x' }] })
    ).toThrow();
  });
});
