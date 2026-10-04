import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 2026-10-04 生產事故：`useT()` 每次 render 都回傳全新的 `t` 函式。呼叫端普遍把 `t`
 * 放進 `useCallback`／`useEffect` 的依賴陣列（例如 IELTS 練習卷
 * `useCallback(load, [testId, t])` → `useEffect(load, [load])`），於是每次 render 都
 * 產生新的 `load`、effect 再跑一次、setState 又觸發 render —— 無限迴圈狂發
 * `POST /api/ielts/attempts`，觸發限流（20 次／分鐘／學生）並回 429。
 *
 * 不變條件：`t` 的識別必須在語言未變時保持穩定（以 `language` 為 memo 依賴），
 * 否則任何把它列入依賴陣列的 effect 都會失控。此檔以來源掃描強制此契約
 * （本專案無 jsdom／react-test-renderer，無法以渲染方式驗證）。
 */
describe('useT() — t 的識別必須穩定（不得每次 render 重建）', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../use-i18n.ts'), 'utf-8');

  it('t 由 useCallback 建立（React 會依依賴陣列保持識別穩定）', () => {
    expect(source).toMatch(/import\s*\{[^}]*\buseCallback\b[^}]*\}\s*from\s*'react'/);
    expect(source).toMatch(/const\s+t\s*=\s*useCallback\(/);
  });

  it('memo 依賴為 language（切換語言時仍會更新翻譯）', () => {
    expect(source).toMatch(/\}\s*,\s*\[language\]\s*,?\s*\)\s*;/);
  });

  it('回傳物件不得內嵌箭頭函式（否則每次 render 都是新識別）', () => {
    expect(source).not.toMatch(/t:\s*\(key: string/);
    expect(source).toMatch(/return\s*\{\s*t\s*,\s*language\s*\}/);
  });
});
