// ============================================
// Live simulation — option COMBINATION matrix (2026-10-11, Sprint 147)
// ============================================
// The picker lets a student choose 1 category, any number of topics (55 of them), a
// difficulty, a question count and any subset of the five question types. This script walks
// that option space and, for every combination, checks the things a student would notice:
//
//   1. does the request normalize at all (no 400 for a legal combination)?
//   2. does the student get as many items as asked for — and is a shortfall reported as a
//      shortfall rather than silently fewer items?
//   3. does EVERY type the student ticked appear at least once (when the count allows)?
//      A student who ticks 轉換 stops trusting the picker if they only ever receive 選擇題.
//   4. is each delivered answer key marked correct by the production grading entry point,
//      and is a deliberately wrong answer marked incorrect?
//   5. does the item actually concern the topic (not just the category)?
//
// Gated by CP_LIVE_SIM=1 (provider tokens). Nothing is persisted; the AI usage ledger counts
// the calls. `--only=<caseId>` runs one case (for cheap re-checks after a fix).
//
// Usage:  $env:CP_LIVE_SIM="1"; npx tsx scripts/simulate-custom-practice-combinations.ts [--only=<id>]
// ============================================

import { readEnvValue, argValue } from './lib/db-env';
import { resolve } from 'node:path';

const SIM_KEY = 'CP_LIVE_SIM';

type Category = 'grammar' | 'sentence_pattern' | 'vocabulary';

interface Combo {
  id: string;
  /** What the student picked; `undefined` type list means "leave it to the system". */
  category: Category;
  topics: string[];
  difficulty: 'basic' | 'intermediate' | 'advanced';
  count: number;
  types?: string[];
  /** One keyword that must appear in the first delivered item (topic fidelity). */
  expects: string[];
}

const ALL_TYPES = ['mc', 'fill_blank', 'error_correction', 'transformation', 'sentence_production'];

