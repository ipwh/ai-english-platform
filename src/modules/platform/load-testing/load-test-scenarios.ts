// Sprint 97: Load Test Scenarios — predefined load patterns
import type { LoadScenario } from './load-test-types';

export const LOAD_SCENARIOS: LoadScenario[] = [
  {
    name: 'single-generate-questions',
    description: 'Single request: generate 3 MC questions',
    pattern: 'single',
    concurrency: 1,
    totalRequests: 1,
    targetFn: 'generateQuestions',
    input: { grammarItem: 'Conditionals', grammarItemZh: '條件句', difficulty: 'core', gradeLevel: 'S4', count: 3, questionType: 'mc' },
  },
  {
    name: 'burst-10-analyze-answer',
    description: 'Burst: 10 concurrent answer analyses',
    pattern: 'burst',
    concurrency: 10,
    totalRequests: 10,
    burstDelayMs: 50,
    targetFn: 'analyzeAnswer',
    input: { question: 'If it ___ tomorrow, we will stay home.', questionType: 'mc', correctAnswer: 'B', studentAnswer: 'A', choices: ['rain', 'rains', 'rained', 'raining'], grammarItemZh: '條件句' },
  },
  {
    name: 'sustained-5-writing',
    description: 'Sustained: 5 concurrent writing analyses over 30s',
    pattern: 'sustained',
    concurrency: 5,
    totalRequests: 15,
    durationMs: 30000,
    targetFn: 'analyzeWriting',
    input: { title: 'My Favourite Hobby', prompt: 'Write about your favourite hobby.', studentDraft: 'My favourite hobby is playing basketball. I very like it because it is exciting. I play basketball with my friends every weekend.', studentLevel: 'S3', difficulty: 'core', textType: 'article' },
  },
  {
    name: 'mixed-8-ai-requests',
    description: 'Mixed: 8 concurrent requests across all 4 use cases',
    pattern: 'mixed',
    concurrency: 8,
    totalRequests: 16,
    targetFn: 'mixed',
    input: {},
  },
];
