// ============================================
// 批量匯入工具 — Zod 驗證、CSV 解析、模板生成
// ============================================

import { z } from 'zod';

// ============================================
// CSV 解析（無外部依賴，支援引號欄位）
// ============================================

/** 解析完整 CSV 文字為 Record 陣列 */
export function parseCSV(text: string): Record<string, string>[] {
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

/** 解析單行 CSV（處理引號內逗號） */
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

// ============================================
// Zod 驗證 Schema
// ============================================

/** 年級 S1-S6 */
const gradeLevelSchema = z.enum(['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);

/** 學生 CSV 欄位驗證 */
export const studentRowSchema = z.object({
  studentId: z
    .string()
    .min(1, 'studentId 為必填')
    .regex(/^s\d+$/i, 'studentId 必須以 s 開頭後接數字（例：s12345）'),
  email: z
    .string()
    .min(1, 'email 為必填')
    .email('email 格式不正確')
    .transform(e => e.toLowerCase().trim()),
  nameZh: z.string().min(1, '中文姓名為必填'),
  nameEn: z.string().min(1, '英文姓名為必填'),
  level: gradeLevelSchema,
  className: z
    .string()
    .min(1, '班級為必填')
    .regex(/^[1-6][A-E]$/, '班級格式必須為數字+英文字母（例：4A）'),
  classNumber: z.string().optional(),
  gender: z.enum(['M', 'F']).optional(),
  joinedAt: z
    .string()
    .optional()
    .transform(v => v || new Date().toISOString().split('T')[0]),
});

export type StudentRow = z.infer<typeof studentRowSchema>;

/** 教師 CSV 欄位驗證 */
export const teacherRowSchema = z.object({
  teacherId: z
    .string()
    .min(1, 'teacherId 為必填')
    .regex(/^[a-z]+$/i, 'teacherId 必須為英文姓氏+名字縮寫（例：chantm、cheunghy）'),
  email: z
    .string()
    .min(1, 'email 為必填')
    .email('email 格式不正確')
    .transform(e => e.toLowerCase().trim()),
  nameZh: z.string().min(1, '中文姓名為必填'),
  nameEn: z.string().min(1, '英文姓名為必填'),
  subjects: z
    .string()
    .optional()
    .transform(v => {
      if (!v || v.trim() === '') return '["English Language"]';
      // 支援 JSON array 或 | 分隔
      if (v.startsWith('[')) return v; // 已是 JSON
      return JSON.stringify(v.split('|').map(s => s.trim()).filter(Boolean));
    }),
  department: z.string().optional(),
  gender: z.enum(['M', 'F']).optional(),
});

export type TeacherRow = z.infer<typeof teacherRowSchema>;

// ============================================
// 匯入結果型別
// ============================================

export interface ImportDetail {
  row: number;
  studentId?: string;
  teacherId?: string;
  email: string;
  nameZh: string;
  status: 'created' | 'updated' | 'skipped' | 'error';
  reason?: string;
}

export interface ImportResult {
  total: number;
  success: number;
  updated: number;
  failed: number;
  errors: string[];
  details: ImportDetail[];
}

export function emptyImportResult(): ImportResult {
  return { total: 0, success: 0, updated: 0, failed: 0, errors: [], details: [] };
}

// ============================================
// CSV 模板產生
// ============================================

/** 產生學生 CSV 模板內容 */
export function generateStudentTemplate(): string {
  const headers = [
    'studentId',
    'email',
    'nameZh',
    'nameEn',
    'level',
    'className',
    'classNumber',
    'gender',
    'joinedAt',
  ];
  const examples = [
    [
      's10001',
      'student1@school.edu.hk',
      '陳大文',
      'Chan Tai Man',
      'S4',
      '4A',
      '1',
      'M',
      '2025-09-01',
    ],
    [
      's10002',
      'student2@school.edu.hk',
      '李小美',
      'Lee Siu Mei',
      'S4',
      '4A',
      '2',
      'F',
      '2025-09-01',
    ],
  ];

  return [headers.join(','), ...examples.map(r => r.join(','))].join('\n');
}

/** 產生教師 CSV 模板內容 */
export function generateTeacherTemplate(): string {
  const headers = [
    'teacherId',
    'email',
    'nameZh',
    'nameEn',
    'subjects',
    'department',
    'gender',
  ];
  const examples = [
    [
      'cheungtm',
      'teacher1@school.edu.hk',
      '張大文',
      'Cheung Tai Man',
      '"[""English Language"",""English Literature""]"',
      'English',
      'M',
    ],
    [
      'wongsm',
      'teacher2@school.edu.hk',
      '黃小美',
      'Wong Siu Mei',
      'English Language|History',
      'English',
      'F',
    ],
  ];

  return [headers.join(','), ...examples.map(r => r.join(','))].join('\n');
}

// ============================================
// 輔助函數
// ============================================

/** 根據班級名稱推斷年級 */
export function inferGradeLevel(className: string): string {
  const match = className.match(/^(\d)/);
  if (match) return `S${match[1]}`;
  return 'S4';
}
