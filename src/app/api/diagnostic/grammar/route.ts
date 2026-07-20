// ============================================
// API: /api/diagnostic/grammar — 40 個文法點獨立診斷
// GET:  取得完整文法雷達圖數據
// POST: 生成指定文法點的診斷題目並提交結果
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db/db';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { generateQuestions, type GeneratedQuestion } from '@/modules/ai/services/ai-service';

// 40 個 HKDSE 文法點（對應 ELE KLACG 2017 Appendix 4）
const GRAMMAR_POINTS = [
  { id: 'tenses-simple', name: 'Simple Tenses', nameZh: '簡單時態', cat: 'tenses' },
  { id: 'tenses-continuous', name: 'Continuous Tenses', nameZh: '進行時態', cat: 'tenses' },
  { id: 'tenses-perfect', name: 'Perfect Tenses', nameZh: '完成時態', cat: 'tenses' },
  { id: 'tenses-perfect-cont', name: 'Perfect Continuous', nameZh: '完成進行時態', cat: 'tenses' },
  { id: 'tenses-mixed', name: 'Mixed Tenses', nameZh: '混合時態', cat: 'tenses' },
  { id: 'cond-type0', name: 'Zero Conditional', nameZh: '零條件句', cat: 'conditionals' },
  { id: 'cond-type1', name: 'First Conditional', nameZh: '第一條件句', cat: 'conditionals' },
  { id: 'cond-type2', name: 'Second Conditional', nameZh: '第二條件句', cat: 'conditionals' },
  { id: 'cond-type3', name: 'Third Conditional', nameZh: '第三條件句', cat: 'conditionals' },
  { id: 'cond-mixed', name: 'Mixed Conditionals', nameZh: '混合條件句', cat: 'conditionals' },
  { id: 'passive-basic', name: 'Passive Voice (Basic)', nameZh: '被動語態（基礎）', cat: 'passive' },
  { id: 'passive-adv', name: 'Passive Voice (Advanced)', nameZh: '被動語態（進階）', cat: 'passive' },
  { id: 'reported-statements', name: 'Reported Statements', nameZh: '轉述陳述句', cat: 'reported' },
  { id: 'reported-questions', name: 'Reported Questions', nameZh: '轉述疑問句', cat: 'reported' },
  { id: 'reported-commands', name: 'Reported Commands', nameZh: '轉述祈使句', cat: 'reported' },
  { id: 'rel-defining', name: 'Defining Relative Clauses', nameZh: '限定關係子句', cat: 'relatives' },
  { id: 'rel-non-defining', name: 'Non-defining Relative Clauses', nameZh: '非限定關係子句', cat: 'relatives' },
  { id: 'rel-omission', name: 'Relative Pronoun Omission', nameZh: '關係代名詞省略', cat: 'relatives' },
  { id: 'modals-ability', name: 'Modals: Ability (can/could)', nameZh: '情態動詞：能力', cat: 'modals' },
  { id: 'modals-obligation', name: 'Modals: Obligation (must/have to)', nameZh: '情態動詞：義務', cat: 'modals' },
  { id: 'modals-possibility', name: 'Modals: Possibility (may/might)', nameZh: '情態動詞：可能性', cat: 'modals' },
  { id: 'modals-deduction', name: 'Modals: Deduction (must/can\'t have)', nameZh: '情態動詞：推測', cat: 'modals' },
  { id: 'articles-definite', name: 'Articles: Definite (the)', nameZh: '定冠詞', cat: 'articles' },
  { id: 'articles-indefinite', name: 'Articles: Indefinite (a/an)', nameZh: '不定冠詞', cat: 'articles' },
  { id: 'articles-zero', name: 'Zero Article', nameZh: '零冠詞', cat: 'articles' },
  { id: 'prep-time', name: 'Prepositions of Time', nameZh: '時間介詞', cat: 'prepositions' },
  { id: 'prep-place', name: 'Prepositions of Place', nameZh: '地點介詞', cat: 'prepositions' },
  { id: 'prep-movement', name: 'Prepositions of Movement', nameZh: '移動介詞', cat: 'prepositions' },
  { id: 'prep-dependent', name: 'Dependent Prepositions', nameZh: '固定搭配介詞', cat: 'prepositions' },
  { id: 'gerund-subject', name: 'Gerunds as Subjects', nameZh: '動名詞作主語', cat: 'gerunds-inf' },
  { id: 'gerund-after-prep', name: 'Gerunds after Prepositions', nameZh: '介詞後動名詞', cat: 'gerunds-inf' },
  { id: 'infinitives-purpose', name: 'Infinitives of Purpose', nameZh: '不定詞表目的', cat: 'gerunds-inf' },
  { id: 'gerund-vs-infinitive', name: 'Gerund vs Infinitive', nameZh: '動名詞 vs 不定詞', cat: 'gerunds-inf' },
  { id: 'subject-verb-agreement', name: 'Subject-Verb Agreement', nameZh: '主謂一致', cat: 'agreement' },
  { id: 'comparatives', name: 'Comparatives', nameZh: '比較級', cat: 'comparison' },
  { id: 'superlatives', name: 'Superlatives', nameZh: '最高級', cat: 'comparison' },
  { id: 'question-forms', name: 'Question Forms', nameZh: '疑問句形式', cat: 'questions' },
  { id: 'tag-questions', name: 'Tag Questions', nameZh: '附加問句', cat: 'questions' },
  { id: 'inversion-negative', name: 'Inversion (Negative Adverbials)', nameZh: '倒裝句（否定副詞）', cat: 'inversion' },
  { id: 'inversion-conditional', name: 'Inversion (Conditional)', nameZh: '倒裝句（條件句）', cat: 'inversion' },
];

