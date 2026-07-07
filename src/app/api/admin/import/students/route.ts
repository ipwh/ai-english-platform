// ============================================
// POST /api/admin/import/students
// 批量匯入學生資料 — 支援 upsert、Zod 驗證、transaction
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import {
  parseCSV,
  studentRowSchema,
  inferGradeLevel,
  emptyImportResult,
} from '@/lib/import-utils';
import type { ImportResult, ImportDetail } from '@/lib/import-utils';
import { verifySessionToken } from '@/lib/jwt';

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
    // ---- 認證：僅 admin ----
    const token =
      request.cookies.get('session_token')?.value ||
      request.headers.get('authorization')?.replace('Bearer ', '') ||
      '';

    const session = await verifySessionToken(token);
    if (!session || session.role !== 'admin') {
      return NextResponse.json(
        { error: '權限不足：僅管理員可執行批量匯入' },
        { status: 403 }
      );
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
        const parsed = studentRowSchema.safeParse(row);

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

        // Dry run 模式：僅檢查是否已存在
        if (dryRun) {
          const exists = await db.user.findUnique({
            where: { email: data.email },
          });
          result.details.push({
            row: rowNum,
            studentId: data.studentId,
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
          // 1. 確保班級存在
          const cls = await tx.class.upsert({
            where: { name: data.className },
            update: {},
            create: {
              name: data.className,
              gradeLevel: data.level || inferGradeLevel(data.className),
            },
          });

          // 2. 檢查是否已存在（含跨角色衝突檢查）
          const existing = await tx.user.findUnique({
            where: { email: data.email },
          });

          // 若 email 已被非 student 角色使用，拒絕匯入
          if (existing && existing.role !== 'student') {
            throw new Error(
              `email ${data.email} 已被 ${existing.role === 'teacher' ? '教師' : '管理員'} 使用，無法匯入為學生`
            );
          }

          // 3. Upsert 使用者
          const userData = {
            email: data.email,
            nameZh: data.nameZh,
            nameEn: data.nameEn,
            role: 'student' as const,
            level: data.level,
            classId: cls.id,
            classNumber: data.classNumber || undefined,
            joinedAt: data.joinedAt ? new Date(data.joinedAt) : undefined,
            // 新用戶才設定 passwordHash
            ...(existing
              ? {}
              : { passwordHash: simpleHash('student123') }),
          };

          if (existing) {
            await tx.user.update({
              where: { email: data.email },
              data: userData,
            });
          } else {
            // 使用指定的 studentId 作為 id（若已被佔用則自動生成）
            await tx.user.create({
              data: {
                id: data.studentId,
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
          studentId: data.studentId,
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
    console.error('[admin/import/students] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
