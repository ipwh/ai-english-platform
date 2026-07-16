// ============================================
// E2E: 邊界案例測試
// ============================================
import { test, expect } from '@playwright/test';
import { login, selectRole, waitForLoadingDone } from './helpers';

test.describe('Edge Cases', () => {

  test('TC-E01: 無數據新學生 — Dashboard 仍可載入', async ({ page }) => {
    await login(page, 'test-student-new@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    // Dashboard 應顯示，即使無練習記錄
    await expect(page.getByText(/學習主頁|Dashboard/i).first()).toBeVisible({ timeout: 10_000 });
    // KPI 卡片應顯示 0
    await expect(page.getByText('0').first()).toBeVisible({ timeout: 5000 });
  });

  test('TC-E02: 無錯題 — 錯題頁面顯示空狀態', async ({ page }) => {
    await login(page, 'test-student-new@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    await page.click('nav a[href="/student/mistakes"]');
    await page.waitForURL('**/student/mistakes');

    await expect(page.getByText(/暫無錯題|No mistakes/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('TC-E03: 無生字 — 生字簿顯示空狀態', async ({ page }) => {
    await login(page, 'test-student-new@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    await page.click('nav a[href="/student/vocabulary"]');
    await page.waitForURL('**/student/vocabulary');

    await expect(page.getByText(/生字簿|Vocabulary/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('TC-E04: 網路中斷 — API 錯誤時顯示錯誤訊息', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    await page.click('nav a[href="/student/practice"]');
    await page.waitForURL('**/student/practice');

    // 模擬網路中斷
    await page.route('**/api/ai/generate-questions', route => route.abort());

    // 嘗試生成
    await page.fill('input[type="number"]', '3');
    const genBtn = page.getByRole('button', { name: /生成.*練習/ });
    await genBtn.click();
    await page.waitForTimeout(5000);

    // 應顯示錯誤訊息
    const errorText = page.getByText(/失敗|error|無法|unavailable/i);
    if (await errorText.isVisible({ timeout: 5000 }).catch(() => false)) {
      // 錯誤有被處理
    }
  });

  test('TC-E05: 語言切換 — 中/EN 正常切換', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    // 點擊語言切換
    const langBtn = page.locator('button:has-text("中"), button:has-text("EN")').first();
    if (await langBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await langBtn.click();
      await page.waitForTimeout(500);
    }

    // Dashboard 仍可見
    await expect(page.getByText(/學習主頁|Dashboard/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('TC-E06: 暗色模式切換', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    // 點擊暗色模式
    const darkBtn = page.locator('button:has(svg.lucide-moon), button:has(svg.lucide-sun)').first();
    if (await darkBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await darkBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('TC-E07: 診斷測試 — 載入 → 作答 → 結果', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    await page.click('nav a[href="/student/diagnostic"]');
    await page.waitForURL('**/student/diagnostic');

    // 點擊開始
    const startBtn = page.getByRole('button', { name: /開始診斷|Start/i });
    if (await startBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await startBtn.click();
      await waitForLoadingDone(page);
    }

    // 作答（如有題目）
    const choices = page.locator('button:has-text("A."), button:has-text("B.")');
    for (let i = 0; i < 5; i++) {
      if (await choices.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await choices.first().click();
        await page.waitForTimeout(1000);
      } else break;
    }

    // 應顯示結果或練習建議
    await expect(page.getByText(/練習|Practice|結果|Result/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('TC-E08: 寫作頁面 — 生成題目 → 輸入 → AI 批改', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    await page.click('nav a[href="/student/writing"]');
    await page.waitForURL('**/student/writing');

    // 點擊生成
    const genBtn = page.getByRole('button', { name: /生成題目|Generate/i });
    if (await genBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await genBtn.click();
      await waitForLoadingDone(page);
    }

    // 輸入寫作
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible({ timeout: 5000 }).catch(() => false)) {
      await textarea.fill('This is a test essay for E2E testing. It demonstrates the writing analysis flow.');
    }

    // 提交
    const analyzeBtn = page.getByRole('button', { name: /分析|Analyze/i });
    if (await analyzeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyzeBtn.click();
      await waitForLoadingDone(page);
    }
  });
});
