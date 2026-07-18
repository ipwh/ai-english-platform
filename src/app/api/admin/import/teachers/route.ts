// ============================================
// POST /api/admin/import/teachers
// 批量匯入教師資料 — 單一 transaction，高效批次處理
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/shared/db/db';
import {
  parseCSV,
  teacherRowSchema,
  emptyImportResult,
} from '@/shared/utils/import-utils';
import type { ImportResult } from '@/shared/utils/import-utils';
import { verifyAdmin } from '@/shared/auth/admin-auth';
import { hashPasswordSync } from '@/shared/auth/crypto';

export async function POST(request: NextRequest) {
  const result: ImportResult = emptyImportResult();

  try {
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const dryRun = formData.get('dryRun') === 'true';

    if (!file) {
      return NextResponse.json({ error: '請上傳 CSV 檔案' }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'CSV 檔案沒有有效資料' }, { status: 400 });
    }
    result.total = rows.length;

    // Phase 1: Validate all rows
    const validRows: { rowNum: number; data: ReturnType<typeof teacherRowSchema.parse> }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const parsed = teacherRowSchema.safeParse(rows[i]);
      if (!parsed.success) {
        const issues = parsed.error.issues.map(iss => `${iss.path.join('.')}: ${iss.message}`).join('; ');
        result.failed++;
        result.errors.push(`第 ${i + 2} 列: ${issues}`);
        result.details.push({ row: i + 2, email: rows[i].email || '(無)', nameZh: rows[i].nameZh || '(無)', status: 'error', reason: issues });
      } else {
        validRows.push({ rowNum: i + 2, data: parsed.data });
      }
    }
    if (validRows.length === 0) return NextResponse.json(result);

    const allEmails = validRows.map(r => r.data.email);

    // Dry run: batch check
    if (dryRun) {
      const existingEmails = new Set(
        (await db.user.findMany({ where: { email: { in: allEmails } }, select: { email: true } })).map(u => u.email)
      );
      for (const { rowNum, data } of validRows) {
        const exists = existingEmails.has(data.email);
        result.details.push({ row: rowNum, teacherId: data.teacherId, email: data.email, nameZh: data.nameZh, status: exists ? 'skipped' : 'created', reason: exists ? '已存在，將被更新' : '將被新增' });
        if (!exists) result.success++; else result.updated++;
      }
      return NextResponse.json(result);
    }

    // Phase 2: Batch upsert — 每批獨立 commit，避免 Vercel timeout
    const existingUsers = await db.user.findMany({
      where: { email: { in: allEmails } },
      select: { id: true, email: true, role: true },
    });
    const existingMap = new Map(existingUsers.map(u => [u.email, u]));
    const defaultPwHash = hashPasswordSync('teacher123');
    const BATCH_SIZE = 50;

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      const batchOps: Promise<void>[] = [];

      for (const { rowNum, data } of batch) {
        const existing = existingMap.get(data.email);

        if (existing && existing.role !== 'teacher') {
          const roleLabel = existing.role === 'student' ? '學生' : '管理員';
          result.failed++;
          result.errors.push(`第 ${rowNum} 列 (${data.email}): email 已被${roleLabel}使用`);
          result.details.push({ row: rowNum, email: data.email, nameZh: data.nameZh, status: 'error', reason: `email 已被${roleLabel}使用` });
          continue;
        }

        const userData = {
          email: data.email,
          nameZh: data.nameZh,
          nameEn: data.nameEn,
          role: 'teacher' as const,
          subjects: data.subjects || '["English Language"]',
          department: data.department || undefined,
          ...(existing ? {} : { passwordHash: defaultPwHash }),
        };

        if (existing) {
          batchOps.push(
            db.user.update({ where: { email: data.email }, data: userData }).then(() => {
              result.updated++;
              result.details.push({ row: rowNum, teacherId: data.teacherId, email: data.email, nameZh: data.nameZh, status: 'updated' });
            }).catch((err: Error) => {
              result.failed++;
              result.errors.push(`第 ${rowNum} 列 (${data.email}): ${err.message}`);
            })
          );
        } else {
          batchOps.push(
            db.user.create({ data: { id: data.teacherId, ...userData } }).then(() => {
              result.success++;
              result.details.push({ row: rowNum, teacherId: data.teacherId, email: data.email, nameZh: data.nameZh, status: 'created' });
            }).catch(async (createErr: Error) => {
              if (createErr.message.includes('Unique constraint')) {
                try {
                  await db.user.create({ data: userData });
                  result.success++;
                  result.details.push({ row: rowNum, teacherId: '(auto)', email: data.email, nameZh: data.nameZh, status: 'created' });
                } catch (retryErr: unknown) {
                  const retryMsg = retryErr instanceof Error ? retryErr.message : '未知錯誤';
                  result.failed++;
                  result.errors.push(`第 ${rowNum} 列 (${data.email}): ${retryMsg}`);
                }
              } else {
                result.failed++;
                result.errors.push(`第 ${rowNum} 列 (${data.email}): ${createErr.message}`);
              }
            })
          );
        }
      }

      await Promise.allSettled(batchOps);
      console.log(`[import/teachers] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(validRows.length / BATCH_SIZE)} done`);
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    console.error('[admin/import/teachers] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
