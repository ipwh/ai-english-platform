// ============================================
// GET /api/admin/import/template/students
// 下載學生 CSV 匯入模板 (admin only)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { generateStudentTemplate } from '@/shared/utils/import-utils';
import { verifyApiAuth } from '@/shared/auth/api-auth';

export async function GET(request: NextRequest) {
  const auth = await verifyApiAuth(request, ['admin']);
  if (!auth.authenticated) {
    return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });
  }
  const csv = generateStudentTemplate();

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="students_template.csv"',
    },
  });
}
