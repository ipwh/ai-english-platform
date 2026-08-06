// ============================================
// API: POST /api/speaking — Speaking practice AI analysis
// IMPORTANT: AI can ONLY analyze text content (grammar, vocabulary, relevance).
// It CANNOT assess fluency, pronunciation, or interaction from text alone.
// The limitation is clearly communicated in every response.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { callLLM, selectDiverseTopic, buildDiversityInstruction } from '@/modules/ai';
import { checkRateLimit } from '@/shared/utils/rate-limiter';

const SPEAKING_RATE_LIMIT = { maxRequests: 10, windowMs: 60_000 };

/** Safe JSON parse — strips markdown fences and retries on failure */
function safeJsonParse(raw: string, context: string): Record<string, unknown> {
  try { return JSON.parse(raw); } catch { /* try stripping markdown fences */ }
  const stripped = raw.replace(/```json\s*|```\s*/g, '').trim();
  try { return JSON.parse(stripped); } catch {
    throw new Error(`AI returned invalid JSON for ${context}`);
  }
}

// HKDSE Speaking Level Descriptors (simplified for prompt)
const SPEAKING_RUBRIC = `
HKDSE English Language Speaking Level Descriptors:
L5: Expresses a wide range of ideas fluently and coherently. Highly accurate grammar/pronunciation. Engages effectively in discussion.
L4: Expresses ideas clearly with good fluency. Minor grammar errors. Good interaction skills.
L3: Communicates adequately on familiar topics. Some hesitations. Noticeable errors but meaning clear.
L2: Limited ideas, frequent hesitations. Basic sentence patterns. Pronunciation may affect communication.
L1: Very limited communication. Fragmented speech. Frequent errors impede understanding.
`;

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateLimit = await checkRateLimit({ ...SPEAKING_RATE_LIMIT, identifier: `speaking:${ip}` });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: rateLimit.message }, {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    const body = await request.json();
    const { transcript, topic, gradeLevel, difficulty, mode } = body as {
      transcript?: string;
      topic?: string;
      gradeLevel?: string;
      difficulty?: string;
      mode?: 'practice' | 'mock';
    };

    const levelLabel = gradeLevel || 'S4';
    const diffLabel = difficulty || 'core';
    const diffMap: Record<string, string> = { remedial: '補底 (HKDSE Level 1-2)', core: '核心 (HKDSE Level 3)', challenge: '挑戰 (HKDSE Level 4-5)' };
    const difficultyDesc = diffMap[diffLabel] || diffMap['core'];

    if (mode === 'mock') {
      // Diversity-aware topic selection
      const userId = authResult.userId || 'anonymous';
      const diverseTopic = topic || selectDiverseTopic({ userId, skill: 'speaking', gradeLevel: levelLabel });
      const diversityInstruction = buildDiversityInstruction({ userId, skill: 'speaking', gradeLevel: levelLabel });

      // Generate a mock speaking prompt (Group Discussion or Individual Response)
      const prompt = await callLLM([
        {
          role: 'system',
          content: `You are an HKDSE English Speaking examiner. Generate ONE speaking practice question suitable for ${levelLabel} level Hong Kong students at ${difficultyDesc} difficulty.

${SPEAKING_RUBRIC}

${diversityInstruction}

⚠️ REQUIRED TOPIC: "${diverseTopic}" — You MUST design the speaking question around this specific topic.

Return a JSON object:
{
  "topic": "discussion topic title",
  "scenario": "brief scenario description (2-3 sentences)",
  "discussionQuestions": ["Q1", "Q2", "Q3"],
  "individualQuestion": "a follow-up individual response question",
  "vocabularyHints": ["useful word 1", "useful word 2"],
  "timeLimit": 8
}`,
        },
        { role: 'user', content: `Generate a DSE Speaking mock question for ${levelLabel} students at ${difficultyDesc} difficulty. Required topic: "${diverseTopic}".` },
      ], { temperature: 0.8, maxTokens: 1024, jsonMode: true, timeoutMs: 15000 });

      const parsed = safeJsonParse(prompt, 'mock prompt generation');
      return NextResponse.json({ mockQuestion: parsed });
    }

    // Practice mode: analyze student transcript
    if (!transcript) {
      return NextResponse.json({ error: 'transcript required for practice mode' }, { status: 400 });
    }

    const analysis = await callLLM([
      {
        role: 'system',
        content: `You are an HKDSE English Speaking examiner analyzing a TEXT transcript (NOT audio).

${SPEAKING_RUBRIC}

⚠️ CRITICAL LIMITATION: You are reading text, not listening to audio. You CANNOT assess:
- Fluency (pace, hesitation, smoothness)
- Pronunciation (accuracy, clarity)
- Interaction quality (turn-taking, engagement)

ONLY analyze what is observable from written text:
- Grammar accuracy
- Vocabulary range and appropriateness
- Content relevance (did the student address the topic?)
- Idea development and logical flow

Return a JSON object:
{
  "grammarAccuracy": { "score": 1-5, "comment": "grammar analysis in Traditional Chinese (繁體中文)" },
  "vocabularyRange": { "score": 1-5, "comment": "vocabulary analysis in Traditional Chinese (繁體中文)" },
  "contentRelevance": { "score": 1-5, "comment": "content/topic relevance in Traditional Chinese (繁體中文)" },
  "overallComment": "overall assessment in Traditional Chinese (繁體中文). MUST start with: 「注意：此分析僅基於文字轉錄內容。AI 無法聆聽錄音，因此無法評估流暢度、發音及互動表現。以下僅就文法、詞彙及內容相關性進行分析。」",
  "improvementTips": ["improvement tip in Traditional Chinese (繁體中文)"],
  "limitationNote": "清晰說明 AI 只分析了文字內容中的文法、詞彙及內容相關性，無法評估流暢度、發音及互動表現。建議用家尋求老師或母語人士進行真人評估。（繁體中文）"
}`,
      },
      { role: 'user', content: `Analyze this student speaking transcript from a DSE ${levelLabel} student at ${difficultyDesc} difficulty on the topic "${topic || 'general'}":\n\n${transcript}` },
    ], { temperature: 0.3, maxTokens: 2048, jsonMode: true, timeoutMs: 15000 });

    const parsed = safeJsonParse(analysis, 'transcript analysis');
    return NextResponse.json({ analysis: parsed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
