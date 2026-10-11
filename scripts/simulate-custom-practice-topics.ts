// ============================================
// Live simulation — 自訂練習 topic → question quality (2026-10-10, Sprint 146)
// ============================================
// The question this answers, with real provider calls rather than assertions about code:
//
//   "If a student ticks 分詞構句 / 標點 / 介詞搭配 …, do they actually get items about that
//    topic, and are the delivered answer keys correct?"
//
// For each simulated topic it runs the SAME layers the product runs —
//   composePracticeRequest → normalizePracticeRequest (topic-aware types)
//   → generateCustomPracticeWithAI → validateGeneratedQuestions → verifyGeneratedQuestions
//   (blind solve: the verifier never sees the key, mismatches are dropped)
// — then it grades the delivered key through the production grading entry point and grades
// a deliberately wrong answer next to it. A key that the server marks incorrect, or an item
// whose text never mentions the topic, is a FAILURE of this run.
//
// Nothing is persisted (no generateCustomPracticeSet, which would need a real student);
// the only side effect is the AI usage ledger, because the canonical pipeline accounts for
// every call. Gated by CP_LIVE_SIM=1 because it spends provider tokens.
//
// Usage:  $env:CP_LIVE_SIM="1"; npx tsx scripts/simulate-custom-practice-topics.ts
// ============================================

import { readEnvValue } from './lib/db-env';
import { resolve } from 'node:path';

const SIM_KEY = 'CP_LIVE_SIM';
const QUESTION_COUNT = 3;

/** Representative topics: the teacher's examples plus every new family. */
const SIM_TOPICS = [
  { category: 'grammar', id: 'punctuation', expects: ['comma', 'semicolon', 'colon', 'punctuat', 'splice'] },
  { category: 'grammar', id: 'quantifiers', expects: ['quantifier', 'many', 'much', 'some', 'few', 'little', 'lot'] },
  { category: 'grammar', id: 'modal-perfects', expects: ['have', 'should', 'must', 'could', 'deduc', 'regret'] },
  { category: 'sentence_pattern', id: 'reduced-clauses', expects: ['participle', 'reduc', 'ing', 'p.p', 'having'] },
  { category: 'sentence_pattern', id: 'cleft', expects: ['cleft', 'it is', 'it was', 'what', 'emphasi'] },
  { category: 'sentence_pattern', id: 'subjunctive', expects: ['subjunctive', 'suggest', 'insist', 'recommend', 'base form'] },
  { category: 'vocabulary', id: 'fixed-collocations', expects: ['collocation', 'depend on', 'interested in', 'responsible for'] },
  { category: 'vocabulary', id: 'confusable', expects: ['affect', 'effect', 'borrow', 'lend', 'confus'] },
] as const;

interface TopicReport {
  topic: string;
  types: string;
  generated: number;
  valid: number;
  accepted: number;
  rejected: number;
  onTopic: string;
  keyVerdict: string;
  wrongVerdict: string;
  ok: boolean;
  problems: string[];
}

const reports: TopicReport[] = [];

function preview(text: string, max = 120): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function matchesTopic(item: { prompt: string; instructions: string; targetRule: string }, expects: readonly string[]): string | null {
  const haystack = `${item.targetRule} ${item.instructions} ${item.prompt}`.toLowerCase();
  const hit = expects.find(keyword => haystack.includes(keyword.toLowerCase()));
  return hit ?? null;
}

/** The first option letter that is not the key (mc items list "A) … B) …"). */
function wrongLetter(prompt: string, answerKey: string): string | null {
  const letters = [...prompt.matchAll(/([A-D])\)/g)].map(match => match[1]);
  const distinct = [...new Set(letters)];
  return distinct.find(letter => letter !== answerKey.trim().toUpperCase()) ?? null;
}

