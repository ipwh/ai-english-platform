// Sprint 34: GET /api/knowledge-graph/node/[id]/dependents
import { NextRequest, NextResponse } from 'next/server';
import { knowledgeGraphService } from '@/modules/knowledge-graph/services/knowledge-graph-service';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const successors = knowledgeGraphService.getAllSuccessors(id);
    const node = knowledgeGraphService.getNode(id);

    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }

    return NextResponse.json({
      nodeId: id,
      nodeTitle: node.title,
      nodeTitleZh: node.titleZh,
      directSuccessors: node.successors,
      allDependents: successors,
      totalDependents: successors.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
