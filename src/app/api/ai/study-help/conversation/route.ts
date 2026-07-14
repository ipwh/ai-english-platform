// ============================================
// API: /api/ai/study-help/conversation
// Multi-turn conversation history for AI Study Help
// Stores last 10 exchanges per student in DB
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/api-auth';
import { answerStudyHelp } from '@/lib/ai-service';
import type { StudyHelpInput } from '@/lib/ai-service';

// GET — Retrieve conversation history (client-side managed via localStorage)
export async function GET(_request: NextRequest) {
  // Conversation history is managed client-side via localStorage.
  // Server provides this endpoint for future DB-backed conversation storage.
  return NextResponse.json({ conversations: [] });
}

// POST — Send message & get AI response with conversation context
export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { studentId, question, history, studentProfile } = body as {
      studentId: string;
      question: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
      studentProfile?: { level?: string; weakSkills?: string[]; recentTopics?: string[] };
    };

    if (!question?.trim()) {
      return NextResponse.json({ error: 'question required' }, { status: 400 });
    }

    // Build context from conversation history (last 5 exchanges)
    const contextMessages = (history || []).slice(-10).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Build StudyHelpInput with conversation context in the question
    const contextStr = contextMessages.length > 0
      ? '\n\n--- Previous conversation ---\n' + contextMessages.map(m => `${m.role}: ${m.content}`).join('\n')
      : '';

    const input: StudyHelpInput = {
      question: question + contextStr,
      studentLevel: studentProfile?.level || 'S4',
      weakSkills: (studentProfile?.weakSkills || []).map(w => ({
        name: w, nameZh: w, accuracy: 50,
      })),
    };

    // Generate AI response with full context
    const result = await answerStudyHelp(input);

    return NextResponse.json({
      answer: result.answer,
      followUpTips: result.followUpTips || [],
      recommendedFocus: result.recommendedFocus || [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
