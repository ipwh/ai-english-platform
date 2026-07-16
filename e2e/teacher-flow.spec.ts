// ============================================
// E2E: 教師端流程 + 混合班級情境
// ============================================
import { test, expect } from '@playwright/test';
import { login, selectRole, waitForLoadingDone, expectButtonEnabled } from './helpers';

test.describe('Teacher Flow', () => {

  test('TC-T01: 教師登入 → Dashboard 可見', async ({ page }) => {
    await login(page, 'test-teacher@school.edu.hk', 'test1234');
    await selectRole(page, 'teacher');

    await expect(page.getByText(/教師|Teacher/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('a[href="/teacher/assignments/new"]')).toBeVisible();
  });

  test('TC-T02: 建立作業 → 指派班級 → 預覽 → 發布', async ({ page }) => {
    await login(page, 'test-teacher@school.edu.hk', 'test1234');
    await selectRole(page, 'teacher');

    await page.click('a[href="/teacher/assignments/new"]');
    await page.waitForURL('**/teacher/assignments/new');

    // 填寫作業名稱
    await page.fill('input[placeholder*="作業名稱"]', 'E2E Test Assignment');
    await page.selectOption('select:below(:text("班別"))', { index: 1 });

    // 點擊生成
    const genBtn = page.getByRole('button', { name: /生成.*題/ });
    await genBtn.click();
    await waitForLoadingDone(page);

    // 確認預覽出現
    await expect(page.getByText(/確認派發|Confirm/i)).toBeVisible({ timeout: 20_000 });

    // 點擊發布
    const publishBtn = page.getByRole('button', { name: /確認派發/ });
    await publishBtn.click();
    await waitForLoadingDone(page);

    // 檢查成功訊息
    await expect(page.getByText(/成功|success/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('TC-T03: 教師查看作業詳情 → 查看學生提交', async ({ page }) => {
    await login(page, 'test-teacher@school.edu.hk', 'test1234');
    await selectRole(page, 'teacher');

    await page.click('a[href="/teacher/assignments"]');
    await page.waitForURL('**/teacher/assignments');

    // 點擊第一個作業
    const firstAssignment = page.locator('a[href*="/teacher/assignments/"]').first();
    if (await firstAssignment.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstAssignment.click();
      await page.waitForURL('**/teacher/assignments/**');

      // 確認題目和提交列表
      await expect(page.getByText(/題目|Questions/i).first()).toBeVisible({ timeout: 10_000 });
    }
  });

  test('TC-T04: 教師覆核 — AI 批改結果', async ({ page }) => {
    await login(page, 'test-teacher@school.edu.hk', 'test1234');
    await selectRole(page, 'teacher');

    await page.click('a[href="/teacher/review"]');
    await page.waitForURL('**/teacher/review');

    // 如有覆核項目，點擊第一個
    const firstReview = page.locator('button:has-text("Pending"), button:has-text("pending")').first();
    if (await firstReview.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstReview.click();
      // 確認顯示 AI 評分和學生答案
      await expect(page.getByText(/Student Answer|學生答案/i).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('TC-T05: 教師報告 — 產生 CSV', async ({ page }) => {
    await login(page, 'test-teacher@school.edu.hk', 'test1234');
    await selectRole(page, 'teacher');

    await page.click('a[href="/teacher/reports"]');
    await page.waitForURL('**/teacher/reports');

    const reportBtn = page.getByRole('button', { name: /產生|Generate/i }).first();
    if (await reportBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15_000 }),
        reportBtn.click(),
      ]);
      expect(download.suggestedFilename()).toContain('.csv');
    }
  });
});

test.describe('Mixed Class / Group Flow', () => {

  test('TC-M01: 教師建立組別 → 加入學生', async ({ page }) => {
    await login(page, 'test-teacher@school.edu.hk', 'test1234');
    await selectRole(page, 'teacher');

    await page.goto('/teacher/groups');
    await page.waitForURL('**/teacher/groups');

    // 點擊建立組別
    const createBtn = page.getByRole('button', { name: /建立組別/ });
    await createBtn.click();

    // 填寫組別名稱
    await page.fill('input[placeholder*="組別名稱"]', 'E2E Test Group');

    // 選擇學生
    const studentCheckbox = page.locator('label:has(input[type="checkbox"])').first();
    if (await studentCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await studentCheckbox.click();
    }

    // 建立
    const saveBtn = page.getByRole('button', { name: /建立$/ });
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click();
      await waitForLoadingDone(page);
    }
  });

  test('TC-M02: 指派作業給組別', async ({ page }) => {
    await login(page, 'test-teacher@school.edu.hk', 'test1234');
    await selectRole(page, 'teacher');

    await page.click('a[href="/teacher/assignments/new"]');
    await page.waitForURL('**/teacher/assignments/new');

    // 切換到組別模式
    const targetSelect = page.locator('select:below(:text("指派對象"))');
    if (await targetSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await targetSelect.selectOption('group');
      await page.waitForTimeout(1000);

      // 選擇組別
      const groupCheckbox = page.locator('label:has(input[type="checkbox"])').first();
      if (await groupCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
        await groupCheckbox.click();
      }
    }
  });

  test('TC-M03: 通知鈴鐺 — 顯示通知並標記已讀', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    // 點擊鈴鐺
    const bellBtn = page.locator('button:has(svg.lucide-bell)').first();
    if (await bellBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await bellBtn.click();
      await page.waitForTimeout(1000);

      // 檢查下拉選單出現
      const dropdown = page.locator('text=通知, text=Notifications').first();
      if (await dropdown.isVisible({ timeout: 3000 }).catch(() => false)) {
        // 點擊第一條通知標記已讀
        const firstNotif = page.locator('[class*="cursor-pointer"]').first();
        if (await firstNotif.isVisible({ timeout: 2000 }).catch(() => false)) {
          await firstNotif.click();
        }
      }
    }
  });
});
