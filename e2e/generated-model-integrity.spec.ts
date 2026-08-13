// ============================================
// R3.10-K Phase 5 — Generated Model Integrity (UI regression)
// Dual-track semantics: pedagogical target ≠ assessment result.
// ============================================

import { test, expect } from '@playwright/test';
import { login, selectRole } from './helpers';

test.describe('Generated model integrity', () => {
  test('medium model keeps its Level 3 target; independent analysis shows both tracks', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    // 1. Open the writing page and generate a prompt + mid-level model.
    await page.goto('/student/writing');
    await page.getByRole('button', { name: /生成題目|Generate Prompt/i }).click();

    const generateModel = page.getByRole('button', { name: /生成中等範文|Generate Mid-Level Model/i });
    await generateModel.waitFor({ state: 'visible', timeout: 15000 });
    await generateModel.click();

    // 2. The model card must show the PEDAGOGICAL TARGET label.
    const modelCard = page.getByText(/範文目標：Level 3|Pedagogical Target: Level 3/i);
    await modelCard.waitFor({ state: 'visible', timeout: 30000 });
    expect(await modelCard.isVisible()).toBe(true);

    // 3. The model card must state it is NOT the student's essay.
    await expect(page.getByText(/並非你的作文|NOT your own essay/i)).toBeVisible();

    // 4. Analyze the model independently.
    await page.getByRole('button', { name: /獨立分析範文|Analyze this model independently/i }).click();

    // 5. Dual-track block: target line + independent analysis line + explanation.
    await page.getByText(/獨立 AI 分析|Independent platform analysis/i).waitFor({ state: 'visible', timeout: 60000 });
    await expect(page.getByText(/範文目標：Level 3|Pedagogical Target: Level 3/i).first()).toBeVisible();
    await expect(page.getByText(/用途不同|different purposes/i)).toBeVisible();
  });
});
