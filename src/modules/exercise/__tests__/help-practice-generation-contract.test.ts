// ============================================
// 求助頁 AI 練習生成 — 交付契約（source scan）
// ============================================
// 2026-10-07 用戶回報：在求助頁問「what is zero conditional」，生成的練習第 1 題是
// 「According to the passage, what happens if you heat ice above zero degrees
// Celsius?」，但畫面上沒有篇章 → 題目無法作答。
//
// 兩個成因都必須被鎖住，缺一不可：
//   1. 求助頁把「文法／無法判斷」的問題當成 `reading`（舊碼 `: 'reading'` 預設）
//      → 生成需要篇章的閱讀題；
//   2. 求助頁丟棄 API 回傳的 `readingContent`／`listeningContent`，只渲染 `prompt`
//      → 即使模型正確附上篇章，學生仍然看不到。
//
// 契約：交付的題目若引用篇章／對話，該篇章／對話必須一併顯示；文法問題走文法出題。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../../..');

describe('student help page — AI practice generation contract', () => {
  const helpPage = readFileSync(resolve(root, 'src/app/student/help/page.tsx'), 'utf-8');

  it('defaults grammar / unrecognised questions to the grammar path (never forces reading)', () => {
    // 無法判斷 ⇒ 空字串；文法關鍵字不再導向寫作
    expect(helpPage).toContain(": '';  // 省略 languageSkill ⇒ 文法路徑");
    expect(helpPage).not.toContain(": 'reading';  // safe default");
    expect(helpPage).not.toContain("q.includes('grammar') ? 'writing'");
    // 空字串必須轉為 undefined：`languageSkill: ''` 會被 Zod enum 判為 400
    expect(helpPage).toContain('languageSkill: skill || undefined');
  });

  it('keeps and renders the passage / dialogue returned with each delivered question', () => {
    // 保留 API 回傳的篇章與對話
    expect(helpPage).toContain('readingContent: (q.readingContent as string) || undefined');
    expect(helpPage).toContain('listeningContent: (q.listeningContent as string) || undefined');
    // 逐題渲染（與 /student/practice/[id] 相同語意）
    expect(helpPage).toContain('{q.readingContent && (');
    expect(helpPage).toContain('{q.listeningContent && (');
    expect(helpPage).toContain("t('practice.question.readingPassage')");
    expect(helpPage).toContain("t('practice.question.listeningContent')");
  });

  it('「前往完整練習」deep link（mode=help）帶上 topic，文法問題一樣能出題', () => {
    const practicePage = readFileSync(resolve(root, 'src/app/student/practice/page.tsx'), 'utf-8');
    // 文法問題沒有 grammarItem／languageSkill，只有 topic hint → 交付守衛必須接受
    expect(practicePage).toContain('!activeForm.grammarItem && !activeForm.languageSkill && !activeForm.topic');
    // topic 必須送進生成 API（否則補題／文法出題會失去情境）
    expect(practicePage).toContain('topic: activeForm.topic || undefined');
    // 求助頁的 deep link 必須把 topic 帶進表單（只有求助頁的路徑會有此形狀）
    expect(practicePage).toMatch(/gradeLevel,\s*\n\s*topic,/);
  });
});
