// Sprint 34: GET /api/knowledge-graph/node/[id]/dependents
import { NextRequest, NextResponse } from 'next/server';
import { knowledgeGraphService } from '@/modules/knowledge-graph/services/knowledge-graph-service';
import { verifySessionToken } from '@/shared/auth/jwt';
import { auth } from '@/shared/auth/auth-next';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Auth check
    const token = request.cookies.get('session_token')?.value;
    let authenticated = false;
    if (token) {
      const payload = await verifySessionToken(token);
      if (payload) authenticated = true;
    }
    if (!authenticated) {
      const session = await auth();
      if (session?.user?.id) authenticated = true;
    }
    if (!authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
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
