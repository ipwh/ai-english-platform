// ============================================
// POST /api/admin/import/teachers
// 批量匯入教師資料 — 支援 upsert、Zod 驗證、transaction
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import {
  parseCSV,
  teacherRowSchema,
  emptyImportResult,
} from '@/lib/import-utils';
import type { ImportResult } from '@/lib/import-utils';
import { verifyAdmin } from '@/lib/admin-auth';

/** 簡易密碼雜湊（與 seed.ts 一致） */
function simpleHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `hash_${Math.abs(hash).toString(16)}_${password.length}`;
}

export async function POST(request: NextRequest) {
  const result: ImportResult = emptyImportResult();

  try {
    // ---- 認證：僅 admin（JWT + NextAuth 雙重支援）----
    const auth = await verifyAdmin(request);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    // ---- 解析上傳檔案 ----
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const dryRun = formData.get('dryRun') === 'true';

    if (!file) {
      return NextResponse.json({ error: '請上傳 CSV 檔案' }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'CSV 檔案沒有有效資料（至少需要標題列 + 一筆資料）' },
        { status: 400 }
      );
    }

    result.total = rows.length;

    // ---- 逐列處理 ----
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // CSV row number (1-indexed + header)

      try {
        // Zod 驗證
        const parsed = teacherRowSchema.safeParse(row);

        if (!parsed.success) {
          const issues = parsed.error.issues
            .map(iss => `${iss.path.join('.')}: ${iss.message}`)
            .join('; ');
          result.failed++;
          result.errors.push(`第 ${rowNum} 列: ${issues}`);
          result.details.push({
            row: rowNum,
            email: row.email || '(無)',
            nameZh: row.nameZh || '(無)',
            status: 'error',
            reason: issues,
          });
          continue;
        }

        const data = parsed.data;

        // Dry run 模式
        if (dryRun) {
          const exists = await db.user.findUnique({
            where: { email: data.email },
          });
          result.details.push({
            row: rowNum,
            teacherId: data.teacherId,
            email: data.email,
            nameZh: data.nameZh,
            status: exists ? 'skipped' : 'created',
            reason: exists ? '已存在，將被更新 (upsert)' : '將被新增',
          });
          if (!exists) result.success++;
          else result.updated++;
          continue;
        }

        // ---- 實際寫入（transaction） ----
        await db.$transaction(async (tx) => {
          // 1. 檢查是否已存在（含跨角色衝突檢查）
          const existing = await tx.user.findUnique({
            where: { email: data.email },
          });

          // 若 email 已被非 teacher 角色使用，拒絕匯入
          if (existing && existing.role !== 'teacher') {
            throw new Error(
              `email ${data.email} 已被 ${existing.role === 'student' ? '學生' : '管理員'} 使用，無法匯入為教師`
            );
          }

          // 2. Upsert 使用者
          const userData = {
            email: data.email,
            nameZh: data.nameZh,
            nameEn: data.nameEn,
            role: 'teacher' as const,
            subjects: data.subjects || '["English Language"]',
            ...(existing
              ? {}
              : { passwordHash: simpleHash('teacher123') }),
          };

          if (existing) {
            await tx.user.update({
              where: { email: data.email },
              data: userData,
            });
          } else {
            // 使用指定的 teacherId 作為 id
            await tx.user.create({
              data: {
                id: data.teacherId,
                ...userData,
              },
            });
          }
        });

        const existing = await db.user.findUnique({
          where: { email: data.email },
        });
        const wasExisting = existing && existing.updatedAt > existing.createdAt;

        if (wasExisting) {
          result.updated++;
        } else {
          result.success++;
        }

        result.details.push({
          row: rowNum,
          teacherId: data.teacherId,
          email: data.email,
          nameZh: data.nameZh,
          status: wasExisting ? 'updated' : 'created',
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '未知錯誤';
        result.failed++;
        result.errors.push(`第 ${rowNum} 列 (${row.email || '無 email'}): ${msg}`);
        result.details.push({
          row: rowNum,
          email: row.email || '(無)',
          nameZh: row.nameZh || '(無)',
          status: 'error',
          reason: msg,
        });
      }
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    console.error('[admin/import/teachers] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
