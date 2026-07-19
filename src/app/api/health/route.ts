// Sprint 29: Health Check API
import { NextResponse } from 'next/server';
import { healthCheck, readinessCheck } from '@/modules/production/services/production-ready';
import { getAllFeatureFlags } from '@/modules/production/services/production-ready';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'health';

  try {
    switch (type) {
      case 'health':
        return NextResponse.json(await healthCheck());
      case 'readiness':
        return NextResponse.json(await readinessCheck());
      case 'features':
        return NextResponse.json(getAllFeatureFlags());
      default:
        return NextResponse.json({ error: 'Unknown check type' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ status: 'unhealthy', error: String(err) }, { status: 500 });
  }
}
