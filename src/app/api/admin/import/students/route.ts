// ============================================
// POST /api/admin/import/students
// 批量匯入學生資料 — 單一 transaction，高效批次處理
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getBulkDb } from '@/lib/db';
import {
  parseCSV,
  studentRowSchema,
  inferGradeLevel,
  emptyImportResult,
} from '@/lib/import-utils';
import type { ImportResult, ImportDetail } from '@/lib/import-utils';
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
    // ---- 認證 ----
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

    // ---- Phase 1: Zod 驗證所有列 ----
    const validRows: { rowNum: number; data: ReturnType<typeof studentRowSchema.parse> }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
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
      } else {
        validRows.push({ rowNum, data: parsed.data });
      }
    }

    if (validRows.length === 0) {
      return NextResponse.json(result);
    }

    // ---- Phase 2: 收集唯一班級名稱 & email 列表 ----
    const uniqueClassNames = [...new Set(validRows.map(r => r.data.className))];
    const allEmails = validRows.map(r => r.data.email);

    // ---- Dry run: 批量檢查已存在的 email ----
    if (dryRun) {
      const existingEmails = new Set(
        (await db.user.findMany({
          where: { email: { in: allEmails } },
          select: { email: true },
        })).map(u => u.email)
      );

      for (const { rowNum, data } of validRows) {
        const exists = existingEmails.has(data.email);
        result.details.push({
          row: rowNum,
          studentId: data.studentId,
          email: data.email,
          nameZh: data.nameZh,
          status: exists ? 'skipped' : 'created',
          reason: exists ? '已存在，取消勾選預覽模式後再匯入即可更新班級資料' : '將被新增',
        });
        if (!exists) result.success++;
        else result.updated++;
      }

      return NextResponse.json(result);
    }

    // ---- Phase 3: 先建立班級（使用大量匯入專用 DB）----
    const bulkDb = getBulkDb();
    const existingClasses = await bulkDb.class.findMany({
      where: { name: { in: uniqueClassNames } },
      select: { id: true, name: true },
    });
    const classMap = new Map(existingClasses.map(c => [c.name, c.id]));

    for (const name of uniqueClassNames) {
      if (!classMap.has(name)) {
        const cls = await bulkDb.class.create({
          data: { name, gradeLevel: inferGradeLevel(name) },
        });
        classMap.set(name, cls.id);
      }
    }

    // ---- Phase 4: 批次查詢已存在的使用者 ----
    const existingUsers = await bulkDb.user.findMany({
      where: { email: { in: allEmails } },
      select: { id: true, email: true, role: true },
    });
    const existingUserMap = new Map(existingUsers.map(u => [u.email, u]));

    // ---- Phase 5: 分批寫入（每批獨立 commit，避免 Vercel 10s timeout）----
    const BATCH_SIZE = 50;
    const defaultPwHash = simpleHash('student123');

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      const batchOps: Promise<void>[] = [];

      for (const { rowNum, data } of batch) {
        const existing = existingUserMap.get(data.email);
        const classId = classMap.get(data.className);

        // 跨角色衝突檢查
        if (existing && existing.role !== 'student') {
          const roleLabel = existing.role === 'teacher' ? '教師' : '管理員';
          result.failed++;
          result.errors.push(`第 ${rowNum} 列 (${data.email}): email 已被${roleLabel}使用`);
          result.details.push({ row: rowNum, email: data.email, nameZh: data.nameZh, status: 'error', reason: `email 已被${roleLabel}使用` });
          continue;
        }

        if (existing) {
          // UPDATE existing student — classId is the critical fix
          batchOps.push(
            bulkDb.user.update({
              where: { email: data.email },
              data: {
                nameZh: data.nameZh,
                nameEn: data.nameEn,
                level: data.level,
                classId: classId || undefined,
                classNumber: data.classNumber || undefined,
                joinedAt: data.joinedAt ? new Date(data.joinedAt) : undefined,
              },
            }).then(() => {
              result.updated++;
              result.details.push({ row: rowNum, studentId: data.studentId, email: data.email, nameZh: data.nameZh, status: 'updated' });
            }).catch((err: Error) => {
              result.failed++;
              result.errors.push(`第 ${rowNum} 列 (${data.email}): ${err.message}`);
              result.details.push({ row: rowNum, email: data.email, nameZh: data.nameZh, status: 'error', reason: err.message });
            })
          );
        } else {
          // CREATE new student
          batchOps.push(
            bulkDb.user.create({
              data: {
                id: data.studentId,
                email: data.email,
                nameZh: data.nameZh,
                nameEn: data.nameEn,
                role: 'student',
                level: data.level,
                classId: classId || undefined,
                classNumber: data.classNumber || undefined,
                joinedAt: data.joinedAt ? new Date(data.joinedAt) : undefined,
                passwordHash: defaultPwHash,
              },
            }).then(() => {
              result.success++;
              result.details.push({ row: rowNum, studentId: data.studentId, email: data.email, nameZh: data.nameZh, status: 'created' });
            }).catch(async (createErr: Error) => {
              // ID 衝突：使用 auto-generated cuid 重試
              const msg = createErr.message;
              if (msg.includes('Unique constraint') && msg.includes('id')) {
                try {
                  await bulkDb.user.create({
                    data: {
                      email: data.email,
                      nameZh: data.nameZh,
                      nameEn: data.nameEn,
                      role: 'student',
                      level: data.level,
                      classId: classId || undefined,
                      classNumber: data.classNumber || undefined,
                      joinedAt: data.joinedAt ? new Date(data.joinedAt) : undefined,
                      passwordHash: defaultPwHash,
                    },
                  });
                  result.success++;
                  result.details.push({ row: rowNum, studentId: '(auto)', email: data.email, nameZh: data.nameZh, status: 'created' });
                } catch (retryErr: unknown) {
                  const retryMsg = retryErr instanceof Error ? retryErr.message : '未知錯誤';
                  result.failed++;
                  result.errors.push(`第 ${rowNum} 列 (${data.email}): ${retryMsg}`);
                  result.details.push({ row: rowNum, email: data.email, nameZh: data.nameZh, status: 'error', reason: retryMsg });
                }
              } else {
                result.failed++;
                result.errors.push(`第 ${rowNum} 列 (${data.email}): ${msg}`);
                result.details.push({ row: rowNum, email: data.email, nameZh: data.nameZh, status: 'error', reason: msg });
              }
            })
          );
        }
      }

      // 等待此批次完成（獨立 commit，不會因單筆失敗而全 rollback）
      await Promise.allSettled(batchOps);

      // 進度回報（透過 console，可在 Vercel logs 看到）
      console.log(`[import/students] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(validRows.length / BATCH_SIZE)} done (${Math.min(i + BATCH_SIZE, validRows.length)}/${validRows.length})`);
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    console.error('[admin/import/students] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
