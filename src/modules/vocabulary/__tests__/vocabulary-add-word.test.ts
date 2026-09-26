// ============================================
// Tests: Vocabulary add-word / batch import / PDF export guards
// 2026-09-26 生產事故：批量匯入顯示成功但未新增；PDF 匯出回傳 HTML（存成 .pdf 判為損壞）
// ============================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({
  findVocabByWord: vi.fn(),
  createVocab: vi.fn(),
}));

vi.mock('@/modules/vocabulary/repositories/vocabulary-repo', () => ({
  listVocab: vi.fn(),
  findVocabById: vi.fn(),
  findVocabByWord: mocks.findVocabByWord,
  createVocab: mocks.createVocab,
  updateVocab: vi.fn(),
  deleteVocab: vi.fn(),
  listVocabFiltered: vi.fn(),
  countVocabFiltered: vi.fn(),
  createMasteryLog: vi.fn(),
}));

import { addWord } from '@/modules/vocabulary/services/vocabulary-service';
// 直接由 schema 檔匯入（barrel 會拉進 api-auth → next-auth，在 vitest 下解析失敗）
import { vocabularyCreateSchema } from '@/shared/validation/schemas/crud.schema';

const root = resolve(import.meta.dirname, '../../../..');

describe('vocabularyCreateSchema — batch import payload contract', () => {
  it('accepts the canonical payload sent by batch import / quick add (translation + rich fields)', () => {
    const parsed = vocabularyCreateSchema.safeParse({
      studentId: 's1',
      word: 'ubiquitous',
      translation: '無所不在的',
      partOfSpeech: 'adjective',
      allPartOfSpeech: ['adjective'],
      secondaryMeaningZh: '普遍存在的',
      example: 'Smartphones are ubiquitous.',
      exampleZh: '智能手機無所不在。',
      synonyms: ['omnipresent', 'pervasive'],
      antonyms: ['rare'],
      collocations: ['ubiquitous presence'],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.translation).toBe('無所不在的');
      expect(parsed.data.synonyms).toEqual(['omnipresent', 'pervasive']);
      expect(parsed.data.allPartOfSpeech).toEqual(['adjective']);
    }
  });

  it('rejects the legacy batch payload without `translation` (root cause of the silent no-op)', () => {
    // 舊 BatchImportVocab 送 meaningZh/exampleSentence → 缺 translation → 400 → 生字沒有加入
    const legacy = {
      studentId: 's1',
      word: 'ubiquitous',
      meaningZh: '無所不在的',
      exampleSentence: 'Smartphones are ubiquitous.',
    };
    expect(vocabularyCreateSchema.safeParse(legacy).success).toBe(false);
  });
});

describe('addWord — persistence of AI analysis fields', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists rich fields (arrays as JSON) and reports created=true', async () => {
    mocks.findVocabByWord.mockResolvedValue(null);
    mocks.createVocab.mockImplementation(async (data: Record<string, unknown>) => ({ id: 'v1', ...data }));

    const result = await addWord({
      studentId: 's1',
      word: 'ubiquitous',
      translation: '無所不在的',
      partOfSpeech: 'adjective',
      example: 'Smartphones are ubiquitous.',
      allPartOfSpeech: ['adjective'],
      secondaryMeaningZh: '普遍存在的',
      exampleZh: '智能手機無所不在。',
      synonyms: ['omnipresent'],
      antonyms: [],
      collocations: ['ubiquitous presence'],
    });

    expect(result.created).toBe(true);
    const data = mocks.createVocab.mock.calls[0][0] as Record<string, unknown>;
    expect(data.meaningZh).toBe('無所不在的');
    expect(data.exampleSentence).toBe('Smartphones are ubiquitous.');
    expect(data.synonyms).toBe(JSON.stringify(['omnipresent']));
    expect(data.collocations).toBe(JSON.stringify(['ubiquitous presence']));
    expect(data.allPartOfSpeech).toBe(JSON.stringify(['adjective']));
    // 空陣列不得寫入 '[]'（避免未來擴充分析時蓋掉既有資料）
    expect(data.antonyms).toBeUndefined();
  });

  it('reports created=false for an already-existing word (client must show 已存在, not success)', async () => {
    mocks.findVocabByWord.mockResolvedValue({ id: 'v0', word: 'ubiquitous' });

    const result = await addWord({ studentId: 's1', word: 'ubiquitous', translation: '無所不在的' });

    expect(result.created).toBe(false);
    expect(result.item).toEqual({ id: 'v0', word: 'ubiquitous' });
    expect(mocks.createVocab).not.toHaveBeenCalled();
  });
});

describe('batch import client — honest success reporting', () => {
  const src = readFileSync(resolve(import.meta.dirname, '../components/BatchImportVocab.tsx'), 'utf-8');

  it('posts canonical API field names', () => {
    expect(src).toContain('translation: item.analysis.meaningZh');
    expect(src).toContain('example: item.analysis.exampleSentence');
    expect(src).not.toContain('meaningZh: item.analysis.meaningZh');
    expect(src).not.toContain('exampleSentence: item.analysis.exampleSentence,');
  });

  it('marks failures as errors (no branch-less success) and only counts server-confirmed additions', () => {
    // 舊碼：非 ok / 非 409 的回應沒有任何分支 → 分析成功即被當成加入成功
    expect(src).toContain("status: 'error' as const");
    expect(src).toContain('imported: true');
    expect(src).toContain('addedCount');
    // 「重試失敗」必須以 () => handleAddAll(true) 呼叫（onClick 直接傳 event 會變 truthy）
    expect(src).toContain('onClick={() => handleAddAll(true)}');
    expect(src).toContain('onClick={() => handleAddAll()}');
  });
});

describe('PDF export route — bundled-runtime guards (2026-09-26 production incident)', () => {
  const route = readFileSync(resolve(root, 'src/app/api/vocabulary/export-pdf/route.ts'), 'utf-8');

  it('skips PDFKit built-in standard fonts (AFM data unreadable in bundled runtime: /ROOT placeholder)', () => {
    // Turbopack 打包 pdfkit 後 `__dirname` 變成 /ROOT → readFileSync('/ROOT/.../Helvetica.afm') ENOENT。
    // 必須以 font: '' 跳過標準字型，並全部使用內嵌 CJK 字型。
    expect(route).toContain("font: ''");
    expect(route).not.toMatch(/\.font\('Helvetica/);
    expect(route).toContain("doc.registerFont('CJK', cjkFont)");
  });

  it('never falls back to an HTML 200 when format=pdf (HTML saved as .pdf = "corrupted" file)', () => {
    expect(route).toContain("format === 'pdf'");
    expect(route).toContain('PDF_GENERATION_FAILED');
    // 失敗必須以非 2xx 回傳
    expect(route).toMatch(/status:\s*500/);
  });
});
