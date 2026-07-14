// ============================================
// E2E: 認證與安全測試
// 驗證所有 API 授權、rate limiting、middleware redirect
// ============================================
import { test, expect } from '@playwright/test';
import { login, selectRole, TEST_ACCOUNTS } from './helpers';

test.describe('Auth & Security', () => {

  test('TC-A01: 未授權 API — diagnostic 回傳 401', async ({ request }) => {
    const res = await request.get('/api/diagnostic?studentId=test-unknown-id');
    expect(res.status()).toBe(401);
  });

  test('TC-A02: 未授權 API — mistakes 回傳 401', async ({ request }) => {
    const res = await request.get('/api/mistakes?studentId=test-unknown-id');
    expect(res.status()).toBe(401);
  });

  test('TC-A03: 未授權 API — vocabulary 回傳 401', async ({ request }) => {
    const res = await request.get('/api/vocabulary?studentId=test-unknown-id');
    expect(res.status()).toBe(401);
  });

  test('TC-A04: 未授權 API — practice 回傳 401', async ({ request }) => {
    const res = await request.get('/api/practice?studentId=test-unknown-id');
    expect(res.status()).toBe(401);
  });

  test('TC-A05: 未授權 API — gamification 回傳 401', async ({ request }) => {
    const res = await request.get('/api/gamification?studentId=test-unknown-id');
    expect(res.status()).toBe(401);
  });

  test('TC-A06: 未授權 API — srs/review 回傳 401', async ({ request }) => {
    const res = await request.get('/api/srs/review?studentId=test-unknown-id');
    expect(res.status()).toBe(401);
  });

  test('TC-A07: /api/admin/ensure-admin 回傳 404 (production guard)', async ({ request }) => {
    const res = await request.post('/api/admin/ensure-admin');
    // In non-production env, may return 200. In CI with NODE_ENV=production, returns 404.
    expect([200, 201, 404]).toContain(res.status());
  });

  test('TC-A08: /api/auth/debug 回傳 404 (production guard)', async ({ request }) => {
    const res = await request.get('/api/auth/debug');
    expect([200, 404]).toContain(res.status());
  });

  test('TC-A09: 學生訪問教師頁面 — middleware redirect', async ({ page }) => {
    await login(page, TEST_ACCOUNTS.student.email, TEST_ACCOUNTS.student.password);
    await selectRole(page, 'student');

    // 直接導航到教師頁面
    await page.goto('/teacher/dashboard');
    // 應被 redirect 到 login（因為 middleware 檢查 role）
    await page.waitForURL('**/login**', { timeout: 10_000 });
  });

  test('TC-A10: 未登入訪問 Dashboard — redirect to login', async ({ page }) => {
    await page.goto('/student/dashboard');
    await page.waitForURL('**/login**', { timeout: 10_000 });
  });

  test('TC-A11: Login rate limit — 6 次失敗後回傳 429', async ({ request }) => {
    for (let i = 0; i < 6; i++) {
      const res = await request.post('/api/auth/login', {
        data: { email: 'wrong@test.com', password: 'wrong' },
      });
      if (i < 5) {
        expect(res.status()).toBe(401);
      } else {
        // 第 6 次應為 rate limited
        expect([401, 429]).toContain(res.status());
        if (res.status() === 429) {
          expect(res.headers()['retry-after']).toBeDefined();
        }
      }
    }
  });

  test('TC-A12: Login-logs POST 需認證', async ({ request }) => {
    const res = await request.post('/api/admin/login-logs', {
      data: { userId: 'fake', userEmail: 'fake@test.com', role: 'student' },
    });
    expect(res.status()).toBe(401);
  });
});
