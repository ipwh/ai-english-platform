// Sprint 39: POST /api/writing-coach/analyze — enhanced analysis
import { NextRequest, NextResponse } from 'next/server';
import { validateRequest, writingCoachAnalyzeSchema } from '@/shared/validation/schemas';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { writingCoachPro } from '@/modules/writing-coach/services/writing-coach-pro';
import { logger } from '@/shared/logger/logger';

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = validateRequest(writingCoachAnalyzeSchema, body);
    const parsed = validateRequest(writingCoachAnalyzeSchema, body);
    const { essayId, studentId, title, content, textType, gradeLevel, action `} = parsed;

    if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 });

    const submission = {
      studentId: studentId || authResult.userId!,
      essayId: essayId || `essay_${Date.now()}`,
      title: title || 'Untitled',
      content,
      textType: textType || 'essay',
      gradeLevel: gradeLevel || 'S4',
      wordCount: content.split(/\s+/).length,
      submittedAt: new Date().toISOString(),
    };

    switch (action) {
      case 'full-analysis': {
        const scores = writingCoachPro.scoreWithAllRubrics(submission);
        const sentenceVariety = writingCoachPro.analyzeSentenceVariety(content);
        const toneRegister = writingCoachPro.analyzeToneRegister(content, submission.textType);
        const logicArgument = writingCoachPro.analyzeLogicArgument(content);
        const vocabUpgrades = writingCoachPro.generateVocabUpgrades(content);
        const grammarUpgrades = writingCoachPro.generateGrammarUpgrades(content);
        const betterExpressions = writingCoachPro.generateBetterExpressions(content);
        const sentenceRewrites = writingCoachPro.generateSentenceRewrites(content);

        return NextResponse.json({
          analysis: {
            scores, sentenceVariety, toneRegister, logicArgument,
            vocabUpgrades, grammarUpgrades, betterExpressions, sentenceRewrites,
          },
        });
      }
      case 'scores':
        return NextResponse.json({ scores: writingCoachPro.scoreWithAllRubrics(submission) });
      case 'sentence-variety':
        return NextResponse.json({ sentenceVariety: writingCoachPro.analyzeSentenceVariety(content) });
      case 'tone-register':
        return NextResponse.json({ toneRegister: writingCoachPro.analyzeToneRegister(content, submission.textType) });
      case 'logic-argument':
        return NextResponse.json({ logicArgument: writingCoachPro.analyzeLogicArgument(content) });
      case 'upgrades':
        return NextResponse.json({
          vocabUpgrades: writingCoachPro.generateVocabUpgrades(content),
          grammarUpgrades: writingCoachPro.generateGrammarUpgrades(content),
          betterExpressions: writingCoachPro.generateBetterExpressions(content),
          sentenceRewrites: writingCoachPro.generateSentenceRewrites(content),
        });
      default:
        return NextResponse.json({ scores: writingCoachPro.scoreWithAllRubrics(submission) });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ module: 'writing-coach-pro', error: msg }, 'Analysis failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}