async function main(): Promise<void> {
  if (process.env[SIM_KEY] !== '1') {
    console.log(`Refusing to run: set ${SIM_KEY}=1 — this calls the AI provider and costs tokens.`);
    process.exit(2);
  }

  // Env first: the canonical pipeline reads provider config, and the usage ledger needs a DB.
  const envPath = resolve(process.cwd(), '.env.local');
  for (const key of [
    'DATABASE_URL',
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_BASE_URL',
    'DEEPSEEK_MODEL',
    'AI_TIMEOUT_MS',
    'AI_DAILY_TOKEN_LIMIT',
    'AI_MONTHLY_COST_LIMIT',
    'AI_CACHE_ENABLED',
  ]) {
    if (process.env[key]) continue;
    const value = readEnvValue(envPath, key);
    if (value) process.env[key] = value;
  }

  const { isAIConfigured, generateCustomPracticeWithAI } = await import('../src/modules/ai');
  const { normalizePracticeRequest } = await import('../src/modules/custom-practice/services/request-normalizer');
  const { validateGeneratedQuestions } = await import('../src/modules/custom-practice/services/generation-service');
  const { verifyGeneratedQuestions } = await import('../src/modules/custom-practice/services/verification-service');
  const { gradeObjectiveItem, gradeCustomPracticeAnswers } = await import(
    '../src/modules/custom-practice/services/grading-service'
  );
  const { composePracticeRequest, topicQuestionTypeDefaults } = await import(
    '../src/shared/utils/custom-practice-topics'
  );

  if (!isAIConfigured()) {
    console.error('No AI provider configured (DEEPSEEK_API_KEY missing).');
    process.exit(3);
  }
  console.log(`Live topic simulation — ${SIM_TOPICS.length} topics × ${QUESTION_COUNT} questions\n`);

  for (const topic of SIM_TOPICS) {
    const label = `${topic.category}/${topic.id}`;
    const problems: string[] = [];
    const requestText = composePracticeRequest('', topic.category, [topic.id]);
    const expectedTypes = topicQuestionTypeDefaults(topic.category, [topic.id]);

    console.log(`\n=== ${label} — ${preview(requestText, 160)}`);
    console.log(`    request text: ${requestText.length} chars · resolved types: ${expectedTypes.join(', ')}`);

    const normalized = normalizePracticeRequest({ requestText, category: topic.category });
    if (!normalized.ok) {
      problems.push(`normalize failed: ${normalized.code}`);
      reports.push({ topic: label, types: '-', generated: 0, valid: 0, accepted: 0, rejected: 0, onTopic: '-', keyVerdict: '-', wrongVerdict: '-', ok: false, problems });
      continue;
    }
    const spec = normalized.spec;
    if (JSON.stringify(spec.exerciseTypes) !== JSON.stringify(expectedTypes)) {
      problems.push(`spec types ${spec.exerciseTypes.join(',')} ≠ topic defaults ${expectedTypes.join(',')}`);
    }

    const generated = await generateCustomPracticeWithAI({
      requestText: spec.requestText,
      objective: spec.objective,
      category: spec.category,
      difficulty: spec.difficulty,
      questionCount: QUESTION_COUNT,
      exerciseTypes: spec.exerciseTypes,
    });
    const { valid, dropped } = validateGeneratedQuestions(generated.questions, spec, { limit: QUESTION_COUNT });
    const verification = await verifyGeneratedQuestions({ spec, questions: valid });

    console.log(
      `    generated ${generated.questions.length} · structurally valid ${valid.length} · dropped ${dropped.length}` +
        ` · verification accepted ${verification.accepted.length} / rejected ${verification.rejected.length}`
    );
    for (const item of dropped) console.log(`      dropped: ${preview(item.reason, 130)}`);
    for (const item of verification.rejected) console.log(`      rejected: ${preview(item.reason, 130)}`);
    if (!verification.verifierAvailable) problems.push('blind-solve verifier unavailable (fail-closed: nothing would ship)');
    if (verification.accepted.length === 0) problems.push('nothing survived verification');

    let onTopicSummary = '—';
    let keyVerdictSummary = '—';
    let wrongVerdictSummary = '—';

    for (const item of verification.accepted) {
      const hit = matchesTopic(item, topic.expects);
      if (!hit) problems.push(`off-topic item: ${preview(item.targetRule, 80)}`);
      if (!spec.exerciseTypes.includes(item.questionType)) {
        problems.push(`type ${item.questionType} not in the requested set`);
      }
      console.log(
        `    · [${item.questionType}] ${hit ? `on-topic(${hit})` : 'OFF-TOPIC'} · ${preview(item.targetRule, 90)}`
      );
      console.log(`      Q: ${preview(item.prompt, 220)}`);
      console.log(`      key: ${preview(item.answerKey, 90)} | accepted: ${item.acceptedAnswers.length} | rule: ${preview(item.targetRule, 60)}`);
    }

    const first = verification.accepted[0];
    if (first) {
      onTopicSummary = matchesTopic(first, topic.expects) ?? 'OFF-TOPIC';
      const questionId = `sim-${topic.id}-0`;
      if (first.questionType === 'mc') {
        const keyResult = gradeObjectiveItem({
          questionId,
          answerText: first.answerKey,
          answerKey: first.answerKey,
          acceptedAnswers: first.acceptedAnswers,
          maxMarks: first.maxMarks,
          targetRule: first.targetRule,
        });
        const wrong = wrongLetter(first.prompt, first.answerKey);
        const wrongResult = wrong
          ? gradeObjectiveItem({
              questionId,
              answerText: wrong,
              answerKey: first.answerKey,
              acceptedAnswers: first.acceptedAnswers,
              maxMarks: first.maxMarks,
              targetRule: first.targetRule,
            })
          : null;
        keyVerdictSummary = `mc:${keyResult.verdict}`;
        wrongVerdictSummary = wrongResult ? `mc:${wrongResult.verdict}(${wrong})` : 'mc:no-distractor';
        if (keyResult.verdict !== 'correct') problems.push(`the delivered key was graded ${keyResult.verdict}`);
        if (wrongResult && wrongResult.verdict === 'correct') problems.push('a wrong option was graded correct');
      } else {
        const base = {
          questionId,
          questionType: first.questionType,
          instructions: first.instructions,
          prompt: first.prompt,
          targetRule: first.targetRule,
          rubric: first.rubric,
          maxMarks: first.maxMarks,
          answerKey: first.answerKey,
          acceptedAnswers: first.acceptedAnswers,
          rejectedAnswers: first.rejectedAnswers,
        };
        const marked = await gradeCustomPracticeAnswers({
          spec: { category: spec.category, difficulty: spec.difficulty },
          questions: [{ ...base, answerText: first.answerKey }],
          objective: [],
        });
        const wrongAnswer = first.rejectedAnswers[0]?.answer ?? 'zzz — nothing to do with the target structure';
        const markedWrong = await gradeCustomPracticeAnswers({
          spec: { category: spec.category, difficulty: spec.difficulty },
          questions: [{ ...base, answerText: wrongAnswer }],
          objective: [],
        });
        const keyVerdict = marked.items[0]?.verdict ?? 'missing';
        const wrongVerdict = markedWrong.items[0]?.verdict ?? 'missing';
        keyVerdictSummary = `${first.questionType}:${keyVerdict}`;
        wrongVerdictSummary = `${first.questionType}:${wrongVerdict}`;
        if (keyVerdict !== 'correct') problems.push(`the delivered key was graded ${keyVerdict}`);
        if (wrongVerdict === 'correct') problems.push('a wrong answer was graded correct');
      }
    }

    reports.push({
      topic: label,
      types: expectedTypes.join('/'),
      generated: generated.questions.length,
      valid: valid.length,
      accepted: verification.accepted.length,
      rejected: verification.rejected.length + dropped.length,
      onTopic: onTopicSummary,
      keyVerdict: keyVerdictSummary,
      wrongVerdict: wrongVerdictSummary,
      ok: problems.length === 0,
      problems,
    });
  }

  console.log('\n\n==================== SUMMARY ====================');
  for (const report of reports) {
    console.log(
      `${report.ok ? 'PASS' : 'FAIL'}  ${report.topic.padEnd(28)} types ${report.types.padEnd(38)} ` +
        `gen ${report.generated} valid ${report.valid} accepted ${report.accepted} dropped/rejected ${report.rejected}`
    );
    console.log(
      `      first item on-topic=${report.onTopic} · key graded ${report.keyVerdict} · wrong answer graded ${report.wrongVerdict}`
    );
    for (const problem of report.problems) console.log(`      ⚠ ${problem}`);
  }
  const failed = reports.filter(report => !report.ok);
  console.log(`\n${reports.length - failed.length}/${reports.length} topics passed.`);
  if (failed.length > 0) {
    console.error(`FAILED topics: ${failed.map(report => report.topic).join(', ')}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('simulation crashed:', error);
  process.exit(1);
});
