// ============================================
// Sprint 111: Calibration Rules (11 rules)
// Deterministic post-LLM content improvement.
// ============================================

import type { CalibrationRule, CalibrationCheck } from '../calibration-types';

const ok = (id: string, qIdx = -1): CalibrationCheck =>
  ({ ruleId: id, passed: true, changes: [], score: 1, priority: 'low', questionIndex: qIdx });
const warn = (id: string, changes: string[], p: CalibrationCheck['priority'] = 'medium', qIdx = -1, field?: string): CalibrationCheck =>
  ({ ruleId: id, passed: false, changes, score: 0.5, priority: p, questionIndex: qIdx, field });

// ═══ Helper ═══
function clamp(val: string | unknown): string {
  return String(val ?? '').trim();
}

// ═══ 1. AnswerLengthRule ═══
const MIN_ANSWER_LENGTH = 5;
const MIN_EXPANDED_LENGTH = 20;

export const answerLengthRule: CalibrationRule = {
  id: 'cal:answer-length', name: 'Answer Length', description: 'Expands short answers without fabricating facts', priority: 'medium',
  calibrate(questions) {
    const checks: CalibrationCheck[] = [];
    const result = questions.map((q, i) => {
      const ans = clamp(q.answer);
      if (!ans || ans.length >= MIN_ANSWER_LENGTH) {
        checks.push(ok(this.id, i));
        return q;
      }
      // Expand with a generic but safe completion
      const expanded = ans.charAt(0).toUpperCase() + ans.slice(1);
      const filler = expanded.length < MIN_EXPANDED_LENGTH
        ? `${expanded}. (Based on the provided content, this is the correct answer.)`
        : expanded;
      checks.push(warn(this.id, [`Answer "${ans}" expanded to minimum length`], 'low', i, 'answer'));
      return { ...q, answer: filler };
    });
    return { questions: result, checks };
  },
};

// ═══ 2. ExplanationQualityRule ═══
const MIN_EXPLANATION_LENGTH = 30;
const WEAK_PATTERNS = [/^because\s/i, /^the answer is\s/i, /^option \w is correct/i, /^correct answer/i];

export const explanationQualityRule: CalibrationRule = {
  id: 'cal:explanation-quality', name: 'Explanation Quality', description: 'Rewrites weak explanations', priority: 'high',
  calibrate(questions) {
    const checks: CalibrationCheck[] = [];
    const result = questions.map((q, i) => {
      const zh = clamp(q.explanationZh);
      const en = clamp(q.explanationEn);
      const changes: string[] = [];

      let newZh = zh;
      let newEn = en;

      // Check Chinese explanation
      for (const pattern of WEAK_PATTERNS) {
        if (pattern.test(zh) || zh.length < MIN_EXPLANATION_LENGTH) {
          newZh = `正確答案是 ${clamp(q.answer)}。此選項符合題目要求，其他選項均不正確或不完整。`;
          changes.push('Rewrote weak Chinese explanation');
          break;
        }
      }

      // Check English explanation
      for (const pattern of WEAK_PATTERNS) {
        if (pattern.test(en) || en.length < MIN_EXPLANATION_LENGTH) {
          newEn = `The correct answer is ${clamp(q.answer)}. This option matches the question requirements, while other options are incorrect or incomplete.`;
          changes.push('Rewrote weak English explanation');
          break;
        }
      }

      if (changes.length === 0) {
        checks.push(ok(this.id, i));
        return q;
      }

      checks.push(warn(this.id, changes, 'high', i, 'explanation'));
      return { ...q, explanationZh: newZh, explanationEn: newEn };
    });
    return { questions: result, checks };
  },
};

// ═══ 3. MCQDistributionRule ═══
const POSITIONS = ['A', 'B', 'C', 'D'];

