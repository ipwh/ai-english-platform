import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 2026-09-23 稽核：瀏覽器自動翻譯（Chrome／Edge／Google 翻譯）會把文字節點包進 <font>
 * 並改寫父子關係，令 React 之後的 removeChild 拋出
 * "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of
 * this node."（實測：錯誤頁的繁中字串被翻成簡體後整個 App 被錯誤邊界接住）。
 *
 * 平台不依賴瀏覽器翻譯：介面語言由 lang cookie + i18n 決定，題目翻譯走自家
 * /api/ai/translate；機器翻譯亦會破壞 DSE 篇章的行號排版與答案比對。
 * 因此 app shell 必須明確封鎖翻譯，且區段錯誤邊界不得再輸出巢狀 html/body
 * （那是無效 DOM，只有 global-error.tsx 可以定義）。
 */
describe('app shell — 瀏覽器自動翻譯必須被封鎖', () => {
  const layoutSource = readFileSync(resolve(import.meta.dirname, '../layout.tsx'), 'utf-8');
  const errorSource = readFileSync(resolve(import.meta.dirname, '../error.tsx'), 'utf-8');

  it('root layout 同時宣告 Google 官方 notranslate meta 與 HTML 標準 translate="no"', () => {
    expect(layoutSource).toContain("other: { google: 'notranslate' }");
    expect(layoutSource).toContain('translate="no"');
  });

  it('root layout 的 <html> 帶有正確的 lang（翻譯誤判的前置條件）', () => {
    expect(layoutSource).toContain('lang={htmlLang}');
    expect(layoutSource).toContain("langCookie === 'en' ? 'en' : 'zh-HK'");
  });

  it('區段錯誤邊界不輸出 html/body 標籤（只有 global-error.tsx 可以）', () => {
    expect(errorSource).not.toMatch(/<html[\s>]/);
    expect(errorSource).not.toMatch(/<body[\s>]/);
  });

  it('錯誤邊界的重試走 Next 16 的 unstable_retry，並以 reset 為後備', () => {
    expect(errorSource).toContain('unstable_retry ?? reset');
    expect(errorSource).toContain('onClick={() => retry?.()}');
  });
});
