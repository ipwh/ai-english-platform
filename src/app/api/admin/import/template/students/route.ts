// ============================================
// GET /api/admin/import/template/students
// 下載學生 CSV 匯入模板
// ============================================

import { NextResponse } from 'next/server';
import { generateStudentTemplate } from '@/shared/utils/import-utils';

export async function GET() {
  const csv = generateStudentTemplate();

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="students_template.csv"',
    },
  });
}