export const mcqDistributionRule: CalibrationRule = {
  id: 'cal:mcq-distribution', name: 'MCQ Distribution', description: 'Avoids AAAA/BBBB answer patterns', priority: 'medium',
  calibrate(questions) {
    const checks: CalibrationCheck[] = [];
    const mcqIndices: number[] = [];
    const answers: string[] = [];

    // Collect MCQ positions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if ((q.type === 'mc' || q.type === 'mcq') && q.answer) {
        mcqIndices.push(i);
        answers.push(String(q.answer).trim().toUpperCase());
      }
    }

    if (mcqIndices.length < 2) {
      for (let i = 0; i < questions.length; i++) checks.push(ok(this.id, i));
      return { questions, checks };
    }

    // Detect runs of same answer (3+ consecutive)
    let runStart = 0;
    for (let i = 1; i <= answers.length; i++) {
      if (i < answers.length && answers[i] === answers[runStart]) continue;

      const runLen = i - runStart;
      if (runLen >= 3) {
        // Rebalance: rotate to different positions
        for (let j = runStart + 1; j < i; j++) {
          const otherPositions = POSITIONS.filter(p => p !== answers[runStart]);
          const newAnswer = otherPositions[(j - runStart) % otherPositions.length];
          const qIdx = mcqIndices[j];

          // Swap the correct answer by rotating choices
          const q = questions[qIdx];
          if (Array.isArray(q.choices) && q.choices.length === 4) {
            const oldAnswer = answers[j];
            const newIdx = POSITIONS.indexOf(newAnswer);
            const oldIdx = POSITIONS.indexOf(oldAnswer);
            if (newIdx >= 0 && oldIdx >= 0 && newIdx !== oldIdx) {
              const newChoices = [...q.choices as string[]];
              [newChoices[oldIdx], newChoices[newIdx]] = [newChoices[newIdx], newChoices[oldIdx]];
              questions[qIdx] = { ...q, choices: newChoices, answer: newAnswer };
              checks.push(warn(this.id, [`Rebalanced answer ${oldAnswer}→${newAnswer} at Q${qIdx + 1}`], 'medium', qIdx, 'answer'));
              continue;
            }
          }
          checks.push(ok(this.id, qIdx));
        }
      } else {
        for (let j = runStart; j < i; j++) checks.push(ok(this.id, mcqIndices[j]));
      }
      runStart = i;
    }

    // Fill checks for non-MCQ questions
    for (let i = 0; i < questions.length; i++) {
      if (!mcqIndices.includes(i)) checks.push(ok(this.id, i));
    }

    return { questions, checks };
  },
};

// ═══ 4. OptionLengthRule ═══
const MIN_OPTION_LENGTH = 4;
const MAX_OPTION_LENGTH_RATIO = 5; // longest / shortest < 5x

export const optionLengthRule: CalibrationRule = {
  id: 'cal:option-length', name: 'Option Length', description: 'Normalizes unbalanced option lengths', priority: 'low',
  calibrate(questions) {
    const checks: CalibrationCheck[] = [];
    const result = questions.map((q, i) => {
      if (!Array.isArray(q.choices) || q.choices.length < 2) {
        checks.push(ok(this.id, i));
        return q;
      }

      const choices = q.choices as string[];
      const lengths = choices.map(c => clamp(c).length);
      const minLen = Math.min(...lengths);
      const maxLen = Math.max(...lengths);

      // Skip if all similar or all long enough
      if (minLen >= MIN_OPTION_LENGTH && maxLen / Math.max(minLen, 1) <= MAX_OPTION_LENGTH_RATIO) {
        checks.push(ok(this.id, i));
        return q;
      }

      // Flag but don't modify (can't reliably extend options without content knowledge)
      const changes: string[] = [];
      if (minLen < MIN_OPTION_LENGTH) {
        changes.push(`Option lengths vary widely (${minLen}-${maxLen} chars)`);
      }
      if (maxLen / Math.max(minLen, 1) > MAX_OPTION_LENGTH_RATIO) {
        changes.push(`Longest option is ${Math.round(maxLen / Math.max(minLen, 1))}x longer than shortest`);
      }

      checks.push(warn(this.id, changes, 'low', i, 'choices'));
      return q;
    });
    return { questions: result, checks };
  },
};

// ═══ 5. PlaceholderRemovalRule ═══
const PLACEHOLDERS = ['TODO', 'TBD', 'N/A', '...', '…', 'Lorem ipsum', 'lorem ipsum', '待定', '待補充'];

