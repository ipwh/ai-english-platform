// ============================================
// E2E Test Helpers — 共用登入、等待、檢查輔助函式
// ============================================
import { Page, expect } from '@playwright/test';

/** 測試帳號（需先在測試 DB 中建立） */
export const TEST_ACCOUNTS = {
  student: { email: 'test-student@school.edu.hk', password: 'test1234', name: 'Test Student' },
  teacher: { email: 'test-teacher@school.edu.hk', password: 'test1234', name: 'Test Teacher' },
};

/** 登入 */
export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("登入")');
  await page.waitForURL('**/role-select', { timeout: 15_000 });
}

/** 選擇角色 */
export async function selectRole(page: Page, role: 'student' | 'teacher') {
  if (role === 'student') {
    await page.click('button:has-text("學生")');
    await page.waitForURL('**/student/dashboard', { timeout: 15_000 });
  } else {
    await page.click('button:has-text("教師")');
    await page.waitForURL('**/teacher/dashboard', { timeout: 15_000 });
  }
}

/** 等待 loading spinner 消失 */
export async function waitForLoadingDone(page: Page) {
  const spinner = page.locator('.animate-spin');
  if (await spinner.isVisible({ timeout: 2000 }).catch(() => false)) {
    await spinner.waitFor({ state: 'hidden', timeout: 30_000 });
  }
}

/** 確認 toast/error 文字 */
export async function expectToast(page: Page, text: string) {
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 10_000 });
}

/** 確認按鈕存在且可用 */
export async function expectButtonEnabled(page: Page, label: string) {
  const btn = page.getByRole('button', { name: label });
  await expect(btn).toBeVisible();
  await expect(btn).not.toBeDisabled();
}

/** 確認按鈕 disabled */
export async function expectButtonDisabled(page: Page, label: string) {
  const btn = page.getByRole('button', { name: label });
  await expect(btn).toBeVisible();
  await expect(btn).toBeDisabled();
}

/** 填寫 AI 練習表單 */
export async function fillPracticeForm(page: Page, opts: { skill?: string; difficulty?: string; count?: number } = {}) {
  if (opts.skill) await page.selectOption('select:below(:text("文法項目"))', { label: opts.skill });
  if (opts.difficulty) await page.selectOption('select:below(:text("難度"))', { label: opts.difficulty });
  if (opts.count) await page.fill('input[type="number"]', String(opts.count));
}

/** 安全點擊（等待元素可見） */
export async function safeClick(page: Page, selector: string | ReturnType<Page['getByRole']>) {
  if (typeof selector === 'string') {
    await page.waitForSelector(selector, { state: 'visible', timeout: 10_000 });
    await page.click(selector);
  } else {
    await selector.waitFor({ state: 'visible', timeout: 10_000 });
    await selector.click();
  }
}
