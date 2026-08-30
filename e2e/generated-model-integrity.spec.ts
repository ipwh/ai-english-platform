// ============================================
// R3.10-K Phase 5 — Generated Model Integrity (UI regression)
// The model card shows the pedagogical target label (範文目標 Level N,
// restored 2026-08-29 VIII per ADR-038) + a "NOT your own essay" note;
// independent analysis remains available.
// ============================================

import { test, expect } from '@playwright/test';
import { login, selectRole } from './helpers';

test.describe('Generated model integrity', () => {
  test('model card shows pedagogical target label + not-your-essay disclaimer', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    // 1. Open the writing page and generate a prompt + model essay.
    await page.goto('/student/writing');
    await page.getByRole('button', { name: /生成題目|Generate Prompt/i }).click();

    const generateModel = page.getByRole('button', { name: /生成範文|Generate Model Essay/i });
    await generateModel.waitFor({ state: 'visible', timeout: 15000 });
    await generateModel.click();

    // 2. The model card must show the pedagogical target label.
    const modelCard = page.getByText(/📝 範文|📝 Model Essay/i).first();
    await modelCard.waitFor({ state: 'visible', timeout: 30000 });
    expect(await modelCard.isVisible()).toBe(true);
    await expect(page.getByText(/範文目標|Pedagogical Target/i).first()).toBeVisible();

    // 3. The model card must state it is NOT the student's essay.
    await expect(page.getByText(/並非你的作文|NOT your own essay/i)).toBeVisible();

    // 4. Analyze the model independently.
    await page.getByRole('button', { name: /獨立分析範文|Analyze this model independently/i }).click();

    // 5. Independent analysis line appears; target label remains only on the card.
    await page.getByText(/獨立 AI 分析|Independent platform analysis/i).waitFor({ state: 'visible', timeout: 60000 });
    await expect(page.getByText(/範文目標|Pedagogical Target/i).first()).toBeVisible();
  });
});