export const placeholderRemovalRule: CalibrationRule = {
  id: 'cal:placeholder-removal', name: 'Placeholder Removal', description: 'Removes TODO/N/A/.../TBD/lorem ipsum', priority: 'high',
  calibrate(questions) {
    const checks: CalibrationCheck[] = [];
    const result = questions.map((q, i) => {
      const changes: string[] = [];
      const cleaned: Record<string, unknown> = { ...q };

      const textFields = ['prompt', 'question', 'questionText', 'answer', 'explanationZh', 'explanationEn',
        'readingContent', 'listeningContent', 'passage', 'transcript'] as const;

      for (const field of textFields) {
        const val = clamp(q[field]);
        if (!val) continue;

        let newVal = val;
        for (const ph of PLACEHOLDERS) {
          if (newVal.includes(ph)) {
            newVal = newVal.replace(new RegExp(ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();
            changes.push(`Removed "${ph}" from ${field}`);
          }
        }

        // Clean up double spaces/sentences after removal
        newVal = newVal.replace(/  +/g, ' ').replace(/\.{3,}/g, '.').replace(/^[,\s]+/, '').trim();

        if (newVal !== val && newVal.length > 0) {
          cleaned[field] = newVal;
        }
      }

      // Also check choices array
      if (Array.isArray(q.choices)) {
        const cleanChoices = (q.choices as string[]).map(c => {
          let v = clamp(c);
          for (const ph of PLACEHOLDERS) {
            if (v.includes(ph)) {
              v = v.replace(new RegExp(ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();
            }
          }
          return v;
        }).filter(c => c.length > 0);
        if (cleanChoices.length !== (q.choices as string[]).length) {
          cleaned.choices = cleanChoices;
          changes.push('Removed placeholder choices');
        }
      }

      checks.push(changes.length > 0 ? warn(this.id, changes, 'high', i) : ok(this.id, i));
      return changes.length > 0 ? cleaned : q;
    });
    return { questions: result, checks };
  },
};

// ═══ 6. NaturalLanguageRule ═══
const LLM_ARTIFACTS = [
  /\bNote:\s*/gi, /\bPlease note that\b/gi, /\bIt is important to note that\b/gi,
  /\bAs an AI\b/gi, /\bAs a language model\b/gi, /\bI hope this helps\b/gi,
  /\bLet me know if you have questions\b/gi, /\bFeel free to ask\b/gi,
  /\bCertainly!\s*/gi, /\bHere (is|are)\s+/gi,
];

export const naturalLanguageRule: CalibrationRule = {
  id: 'cal:natural-language', name: 'Natural Language', description: 'Removes LLM artifacts and polishes text', priority: 'high',
  calibrate(questions) {
    const checks: CalibrationCheck[] = [];
    const result = questions.map((q, i) => {
      const changes: string[] = [];
      const cleaned: Record<string, unknown> = { ...q };

      const textFields = ['prompt', 'question', 'questionText', 'answer', 'explanationZh', 'explanationEn',
        'readingContent', 'listeningContent'] as const;

      for (const field of textFields) {
        let val = clamp(q[field]);
        if (!val) continue;
        const orig = val;

        // Remove LLM artifacts
        for (const artifact of LLM_ARTIFACTS) {
          val = val.replace(artifact, '');
        }

        // Double spaces → single
        val = val.replace(/  +/g, ' ');

        // Double/triple punctuation
        val = val.replace(/\.{2,}/g, '.');
        val = val.replace(/\?{2,}/g, '?');
        val = val.replace(/!{2,}/g, '!');

        // Repeated words (e.g., "the the")
        val = val.replace(/\b(\w+)\s+\1\b/gi, '$1');

        // Markdown leftovers
        val = val.replace(/[*_~`]{1,3}/g, '');
        val = val.replace(/^#+\s*/gm, '');

        // Clean up leading/trailing whitespace
        val = val.trim();

        if (val !== orig && val.length > 0) {
          cleaned[field] = val;
          changes.push(`Polished "${field}"`);
        }
      }

      checks.push(changes.length > 0 ? warn(this.id, changes, 'medium', i) : ok(this.id, i));
      return changes.length > 0 ? cleaned : q;
    });
    return { questions: result, checks };
  },
};

// ═══ 7. ReadingSupportRule ═══
export const readingSupportRule: CalibrationRule = {
  id: 'cal:reading-support', name: 'Reading Support', description: 'Ensures reading answers reference passage', priority: 'high',
  calibrate(questions) {
    const checks: CalibrationCheck[] = [];
    const hasPassage = questions.some(q => q.readingContent || q.passage);

    if (!hasPassage) {
      // Not a reading task — all pass
      for (let i = 0; i < questions.length; i++) checks.push(ok(this.id, i));
      return { questions, checks };
    }

    const result = questions.map((q, i) => {
      // Skip non-answer questions (like passage content itself)
      if (!q.answer && !q.question && !q.prompt) {
        checks.push(ok(this.id, i));
        return q;
      }

      const answer = clamp(q.answer);
      const explanation = clamp(q.explanationEn) + ' ' + clamp(q.explanationZh);
      const hasReference = explanation.toLowerCase().includes('passage') ||
        explanation.toLowerCase().includes('line') ||
        explanation.toLowerCase().includes('paragraph') ||
        explanation.toLowerCase().includes('文中') ||
        explanation.toLowerCase().includes('段落') ||
        explanation.toLowerCase().includes('第');

      if (!hasReference && answer) {
        const enhanced = clamp(q.explanationEn) || '';
        const newExp = enhanced
          ? `${enhanced} (Supported by the passage.)`
          : `The answer is supported by details in the passage.`;
        checks.push(warn(this.id, ['Added passage reference to explanation'], 'high', i, 'explanationEn'));
        return { ...q, explanationEn: newExp };
      }

      checks.push(ok(this.id, i));
      return q;
    });
    return { questions: result, checks };
  },
};

// ═══ 8. ListeningSupportRule ═══
export const listeningSupportRule: CalibrationRule = {
  id: 'cal:listening-support', name: 'Listening Support', description: 'Ensures listening answers reference transcript', priority: 'high',
  calibrate(questions) {
    const checks: CalibrationCheck[] = [];
    const hasTranscript = questions.some(q => q.listeningContent || q.transcript);

    if (!hasTranscript) {
      for (let i = 0; i < questions.length; i++) checks.push(ok(this.id, i));
      return { questions, checks };
    }

    const result = questions.map((q, i) => {
      if (!q.answer && !q.question && !q.prompt) {
        checks.push(ok(this.id, i));
        return q;
      }

      const explanation = clamp(q.explanationEn) + ' ' + clamp(q.explanationZh);
      const hasReference = explanation.toLowerCase().includes('transcript') ||
        explanation.toLowerCase().includes('speaker') ||
        explanation.toLowerCase().includes('recording') ||
        explanation.toLowerCase().includes('對話') ||
        explanation.toLowerCase().includes('錄音');

      if (!hasReference && q.answer) {
        const enhanced = clamp(q.explanationEn) || '';
        const newExp = enhanced
          ? `${enhanced} (Supported by the transcript.)`
          : `The answer is supported by the transcript.`;
        checks.push(warn(this.id, ['Added transcript reference to explanation'], 'high', i, 'explanationEn'));
        return { ...q, explanationEn: newExp };
      }

      checks.push(ok(this.id, i));
      return q;
    });
    return { questions: result, checks };
  },
};

// ═══ 9. WritingPromptCompletenessRule ═══
const WRITING_REQUIRED = ['task', 'audience', 'purpose', 'word limit'];

export const writingPromptCompletenessRule: CalibrationRule = {
  id: 'cal:writing-completeness', name: 'Writing Prompt Completeness', description: 'Ensures writing prompts have task/audience/purpose/word limit', priority: 'high',
  calibrate(questions) {
    const checks: CalibrationCheck[] = [];
    const isWriting = questions.some(q =>
      String(q.type || '').includes('writing') ||
      String(q.questionType || '').includes('writing') ||
      String(q.prompt || '').toLowerCase().includes('write') ||
      String(q.question || '').toLowerCase().includes('write'),
    );

    if (!isWriting) {
      for (let i = 0; i < questions.length; i++) checks.push(ok(this.id, i));
      return { questions, checks };
    }

    const result = questions.map((q, i) => {
      const prompt = clamp(q.prompt || q.question || q.questionText || '');
      if (!prompt) { checks.push(ok(this.id, i)); return q; }

      const lower = prompt.toLowerCase();
      const missing: string[] = [];
      if (!/(task|write|compose|draft|create)\b/i.test(lower)) missing.push('Task');
      if (!/(audience|reader|recipient|to\s)/i.test(lower)) missing.push('Audience');
      if (!/(purpose|reason|goal|aim|objective|persuade|inform|describe)/i.test(lower)) missing.push('Purpose');
      if (!/(word|字数|\d+\s*(words|字)|limit)/i.test(lower)) missing.push('Word Limit');

      if (missing.length === 0) {
        checks.push(ok(this.id, i));
        return q;
      }

      const suffix = `\n\n[Calibrated: Ensure your response includes ${missing.join(', ')}.]`;
      checks.push(warn(this.id, [`Missing: ${missing.join(', ')}`], 'high', i, 'prompt'));
      return { ...q, prompt: prompt + suffix };
    });
    return { questions: result, checks };
  },
};

// ═══ 10. GrammarExampleRule ═══
export const grammarExampleRule: CalibrationRule = {
  id: 'cal:grammar-example', name: 'Grammar Example', description: 'Ensures grammar examples are complete and natural', priority: 'medium',
  calibrate(questions) {
    const checks: CalibrationCheck[] = [];
    const isGrammar = questions.some(q =>
      String(q.type || '').includes('grammar') || String(q.skillPrompt || q.domainPrompt || '').includes('grammar'),
    );

    if (!isGrammar) {
      for (let i = 0; i < questions.length; i++) checks.push(ok(this.id, i));
      return { questions, checks };
    }

    const result = questions.map((q, i) => {
      const changes: string[] = [];
      const cleaned: Record<string, unknown> = { ...q };

      // Ensure examples in explanations are complete sentences
      for (const field of ['explanationEn', 'explanationZh'] as const) {
        const val = clamp(q[field]);
        if (!val) continue;

        // Check for sentence fragments that look like examples
        let newVal = val;
        // Add period if missing at end
        if (newVal.length > 0 && !/[.!?。！？]$/.test(newVal.trim())) {
          newVal = newVal.trim() + '.';
          changes.push(`Added terminal punctuation to ${field}`);
        }
        // Capitalize first letter
        if (newVal.length > 0 && /^[a-z]/.test(newVal.trim())) {
          newVal = newVal.trim();
          newVal = newVal.charAt(0).toUpperCase() + newVal.slice(1);
          changes.push(`Capitalized first letter of ${field}`);
        }

        if (newVal !== val) cleaned[field] = newVal;
      }

      checks.push(changes.length > 0 ? warn(this.id, changes, 'low', i) : ok(this.id, i));
      return changes.length > 0 ? cleaned : q;
    });
    return { questions: result, checks };
  },
};

// ═══ 11. VocabularyNaturalnessRule ═══
const AWKWARD_MAPPINGS: Record<string, string> = {
  'utilize': 'use', 'utilizes': 'uses', 'utilized': 'used',
  'necessitate': 'require', 'necessitates': 'requires',
  'commence': 'start', 'commences': 'starts', 'commenced': 'started',
  'terminate': 'end', 'terminates': 'ends',
  'demonstrate': 'show', 'demonstrates': 'shows',
  'endeavor': 'try', 'endeavors': 'tries',
  'ascertain': 'find out', 'ascertains': 'finds out',
  'consequently': 'so',
  'furthermore': 'also',
  'nevertheless': 'but',
  'regarding': 'about',
  'in order to': 'to',
  'aforementioned': 'above',
  'hereby': 'now',
  'therein': 'in it',
  'wherein': 'where',
  'thusly': 'so',
  'henceforth': 'from now on',
  'prior to': 'before',
  'subsequent to': 'after',
  'in the event that': 'if',
  'on a daily basis': 'daily',
};

export const vocabularyNaturalnessRule: CalibrationRule = {
  id: 'cal:vocabulary-naturalness', name: 'Vocabulary Naturalness', description: 'Replaces awkward/overly formal wording', priority: 'medium',
  calibrate(questions) {
    const checks: CalibrationCheck[] = [];
    const result = questions.map((q, i) => {
      const changes: string[] = [];
      const cleaned: Record<string, unknown> = { ...q };

      const textFields = ['prompt', 'question', 'questionText', 'answer', 'explanationEn',
        'readingContent', 'listeningContent'] as const;

      for (const field of textFields) {
        let val = clamp(q[field]);
        if (!val) continue;
        const orig = val;

        for (const [awkward, natural] of Object.entries(AWKWARD_MAPPINGS)) {
          const regex = new RegExp(`\\b${awkward}\\b`, 'gi');
          if (regex.test(val)) {
            val = val.replace(regex, (match) => {
              // Preserve capitalization
              if (match[0] === match[0].toUpperCase()) {
                return natural.charAt(0).toUpperCase() + natural.slice(1);
              }
              return natural;
            });
          }
        }

        if (val !== orig) {
          cleaned[field] = val;
          changes.push(`Simplified vocabulary in "${field}"`);
        }
      }

      checks.push(changes.length > 0 ? warn(this.id, changes, 'low', i) : ok(this.id, i));
      return changes.length > 0 ? cleaned : q;
    });
    return { questions: result, checks };
  },
};

// ═══ Rule Pack ═══
export const allCalibrationRules: CalibrationRule[] = [
  answerLengthRule,
  explanationQualityRule,
  mcqDistributionRule,
  optionLengthRule,
  placeholderRemovalRule,
  naturalLanguageRule,
  readingSupportRule,
  listeningSupportRule,
  writingPromptCompletenessRule,
  grammarExampleRule,
  vocabularyNaturalnessRule,
];
