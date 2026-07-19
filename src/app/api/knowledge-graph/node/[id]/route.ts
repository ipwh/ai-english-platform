// Sprint 34: GET /api/knowledge-graph/node/[id]
import { NextRequest, NextResponse } from 'next/server';
import { knowledgeGraphService } from '@/modules/knowledge-graph/services/knowledge-graph-service';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const node = knowledgeGraphService.getNode(id);
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 });
    }
    return NextResponse.json({ node });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