// GET — 取得學生的文法點雷達圖數據
export async function GET(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get('studentId');

  if (!studentId) {
    return NextResponse.json({ error: 'studentId required' }, { status: 400 });
  }

  try {
    // 從 DiagnosticResult 和 Mistake 計算每個文法點的準確率
    const [diagnosticResults, mistakes] = await Promise.all([
      db.diagnosticResult.findMany({
        where: { studentId },
        select: { weakAreas: true, recommendedGrammar: true, accuracy: true },
        orderBy: { completedAt: 'desc' },
        take: 5,
      }),
      db.mistake.findMany({
        where: { studentId },
        select: { mistakeType: true, studentAnswer: true, correctAnswer: true },
        take: 200,
      }),
    ]);

    // Build grammar point accuracy map
    const grammarAccuracy: Record<string, { total: number; correct: number }> = {};
    for (const gp of GRAMMAR_POINTS) {
      grammarAccuracy[gp.id] = { total: 0, correct: 0 };
    }

    // 從 PracticeSession 中提取文法練習記錄
    const sessions = await db.practiceSession.findMany({
      where: { studentId },
      select: { skill: true, totalQuestions: true, correctCount: true },
      take: 100,
    });

    for (const s of sessions) {
      // map skill to grammar point id
      for (const gp of GRAMMAR_POINTS) {
        if (s.skill.includes(gp.cat) || gp.id.includes(s.skill)) {
          grammarAccuracy[gp.id].total += s.totalQuestions;
          grammarAccuracy[gp.id].correct += s.correctCount;
        }
      }
    }

    // Build radar chart data
    const radarData = GRAMMAR_POINTS.map(gp => ({
      id: gp.id,
      name: gp.name,
      nameZh: gp.nameZh,
      category: gp.cat,
      accuracy: grammarAccuracy[gp.id]?.total > 0
        ? Math.round((grammarAccuracy[gp.id].correct / grammarAccuracy[gp.id].total) * 100)
        : null, // null = 未測試
      questionsDone: grammarAccuracy[gp.id]?.total || 0,
    }));

    // 找出最弱的 5 個文法點
    const weakPoints = radarData
      .filter(d => d.accuracy !== null)
      .sort((a, b) => (a.accuracy || 0) - (b.accuracy || 0))
      .slice(0, 5);

    return NextResponse.json({ grammarPoints: radarData, weakPoints, total: GRAMMAR_POINTS.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — 生成指定文法點的診斷題目
export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { studentId, grammarPointIds, gradeLevel } = body as {
      studentId: string;
      grammarPointIds: string[];
      gradeLevel?: string;
    };

    if (!studentId || !grammarPointIds?.length) {
      return NextResponse.json({ error: 'studentId and grammarPointIds required' }, { status: 400 });
    }

    // 每個文法點生成 3 題 MCQ
    const grammarPoint = GRAMMAR_POINTS.find(g => g.id === grammarPointIds[0]) || GRAMMAR_POINTS[0];
    const questions = await generateQuestions({
      count: 3,
      gradeLevel: gradeLevel || 'S4',
      grammarItem: grammarPoint.cat,
      grammarItemZh: grammarPoint.nameZh,
      questionType: 'mc',
      difficulty: 'core',
    });

    return NextResponse.json({
      grammarPoint: { id: grammarPoint.id, name: grammarPoint.name, nameZh: grammarPoint.nameZh },
      questions,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
