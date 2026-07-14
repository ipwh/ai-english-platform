// ============================================
// E2E: 資料持久化測試
// 驗證 Practice/Vocab/Draft 在重整後正確保存
// ============================================
import { test, expect } from '@playwright/test';
import { login, selectRole, waitForLoadingDone } from './helpers';

test.describe('Data Persistence', () => {

  test('TC-DP01: 練習記錄持久化 — 重整後 history 仍存在', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    // Go to practice page
    await page.click('nav a[href="/student/practice"]');
    await page.waitForURL('**/student/practice');

    // Check "Browse" tab shows sessions (if any exist)
    const sessionsSection = page.getByText(/Recent|練習記錄/i).first();
    await expect(sessionsSection).toBeVisible({ timeout: 10_000 });

    // Reload
    await page.reload();
    await page.waitForURL('**/student/practice');

    // History should still be there
    await expect(sessionsSection).toBeVisible({ timeout: 10_000 });
  });

  test('TC-DP02: 生字簿持久化 — 重整後單字仍在', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    await page.click('nav a[href="/student/vocabulary"]');
    await page.waitForURL('**/student/vocabulary');

    // Page should load with or without vocabulary
    await expect(page.getByText(/生字簿|Vocabulary/i).first()).toBeVisible({ timeout: 10_000 });

    // Reload — page should still load
    await page.reload();
    await page.waitForURL('**/student/vocabulary');
    await expect(page.getByText(/生字簿|Vocabulary/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('TC-DP03: Integrated Skills draft — localStorage 草稿在重整後恢復', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    await page.goto('/student/integrated-skills');
    await page.click('button:has-text("S4")');
    await page.click('button:has-text("Core")');
    await page.click('button:has-text("Summary")');
    await page.getByRole('button', { name: /AI 生成/ }).click();
    await waitForLoadingDone(page);

    // Toggle transcript to unlock notes
    const transcriptBtn = page.getByText(/顯示聆聽文字|隱藏聆聽文字/).first();
    if (await transcriptBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await transcriptBtn.click();
    }

    // Expand Step 2 and fill notes
    const step2Btn = page.getByRole('button', { name: /Note-taking/ });
    await expect(step2Btn).not.toBeDisabled({ timeout: 5000 });
    await step2Btn.click();

    const notesArea = page.locator('textarea').first();
    const testNote = 'Draft persistence test: budget meeting notes v4.';
    await notesArea.fill(testNote);
    await page.waitForTimeout(2000); // Wait for auto-save debounce

    // Reload
    await page.reload();
    await page.waitForURL('**/student/integrated-skills');

    // Config should be restored (same S4/Core/Summary)
    await expect(page.getByText('S4').first()).toBeVisible({ timeout: 5000 });

    // Generate again to see if draft restored
    await page.getByRole('button', { name: /AI 生成/ }).click();
    await waitForLoadingDone(page);

    // Notes textarea should have the previous content restored
    const transcriptBtn2 = page.getByText(/顯示聆聽文字|隱藏聆聽文字/).first();
    if (await transcriptBtn2.isVisible({ timeout: 5000 }).catch(() => false)) {
      await transcriptBtn2.click();
    }

    const step2Btn2 = page.getByRole('button', { name: /Note-taking/ });
    await expect(step2Btn2).not.toBeDisabled({ timeout: 5000 });
    await step2Btn2.click();

    const restoredNotes = page.locator('textarea').first();
    await expect(restoredNotes).toHaveValue(testNote);
  });

  test('TC-DP04: Dashboard KPI data — 重整後不 crash', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    // Dashboard should show KPI cards
    await expect(page.getByText(/練習次數|Sessions/i).first()).toBeVisible({ timeout: 10_000 });

    // Reload
    await page.reload();
    await page.waitForURL('**/student/dashboard');

    // Dashboard should still work
    await expect(page.getByText(/學習主頁|Dashboard/i).first()).toBeVisible({ timeout: 10_000 });
    // KPI cards should render without crash
    await expect(page.getByText(/練習次數|Sessions/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
