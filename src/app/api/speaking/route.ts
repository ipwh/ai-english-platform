// ============================================
// API: POST /api/speaking — Speaking practice AI analysis
// Accepts text transcript and provides DSE Speaking rubric feedback
// Future: will accept audio blob for STT → analysis
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/api-auth';
import { callLLM } from '@/lib/ai-service';

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

  try {
    const body = await request.json();
    const { transcript, topic, gradeLevel, mode } = body as {
      transcript?: string;
      topic?: string;
      gradeLevel?: string;
      mode?: 'practice' | 'mock';
    };

    if (mode === 'mock') {
      // Generate a mock speaking prompt (Group Discussion or Individual Response)
      const prompt = await callLLM([
        {
          role: 'system',
          content: `You are an HKDSE English Speaking examiner. Generate ONE speaking practice question suitable for ${gradeLevel || 'S4'} level Hong Kong students.

${SPEAKING_RUBRIC}

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
        { role: 'user', content: `Generate a DSE Speaking mock question for ${gradeLevel || 'S4'} students. Topic area: ${topic || 'general'}.` },
      ], { temperature: 0.8, maxTokens: 1024, jsonMode: true, timeoutMs: 15000 });

      const parsed = JSON.parse(prompt);
      return NextResponse.json({ mockQuestion: parsed });
    }

    // Practice mode: analyze student transcript
    if (!transcript) {
      return NextResponse.json({ error: 'transcript required for practice mode' }, { status: 400 });
    }

    const analysis = await callLLM([
      {
        role: 'system',
        content: `You are an HKDSE English Speaking examiner. Analyze the student's speaking transcript.

${SPEAKING_RUBRIC}

Return a JSON object:
{
  "estimatedLevel": "L1-L5",
  "fluency": { "score": 1-5, "comment": "zh comment" },
  "pronunciation": { "score": 1-5, "comment": "zh comment" },
  "grammarAccuracy": { "score": 1-5, "comment": "zh comment" },
  "vocabularyRange": { "score": 1-5, "comment": "zh comment" },
  "interaction": { "score": 1-5, "comment": "zh comment" },
  "overallComment": "general feedback in Traditional Chinese",
  "improvementTips": ["tip1 zh", "tip2 zh"]
}`,
      },
      { role: 'user', content: `Analyze this student speaking transcript from a DSE ${gradeLevel || 'S4'} student on the topic "${topic || 'general'}":\n\n${transcript}` },
    ], { temperature: 0.3, maxTokens: 2048, jsonMode: true, timeoutMs: 15000 });

    const parsed = JSON.parse(analysis);
    return NextResponse.json({ analysis: parsed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
