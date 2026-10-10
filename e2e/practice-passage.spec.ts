// ============================================
// E2E — practice runner must show the passage it delivers (2026-10-10 bug report)
// ============================================
// Student report: the runner asked "According to the passage, what does the word
// 'infrasound' mean?" with NO passage on screen.
//
// Root cause (fixed here): the runner rendered `readingContent` only when the
// question's skill was exactly 'reading'. A passage delivered with ANY other skill
// (grammar/vocabulary, or a model-authored passage) was hidden, leaving an
// unanswerable question.
//
// This spec drives the REAL UI: only the AI-backed generation call is mocked (so
// the delivered payload is deterministic); the runner, session building and
// rendering all run for real. Prerequisites: BASE_URL + TEST_DATABASE_URL (a
// student is seeded below) and a running app.
// ============================================

import { test, expect, type BrowserContext } from '@playwright/test';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const RUN = randomUUID().slice(0, 8);
const STUDENT = { email: `e2e-passage-${RUN}@test.local`, password: 'test-password-1' };

const PASSAGE = 'Elephants communicate over long distances with infrasound, a very low-frequency sound '
  + 'that humans cannot hear. Researchers in Kenya recorded these rumbles at night and found that herds '
  + 'several kilometres apart answered one another.';

let db: Client;
let sessionCookie: string | null = null;

async function createStudent(): Promise<string> {
  const id = `e2e-passage-${randomUUID()}`;
  await db.query(
    `INSERT INTO "User" (id, email, role, "passwordHash", "badgeIds", xp, "createdAt", "updatedAt")
     VALUES ($1, $2, 'student', $3, '[]', 0, now(), now())`,
    [id, STUDENT.email, bcrypt.hashSync(STUDENT.password, 8)],
  );
  return id;
}

/** ONE real login per run — the login endpoint is limited to 5/min/IP. */
async function captureSessionCookie(request: import('@playwright/test').APIRequestContext) {
  const response = await request.post('/api/auth/login', {
    data: { email: STUDENT.email, password: STUDENT.password },
  });
  if (!response.ok()) throw new Error(`login failed with status ${response.status()}`);
  const setCookie = response.headersArray().find(header => header.name.toLowerCase() === 'set-cookie');
  const token = setCookie?.value.split(';')[0].split('=').slice(1).join('=');
  if (!token) throw new Error('login response did not include a session token cookie');
  sessionCookie = token;
  return token;
}

async function authenticate(context: BrowserContext) {
  if (!sessionCookie) throw new Error('session cookie was not captured in beforeAll');
  await context.addCookies([{ name: 'session_token', value: sessionCookie, url: BASE }]);
}

/** The AI generation call is mocked; everything else (runner, session, grading) is real. */
async function mockGeneration(context: BrowserContext) {
  await context.route('**/api/ai/generate-questions', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        questions: [
          {
            id: 'e2e-passage-q1',
            type: 'mc',
            prompt: 'According to the passage, what does the word "infrasound" mean?',
            promptZh: '根據篇章作答',
            choices: [
              'Sound that is too low for humans to hear.',
              'Sound that only elephants can make.',
              'Sound that is too high for humans to hear.',
              'Sound that is louder than thunder.',
            ],
            answer: 'A',
            // The passage travels with the item even though the request was GRAMMAR,
            // which is exactly the case the old runner hid.
            readingContent: PASSAGE,
            explanationZh: '低頻率、人耳聽不到的聲音。',
            explanationEn: 'Infrasound is too low for humans to hear.',
            commonMistake: '學生常誤選「太大聲」。',
            grammarPoint: 'Vocabulary in context',
          },
        ],
        _meta: { requestedCount: 1, deliveredCount: 1, shortfall: 0 },
      }),
    });
  });
}

test.beforeAll(async ({ playwright }) => {
  if (!DB_URL) throw new Error('TEST_DATABASE_URL (or DATABASE_URL) must point at the test database');
  db = new Client({ connectionString: DB_URL });
  await db.connect();
  await createStudent();
  const requestContext = await playwright.request.newContext({ baseURL: BASE });
  await captureSessionCookie(requestContext);
  await requestContext.dispose();
});

test.afterAll(async () => {
  if (!db) return;
  await db.query('DELETE FROM "User" WHERE email = $1', [STUDENT.email]);
  await db.end();
});

test('a passage delivered with a non-reading question is rendered in the runner', async ({ page, context }) => {
  await authenticate(context);
  await mockGeneration(context);

  await page.goto('/student/practice');
  // Grammar item (NOT reading) — the passage must still be shown.
  await page.locator('select').nth(0).selectOption('tenses');
  await page.getByRole('button', { name: /生成 \d+ 題 AI 練習|Generate \d+ AI questions/ }).click();

  // 1. The runner opens on the delivered question.
  await page.waitForURL('**/student/practice/e2e-passage-q1', { timeout: 30_000 });
  await expect(page.getByText(/According to the passage/)).toBeVisible();

  // 2. The passage itself is on screen, labelled as question text (not hidden).
  await expect(page.getByText(/Elephants communicate over long distances/)).toBeVisible();
  await expect(page.getByText(/題目內文|Question text/)).toBeVisible();

  // 3. The question is answerable: the options are there too.
  await expect(page.getByText(/Sound that is too low for humans to hear/)).toBeVisible();
});
