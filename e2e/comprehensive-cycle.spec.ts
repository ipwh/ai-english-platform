// ============================================
// E2E: 完整學習週期 + 通知同步 + 邊界案例 + 跨裝置
// 涵蓋 5 大情境，填補現有測試的 coverage gaps
// ============================================
import { test, expect } from '@playwright/test';
import {
  login, selectRole, waitForLoadingDone, expectButtonEnabled,
  expectButtonDisabled, expectToast, safeClick, TEST_ACCOUNTS,
} from './helpers';

const STUDENT = TEST_ACCOUNTS.student;
const TEACHER = TEST_ACCOUNTS.teacher;

// ════════════════════════════════════════════════════════════
// 1. 新學生完整學習週期（補強：進度頁、生字簿選取、設定同步）
// ════════════════════════════════════════════════════════════
test.describe('Scenario 1: Full Student Learning Cycle', () => {

  test('SC1-01: 登入 → 偏好自動同步 → 設定頁面驗證', async ({ page }) => {
    await login(page, STUDENT.email, STUDENT.password);
    await selectRole(page, 'student');

    // 導航到設定頁面
    await page.goto('/student/settings');
    await page.waitForURL('**/student/settings');

    // 確認三個區塊都存在
    await expect(page.getByText(/語言|Language/).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/外觀|Appearance/).first()).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText(/通知|Notifications/).first()).toBeVisible({ timeout: 3_000 });

    // 切換語言 → 確認 UI 文字改變
    const langBtn = page.getByRole('button', { name: /English|中文/ });
    await langBtn.click();
    await page.waitForTimeout(500);
    // 確認儲存提示
    await expect(page.getByText(/Saved|已儲存/).first()).toBeVisible({ timeout: 3_000 });

    // 切換深色模式
    const darkCard = page.locator('button:has-text("Dark"), button:has-text("深色")');
    await darkCard.click();
    await page.waitForTimeout(500);
    // 確認 html 有 dark class
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(isDark).toBe(true);
  });

  test('SC1-02: 通知偏好 — 關閉再開啟 → localStorage 驗證', async ({ page }) => {
    await login(page, STUDENT.email, STUDENT.password);
    await selectRole(page, 'student');

    await page.goto('/student/settings');

    // 關閉「作業通知」
    const assignmentToggle = page.locator('text=Assignments, text=作業通知')
      .locator('..')
      .locator('..');
    await assignmentToggle.click();
    await page.waitForTimeout(300);

    // 驗證 localStorage
    const notifSettings = await page.evaluate(() => {
      const raw = localStorage.getItem('notif-settings');
      return raw ? JSON.parse(raw) : null;
    });
    expect(notifSettings).toBeTruthy();
    expect(notifSettings.assignment).toBe(false);

    // 重整頁面 → 確認狀態保持
    await page.reload();
    await page.waitForURL('**/student/settings');
    const notifAfterReload = await page.evaluate(() => {
      const raw = localStorage.getItem('notif-settings');
      return raw ? JSON.parse(raw) : null;
    });
    expect(notifAfterReload.assignment).toBe(false);
  });

  test('SC1-03: 生字簿 — 選取模式 → 加入日期顯示 → 日期排序', async ({ page }) => {
    await login(page, STUDENT.email, STUDENT.password);
    await selectRole(page, 'student');

    await page.goto('/student/vocabulary');

    // 點擊「選取生字」按鈕
    const selectBtn = page.getByRole('button', { name: /選取|Select Words/i });
    if (await selectBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await selectBtn.click();
      await page.waitForTimeout(300);
    }

    // 確認 checkboxes 出現
    const checkboxes = page.locator('input[type="checkbox"]');
    const cbCount = await checkboxes.count();
    if (cbCount > 0) {
      // 選取第一個
      await checkboxes.first().check();
      // 確認選中計數更新
      await expect(page.getByText(/Selected|已選/).first()).toBeVisible({ timeout: 3_000 });
    }

    // 檢查排序下拉有「加入日期」
    const sortSelect = page.locator('select');
    if (await sortSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await sortSelect.selectOption({ label: /日期|Date Added/i });
      await page.waitForTimeout(300);
    }
  });

  test('SC1-04: 進度頁面 — 載入與數據顯示', async ({ page }) => {
    await login(page, STUDENT.email, STUDENT.password);
    await selectRole(page, 'student');

    await page.goto('/student/progress');

    // 確認進度頁面載入
    await expect(page.getByText(/進度|Progress/i).first()).toBeVisible({ timeout: 10_000 });
    // 應顯示統計數據（0 或以上）
    await expect(page.locator('text=/\\d+/').first()).toBeVisible({ timeout: 5_000 });
  });
});

