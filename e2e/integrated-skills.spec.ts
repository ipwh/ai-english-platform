// ============================================
// E2E: Integrated Skills v4 — 步驟鎖定 · 自動儲存 · 雙維度批改
// ============================================
import { test, expect } from '@playwright/test';
import { login, selectRole, waitForLoadingDone, expectButtonDisabled } from './helpers';

test.describe('Integrated Skills v4', () => {

  test('TC-IS01: 步驟鎖定 — Step 2/3 初始為 disabled', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    await page.goto('/student/integrated-skills');

    // Config: generate task
    await page.click('button:has-text("S4")');
    await page.click('button:has-text("Core")');
    await page.click('button:has-text("Summary")');
    const genBtn = page.getByRole('button', { name: /AI 生成/ });
    await genBtn.click();
    await waitForLoadingDone(page);

    // Step indicator should show Step 1 active
    await expect(page.locator('text=Listening').first()).toBeVisible({ timeout: 10_000 });

    // Step 2 should be disabled (locked until listening completed)
    const step2Btn = page.getByRole('button', { name: /Note-taking/ });
    if (await step2Btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(step2Btn).toBeDisabled();
    }

    // Step 3 should be disabled
    const step3Btn = page.getByRole('button', { name: /Writing/ });
    if (await step3Btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(step3Btn).toBeDisabled();
    }
  });

  test('TC-IS02: 聆聽完成 → Step 2 解鎖 → 筆記完成 → Step 3 解鎖', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    await page.goto('/student/integrated-skills');
    await page.click('button:has-text("S4")');
    await page.click('button:has-text("Core")');
    await page.click('button:has-text("Summary")');
    await page.getByRole('button', { name: /AI 生成/ }).click();
    await waitForLoadingDone(page);

    // Toggle transcript → marks listening as completed
    const transcriptBtn = page.getByText(/顯示聆聽文字|隱藏聆聽文字/).first();
    if (await transcriptBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await transcriptBtn.click();
    }

    // Now Step 2 should be unlocked
    const step2Btn = page.getByRole('button', { name: /Note-taking/ });
    await expect(step2Btn).not.toBeDisabled({ timeout: 5000 });

    // Click Step 2
    await step2Btn.click();
    await page.waitForTimeout(500);

    // Fill notes
    const notesArea = page.locator('textarea').first();
    await notesArea.fill('Test notes: Meeting at 3pm Friday. Room 302. John and Mary attending. Key decision: budget increase by 15%.');

    // "開始寫作" button should appear
    const startWritingBtn = page.getByRole('button', { name: /開始寫作/ });
    await expect(startWritingBtn).toBeVisible({ timeout: 5000 });
    await startWritingBtn.click();

    // Fill writing
    const writingArea = page.locator('textarea').last();
    await writingArea.fill('The meeting is scheduled for 3pm on Friday in Room 302. John and Mary will be attending. The key decision was to increase the budget by 15 percent.');

    // Submit
    const submitBtn = page.getByRole('button', { name: /提交 AI 批改/ });
    await expect(submitBtn).not.toBeDisabled();
    await submitBtn.click();
    await waitForLoadingDone(page);

    // Result view should show scores
    await expect(page.getByText(/Overall Score/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test('TC-IS03: 雙維度批改結果 — Listening + Writing 分數', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    await page.goto('/student/integrated-skills');
    await page.click('button:has-text("S4")');
    await page.click('button:has-text("Core")');
    await page.click('button:has-text("Summary")');
    await page.getByRole('button', { name: /AI 生成/ }).click();
    await waitForLoadingDone(page);

    // Quick-complete all steps
    const transcriptBtn = page.getByText(/顯示聆聽文字|隱藏聆聽文字/).first();
    if (await transcriptBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await transcriptBtn.click();
    }

    const step2Btn = page.getByRole('button', { name: /Note-taking/ });
    await expect(step2Btn).not.toBeDisabled({ timeout: 5000 });
    await step2Btn.click();

    const notesArea = page.locator('textarea').first();
    await notesArea.fill('Budget meeting notes: 15% increase approved, starts Q3. John and Mary attended.');
    await page.waitForTimeout(500);

    const startWritingBtn = page.getByRole('button', { name: /開始寫作/ });
    if (await startWritingBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await startWritingBtn.click();
    }

    const writingArea = page.locator('textarea').last();
    await writingArea.fill('The budget meeting was held to discuss the proposed increase. It was decided that the budget would be increased by 15% starting Q3.');
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /提交 AI 批改/ }).click();
    await waitForLoadingDone(page);

    // Verify result cards (labels renamed in v6: Listening / Language / Organization)
    await expect(page.getByText('Listening (40%)')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Language (35%)')).toBeVisible({ timeout: 5000 });
  });

  test('TC-IS04: 返回修改 → 重新提交', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    await page.goto('/student/integrated-skills');
    await page.click('button:has-text("S4")');
    await page.click('button:has-text("Core")');
    await page.click('button:has-text("Summary")');
    await page.getByRole('button', { name: /AI 生成/ }).click();
    await waitForLoadingDone(page);

    // Complete flow quickly
    const transcriptBtn = page.getByText(/顯示聆聽文字|隱藏聆聽文字/).first();
    if (await transcriptBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await transcriptBtn.click();
    }

    const step2Btn = page.getByRole('button', { name: /Note-taking/ });
    await expect(step2Btn).not.toBeDisabled({ timeout: 5000 });
    await step2Btn.click();

    const notesArea = page.locator('textarea').first();
    await notesArea.fill('Test notes for back navigation.');
    await page.waitForTimeout(300);

    const startWritingBtn = page.getByRole('button', { name: /開始寫作/ });
    if (await startWritingBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await startWritingBtn.click();
    }

    const writingArea = page.locator('textarea').last();
    await writingArea.fill('This is a test submission for the back navigation feature.');
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: /提交 AI 批改/ }).click();
    await waitForLoadingDone(page);

    // Click "返回修改"
    const backBtn = page.getByRole('button', { name: /返回修改/ });
    if (await backBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await backBtn.click();
      // Should return to writing stage
      await expect(page.getByText(/寫作任務/i).first()).toBeVisible({ timeout: 5000 });
    }
  });
});
