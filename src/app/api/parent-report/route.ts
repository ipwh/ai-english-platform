// ============================================
// API: GET /api/parent-report — 家長報告（雙語）
// Generates a simple printable HTML report for parents
// showing their child's learning progress in plain language
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';

export async function GET(request: NextRequest) {
  // Auth check: only teachers/admins can generate parent reports
  const authResult = await verifyApiAuth(request, ['teacher', 'admin']);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get('studentId');
  const format = searchParams.get('format') || 'html';

  if (!studentId) {
    return NextResponse.json({ error: 'studentId required' }, { status: 400 });
  }

  try {
    const db = (await import('@/shared/db/db')).default;

    const [student, sessions, mistakes, vocab] = await Promise.all([
      db.user.findUnique({
        where: { id: studentId },
        select: {
          nameZh: true, nameEn: true, level: true, overallAccuracy: true,
          xp: true, streakDays: true, class: { select: { name: true, gradeLevel: true } },
        },
      }),
      db.practiceSession.findMany({
        where: { studentId },
        orderBy: { startedAt: 'desc' },
        take: 30,
        select: { skillZh: true, totalQuestions: true, correctCount: true, startedAt: true },
      }),
      db.mistake.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { mistakeType: true, createdAt: true },
      }),
      db.vocabItem.count({ where: { studentId } }),
    ]);

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const studentName = student.nameZh || student.nameEn || 'Student';
    const className = student.class?.name || 'N/A';
    const accuracy = student.overallAccuracy ? Math.round(student.overallAccuracy) : 0;

    // Calculate weekly stats
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const weekSessions = sessions.filter(s => new Date(s.startedAt) >= weekAgo);
    const weekTotal = weekSessions.reduce((s, r) => s + r.totalQuestions, 0);
    const weekCorrect = weekSessions.reduce((s, r) => s + r.correctCount, 0);
    const weekAccuracy = weekTotal > 0 ? Math.round((weekCorrect / weekTotal) * 100) : 0;

    // Mistake type distribution
    const mistakeTypes: Record<string, number> = {};
    for (const m of mistakes) {
      mistakeTypes[m.mistakeType] = (mistakeTypes[m.mistakeType] || 0) + 1;
    }

    if (format === 'json') {
      return NextResponse.json({
        studentName, className, accuracy, weekAccuracy,
        totalSessions: sessions.length, totalVocab: vocab,
        xp: student.xp, streakDays: student.streakDays,
        mistakeTypes, level: student.level,
      });
    }

    // Generate HTML report (Traditional Chinese, suitable for printing)
    const html = `<!DOCTYPE html>
<html lang="zh-HK">
<head>
<meta charset="utf-8">
<title>學習進度報告 — ${studentName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Microsoft JhengHei', 'Segoe UI', sans-serif; padding: 32px; color: #1a1a2e; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 24px; color: #0d9488; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #6b7280; margin-bottom: 24px; }
  h2 { font-size: 16px; color: #374151; margin: 20px 0 10px; border-bottom: 2px solid #0d9488; padding-bottom: 4px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
  .kpi { background: #f0fdfa; border-radius: 12px; padding: 16px; text-align: center; }
  .kpi-value { font-size: 28px; font-weight: 700; color: #0d9488; }
  .kpi-label { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .section { margin-bottom: 16px; }
  .bar { height: 10px; background: #e5e7eb; border-radius: 5px; overflow: hidden; margin: 4px 0; }
  .bar-fill { height: 100%; background: #0d9488; border-radius: 5px; transition: width .3s; }
  .mistake-tag { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; margin: 2px; }
  .advice { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 12px; padding: 16px; margin-top: 20px; }
  .advice h3 { font-size: 14px; color: #92400e; margin-bottom: 6px; }
  .advice p { font-size: 12px; color: #78350f; line-height: 1.6; }
  @media print { body { padding: 16px; } .kpi { background: white; border: 1px solid #e5e7eb; } }
</style>
</head>
<body>
<h1>📊 學習進度報告 Learning Progress Report</h1>
<p class="subtitle">學生：${studentName} | 班別：${className} | 日期：${new Date().toLocaleDateString('zh-HK')}</p>

<h2>📈 學習概覽 Overview</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-value">${accuracy}%</div><div class="kpi-label">整體正確率 Overall</div></div>
  <div class="kpi"><div class="kpi-value">${weekAccuracy}%</div><div class="kpi-label">本週正確率 This Week</div></div>
  <div class="kpi"><div class="kpi-value">${sessions.length}</div><div class="kpi-label">練習次數 Sessions</div></div>
  <div class="kpi"><div class="kpi-value">${vocab}</div><div class="kpi-label">已學生字 Vocabulary</div></div>
</div>

<h2>🎯 技能表現 Skills</h2>
<div class="section">
  <p style="font-size:12px;color:#6b7280;margin-bottom:4px;">整體正確率 Overall Accuracy</p>
  <div class="bar"><div class="bar-fill" style="width:${accuracy}%"></div></div>
</div>

<h2>📝 錯題分佈 Mistake Types</h2>
<div class="section" style="margin-top:12px;">
  ${Object.entries(mistakeTypes).map(([type, count]) => {
    const labels: Record<string, string> = {
      grammar: '文法 Grammar', vocabulary: '詞彙 Vocabulary',
      comprehension: '閱讀理解 Comprehension', careless: '粗心 Careless',
      'time-management': '時間管理 Time', chinglish: '中式英文 Chinglish',
    };
    return `<span class="mistake-tag" style="background:#fee2e2;color:#991b1b;">${labels[type] || type}: ${count}題</span>`;
  }).join('\n  ')}
</div>

<div class="advice">
  <h3>💡 給家長的建議 Tips for Parents</h3>
  <p>
    ${accuracy >= 80
      ? '同學表現優異！建議繼續保持規律練習，可鼓勵嘗試挑戰難度（Challenge）的題目以進一步提升。'
      : accuracy >= 60
        ? '同學表現良好。建議針對錯題較多的範疇（如文法或詞彙）加強練習，並善用平台的「錯題重溫」功能。'
        : '同學需要更多練習。建議每天使用平台 15-20 分鐘，從補底（Remedial）難度開始，逐步建立信心和基礎能力。'}
  </p>
  <p style="margin-top:8px;">
    建議每週練習 ${accuracy >= 70 ? '3-4' : '5-6'} 次，每次完成 ${accuracy >= 70 ? '10-15' : '5-8'} 題。
    ${mistakes.length > 10 ? '請特別留意錯題中常見的文法或詞彙錯誤，這是進步的關鍵。' : ''}
  </p>
</div>

<p style="text-align:center;font-size:10px;color:#9ca3af;margin-top:32px;">
  AI English Platform · 由 AI 英語學習平台自動生成 · Generated automatically
</p>
</body>
</html>`;

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
