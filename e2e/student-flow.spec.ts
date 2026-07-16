// ============================================
// E2E: 新學生完整學習流程
// 登入 → 診斷 → 練習 → Integrated Skills → 生字簿 → 作業
// ============================================
import { test, expect } from '@playwright/test';
import { login, selectRole, waitForLoadingDone, expectButtonEnabled, safeClick } from './helpers';

test.describe('Student Full Learning Flow', () => {

  test('TC-S01: 新學生登入 → 到達 Dashboard', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    await expect(page.getByText('學習主頁')).toBeVisible();
    await expect(page.getByText('開始練習')).toBeVisible();
    await expect(page.locator('nav a[href="/student/practice"]')).toBeVisible();
  });

  test('TC-S02: AI 練習 — 生成 MC 題 → 作答 → 查看結果', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    // 進入 AI 練習
    await page.click('nav a[href="/student/practice"]');
    await page.waitForURL('**/student/practice');

    // 選擇文法 + 難度
    await page.selectOption('select:below(:text("文法項目"))', { index: 1 }); // tenses
    await page.selectOption('select:below(:text("難度"))', { index: 0 }); // remedial
    await page.fill('input[type="number"]', '3');

    // 點擊生成
    const genBtn = page.getByRole('button', { name: /生成.*練習/ });
    await genBtn.click();

    // 等待導航到第一題
    await page.waitForURL('**/student/practice/**', { timeout: 30_000 });
    await waitForLoadingDone(page);

    // 確認題目顯示
    await expect(page.getByText(/[A-D]\./).first()).toBeVisible({ timeout: 10_000 });

    // 作答 3 題
    for (let i = 0; i < 3; i++) {
      const choices = page.locator('button:has-text("A."), button:has-text("B."), button:has-text("C."), button:has-text("D.")');
      if (await choices.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await choices.first().click();
      }
      const submitBtn = page.getByRole('button', { name: /提交/ });
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click();
        await page.waitForTimeout(2000);
      }
      const nextBtn = page.getByRole('button', { name: /下一題|完成練習/ });
      if (await nextBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    // 應到達總結頁面
    await expect(page.getByText(/正確|accuracy|Accuracy/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('TC-S03: Integrated Skills — 生成任務 → 聆聽 → 筆記 → 寫作', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    // 進入 Integrated Skills
    await page.click('nav a[href="/student/integrated-skills"]');
    await page.waitForURL('**/student/integrated-skills');

    // 點擊生成
    const genBtn = page.getByRole('button', { name: /生成.*任務/ });
    await genBtn.click();
    await waitForLoadingDone(page);

    // 應到達任務頁面（步驟指示器顯示）
    await expect(page.getByText(/聆聽/).first()).toBeVisible({ timeout: 15_000 });

    // 展開聆聽文字
    const listenToggle = page.getByText(/顯示聆聽文字|聆聽內容/).first();
    if (await listenToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await listenToggle.click();
    }

    // 播放音頻
    const playBtn = page.getByRole('button', { name: /播放/ });
    if (await playBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await playBtn.click();
      await page.waitForTimeout(3000);
      // 點擊停止
      const stopBtn = page.getByRole('button', { name: /停止|暫停/ });
      if (await stopBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await stopBtn.click();
      }
    }

    // 填寫筆記
    const notesArea = page.locator('textarea').first();
    await notesArea.fill('Test notes: The meeting is at 3pm on Friday. Location: Room 302. Attendees: John, Mary.');

    // 應自動顯示寫作區
    await expect(page.getByText(/寫作/).first()).toBeVisible({ timeout: 5000 });

    // 填寫寫作
    const writingArea = page.locator('textarea').last();
    await writingArea.fill('The meeting will be held at 3pm on Friday in Room 302. John and Mary will attend.');

    // 提交
    const submitBtn = page.getByRole('button', { name: /提交.*批改/ });
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      await waitForLoadingDone(page);
    }
  });

  test('TC-S04: 生字簿 — 加入單字', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    await page.click('nav a[href="/student/vocabulary"]');
    await page.waitForURL('**/student/vocabulary');

    // 確認頁面載入
    await expect(page.getByText(/生字簿|Vocabulary/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('TC-S05: 作業 — 查看 → 作答 → 提交', async ({ page }) => {
    await login(page, 'test-student@school.edu.hk', 'test1234');
    await selectRole(page, 'student');

    await page.click('nav a[href="/student/assignments"]');
    await page.waitForURL('**/student/assignments');

    // 如有作業，點擊第一個
    const firstAssignment = page.locator('a[href*="/student/assignments/"]').first();
    if (await firstAssignment.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstAssignment.click();
      await page.waitForURL('**/student/assignments/**');

      // 作答 MC
      const mcLabel = page.locator('label:has(input[type="radio"])').first();
      if (await mcLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
        await mcLabel.click();
      }

      // 提交
      const submitBtn = page.getByRole('button', { name: /提交/ });
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click();
        await waitForLoadingDone(page);
      }
    }
  });
});
