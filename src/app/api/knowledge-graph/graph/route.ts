// Sprint 34: GET /api/knowledge-graph/graph
// Returns full knowledge graph or filtered view
import { NextRequest, NextResponse } from 'next/server';
import { knowledgeGraphService } from '@/modules/knowledge-graph/services/knowledge-graph-service';
import type { SkillDimension } from '@/modules/profile/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const skill = searchParams.get('skill') as SkillDimension | null;
    const cefr = searchParams.get('cefr');
    const hkdse = searchParams.get('hkdse');
    const includeNodes = searchParams.get('includeNodes') !== 'false';
    const includeEdges = searchParams.get('includeEdges') !== 'false';

    let nodes = knowledgeGraphService.getAllNodes();
    let edges: unknown[] = [];

    // Apply filters
    if (skill) {
      nodes = nodes.filter(n => n.skill === skill);
    }
    if (cefr) {
      nodes = nodes.filter(n => n.cefr === cefr);
    }
    if (hkdse) {
      nodes = nodes.filter(n => n.hkdseLevel === hkdse);
    }

    // Get edges for filtered nodes
    if (includeEdges) {
      const allEdges = knowledgeGraphService.getAllEdges();
      const nodeIds = new Set(nodes.map(n => n.id));
      edges = allEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
    }

    return NextResponse.json({
      metadata: knowledgeGraphRepo.getMetadata(),
      nodes: includeNodes ? nodes : undefined,
      edges: includeEdges ? edges : undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
