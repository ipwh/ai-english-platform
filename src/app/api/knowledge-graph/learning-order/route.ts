// Sprint 34: GET /api/knowledge-graph/learning-order
// Returns topological order of the knowledge graph
import { NextRequest, NextResponse } from 'next/server';
import { knowledgeGraphService } from '@/modules/knowledge-graph/services/knowledge-graph-service';
import type { SkillDimension } from '@/modules/profile/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const skill = searchParams.get('skill') as SkillDimension | null;

    if (skill) {
      const order = knowledgeGraphService.getLearningOrderForSkill(skill);
      return NextResponse.json(order);
    }

    const order = knowledgeGraphService.getLearningOrder();
    return NextResponse.json(order);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
