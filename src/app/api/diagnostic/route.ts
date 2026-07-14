// ============================================
// POST /api/diagnostic — 儲存診斷測驗結果
// GET  /api/diagnostic?studentId=... — 讀取歷史診斷
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyApiAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { studentId, results } = body as {
      studentId: string;
      results: { skill: string; skillZh: string; accuracy: number; weakAreas: string[]; recommendedGrammar?: string; recommendedSkill?: string }[];
    };

    if (!studentId || !results?.length) {
      return NextResponse.json({ error: '缺少 studentId 或 results' }, { status: 400 });
    }

    // 清除舊診斷結果（保留最新一次）
    await db.diagnosticResult.deleteMany({ where: { studentId } });

    // 寫入新結果
    const created = await Promise.all(
      results.map(r =>
        db.diagnosticResult.create({
          data: {
            studentId,
            skill: r.skill,
            skillZh: r.skillZh,
            accuracy: r.accuracy,
            weakAreas: JSON.stringify(r.weakAreas || []),
            recommendedGrammar: r.recommendedGrammar || null,
            recommendedSkill: r.recommendedSkill || null,
            completedAt: new Date(),
          },
        })
      )
    );

    return NextResponse.json({ results: created }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // 🔒 Auth check
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    if (!studentId) return NextResponse.json({ error: '缺少 studentId' }, { status: 400 });

    const results = await db.diagnosticResult.findMany({
      where: { studentId },
      orderBy: { completedAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({ results });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '未知錯誤';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