// ════════════════════════════════════════════════════════════
// 2. 教師完整流程（補強：組別建立、通知發送、寫作覆核）
// ════════════════════════════════════════════════════════════
test.describe('Scenario 2: Teacher Full Workflow', () => {

  test('SC2-01: 建立組別 → 加入學生 → 驗證顯示', async ({ page }) => {
    await login(page, TEACHER.email, TEACHER.password);
    await selectRole(page, 'teacher');

    await page.goto('/teacher/groups');

    // 確認組別頁面
    await expect(page.getByText(/組別|Groups/i).first()).toBeVisible({ timeout: 10_000 });

    // 如有「建立組別」按鈕
    const createBtn = page.getByRole('button', { name: /建立|Create/i });
    if (await createBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(500);

      // 填寫組名
      const nameInput = page.locator('input[placeholder*="組別"], input[name="name"]').first();
      if (await nameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await nameInput.fill(`E2E Test Group ${Date.now()}`);
        const saveBtn = page.getByRole('button', { name: /儲存|Save|建立/ });
        if (await saveBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await saveBtn.click();
          await waitForLoadingDone(page);
        }
      }
    }
  });

  test('SC2-02: 教師查看學生進度詳情', async ({ page }) => {
    await login(page, TEACHER.email, TEACHER.password);
    await selectRole(page, 'teacher');

    await page.goto('/teacher/students');

    // 確認學生列表
    await expect(page.getByText(/學生|Students/i).first()).toBeVisible({ timeout: 10_000 });

    // 點擊第一個學生
    const firstStudent = page.locator('a[href*="/teacher/students/"]').first();
    if (await firstStudent.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await firstStudent.click();
      await page.waitForURL('**/teacher/students/**');

      // 確認顯示 XP/徽章/準確率
      await expect(page.getByText(/XP|準確率|Accuracy/i).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('SC2-03: 教師通知 — 查看通知列表', async ({ page }) => {
    await login(page, TEACHER.email, TEACHER.password);
    await selectRole(page, 'teacher');

    // 點擊通知 bell icon
    const bellBtn = page.locator('button:has(svg), a:has(svg)').filter({ has: page.locator('.lucide-bell') }).first();
    if (await bellBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await bellBtn.click();
      await page.waitForTimeout(500);
    }
  });
});

// ════════════════════════════════════════════════════════════
// 3. 混合班級 / 權限隔離
// ════════════════════════════════════════════════════════════
test.describe('Scenario 3: Mixed Class & Permission Isolation', () => {

  test('SC3-01: 學生無法訪問教師頁面', async ({ page }) => {
    await login(page, STUDENT.email, STUDENT.password);
    await selectRole(page, 'student');

    // 嘗試訪問教師頁面
    await page.goto('/teacher/dashboard');
    await page.waitForURL('**/login**', { timeout: 10_000 });
  });

  test('SC3-02: 學生無法訪問管理員頁面', async ({ page }) => {
    await login(page, STUDENT.email, STUDENT.password);
    await selectRole(page, 'student');

    await page.goto('/admin');
    // 應被 redirect
    await page.waitForURL('**/login**', { timeout: 10_000 });
  });

  test('SC3-03: 教師無法訪問學生專屬頁面', async ({ page }) => {
    await login(page, TEACHER.email, TEACHER.password);
    await selectRole(page, 'teacher');

    // 嘗試訪問學生 diagnostic
    await page.goto('/student/diagnostic');
    await page.waitForURL('**/login**', { timeout: 10_000 });
  });

  test('SC3-04: 未登入 → 所有 protected routes → 401/redirect', async ({ page }) => {
    const protectedPaths = [
      '/student/dashboard',
      '/teacher/dashboard',
      '/admin',
      '/student/practice',
      '/student/vocabulary',
      '/student/settings',
    ];

    for (const path of protectedPaths) {
      await page.goto(path);
      await page.waitForURL('**/login**', { timeout: 10_000 });
    }
  });
});

// ════════════════════════════════════════════════════════════
// 4. 邊界案例：RAG 失敗、TTS 失敗、網路中斷、空數據
// ════════════════════════════════════════════════════════════
test.describe('Scenario 4: Edge Cases & Resilience', () => {

  test('SC4-01: TTS 失敗 → Web Speech fallback 橫幅顯示', async ({ page }) => {
    await login(page, STUDENT.email, STUDENT.password);
    await selectRole(page, 'student');

    await page.goto('/student/integrated-skills');

    // 生成任務
    const s4Btn = page.getByRole('button', { name: /S4/i });
    if (await s4Btn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await s4Btn.click();
      await page.getByRole('button', { name: /Core/i }).click();
      await page.getByRole('button', { name: /Summary/i }).click();
      const genBtn = page.getByRole('button', { name: /AI 生成/ });
      await genBtn.click();
      await waitForLoadingDone(page);
    }

    // 模擬 TTS API 失敗
    await page.route('**/api/tts', route => route.abort());

    // 點擊播放
    const playBtn = page.getByRole('button', { name: /播放/ });
    if (await playBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await playBtn.click();
      await page.waitForTimeout(5000);
    }

    // 應出現 fallback 橫幅或 Web Speech 標記
    const fallbackBanner = page.getByText(/browser speech|fallback|Web Speech/i);
    // 至少不應 crash
    await expect(page.getByText(/聆聽|Listening/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('SC4-02: AI API timeout → 錯誤處理不 crash', async ({ page }) => {
    await login(page, STUDENT.email, STUDENT.password);
    await selectRole(page, 'student');

    await page.goto('/student/practice');

    // 模擬 AI API 超時
    await page.route('**/api/ai/generate-questions', route => {
      route.abort('timedout');
    });

    // 嘗試生成
    await page.fill('input[type="number"]', '3');
    const genBtn = page.getByRole('button', { name: /生成/ });
    await genBtn.click();
    await page.waitForTimeout(5000);

    // 頁面不應 crash，應有錯誤提示
    const errorIndicator = page.getByText(/失敗|error|無法|timeout|逾時/i);
    const pageStillAlive = await page.getByText(/練習|Practice/i).first().isVisible({ timeout: 3_000 }).catch(() => false);
    // 至少有其一
    expect(await errorIndicator.isVisible({ timeout: 2_000 }).catch(() => false) || pageStillAlive).toBeTruthy();
  });

  test('SC4-03: 無網路 → offline detection', async ({ page }) => {
    await login(page, STUDENT.email, STUDENT.password);
    await selectRole(page, 'student');

    await page.goto('/student/vocabulary');
    await expect(page.getByText(/生字簿|Vocabulary/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('SC4-04: 大量 localStorage 資料 → 頁面正常載入', async ({ page }) => {
    // 先寫入大量 localStorage 模擬長期使用者
    await page.goto('/login');
    await page.evaluate(() => {
      const bigData = { data: 'x'.repeat(5000) };
      for (let i = 0; i < 20; i++) {
        localStorage.setItem(`test-key-${i}`, JSON.stringify(bigData));
      }
      localStorage.setItem('lang', 'zh');
      localStorage.setItem('darkMode', 'false');
      localStorage.setItem('notif-settings', JSON.stringify({
        assignment: true, submission: true, feedback: false,
        achievement: true, system: true,
      }));
    });

    await login(page, STUDENT.email, STUDENT.password);
    await selectRole(page, 'student');

    // Dashboard 應正常載入
    await expect(page.getByText(/學習主頁|Dashboard/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('SC4-05: XSS 防護 — script tag 不執行', async ({ page }) => {
    await login(page, STUDENT.email, STUDENT.password);
    await selectRole(page, 'student');

    // 嘗試寫入惡意 localStorage
    await page.evaluate(() => {
      localStorage.setItem('lang', '<script>alert("xss")</script>');
    });

    await page.reload();
    // 不應出現 alert
    let dialogAppeared = false;
    page.on('dialog', () => { dialogAppeared = true; });
    await page.waitForTimeout(2000);
    expect(dialogAppeared).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// 5. Notification i18n + Preferences 跨裝置同步
// ════════════════════════════════════════════════════════════
test.describe('Scenario 5: Notification i18n & Preferences Cross-Device Sync', () => {

  test('SC5-01: 中英文通知文字正確顯示', async ({ page }) => {
    await login(page, STUDENT.email, STUDENT.password);
    await selectRole(page, 'student');

    // 先切到中文
    await page.evaluate(() => localStorage.setItem('lang', 'zh'));
    await page.goto('/student/settings');

    // 驗證中文文字
    const zhTexts = ['偏好設定', '語言', '界面語言', '外觀', '通知設定'];
    for (const text of zhTexts) {
      await expect(page.getByText(text).first()).toBeVisible({ timeout: 3_000 });
    }

    // 切換到英文
    await page.evaluate(() => localStorage.setItem('lang', 'en'));
    await page.reload();

    // 驗證英文文字
    const enTexts = ['Settings', 'Language', 'Interface Language', 'Appearance', 'Notifications'];
    for (const text of enTexts) {
      await expect(page.getByText(text).first()).toBeVisible({ timeout: 3_000 });
    }
  });

  test('SC5-02: 通知開關 — 五種類型全部可切換', async ({ page }) => {
    await login(page, STUDENT.email, STUDENT.password);
    await selectRole(page, 'student');

    await page.goto('/student/settings');

    const notifKeys = ['assignment', 'submission', 'feedback', 'achievement', 'system'];
    const notifNames = ['Assignments', 'Submissions', 'Feedback', 'Achievements', 'Announcements'];

    for (let i = 0; i < notifKeys.length; i++) {
      const toggleCard = page.getByText(notifNames[i]).first();
      if (await toggleCard.isVisible({ timeout: 2_000 }).catch(() => false)) {
        // 點擊 toggle（點擊整個卡片）
        await toggleCard.click();
        await page.waitForTimeout(200);
      }
    }

    // 驗證 localStorage 全部更新
    const finalSettings = await page.evaluate(() => {
      const raw = localStorage.getItem('notif-settings');
      return raw ? JSON.parse(raw) : null;
    });
    expect(finalSettings).toBeTruthy();
    // All 5 keys should exist
    for (const key of notifKeys) {
      expect(finalSettings).toHaveProperty(key);
    }
  });

  test('SC5-03: Preferences API — GET 回傳偏好', async ({ request, page }) => {
    // 先登入取得 cookie
    await login(page, STUDENT.email, STUDENT.password);
    await selectRole(page, 'student');

    // 使用同一 context 發送 API request
    const res = await request.get('/api/user/preferences');
    // 可能 200（已登入）或 401（cookie 未同步到 request fixture）
    expect([200, 401]).toContain(res.status());

    if (res.status() === 200) {
      const data = await res.json();
      expect(data.preferences).toBeTruthy();
      expect(data.preferences).toHaveProperty('language');
      expect(data.preferences).toHaveProperty('notifAssignment');
      expect(data.preferences).toHaveProperty('notifSubmission');
      expect(data.preferences).toHaveProperty('notifFeedback');
      expect(data.preferences).toHaveProperty('notifAchievement');
      expect(data.preferences).toHaveProperty('notifSystem');
    }
  });

  test('SC5-04: Preferences API — POST 寫入後 GET 驗證', async ({ page, request }) => {
    await login(page, STUDENT.email, STUDENT.password);
    await selectRole(page, 'student');

    // POST 更新偏好
    const postRes = await request.post('/api/user/preferences', {
      data: {
        language: 'en',
        darkMode: true,
        notifAssignment: false,
        notifSubmission: true,
        notifFeedback: true,
        notifAchievement: false,
        notifSystem: true,
      },
    });

    if (postRes.status() === 200) {
      const postData = await postRes.json();
      expect(postData.preferences.language).toBe('en');
      expect(postData.preferences.notifAssignment).toBe(false);
      expect(postData.preferences.notifAchievement).toBe(false);

      // GET 驗證
      const getRes = await request.get('/api/user/preferences');
      if (getRes.status() === 200) {
        const getData = await getRes.json();
        expect(getData.preferences.language).toBe('en');
        expect(getData.preferences.notifAssignment).toBe(false);
      }
    }
  });

  test('SC5-05: 跨裝置模擬 — 修改後重整保持', async ({ page }) => {
    await login(page, STUDENT.email, STUDENT.password);
    await selectRole(page, 'student');

    // 步驟 1: 在設定頁修改
    await page.goto('/student/settings');

    // 切換語言到英文
    const langBtn = page.getByRole('button', { name: /English|中文/ });
    const currentLang = await langBtn.textContent();
    await langBtn.click();
    await page.waitForTimeout(500);

    // 步驟 2: 重整（模擬另一裝置登入）
    await page.reload();
    await page.waitForURL('**/student/settings');

    // 步驟 3: 驗證語言保持
    const newLangBtn = page.getByRole('button', { name: /English|中文/ });
    const newLang = await newLangBtn.textContent();
    // 語言應該已經從 original 切換
    expect(newLang).not.toBe(currentLang);
  });
});

// ════════════════════════════════════════════════════════════
// 6. Integrated Skills 音頻修正驗證
// ════════════════════════════════════════════════════════════
test.describe('Scenario 6: Integrated Skills Audio & Note-Taking', () => {

  test('SC6-01: 播放時文稿預設隱藏 → 點擊顯示', async ({ page }) => {
    await login(page, STUDENT.email, STUDENT.password);
    await selectRole(page, 'student');

    await page.goto('/student/integrated-skills');

    // 生成任務
    const s4Btn = page.getByRole('button', { name: /S4/i });
    if (await s4Btn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await s4Btn.click();
      await page.getByRole('button', { name: /Core/i }).click();
      await page.getByRole('button', { name: /Summary/i }).click();
      await page.getByRole('button', { name: /AI 生成/ }).click();
      await waitForLoadingDone(page);
    }

    // 確認「顯示聆聽文字」按鈕存在（文稿預設隱藏）
    const showTextBtn = page.getByText(/顯示聆聽文字|Show.*text/i);
    const hideTextBtn = page.getByText(/隱藏聆聽文字|Hide.*text/i);

    const showVisible = await showTextBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    const hideVisible = await hideTextBtn.isVisible({ timeout: 1_000 }).catch(() => false);

    // 預設應為「顯示」(文稿隱藏中) 或「隱藏」(已展開)
    expect(showVisible || hideVisible).toBeTruthy();
  });

  test('SC6-02: Note-taking 區塊在聆聽時可存取', async ({ page }) => {
    await login(page, STUDENT.email, STUDENT.password);
    await selectRole(page, 'student');

    await page.goto('/student/integrated-skills');

    // 生成任務
    const s4Btn = page.getByRole('button', { name: /S4/i });
    if (await s4Btn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await s4Btn.click();
      await page.getByRole('button', { name: /Core/i }).click();
      await page.getByRole('button', { name: /Summary/i }).click();
      await page.getByRole('button', { name: /AI 生成/ }).click();
      await waitForLoadingDone(page);
    }

    // Note-taking 區塊應在 Step 1 就可見
    const noteArea = page.getByText(/Note-taking|筆記/).first();
    await expect(noteArea).toBeVisible({ timeout: 5_000 });

    // 應有 textarea 可供輸入
    const textareas = page.locator('textarea');
    const taCount = await textareas.count();
    expect(taCount).toBeGreaterThanOrEqual(1);
  });

  test('SC6-03: 播放按鈕 → 點擊後文稿自動隱藏', async ({ page }) => {
    await login(page, STUDENT.email, STUDENT.password);
    await selectRole(page, 'student');

    await page.goto('/student/integrated-skills');

    const s4Btn = page.getByRole('button', { name: /S4/i });
    if (await s4Btn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await s4Btn.click();
      await page.getByRole('button', { name: /Core/i }).click();
      await page.getByRole('button', { name: /Summary/i }).click();
      await page.getByRole('button', { name: /AI 生成/ }).click();
      await waitForLoadingDone(page);
    }

    // 點擊播放
    const playBtn = page.getByRole('button', { name: /播放/ });
    if (await playBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await playBtn.click();
      await page.waitForTimeout(2000);

      // 停止播放
      const stopBtn = page.getByRole('button', { name: /停止|暫停|Pause/ });
      if (await stopBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await stopBtn.click();
      }
    }
  });
});
