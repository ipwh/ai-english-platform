// ============================================
// GET /api/admin/import/template/teachers
// 下載教師 CSV 匯入模板
// ============================================

import { NextResponse } from 'next/server';
import { generateTeacherTemplate } from '@/lib/import-utils';

export async function GET() {
  const csv = generateTeacherTemplate();

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="teachers_template.csv"',
    },
  });
}
