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
    skillSection = buildReadingSection(input.difficulty, input.gradeLevel);
  } else if (isWriting) {
    skillSection = buildWritingSection(input.difficulty, input.gradeLevel);
  } else if (isSpeaking) {
    skillSection = buildSpeakingSection(input.difficulty, input.gradeLevel);
  }

  // ── Assemble ──
  return `You are a Hong Kong secondary school English teacher. Generate ${count} English ${skillDesc} practice questions aligned to HKDSE ${input.gradeLevel} standards at ${diffMap[input.difficulty]} difficulty (${effectiveQuestionType} format).

CRITICAL: Your ENTIRE response must be a JSON object: {"questions": [...]}. The 'questions' field contains the array of question objects. Start with { and end with }. No markdown, no code blocks, no text outside the JSON.

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

Example JSON format:
{"questions":[{"type":"mc","prompt":"Choose the correct word: If I ___ rich, I would travel.","promptZh":"選擇正確的詞語","choices":["am","was","were","will be"],"answer":"C","explanationZh":"第二類條件句be動詞用were。","explanationEn":"Type 2 conditional uses 'were'.","commonMistake":"學生常誤用was。","grammarPoint":"Type 2 Conditional"}]}

${STRICT_ANSWER_RULES}
${HALLUCINATION_GUARD_LITE}
${dseContextPrompt}`;
}

function buildListeningSection(count: number, difficulty: string, gradeLevel: string): string {
  const lineGuide = difficulty === 'remedial' ? '6-8 lines' : difficulty === 'core' ? '8-12 lines' : '12-16 lines';
  return `─── DSE Paper 3 Listening ───
Each question has its OWN independent listeningContent (short dialogue, ${lineGuide} per question).
Roles: ONLY Boy/Girl/Man/Woman. Format: "Role: dialogue" (one per line, real \\n separators).
CRITICAL: listeningContent MUST be actual dialogue lines, NEVER a narrative summary like "Two students discuss...".
Speech: natural English with occasional fillers ("um", "well"), linking ("gonna", "wanna"), and self-corrections.
${difficulty === 'challenge' ? 'Include inference traps, speaker attitude shifts, synonym distractors.' : ''}
${difficulty === 'remedial' ? 'Slow clear speech, simple vocabulary, obvious wrong choices.' : ''}
Content variety: rotate across school, society, tech, environment, culture, health, career, HK-local, daily-life.
Each dialogue needs 1-3 info points (NOT just time/numbers — include locations, reasons, conditions, attitudes).
Answer MUST appear verbatim in listeningContent. Verify before output.`;
}

function buildReadingSection(difficulty: string, gradeLevel: string): string {
  const wordRange = difficulty === 'remedial' ? '60-120 words' : difficulty === 'core' ? '100-180 words' : '150-250 words';
  const passageType = (gradeLevel === 'S1' || gradeLevel === 'S2')
    ? 'stories, letters, posters, notices'
    : (gradeLevel === 'S3' || gradeLevel === 'S4')
      ? 'news articles, opinion pieces, informational texts'
      : 'complex editorials, literary extracts, academic articles';
  const questionFocus = difficulty === 'remedial'
    ? 'Focus on explicit information, simple vocabulary-in-context, and factual questions.'
    : difficulty === 'challenge'
      ? 'Include inference questions, author attitude/tone, figurative language, and cross-paragraph reasoning.'
      : 'Mix of explicit and implicit questions with straightforward inferences.';
  return `─── DSE Paper 1 Reading ───
Provide a readingContent passage (${wordRange}). All questions must be answerable from this passage.
Passage types for ${gradeLevel}: ${passageType}.
${questionFocus}`;
}

function buildWritingSection(difficulty: string, gradeLevel: string): string {
  const promptRange = difficulty === 'remedial' ? '20-40 words' : difficulty === 'core' ? '40-60 words' : '50-80 words';
  const answerRange = difficulty === 'remedial' ? '60-100 words' : difficulty === 'core' ? '100-150 words' : '150-200 words';
  const studentWordCount = difficulty === 'remedial' ? '80-100 words' : difficulty === 'core' ? '120-150 words' : '180-220 words';
  const complexity = difficulty === 'remedial'
    ? 'Simple scenario, basic vocabulary, straightforward task.'
    : difficulty === 'challenge'
      ? 'Complex scenario with nuanced requirements, advanced vocabulary expectations, multi-perspective task.'
      : 'Standard DSE scenario with moderate complexity.';
  return `─── DSE Paper 2 Writing ───
Generate a short writing prompt (${promptRange}) with scenario, role, task, and specific requirements.
IMPORTANT: The prompt MUST include a word count instruction for the student (e.g. "Write about ${studentWordCount}." or "Your response should be around ${studentWordCount}."). Make word count visible to the student.
Answer field: model answer (${answerRange}). Choices: []. Grade: ${gradeLevel}. ${complexity}
Topics close to HK student life experience.`;
}

function buildSpeakingSection(difficulty: string, gradeLevel: string): string {
  const promptRange = difficulty === 'remedial' ? '15-30 words' : difficulty === 'core' ? '25-40 words' : '35-50 words';
  const depth = difficulty === 'remedial'
    ? 'Simple discussion topic with basic opinion-sharing.'
    : difficulty === 'challenge'
      ? 'Complex discussion topic requiring critical analysis, comparison of viewpoints, and justification.'
      : 'Standard discussion topic with structured argumentation.';
  return `─── DSE Paper 4 Speaking ───
Generate a discussion topic or individual response prompt (${promptRange}). Grade: ${gradeLevel}.
${depth}
Answer field: 3-5 bullet points (not full answer). Choices: [].`;
}
