// ============================================
// CSV/Excel 批量導入 API — 教師與學生資料
// POST /api/import
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

// ---- 簡易 CSV 解析（無需外部依賴） ----
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] || '').trim().replace(/^"|"$/g, '');
    });
    // 跳過完全空白的行
    if (Object.values(row).every(v => !v)) continue;
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function simpleHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `hash_${Math.abs(hash).toString(16)}_${password.length}`;
}

// ---- CSV 格式定義 ----

/**
 * 學生 CSV 欄位：
 *   nameZh, nameEn, email, password, class, classNumber, level
 *
 * 教師 CSV 欄位：
 *   nameZh, nameEn, email, password, classes (以 | 分隔), subjects (以 | 分隔), isFormTeacherOf
 */

interface ImportRow {
  // 通用
  nameZh: string;
  nameEn: string;
  email: string;
  password: string;
  role: 'student' | 'teacher';
  // 學生
  class?: string;
  classNumber?: string;
  level?: string;
  // 教師
  classes?: string[];
  subjects?: string[];
  formTeacherOf?: string;
}

interface ImportResult {
  total: number;
  success: number;
  skipped: number;
  errors: string[];
  details: { email: string; nameZh: string; status: 'created' | 'skipped' | 'error'; reason?: string }[];
}

// ---- POST Handler ----

export async function POST(request: NextRequest) {
  const results: ImportResult = {
    total: 0,
    success: 0,
    skipped: 0,
    errors: [],
    details: [],
  };

  try {
    const contentType = request.headers.get('content-type') || '';
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const role = formData.get('role') as string; // "student" | "teacher"
    const dryRun = formData.get('dryRun') === 'true'; // 預覽模式

    if (!file) {
      return NextResponse.json({ error: '請上傳 CSV 檔案' }, { status: 400 });
    }
    if (!['student', 'teacher'].includes(role)) {
      return NextResponse.json({ error: 'role 必須為 student 或 teacher' }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'CSV 檔案沒有有效資料' }, { status: 400 });
    }

    results.total = rows.length;

    for (const row of rows) {
      try {
        const importRow = normalizeRow(row, role as 'student' | 'teacher');

        // 驗證必填欄位
        if (!importRow.email || !importRow.nameZh) {
          results.skipped++;
          results.details.push({
            email: importRow.email || '(無)',
            nameZh: importRow.nameZh || '(無)',
            status: 'skipped',
            reason: '缺少 email 或 nameZh',
          });
          continue;
        }

        if (dryRun) {
          const exists = await db.user.findUnique({ where: { email: importRow.email } });
          results.details.push({
            email: importRow.email,
            nameZh: importRow.nameZh,
            status: exists ? 'skipped' : 'created',
            reason: exists ? '已存在，將被跳過' : '將被新增',
          });
          if (!exists) results.success++;
          else results.skipped++;
          continue;
        }

        // 實際寫入
        const existing = await db.user.findUnique({ where: { email: importRow.email } });
        if (existing) {
          results.skipped++;
          results.details.push({
            email: importRow.email,
            nameZh: importRow.nameZh,
            status: 'skipped',
            reason: '已存在',
          });
          continue;
        }

        // 確保班級存在（學生）
        if (importRow.class) {
          await db.class.upsert({
            where: { name: importRow.class },
            update: {},
            create: {
              name: importRow.class,
              gradeLevel: importRow.level || inferGradeLevel(importRow.class),
            },
          });
        }

        // 創建用戶
        await db.user.create({
          data: {
            email: importRow.email,
            passwordHash: simpleHash(importRow.password || 'student123'),
            nameZh: importRow.nameZh,
            nameEn: importRow.nameEn || importRow.nameZh,
            role: importRow.role,
            classId: importRow.class || undefined,
            classNumber: importRow.classNumber || undefined,
            level: importRow.level || (importRow.class ? inferGradeLevel(importRow.class) : undefined),
            // 教師欄位
            subjects: importRow.subjects ? JSON.stringify(importRow.subjects) : undefined,
          },
        });

        // 教師 ↔ 班級關聯
        if (importRow.role === 'teacher' && importRow.classes) {
          for (const className of importRow.classes) {
            const cls = await db.class.upsert({
              where: { name: className },
              update: {},
              create: { name: className, gradeLevel: inferGradeLevel(className) },
            });
            await db.teacherClass.create({
              data: {
                teacher: { connect: { email: importRow.email } },
                class: { connect: { id: cls.id } },
                isFormTeacher: importRow.formTeacherOf === className,
              },
            }).catch(() => {/* 已存在則跳過 */});
          }
        }

        results.success++;
        results.details.push({
          email: importRow.email,
          nameZh: importRow.nameZh,
          status: 'created',
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '未知錯誤';
        results.errors.push(`${row.email || '(無)'}: ${msg}`);
        results.details.push({
          email: row.email || '(無)',
          nameZh: row.nameZh || '(無)',
          status: 'error',
          reason: msg,
        });
      }
    }

    return NextResponse.json(results);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '伺服器錯誤';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ---- 輔助函數 ----

function normalizeRow(row: Record<string, string>, role: 'student' | 'teacher'): ImportRow {
  const base: ImportRow = {
    nameZh: row.nameZh || row['中文姓名'] || '',
    nameEn: row.nameEn || row['英文姓名'] || '',
    email: row.email || row['電郵'] || '',
    password: row.password || row['密碼'] || 'student123',
    role,
  };

  if (role === 'student') {
    base.class = row.class || row['班級'] || undefined;
    base.classNumber = row.classNumber || row['班號'] || undefined;
    base.level = row.level || row['年級'] || undefined;
  } else {
    base.classes = (row.classes || row['任教班級'] || '')
      .split('|').map(c => c.trim()).filter(Boolean);
    base.subjects = (row.subjects || row['任教科目'] || 'English Language')
      .split('|').map(s => s.trim()).filter(Boolean);
    base.formTeacherOf = row.formTeacherOf || row['班主任班級'] || undefined;
  }

  return base;
}

function inferGradeLevel(className: string): string {
  const match = className.match(/^(\d)/);
  if (match) return `S${match[1]}`;
  return 'S4';
}
