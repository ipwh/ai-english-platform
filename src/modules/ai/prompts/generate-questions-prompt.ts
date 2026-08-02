// ============================================
// Compact system prompt builder for generate-questions
// Replaces the ~500-line inline prompt (~4000+ tokens)
// Target: <1500 tokens for non-listening, <2500 for listening
// ============================================

import { getDSEEmpiricalTopics, validateDSEtopicMatch } from '../services/dse-topics';
import { selectDiverseTopic, buildDiversityInstruction } from '../services/topic-selector';
import { STRICT_ANSWER_RULES } from '../prompts';
import { HALLUCINATION_GUARD_LITE } from '../services/hallucination-guard';
import type { GenerateQuestionsInput } from '../types/generation-types';

const diffMap: Record<string, string> = { remedial: '補底', core: '核心', challenge: '挑戰' };

export function buildCompactSystemPrompt(input: GenerateQuestionsInput, dseContextPrompt: string): string {
  const count = input.count || 5;
  const skillDesc = input.grammarItemZh || input.languageSkillZh || input.grammarItem || input.languageSkill || '綜合';
  const isListening = input.languageSkill === 'listening';
  const isReading = input.languageSkill === 'reading';
  const isWriting = input.languageSkill === 'writing';
  const isSpeaking = input.languageSkill === 'speaking';
  const effectiveQuestionType = isWriting ? 'short-writing' : (input.questionType || 'mc');

  const topic = selectDiverseTopic({
    userId: input.userId || 'anonymous',
    skill: isListening ? 'listening' : isReading ? 'reading' : isWriting ? 'writing' : isSpeaking ? 'speaking' : 'grammar',
    gradeLevel: input.gradeLevel,
  });
  const diversity = buildDiversityInstruction({
    userId: input.userId || 'anonymous',
    skill: isListening ? 'listening' : isReading ? 'reading' : isWriting ? 'writing' : isSpeaking ? 'speaking' : 'grammar',
    gradeLevel: input.gradeLevel,
  });

  // ── DSE topics ──
  let dseTopics = '';
  if (isListening) {
    dseTopics = `DSE Listening topics: ${getDSEEmpiricalTopics('listening', undefined, 3).join(', ')}.`;
  } else if (isReading) {
    dseTopics = `DSE Reading topics: ${getDSEEmpiricalTopics('reading', undefined, 3).join(', ')}.`;
  } else if (isWriting) {
    dseTopics = `DSE Writing topics: ${getDSEEmpiricalTopics('writing', undefined, 3).join(', ')}.`;
  } else if (isSpeaking) {
    dseTopics = `DSE Speaking topics: ${getDSEEmpiricalTopics('listening', undefined, 2).join(', ')}.`;
  }

  // ── Skill-specific section ──
  let skillSection = '';
  if (isListening) {
    skillSection = buildListeningSection(count, input.difficulty, input.gradeLevel);
  } else if (isReading) {
    skillSection = buildReadingSection();
  } else if (isWriting) {
    skillSection = buildWritingSection();
  } else if (isSpeaking) {
    skillSection = buildSpeakingSection();
  }

  // ── Assemble ──
  return `You are a Hong Kong secondary school English teacher. Generate ${count} English ${skillDesc} practice questions aligned to HKDSE ${input.gradeLevel} standards at ${diffMap[input.difficulty]} difficulty (${effectiveQuestionType} format).

${dseTopics}
Topic: "${topic}" — DO NOT use default topics like basketball tryouts/bees/movie time.
${diversity}
${input.topic ? `Additional topic hint: ${input.topic}` : ''}

${skillSection}

─── Output Format ───
Return a pure JSON array (no markdown). Each question must have:
- type: "${effectiveQuestionType}"
- prompt: English question
- promptZh: Traditional Chinese hint
${isListening ? '- listeningContent: independent short dialogue per question (Boy/Girl/Man/Woman roles only, 6-16 lines)\n- listeningContentZh: Chinese context\n' : ''}${isReading ? '- readingContent: reading passage (80-200 words)\n- readingContentZh: Chinese topic summary\n' : ''}- choices: array of 4 strings for MC, [] otherwise
- answer: "A"/"B"/"C"/"D" for MC; exact answer for others
- explanationZh, explanationEn, commonMistake, grammarPoint

MCQ rules: 4 complete options, same category, no "All/None of the above", no time fragments like "00 PM".
${isListening ? 'Time must be spelled out: "three o\'clock", NOT "3:00".' : ''}

${STRICT_ANSWER_RULES}
${HALLUCINATION_GUARD_LITE}
${dseContextPrompt}`;
}

function buildListeningSection(count: number, difficulty: string, gradeLevel: string): string {
  const lineGuide = difficulty === 'remedial' ? '6-8 lines' : difficulty === 'core' ? '8-12 lines' : '12-16 lines';
  return `─── DSE Paper 3 Listening ───
Each question has its OWN independent listeningContent (short dialogue, ${lineGuide} per question).
Roles: ONLY Boy/Girl/Man/Woman. Format: "Role: dialogue" (one per line, real \\n separators).
Speech: natural English with occasional fillers ("um", "well"), linking ("gonna", "wanna"), and self-corrections.
${difficulty === 'challenge' ? 'Include inference traps, speaker attitude shifts, synonym distractors.' : ''}
${difficulty === 'remedial' ? 'Slow clear speech, simple vocabulary, obvious wrong choices.' : ''}
Content variety: rotate across school, society, tech, environment, culture, health, career, HK-local, daily-life.
Each dialogue needs 1-3 info points (NOT just time/numbers — include locations, reasons, conditions, attitudes).
Answer MUST appear verbatim in listeningContent. Verify before output.`;
}

function buildReadingSection(): string {
  return `─── DSE Paper 1 Reading ───
Provide a readingContent passage (80-200 words). All questions must be answerable from this passage.
Passage types by grade: S1-S3 → stories, letters, posters; S4-S6 → news, opinion, informational articles.`;
}

function buildWritingSection(): string {
  return `─── DSE Paper 2 Writing ───
Generate a short writing prompt (30-80 words) with scenario, role, task, and specific requirements.
Answer field: model answer (80-150 words). Choices: []. Topics close to HK student life experience.`;
}

function buildSpeakingSection(): string {
  return `─── DSE Paper 4 Speaking ───
Generate a discussion topic or individual response prompt (20-50 words).
Answer field: 3-5 bullet points (not full answer). Choices: [].`;
}
