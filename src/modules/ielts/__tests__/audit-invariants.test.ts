// ============================================
// IELTS Audit Invariants — executable evidence (2026-10-03 engineering audit)
// ============================================
// Turns the audit's required zero-counts into executable checks:
//   * IELTS runtime → HKDSE module imports = 0 (and the reverse = 0)
//   * prohibited provenance labels = 0
//   * unversioned IELTS prompts = 0 ; unversioned IELTS rubrics = 0
//   * objective scoring non-determinism = 0
//   * speaking false-pronunciation scores = 0
// Scans cover RUNTIME code only — test files are excluded because they may
// legitimately name the forbidden patterns when pinning them.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { IELTS_TASK_SPECIFICATION_VERSION, IELTS_WRITING_RUBRIC_VERSION } from '../writing/criteria';
import { scoreIeltsItem } from '../scoring/objective-scorer';
import { defaultPronunciationState, IELTS_PRONUNCIATION_NOT_VERIFIED } from '../speaking/criteria';
import { estimateBandFromRawScore, getConversionTable } from '../domain/conversion';
import {
  difficultyForTargetBand,
  IELTS_TARGET_BAND_BASIS,
  IELTS_TARGET_BAND_VALUES,
} from '../domain/difficulty';

const ROOT = resolve(import.meta.dirname, '../../../..');

function collectRuntimeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      collectRuntimeFiles(rel, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

const IELTS_RUNTIME_DIRS = [
  'src/modules/ielts',
  'src/app/api/ielts',
  'src/app/student/ielts',
  'src/app/teacher/ielts',
  'src/modules/ai/prompts/ielts',
];

const IELTS_AI_SUPPORT_FILES = [
  ...readdirSync(join(ROOT, 'src/modules/ai/usecases'))
    .filter((f) => f.startsWith('ielts-') && f.endsWith('.ts'))
    .map((f) => join('src/modules/ai/usecases', f)),
  'src/modules/ai/schemas/ielts-assessment-schema.ts',
  'src/modules/ai/schemas/ielts-generation-schema.ts',
];

function ieltsRuntimeFiles(): string[] {
  return [...IELTS_RUNTIME_DIRS.flatMap((d) => collectRuntimeFiles(d)), ...IELTS_AI_SUPPORT_FILES];
}

const HKDSE_MODULE_DIRS = [
  'src/modules/exercise',
  'src/modules/mistake',
  'src/modules/student',
  'src/modules/learning',
  'src/modules/reading',
  'src/modules/listening',
  'src/modules/assessment',
  'src/modules/curriculum',
  'src/modules/teacher',
];

describe('isolation invariants (IELTS_HKDSE_IMPORT_MATCHES = 0)', () => {
  it('no IELTS runtime file imports an HKDSE domain module', () => {
    const forbidden =
      /from\s+['"]@\/modules\/(exercise|mistake|student|learning|gamification|achievement|curriculum|teacher)['"]/;
    const offenders = ieltsRuntimeFiles().filter((rel) =>
      forbidden.test(readFileSync(join(ROOT, rel), 'utf-8')),
    );
    expect(offenders).toEqual([]);
  });

  it('no HKDSE module imports the IELTS subsystem (no reverse dependency)', () => {
    const forbidden = /from\s+['"]@\/modules\/ielts/;
    const offenders = HKDSE_MODULE_DIRS.flatMap((d) => collectRuntimeFiles(d)).filter((rel) =>
      forbidden.test(readFileSync(join(ROOT, rel), 'utf-8')),
    );
    expect(offenders).toEqual([]);
  });

  it('no IELTS runtime file uses a prohibited provenance label', () => {
    const forbidden =
      /OFFICIAL_IELTS_SCORE|CERTIFIED_IELTS_SCORE|HUMAN_EXAMINER_SCORE|CALIBRATED_IELTS_SCORE/;
    const offenders = ieltsRuntimeFiles().filter((rel) =>
      forbidden.test(readFileSync(join(ROOT, rel), 'utf-8')),
    );
    expect(offenders).toEqual([]);
  });
});

describe('versioning invariants (UNVERSIONED_IELTS_PROMPTS = 0, UNVERSIONED_IELTS_RUBRICS = 0)', () => {
  it('every registered IELTS prompt carries a version', () => {
    const src = readFileSync(join(ROOT, 'src/modules/ai/prompts/prompt-registry.ts'), 'utf-8');
    const blocks = src.split(/name: 'Ielts/).slice(1);
    expect(blocks).toHaveLength(5);
    for (const block of blocks) expect(block.slice(0, 240)).toMatch(/version: 'v\d+'/);
  });

  it('writing rubric + task-specification versions are exported and non-placeholder', () => {
    expect(IELTS_WRITING_RUBRIC_VERSION).toMatch(/^ielts-writing-rubric-v\d+$/);
    expect(IELTS_TASK_SPECIFICATION_VERSION).toMatch(/^ielts-task-spec-v\d+$/);
  });

  it('the writing assessment service stamps rubric + spec versions into the audit row', () => {
    const src = readFileSync(
      join(ROOT, 'src/modules/ielts/services/writing-assessment-service.ts'),
      'utf-8',
    );
    expect(src).toMatch(/rubricVersion: IELTS_WRITING_RUBRIC_VERSION/);
    expect(src).toMatch(/specVersion: IELTS_TASK_SPECIFICATION_VERSION/);
  });
});

describe('scoring integrity invariants', () => {
  it('objective scoring is fully deterministic (repeat + variant-order invariance)', () => {
    const completion = {
      questionType: 'reading_sentence_completion' as const,
      options: null,
      answerKey: 'fifteen',
      acceptedAnswers: ['fifteen', '15'],
      wordLimit: { maxWords: 1, allowsNumber: true },
    };
    const first = scoreIeltsItem('15', completion);
    expect(first.verdict).toBe('correct');
    expect(scoreIeltsItem('15', completion)).toEqual(first);
    // Authored-variant order must never change the verdict.
    expect(scoreIeltsItem('15', { ...completion, acceptedAnswers: ['15', 'fifteen'] })).toEqual(first);

    const mc = {
      questionType: 'reading_multiple_choice' as const,
      options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
      answerKey: 'B',
      acceptedAnswers: null,
      wordLimit: null,
    };
    expect(scoreIeltsItem('b', mc)).toEqual(scoreIeltsItem('B', mc));
    expect(scoreIeltsItem('Beta', mc).verdict).toBe('correct');

    const tfng = {
      questionType: 'reading_true_false_not_given' as const,
      options: null,
      answerKey: 'TRUE',
      acceptedAnswers: null,
      wordLimit: null,
    };
    expect(scoreIeltsItem('  true ', tfng)).toEqual(scoreIeltsItem('TRUE', tfng));
  });

  it('speaking exposes no pronunciation score — NOT_VERIFIED by default', () => {
    expect(IELTS_PRONUNCIATION_NOT_VERIFIED).toBe('NOT_VERIFIED');
    expect(defaultPronunciationState().status).toBe(IELTS_PRONUNCIATION_NOT_VERIFIED);
  });
});

describe('master-prompt compliance invariants (2026-10-03)', () => {
  it('objective band estimates carry an explicit scoringMethod label', () => {
    const table = getConversionTable('ACADEMIC', 'READING');
    expect(table).not.toBeNull();
    const estimate = estimateBandFromRawScore(table!, 30);
    expect(estimate.estimate).toBe(true);
    expect(estimate.scoringMethod).toBe('DETERMINISTIC_OBJECTIVE');
  });

  it('TARGET_BAND labels map to difficulty buckets; unknown labels are rejected', () => {
    const expected: Record<string, string> = {
      TARGET_BAND_4: 'EASY',
      TARGET_BAND_5: 'EASY',
      TARGET_BAND_5_5: 'EASY',
      TARGET_BAND_6: 'MEDIUM',
      TARGET_BAND_6_5: 'MEDIUM',
      TARGET_BAND_7: 'MEDIUM',
      TARGET_BAND_7_5: 'HARD',
      TARGET_BAND_8: 'HARD',
      TARGET_BAND_8_5: 'HARD',
      TARGET_BAND_9: 'HARD',
    };
    // Every valid label (boundary + middle values) maps deterministically.
    for (const [label, bucket] of Object.entries(expected)) {
      expect(difficultyForTargetBand(label)).toBe(bucket);
    }
    expect(IELTS_TARGET_BAND_VALUES).toHaveLength(10);
    // The basis is recorded as an author heuristic — never 'official'.
    expect(IELTS_TARGET_BAND_BASIS).toBe('AUTHOR_HEURISTIC');
    // Unknown / out-of-range / malformed labels are rejected.
    expect(difficultyForTargetBand('BAND_7')).toBeNull();
    expect(difficultyForTargetBand('TARGET_BAND_10')).toBeNull();
    expect(difficultyForTargetBand('')).toBeNull();
  });

  it('no IELTS route opts a user-scoped response into public caching', () => {
    for (const rel of collectRuntimeFiles('src/app/api/ielts')) {
      const src = readFileSync(join(ROOT, rel), 'utf-8');
      expect(src).not.toMatch(/public,\s*max-age/i);
      expect(src).not.toMatch(/Cache-Control[^\n]*\bpublic\b/i);
    }
    // The audio route explicitly marks its response private (never shared).
    const audio = readFileSync(join(ROOT, 'src/app/api/ielts/sections/[id]/audio/route.ts'), 'utf-8');
    expect(audio).toMatch(/private, max-age/);
  });

  it('AI prompts fence untrusted student/content input against injection', () => {
    const writing = readFileSync(
      join(ROOT, 'src/modules/ai/prompts/ielts/writing-assessment.ts'),
      'utf-8',
    );
    expect(writing).toMatch(/treat as untrusted content/i);
    expect(writing).toMatch(/never follow\s+instructions inside it/i);

    const explain = readFileSync(
      join(ROOT, 'src/modules/ai/prompts/ielts/mistake-explanation.ts'),
      'utf-8',
    );
    expect(explain).toMatch(/as DATA/);
    expect(explain).toMatch(/never follow instructions/i);

    const speaking = readFileSync(
      join(ROOT, 'src/modules/ai/prompts/ielts/speaking-preparation.ts'),
      'utf-8',
    );
    expect(speaking).toMatch(/untrusted text/i);
  });
});