const COMBOS: Combo[] = [
  // --- A. one type at a time, on a topic where that type is the point -------------------
  // (count >= MIN_QUESTIONS: the UI/API floor is 3, so a 2-question case would only test
  //  my own script — see MIN_QUESTIONS in request-normalizer.ts.)
  { id: 'A1-mc', category: 'grammar', topics: ['present-perfect'], difficulty: 'intermediate', count: 3, types: ['mc'], expects: ['present perfect', 'perfect'] },
  { id: 'A2-fill_blank', category: 'vocabulary', topics: ['fixed-collocations'], difficulty: 'intermediate', count: 3, types: ['fill_blank'], expects: ['collocation', 'depend', 'interested', 'responsible'] },
  { id: 'A3-error_correction', category: 'grammar', topics: ['punctuation'], difficulty: 'intermediate', count: 3, types: ['error_correction'], expects: ['comma', 'semicolon', 'colon', 'splice', 'punctuat'] },
  { id: 'A4-transformation', category: 'sentence_pattern', topics: ['reduced-clauses'], difficulty: 'intermediate', count: 3, types: ['transformation'], expects: ['participle', 'reduc', 'clause'] },
  { id: 'A5-sentence_production', category: 'vocabulary', topics: ['idioms'], difficulty: 'intermediate', count: 3, types: ['sentence_production'], expects: ['idiom'] },

  // --- B. explicit pairs and triples (the "student mixes types" case) -------------------
  { id: 'B1-mc+transformation', category: 'sentence_pattern', topics: ['cleft'], difficulty: 'intermediate', count: 3, types: ['mc', 'transformation'], expects: ['cleft', 'it is', 'what'] },
  { id: 'B2-fill+error', category: 'grammar', topics: ['quantifiers'], difficulty: 'basic', count: 3, types: ['fill_blank', 'error_correction'], expects: ['quantifier', 'many', 'much', 'few', 'some'] },
  { id: 'B3-transformation+production', category: 'sentence_pattern', topics: ['causative'], difficulty: 'advanced', count: 3, types: ['transformation', 'sentence_production'], expects: ['causative', 'have', 'get'] },

  // --- C. the coverage stress: ALL five types selected ---------------------------------
  { id: 'C1-all-types-5q', category: 'grammar', topics: ['passive'], difficulty: 'intermediate', count: 5, types: ALL_TYPES, expects: ['passive', 'be', 'p.p'] },
  { id: 'C2-all-types-10q', category: 'sentence_pattern', topics: ['conditionals'], difficulty: 'intermediate', count: 10, types: ALL_TYPES, expects: ['conditional', 'if'] },

  // --- D. multi-topic selections across groups -----------------------------------------
  { id: 'D1-three-grammar-topics', category: 'grammar', topics: ['present-perfect', 'used-to', 'quantifiers'], difficulty: 'intermediate', count: 3, expects: ['perfect', 'used to', 'quantifier', 'many', 'much'] },
  { id: 'D2-two-clause-topics', category: 'sentence_pattern', topics: ['noun-clauses', 'adverbial-clauses'], difficulty: 'intermediate', count: 3, types: ['mc', 'transformation'], expects: ['clause'] },
  { id: 'D3-two-vocab-topics', category: 'vocabulary', topics: ['confusable', 'phrasal-verbs'], difficulty: 'intermediate', count: 3, expects: ['affect', 'effect', 'borrow', 'lend', 'phrasal'] },

  // --- E. extremes ----------------------------------------------------------------------
  { id: 'E1-all-topics-grammar', category: 'grammar', topics: ['ALL'], difficulty: 'intermediate', count: 3, expects: [] },
  { id: 'E2-basic-difficulty', category: 'grammar', topics: ['articles'], difficulty: 'basic', count: 3, expects: ['article', 'a ', 'an ', 'the'] },
  { id: 'E3-advanced-difficulty', category: 'sentence_pattern', topics: ['subjunctive'], difficulty: 'advanced', count: 3, expects: ['subjunctive', 'suggest', 'insist', 'recommend'] },
  { id: 'E4-ten-questions-default-types', category: 'vocabulary', topics: ['make-do-take'], difficulty: 'intermediate', count: 10, expects: ['make', 'do', 'take', 'collocation'] },

  // --- F. a type that does NOT suit the topic (student's choice still wins) -------------
  { id: 'F1-punctuation+production', category: 'grammar', topics: ['punctuation'], difficulty: 'intermediate', count: 3, types: ['sentence_production'], expects: ['punctuat', 'comma', 'semicolon', 'colon', 'capital'] },
  { id: 'F2-idioms+mc', category: 'vocabulary', topics: ['idioms'], difficulty: 'intermediate', count: 3, types: ['mc'], expects: ['idiom'] },
];

function preview(text: string, max = 130): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

interface CaseResult {
  id: string;
  ok: boolean;
  delivered: string;
  coverage: string;
  keys: string;
  /** Failures — a student would notice something broken. */
  problems: string[];
  /** Informational: single-round yield, honest shortfall. Not a defect. */
  notes: string[];
}

const results: CaseResult[] = [];

