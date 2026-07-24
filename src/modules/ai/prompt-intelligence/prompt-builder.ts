// ============================================
// Sprint 109: Prompt Builder
// Assembles prompts from components. Does NOT duplicate existing templates.
// ============================================

import type { PromptComponents, AssembledPrompt } from './prompt-types';
import { DEFAULT_CONSTRAINTS } from './prompt-types';

/** Build an assembled prompt from components. Reuses existing prompt modules. */
export function buildPrompt(components: PromptComponents): AssembledPrompt {
  const parts: string[] = [components.systemPrompt];

  if (components.domainPrompt) parts.push(`\n## Domain Rules\n${components.domainPrompt}`);
  if (components.difficultyPrompt) parts.push(`\n## Difficulty & Level\n${components.difficultyPrompt}`);
  if (components.questionTypePrompt) parts.push(`\n## Question Type Rules\n${components.questionTypePrompt}`);
  if (components.skillPrompt) parts.push(`\n## Skill Focus\n${components.skillPrompt}`);

  // Inject quality constraints
  const constraints = buildConstraintText();
  parts.push(`\n## Quality Constraints (Auto-Injected)\n${constraints}`);

  if (components.qualityRequirements) parts.push(`\n## Additional Requirements\n${components.qualityRequirements}`);

  const system = parts.join('\n');
  const user = components.studentContext
    ? `Student context: ${components.studentContext}\n\nGenerate questions following the system instructions above.`
    : 'Generate questions following the system instructions above.';

  const constraintCount = constraints.split('\n').filter(l => l.startsWith('-')).length;

  return {
    system,
    user,
    metadata: {
      componentCount: parts.length,
      totalLength: system.length + user.length,
      constraintCount,
      hasDSEContext: !!(components.domainPrompt && components.domainPrompt.includes('DSE')),
    },
  };
}

/** Generate constraint injection text from defaults. */
function buildConstraintText(): string {
  const c = DEFAULT_CONSTRAINTS;
  const lines: string[] = [];
  if (c.alwaysIncludeAnswer) lines.push('- Every question MUST include an answer field. Never omit the answer.');
  if (c.mcqExactFourOptions) lines.push('- MCQ questions MUST have exactly 4 options (A/B/C/D).');
  if (c.onlyOneCorrectAnswer) lines.push('- Exactly ONE option must be correct. All distractors must be clearly wrong.');
  if (c.explanationRequired) lines.push('- Every question MUST include explanationZh and explanationEn fields.');
  if (c.noPlaceholders) lines.push('- Do NOT use placeholder values like "N/A", "TBD", "...", or empty strings.');
  if (c.noTodo) lines.push('- Do NOT output "TODO" or incomplete content.');
  if (c.avoidDuplicateOptions) lines.push('- All options must be unique. No duplicate option text.');
  if (c.readingAnswerableFromPassage) lines.push('- Reading questions: answer MUST be supported by the provided passage.');
  if (c.listeningReferenceTranscript) lines.push('- Listening questions: answer MUST appear verbatim in the transcript.');
  if (c.writingRequiresTask) lines.push('- Writing prompts MUST specify a clear writing task.');
  if (c.writingRequiresAudience) lines.push('- Writing prompts MUST define a target audience.');
  if (c.writingRequiresPurpose) lines.push('- Writing prompts MUST state the purpose of writing.');
  if (c.writingRequiresWordLimit) lines.push('- Writing prompts MUST include a suggested word count.');
  return lines.join('\n');
}

/** Estimate prompt complexity score (0-100). */
export function estimatePromptComplexity(system: string, user: string): number {
  const total = system + ' ' + user;
  const words = total.split(/\s+/).length;
  const sentences = total.split(/[.!?]+/).filter(Boolean).length;
  const avgWordsPerSentence = sentences > 0 ? words / sentences : 0;
  const constraintCount = (system.match(/^-\s/gm) || []).length;

  let score = 0;
  score += Math.min(30, words / 20);          // length contributes up to 30
  score += Math.min(20, constraintCount * 5);  // constraints contribute up to 20
  score += Math.min(20, avgWordsPerSentence * 2); // complexity contributes up to 20
  score += Math.min(30, (system.includes('DSE') ? 15 : 0) + (system.includes('CEFR') ? 15 : 0)); // domain specificity

  return Math.round(Math.min(100, score));
}
