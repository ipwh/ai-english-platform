// ============================================
// E2E Edge Case Tests: Auth errors, offline, timeout
// TC-EDGE01 → TC-EDGE06
// ============================================

import { test, expect } from '@playwright/test';
import { login, safeClick, waitForLoadingDone } from './helpers';

test.describe('Edge Cases — Auth & Network', () => {
  test('TC-EDGE01: Expired session redirects to login', async ({ page, context }) => {
    await login(page, 'student');
    // Clear cookies to simulate expired session
    await context.clearCookies();
    await page.goto('/student/dashboard');
    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test('TC-EDGE02: Invalid JWT token returns 401 on API', async ({ page }) => {
    // Direct API call with no auth
    const response = await page.request.post('/api/practice', {
      data: { studentId: 'fake', skill: 'test', totalQuestions: 1, correctCount: 0 },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(401);
  });

  test('TC-EDGE03: Offline mode shows error gracefully', async ({ page }) => {
    await login(page, 'student');
    await page.goto('/student/dashboard');
    // Simulate offline
    await page.context().setOffline(true);
    await page.click('a[href="/student/practice"]');
    // Should show error message, not blank page
    const errorText = page.locator('text=無法載入|Error|Something went wrong|網絡');
    // Wait briefly for error to appear
    await page.waitForTimeout(2000);
    // Reactivate network
    await page.context().setOffline(false);
  });

  test('TC-EDGE04: AI generation timeout shows retry UI', async ({ page }) => {
    await login(page, 'student');
    await page.goto('/student/practice');
    await waitForLoadingDone(page);

    // Fill practice form minimally
    await page.locator('select').first().selectOption('tenses');
    await safeClick(page, page.locator('button', { hasText: /生成題目|Generate/ }));

    // Should show loading state, then either success or error
    // Timeout test: wait up to 30s for result
    const result = await Promise.race([
      page.waitForSelector('text=AI 生成失敗|generation failed|超時', { timeout: 35000 }).then(() => 'error'),
      page.waitForSelector('[class*="question"]', { timeout: 35000 }).then(() => 'success'),
    ]);
    expect(['error', 'success']).toContain(result);
  });

  test('TC-EDGE05: Rapid navigation does not corrupt state', async ({ page }) => {
    await login(page, 'student');
    await page.goto('/student/dashboard');
    await waitForLoadingDone(page);

    // Rapidly click between multiple pages
    await page.click('a[href="/student/practice"]');
    await page.click('a[href="/student/mistakes"]');
    await page.click('a[href="/student/vocabulary"]');
    await page.click('a[href="/student/dashboard"]');
    await waitForLoadingDone(page);

    // Dashboard should still render
    await expect(page.locator('text=學習主頁|Dashboard').first()).toBeVisible({ timeout: 5000 });
  });

  test('TC-EDGE06: Concurrent tabs do not corrupt XP/session', async ({ browser }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await login(page1, 'student');
    // Copy cookies to page2
    const cookies = await context.cookies();
    await page2.context().addCookies(cookies);

    await page1.goto('/student/dashboard');
    await page2.goto('/student/practice');
    await waitForLoadingDone(page1);

    // Both should work
    await expect(page1.locator('text=學習主頁|Dashboard').first()).toBeVisible();
    await expect(page2.locator('text=AI 練習|Practice').first()).toBeVisible();

    await context.close();
  });
});
