// ============================================
// GET /api/admin/import/template/teachers
// 下載教師 CSV 匯入模板 (admin only)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { generateTeacherTemplate } from '@/shared/utils/import-utils';
import { verifyApiAuth } from '@/shared/auth/api-auth';

export async function GET(request: NextRequest) {
  const auth = await verifyApiAuth(request, ['admin']);
  if (!auth.authenticated) {
    return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });
  }
  const csv = generateTeacherTemplate();

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="teachers_template.csv"',
    },
  });
}
