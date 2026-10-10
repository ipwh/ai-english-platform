// ============================================
// 契約測試：練習 runner 必須顯示**每一道已交付的篇章**（2026-10-10 生產回報）
// ============================================
// 學生回報：題目問 "According to the passage, what does the word 'infrasound'
// mean?"，但畫面上**沒有任何篇章**可讀 —— 一道無法作答的題目。
//
// 病根（runner）：篇章區塊只在 `languageSkill === 'reading'` 時渲染。只要篇章
// 隨其他技能交付（詞彙／文法，或模型自發附帶篇章），題目就會被單獨顯示。
// 診斷頁早已用「有內容就顯示」的條件（`languageSkill === 'reading' ||
// readingContent`），本測試把同一不變式釘在練習 runner 上（原始碼掃描 —
// 本 repo 對頁面行為的既有慣例，見 help-practice-generation-contract.test.ts）。
// ============================================

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const runnerSource = () =>
  readFileSync(new URL('../../../app/student/practice/[id]/page.tsx', import.meta.url), 'utf8');

describe('practice runner — delivered-passage contract', () => {
  it('renders the passage for every question that carries one, regardless of skill', () => {
    const source = runnerSource();

    // 有 readingContent 就顯示（改錯題另有專屬區塊，避免重複）。
    expect(source).toContain("question.type !== 'error-correction' && question.readingContent");
    // 舊缺陷：篇章被 `isReading &&` 擋住 —— 不得復辟。
    expect(source).not.toContain("isReading && question.type !== 'error-correction'");
  });

  it('labels a non-reading passage as question text instead of hiding it', () => {
    const source = runnerSource();
    expect(source).toContain("isReading ? t('practice.question.readingPassage') : t('practice.question.contextText')");
  });

  it('still forwards the passage into the AI explanation request', () => {
    // 解說必須看到學生看過的同一段篇章（否則 AI 只能憑題目猜）。
    expect(runnerSource()).toContain('readingContent: question.readingContent || undefined');
  });

  it('keeps the passage visible after answering (submitted state)', () => {
    const conditionLine = runnerSource()
      .split('\n')
      .find(line => line.includes("question.type !== 'error-correction' && question.readingContent")) ?? '';

    expect(conditionLine.length).toBeGreaterThan(0);
    // 不得被 submitted 條件包住：作答後仍要能對照篇章與解說。
    expect(conditionLine).not.toContain('submitted');
  });
});
