// ============================================
// 教師「學生名單」— 返回詳情頁時保留所在班別（source scan 契約）
// ============================================
// 2026-10-07（使用者回報）：在學生名單選好班別 → 點入學生詳情 → 按返回，
// 列表原本會重設成「全部班別」（篩選只存在 React state，重新掛載即遺失）。
// 修法：班別篩選寫回 URL（`?class=`），詳情頁的 `router.back()` 便回到同一網址。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const listPage = readFileSync(resolve(import.meta.dirname, '../teacher/students/page.tsx'), 'utf-8');
const detailPage = readFileSync(
  resolve(import.meta.dirname, '../teacher/students/[studentId]/page.tsx'),
  'utf-8',
);

describe('教師學生名單 — 班別篩選可跨「詳情 → 返回」保留', () => {
  it('班別篩選初值由 ?class= 帶入', () => {
    expect(listPage).toContain('function readClassParam(): string {');
    expect(listPage).toContain("new URLSearchParams(window.location.search).get('class')");
    expect(listPage).toContain('useState<string>(readClassParam)');
  });

  it('變更篩選時以 replaceState 同步 URL（不觸發導航、不重新抓資料）', () => {
    expect(listPage).toContain('function syncClassParamToUrl(value: string): void {');
    expect(listPage).toContain('window.history.replaceState(');
    expect(listPage).toContain('applyClassFilter(e.target.value)');
    // 選「全部班別」⇒ 清掉參數（不得留下 ?class=all）
    expect(listPage).toContain("params.delete('class')");
  });

  it('URL 帶入的班別已不存在時回退「全部班別」（不得留下永遠空白的列表）', () => {
    expect(listPage).toContain("if (requested !== 'all' && !classNames.includes(requested)) {");
  });

  it('詳情頁返回使用 router.back()（回到帶 ?class= 的上一頁）', () => {
    expect(detailPage).toContain('router.back()');
  });
});
