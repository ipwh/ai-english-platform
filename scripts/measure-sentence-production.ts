// ============================================
// Live measurement — 造句 (sentence_production) on OPEN-ENDED topics (2026-10-10, Sprint 146)
// ============================================
// The open-ended topics (篇章標記 / 慣用語 / 日常用語 / 主題詞彙 / 比喻句) default to
// `sentence_production`, which is the only type the server CANNOT mark deterministically —
// it goes to the AI marker and falls back to 待覆核 (needs_review) whenever the marker's
// confidence is below OPEN_ENDED_MIN_CONFIDENCE. That fallback is by design, but nobody had
// measured HOW OFTEN it fires, and a fallback that fires on most legitimate answers would
// make the topic useless to a student.
//
// So this run measures, per answer class, the verdict distribution of the production
// grading entry point:
//   · reference key          → must never be incorrect / needs_review (the platform must be
//                              able to validate its own item)
//   · accepted variant       → the "legitimately different wording" case; needs_review here
//                              is the number that matters most
//   · deliberately wrong     → must never be correct
//
// It also probes an incompatible student choice (標點 + 造句) to see what a student gets when
// the chosen type does not obviously suit the topic.
//
// Gated by CP_LIVE_SIM=1 (provider tokens). Nothing is persisted; the AI usage ledger counts
// the calls, as it does for any run.
//
// Usage:  $env:CP_LIVE_SIM="1"; npx tsx scripts/measure-sentence-production.ts
// ============================================

import { readEnvValue, argValue } from './lib/db-env';
import { resolve } from 'node:path';

const SIM_KEY = 'CP_LIVE_SIM';
const QUESTION_COUNT = 2;
const PROBE = { category: 'grammar', id: 'punctuation' } as const;

interface VerdictTally {
  correct: number;
  partially_correct: number;
  incorrect: number;
  needs_review: number;
}

/** What the production grading entry point needs for one open-ended item. */
interface ProductionItem {
  questionId: string;
  questionType: string;
  instructions: string;
  prompt: string;
  targetRule: string;
  rubric: { marks: number; criteria: string[] };
  maxMarks: number;
  answerKey: string;
  acceptedAnswers: string[];
  rejectedAnswers: Array<{ answer: string; why: string }>;
  explanationEn: string;
}

const emptyTally = (): VerdictTally => ({ correct: 0, partially_correct: 0, incorrect: 0, needs_review: 0 });
const rate = (tally: VerdictTally): string => {
  const total = tally.correct + tally.partially_correct + tally.incorrect + tally.needs_review;
  return total === 0 ? 'n/a' : `${tally.needs_review}/${total} (${Math.round((tally.needs_review / total) * 100)}%)`;
};

/** Confidence the marker reported when it fell back to needs_review (parsed from the rationale). */
function confidenceOf(rationale: string): string {
  const match = rationale.match(/confidence\s+([0-9.]+)/i);
  return match ? match[1] : '?';
}

function preview(text: string, max = 150): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

