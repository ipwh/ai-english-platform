// Sprint 96: Benchmark Scenarios — predefined test inputs for AI use cases
import type { BenchmarkScenario } from './benchmark-types';

export const BENCHMARK_SCENARIOS: BenchmarkScenario[] = [
  {
    name: 'generateQuestions',
    description: 'Generate 3 grammar MC questions at core difficulty',
    input: {
      grammarItem: 'Conditionals',
      grammarItemZh: '條件句',
      difficulty: 'core',
      gradeLevel: 'S4',
      count: 3,
      questionType: 'mc',
    },
    warmupRuns: 1,
    measuredRuns: 3,
  },
  {
    name: 'analyzeAnswer',
    description: 'Analyze a student MC answer for correctness',
    input: {
      question: 'If it ___ tomorrow, we will stay home.',
      questionType: 'mc',
      correctAnswer: 'B',
      studentAnswer: 'A',
      choices: ['rain', 'rains', 'rained', 'raining'],
      grammarItemZh: '條件句',
    },
    warmupRuns: 1,
    measuredRuns: 3,
  },
  {
    name: 'analyzeWriting',
    description: 'Analyze a short student essay (100 words)',
    input: {
      title: 'My Favourite Hobby',
      prompt: 'Write about your favourite hobby and explain why you enjoy it.',
      studentDraft:
        'My favourite hobby is playing basketball. I very like it because it is exciting. ' +
        'I play basketball with my friends every weekend. It helps me relax after studying. ' +
        'Also, it is good for my health. I hope I can play basketball more often.',
      studentLevel: 'S3',
      difficulty: 'core',
      textType: 'article',
    },
    warmupRuns: 1,
    measuredRuns: 2,
  },
  {
    name: 'explainMistake',
    description: 'Explain a grammar mistake to a student',
    input: {
      question: 'Choose: She ___ to school every day.',
      correctAnswer: 'goes',
      studentAnswer: 'go',
      grammarItemZh: '主謂一致',
      studentLevel: 'S2',
      questionType: 'fill-blank',
    },
    warmupRuns: 1,
    measuredRuns: 3,
  },
];