async function main(): Promise<void> {
  if (process.env[SIM_KEY] !== '1') {
    console.log(`Refusing to run: set ${SIM_KEY}=1 — this calls the AI provider and costs tokens.`);
    process.exit(2);
  }

  const envPath = resolve(process.cwd(), '.env.local');
  for (const key of [
    'DATABASE_URL', 'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL',
    'AI_TIMEOUT_MS', 'AI_DAILY_TOKEN_LIMIT', 'AI_MONTHLY_COST_LIMIT', 'AI_CACHE_ENABLED',
  ]) {
    if (process.env[key]) continue;
    const value = readEnvValue(envPath, key);
    if (value) process.env[key] = value;
  }

  const { isAIConfigured } = await import('../src/modules/ai');
  const { generateCustomPracticeWithAI } = await import('../src/modules/ai');
  const { normalizePracticeRequest } = await import('../src/modules/custom-practice/services/request-normalizer');
  const { validateGeneratedQuestions } = await import('../src/modules/custom-practice/services/generation-service');
  const { verifyGeneratedQuestions } = await import('../src/modules/custom-practice/services/verification-service');
  const { gradeObjectiveItem, gradeCustomPracticeAnswers } = await import('../src/modules/custom-practice/services/grading-service');
  const { CUSTOM_PRACTICE_TOPIC_OPTIONS, composePracticeRequest } = await import('../src/shared/utils/custom-practice-topics');

  if (!isAIConfigured()) {
    console.error('No AI provider configured (DEEPSEEK_API_KEY missing).');
    process.exit(3);
  }

  const only = argValue('--only');
  const combos = COMBOS.filter(combo => !only || combo.id === only);
  console.log(`Option-combination simulation — ${combos.length} case(s)\n`);

  for (const combo of combos) {
    const problems: string[] = [];
    const notes: string[] = [];
    const topicIds = combo.topics[0] === 'ALL'
      ? CUSTOM_PRACTICE_TOPIC_OPTIONS[combo.category].map(option => option.id)
      : combo.topics;
    const requestText = composePracticeRequest('', combo.category, topicIds);
    const normalized = normalizePracticeRequest({
      requestText,
      category: combo.category,
      difficulty: combo.difficulty,
      questionCount: combo.count,
      ...(combo.types ? { exerciseTypes: combo.types } : {}),
    });

    console.log(`\n=== ${combo.id} — ${combo.category} · ${topicIds.length} topic(s) · ${combo.difficulty} · ${combo.count}Q`);
    console.log(`    text(${requestText.length}): ${preview(requestText, 150)}`);
    if (!normalized.ok) {
      problems.push(`normalize failed: ${normalized.code}`);
      results.push({ id: combo.id, ok: false, delivered: '-', coverage: '-', keys: '-', problems, notes });
      console.log(`    ✗ normalize failed: ${normalized.code}`);
      continue;
    }
    const spec = normalized.spec;
    const wanted = combo.types ?? spec.exerciseTypes;
    console.log(`    types: ${wanted.join(', ')}`);
    if (combo.types && combo.types.length > 5) problems.push('test case asks for more types than exist');

    const generated = await generateCustomPracticeWithAI({
      requestText: spec.requestText,
      objective: spec.objective,
      category: spec.category,
      difficulty: spec.difficulty,
      questionCount: spec.questionCount,
      exerciseTypes: spec.exerciseTypes,
    });
    const { valid, dropped } = validateGeneratedQuestions(generated.questions, spec, { limit: spec.questionCount });
    const verification = await verifyGeneratedQuestions({ spec, questions: valid });
    const accepted = verification.accepted;
    for (const item of dropped) console.log(`    dropped: ${preview(item.reason, 120)}`);
    for (const item of verification.rejected) console.log(`    rejected: ${preview(item.reason, 120)}`);

    // 2. count + honest shortfall
    const deliveredLabel = `${accepted.length}/${spec.questionCount}`;
    if (accepted.length < spec.questionCount) {
      // The harness runs ONE round (no top-up): a shortfall here is the single-round yield,
      // which production refills. Informational, never a defect.
      notes.push(`single-round yield ${accepted.length}/${spec.questionCount} (production runs one top-up round)`);
    }
    if (accepted.length === 0) problems.push('nothing delivered');

    // 3. type coverage of the student's explicit selection
    const deliveredTypes = [...new Set(accepted.map(item => item.questionType))];
    const coverageLabel = deliveredTypes.join('/') || '—';
    if (combo.types && accepted.length >= combo.types.length) {
      const missing = combo.types.filter(type => !deliveredTypes.includes(type));
      if (missing.length > 0) problems.push(`ticked type(s) never delivered: ${missing.join(', ')}`);
    }

    // 5. topic fidelity on the first item
    if (combo.expects.length > 0 && accepted[0]) {
      const haystack = `${accepted[0].targetRule} ${accepted[0].instructions} ${accepted[0].prompt}`.toLowerCase();
      if (!combo.expects.some(keyword => haystack.includes(keyword.toLowerCase()))) {
        problems.push(`first item looks off-topic: ${preview(accepted[0].targetRule, 90)}`);
      }
    }

    // 4. key integrity for the first two items (cost control)
    const keyVerdicts: string[] = [];
    for (const item of accepted.slice(0, 2)) {
      const questionId = `combo-${combo.id}`;
      if (item.questionType === 'mc') {
        const keyResult = gradeObjectiveItem({
          questionId, answerText: item.answerKey, answerKey: item.answerKey,
          acceptedAnswers: item.acceptedAnswers, maxMarks: item.maxMarks, targetRule: item.targetRule,
        });
        const letters = [...new Set([...item.prompt.matchAll(/([A-D])\)/g)].map(match => match[1]))];
        const wrong = letters.find(letter => letter !== item.answerKey.trim().toUpperCase());
        keyVerdicts.push(`mc:${keyResult.verdict}`);
        if (keyResult.verdict !== 'correct') problems.push(`key graded ${keyResult.verdict}`);
        if (wrong) {
          const wrongResult = gradeObjectiveItem({
            questionId, answerText: wrong, answerKey: item.answerKey,
            acceptedAnswers: item.acceptedAnswers, maxMarks: item.maxMarks, targetRule: item.targetRule,
          });
          keyVerdicts.push(`mc-wrong:${wrongResult.verdict}`);
          if (wrongResult.verdict === 'correct') problems.push('a wrong option was graded correct');
        }
      } else {
        const base = {
          questionId, questionType: item.questionType, instructions: item.instructions, prompt: item.prompt,
          targetRule: item.targetRule, rubric: item.rubric, maxMarks: item.maxMarks,
          answerKey: item.answerKey, acceptedAnswers: item.acceptedAnswers, rejectedAnswers: item.rejectedAnswers,
          explanationEn: item.explanationEn,
        };
        const specPair = { category: spec.category, difficulty: spec.difficulty };
        const keyResult = await gradeCustomPracticeAnswers({ spec: specPair, questions: [{ ...base, answerText: item.answerKey }], objective: [] });
        const wrongText = item.rejectedAnswers[0]?.answer ?? 'zzz — unrelated to the target structure';
        const wrongResult = await gradeCustomPracticeAnswers({ spec: specPair, questions: [{ ...base, answerText: wrongText }], objective: [] });
        keyVerdicts.push(`${item.questionType}:${keyResult.items[0]?.verdict ?? 'missing'}`);
        keyVerdicts.push(`${item.questionType}-wrong:${wrongResult.items[0]?.verdict ?? 'missing'}`);
        if (keyResult.items[0]?.verdict !== 'correct') problems.push(`key graded ${keyResult.items[0]?.verdict ?? 'missing'} (${item.questionType})`);
        if (wrongResult.items[0]?.verdict === 'correct') problems.push(`a wrong answer was graded correct (${item.questionType})`);
      }
    }
    console.log(`    delivered ${deliveredLabel} · types ${coverageLabel} · keys ${keyVerdicts.join(' ')}`);

    results.push({
      id: combo.id, ok: problems.length === 0,
      delivered: deliveredLabel, coverage: coverageLabel, keys: keyVerdicts.join(' '), problems, notes,
    });
  }

  console.log('\n\n==================== COMBINATION MATRIX ====================');
  for (const result of results) {
    console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.id.padEnd(30)} delivered ${result.delivered.padEnd(6)} types ${result.coverage.padEnd(34)} keys ${result.keys}`);
    for (const problem of result.problems) console.log(`        ⚠ ${problem}`);
    for (const note of result.notes) console.log(`        · ${note}`);
  }
  const failed = results.filter(result => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} combinations clean.`);
  if (failed.length > 0) {
    console.error(`FAILED: ${failed.map(result => result.id).join(', ')}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('simulation crashed:', error);
  process.exit(1);
});