async function main(): Promise<void> {
  if (process.env[SIM_KEY] !== '1') {
    console.log(`Refusing to run: set ${SIM_KEY}=1 — this calls the AI provider and costs tokens.`);
    process.exit(2);
  }

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
  const { gradeCustomPracticeAnswers } = await import('../src/modules/custom-practice/services/grading-service');
  const { CUSTOM_PRACTICE_TOPIC_OPTIONS, composePracticeRequest } = await import(
    '../src/shared/utils/custom-practice-topics'
  );

  if (!isAIConfigured()) {
    console.error('No AI provider configured (DEEPSEEK_API_KEY missing).');
    process.exit(3);
  }

  // Every topic whose defaults recommend 造句 — the measurement target, derived, not hardcoded.
  // `--topic=category/id` narrows the run (used to re-probe one topic without paying for all).
  const only = argValue('--topic');
  const targets = (['grammar', 'sentence_pattern', 'vocabulary'] as const)
    .flatMap(category =>
      CUSTOM_PRACTICE_TOPIC_OPTIONS[category]
        .filter(option => option.defaultQuestionTypes.includes('sentence_production'))
        .map(option => ({ category, id: option.id }))
    )
    .filter(topic => !only || `${topic.category}/${topic.id}` === only);
  console.log(
    `造句 measurement — ${targets.length} open-ended topics × ${QUESTION_COUNT} items (type forced to sentence_production)` +
      `${only ? ` · topic filter ${only}` : ' + 1 incompatible-choice probe'}\n`
  );

  const keys = emptyTally();
  const variants = emptyTally();
  const wrongs = emptyTally();
  const problems: string[] = [];

  const runCase = async (topic: { category: 'grammar' | 'sentence_pattern' | 'vocabulary'; id: string }, forcedTypes?: string[]) => {
    const label = `${topic.category}/${topic.id}`;
    const requestText = composePracticeRequest('', topic.category, [topic.id]);
    // Forcing a type must go through the normalizer, otherwise the spec (which the validator
    // filters by) and the AI call disagree and every item is dropped as "not requested".
    const normalized = normalizePracticeRequest({
      requestText,
      category: topic.category,
      ...(forcedTypes ? { exerciseTypes: forcedTypes } : {}),
    });
    if (!normalized.ok) {
      problems.push(`${label}: normalize failed (${normalized.code})`);
      return null;
    }
    const spec = normalized.spec;
    console.log(`\n=== ${label}${forcedTypes ? ' (forced types)' : ''} — ${preview(requestText, 140)}`);
    console.log(`    allowed types: ${spec.exerciseTypes.join(', ')}`);

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
      `    generated ${generated.questions.length} · valid ${valid.length} · dropped ${dropped.length}` +
        ` · accepted ${verification.accepted.length} / rejected ${verification.rejected.length}`
    );
    for (const item of dropped) console.log(`      dropped: ${preview(item.reason, 130)}`);
    for (const item of verification.rejected) console.log(`      rejected: ${preview(item.reason, 130)}`);

    const production = verification.accepted.filter(item => item.questionType === 'sentence_production');
    if (production.length === 0 && verification.accepted.length > 0) {
      problems.push(`${label}: the requested type produced no sentence_production item`);
    }
    if (verification.accepted.length === 0) {
      problems.push(`${label}: nothing survived validation + verification`);
    }
    return { label, spec, accepted: verification.accepted };
  };

  /** The production-grading entry point, called exactly as the submission service calls it. */
  const grade = async (
    category: string,
    difficulty: string,
    item: ProductionItem,
    answerText: string
  ) => {
    const result = await gradeCustomPracticeAnswers({
      spec: {
        category: category as 'grammar' | 'sentence_pattern' | 'vocabulary',
        difficulty: difficulty as 'basic' | 'intermediate' | 'advanced',
      },
      questions: [{ ...item, answerText }],
      objective: [],
    });
    return result.items[0] ?? null;
  };

  for (const topic of targets) {
    // Forced to 造句 alone: the measurement is about production items, and a student can make
    // the same choice by ticking 造句 in the picker.
    const run = await runCase(topic, ['sentence_production']);
    if (!run) continue;
    let index = 0;
    for (const item of run.accepted) {
      if (item.questionType !== 'sentence_production') continue;
      index += 1;
      const base = {
        questionId: `sp-${topic.id}-${index}`,
        questionType: item.questionType,
        instructions: item.instructions,
        prompt: item.prompt,
        targetRule: item.targetRule,
        rubric: item.rubric,
        maxMarks: item.maxMarks,
        answerKey: item.answerKey,
        acceptedAnswers: item.acceptedAnswers,
        rejectedAnswers: item.rejectedAnswers,
        explanationEn: item.explanationEn,
      };
      console.log(`    · ${preview(item.targetRule, 80)}`);
      console.log(`      task: ${preview(item.prompt, 170)}`);
      console.log(`      key: ${preview(item.answerKey, 110)} | variants: ${item.acceptedAnswers.length}`);

      const keyGraded = await grade(run.spec.category, run.spec.difficulty, base, item.answerKey);
      if (keyGraded) {
        keys[keyGraded.verdict] += 1;
        const note = keyGraded.verdict === 'needs_review' ? ` (confidence ${confidenceOf(keyGraded.rationale)})` : '';
        console.log(`      key graded: ${keyGraded.verdict}${note}`);
        if (keyGraded.verdict === 'incorrect') problems.push(`${run.label}: the reference key was graded incorrect`);
      }

      const variant = item.acceptedAnswers[0];
      if (variant) {
        const variantGraded = await grade(run.spec.category, run.spec.difficulty, base, variant);
        if (variantGraded) {
          variants[variantGraded.verdict] += 1;
          const note = variantGraded.verdict === 'needs_review' ? ` (confidence ${confidenceOf(variantGraded.rationale)})` : '';
          console.log(`      variant "${preview(variant, 60)}" graded: ${variantGraded.verdict}${note}`);
        }
      }

      const wrongText = item.rejectedAnswers[0]?.answer ?? 'This is not a sentence using the target structure at all.';
      const wrongGraded = await grade(run.spec.category, run.spec.difficulty, base, wrongText);
      if (wrongGraded) {
        wrongs[wrongGraded.verdict] += 1;
        const note = wrongGraded.verdict === 'needs_review' ? ` (confidence ${confidenceOf(wrongGraded.rationale)})` : '';
        console.log(`      wrong answer graded: ${wrongGraded.verdict}${note}`);
        if (wrongGraded.verdict === 'correct') problems.push(`${run.label}: a wrong answer was graded correct`);
      }
    }
  }

  console.log('\n\n=== INCOMPATIBLE-CHOICE PROBE: 標點 + 造句 ===');
  const probe = only ? null : await runCase(PROBE, ['sentence_production']);

  console.log('\n==================== 造句 VERDICT MATRIX ====================');
  console.log(`reference keys      : ${JSON.stringify(keys)} · needs_review ${rate(keys)}`);
  console.log(`accepted variants   : ${JSON.stringify(variants)} · needs_review ${rate(variants)}`);
  console.log(`wrong answers       : ${JSON.stringify(wrongs)} · needs_review ${rate(wrongs)}`);
  if (probe) {
    console.log(
      `incompatible probe  : accepted ${probe.accepted.length} item(s) — ` +
        (probe.accepted.length > 0
          ? `types ${probe.accepted.map(item => item.questionType).join(', ')}`
          : 'NOTHING was delivered for 標點 + 造句')
    );
  }
  if (problems.length > 0) {
    console.error('\nPROBLEMS:');
    for (const problem of problems) console.error(`  ⚠ ${problem}`);
    process.exit(1);
  }
  console.log('\nNo integrity problem found (keys and wrong answers were graded as expected).');
}

main().catch(error => {
  console.error('measurement crashed:', error);
  process.exit(1);
});
