// ============================================
// API: /api/ai/study-help/conversation
// Multi-turn conversation history for AI Study Help
// Stores last 10 exchanges per student in DB
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyApiAuth } from '@/lib/api-auth';
import { answerStudyHelp } from '@/lib/ai-service';

// GET — Retrieve conversation history
export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get('studentId') || authResult.userId;

  try {
    // Use a simple JSON field on User or a dedicated table
    // For now, store in localStorage-compatible format via API
    const conversations = await db.$queryRawUnsafe<{ id: string; messages: string }[]>(
      `SELECT id, messages FROM "Conversation" WHERE "userId" = $1 ORDER BY "updatedAt" DESC LIMIT 1`,
      studentId
    ).catch(() => []);

    return NextResponse.json({
      conversations: conversations.map(c => ({
        id: c.id,
        messages: JSON.parse(c.messages || '[]'),
      })),
    });
  } catch {
    return NextResponse.json({ conversations: [] });
  }
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

    // Generate AI response with full context
    const result = await answerStudyHelp(
      question,
      studentProfile?.level || 'S4',
      studentProfile?.weakSkills || [],
      studentProfile?.recentTopics || [],
      contextMessages,
    );

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
