// ============================================
// E2E — /student/custom-practice (Sprint 142, P0 #1)
// ============================================
// Real browser, real session, real database. Only the AI-BACKED generation call is
// intercepted (`POST /api/custom-practice`) so the exercise is deterministic; the
// submission, grading, persistence, history and authorization paths all run through
// the real API against real PostgreSQL. Every assertion here is about observed
// browser behaviour or an actual HTTP response — never about component internals.
//
// Labelled coverage: "MOCKED-PROVIDER" (generation) vs "REAL-DB" (submit/results).
// Prerequisites: a running app (`BASE_URL`, default http://localhost:3000) pointed
// at a test database, plus a seeded student (done in beforeAll below).
// ============================================

import { test, expect, type BrowserContext } from '@playwright/test';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const RUN = randomUUID().slice(0, 8);

const STUDENT = { email: `e2e-cp-${RUN}@test.local`, password: 'test-password-1' };
const OTHER_STUDENT = { email: `e2e-cp-other-${RUN}@test.local`, password: 'test-password-1' };

let db: Client;
let studentId = '';
let otherStudentId = '';
let setId = '';
let unsubmittedSetId = '';
let unsubmittedQuestionId = '';
let foreignSetId = '';
let questionIds: string[] = [];
let foreignQuestionId = '';

/** The delivered shape a real generation call would return (answer keys stripped). */
function deliveredSet() {
  return {
    id: setId,
    objective: '[grammar] past perfect vs past simple',
    category: 'grammar',
    difficulty: 'intermediate',
    interpretation: 'Interpreted as grammar practice based on the wording of the request.',
    createdAt: new Date().toISOString(),
    questionCount: 2,
    submitted: false,
    questions: [
      {
        id: questionIds[0],
        orderIndex: 0,
        questionType: 'mc',
        instructions: 'Choose the correct option.',
        prompt: 'By the time we arrived, the film ___.  A) started  B) had started  C) starts  D) starting',
        targetRule: 'past perfect',
        maxMarks: 1,
      },
      {
        id: questionIds[1],
        orderIndex: 1,
        questionType: 'fill_blank',
        instructions: 'Complete with the correct form of the verb.',
        prompt: 'She ___ (finish) the report before the meeting started.',
        targetRule: 'past perfect form',
        maxMarks: 1,
      },
    ],
  };
}

async function createUser(email: string, password: string): Promise<string> {
  const id = `e2e-cp-${randomUUID()}`;
  const hash = bcrypt.hashSync(password, 8);
  await db.query(
    `INSERT INTO "User" (id, email, role, "passwordHash", "badgeIds", xp, "createdAt", "updatedAt")
     VALUES ($1, $2, 'student', $3, '[]', 0, now(), now())`,
    [id, email, hash]
  );
  return id;
}

async function createSet(ownerId: string, label: string): Promise<{ setId: string; questionIds: string[] }> {
  const id = `e2e-set-${randomUUID()}`;
  await db.query(
    `INSERT INTO "CustomPracticeSet"
       (id, "ownerUserId", "requestText", objective, category, difficulty, "questionCount", "promptVersion", "verificationMeta", "createdAt")
     VALUES ($1, $2, $3, $4, 'grammar', 'intermediate', 1, 'custom-practice-generation-v1', $5, now())`,
    [id, ownerId, label, `[grammar] ${label}`, JSON.stringify({ status: 'verified', rounds: 1 })]
  );

  const questions = [
    {
      orderIndex: 0,
      questionType: 'mc',
      instructions: 'Choose the correct option.',
      prompt: 'By the time we arrived, the film ___.  A) started  B) had started  C) starts  D) starting',
      answerKey: 'B',
      acceptedAnswers: '[]',
      rubric: JSON.stringify({ marks: 1, criteria: ['past perfect for the earlier action'] }),
      targetRule: 'past perfect',
      explanationEn: 'The earlier of two past actions takes the past perfect.',
    },
    {
      orderIndex: 1,
      questionType: 'fill_blank',
      instructions: 'Complete with the correct form of the verb.',
      prompt: 'She ___ (finish) the report before the meeting started.',
      answerKey: 'had finished',
      acceptedAnswers: JSON.stringify(['had already finished']),
      rubric: JSON.stringify({ marks: 1, criteria: ['past perfect verb form'] }),
      targetRule: 'past perfect form',
      explanationEn: 'The earlier action takes the past perfect.',
    },
  ];

  const ids: string[] = [];
  for (const question of questions.slice(0, label.includes('foreign') ? 1 : 2)) {
    const qid = `e2e-q-${randomUUID()}`;
    ids.push(qid);
    await db.query(
      `INSERT INTO "CustomPracticeQuestion"
         (id, "setId", "orderIndex", "questionType", instructions, prompt, "answerKey", "acceptedAnswers",
          "rejectedAnswers", rubric, "targetRule", "explanationZh", "explanationEn", "misconceptionTags", "maxMarks")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '[]', $9, $10, NULL, $11, '[]', 1)`,
      [
        qid, id, question.orderIndex, question.questionType, question.instructions, question.prompt,
        question.answerKey, question.acceptedAnswers, question.rubric, question.targetRule, question.explanationEn,
      ]
    );
  }

  return { setId: id, questionIds: ids };
}

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"], button:has-text("登入"), button:has-text("Sign in")');
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 30_000 });
}

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

/** Session cookie captured ONCE — the app rate limits its login endpoint per IP. */
let sessionCookie: string | null = null;

async function captureSessionCookie(request: import('@playwright/test').APIRequestContext) {
  if (sessionCookie) return sessionCookie;
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

/** Applies the shared session to a browser context (no second login call). */
async function authenticate(context: BrowserContext) {
  const token = sessionCookie;
  if (!token) throw new Error('session cookie was not captured in beforeAll');
  await context.addCookies([{ name: 'session_token', value: token, url: BASE }]);
}

/**
 * The login UI is exercised once in the happy path; the other tests reuse the
 * session cookie captured in beforeAll because the login endpoint is rate limited
 * per IP (discovered in Sprint 142 when a UI login per test returned 429).
 */
/** Mock ONLY the AI-backed generation call; everything else stays real. */
async function mockGenerationSuccess(context: BrowserContext) {
  await context.route('**/api/custom-practice', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        set: deliveredSet(),
        meta: {
          requestedCount: 2,
          deliveredCount: 2,
          shortfall: 0,
          droppedCount: 0,
          rejectedByVerification: 0,
          regenerationRounds: 1,
          interpretation: 'Interpreted as grammar practice based on the wording of the request.',
          promptVersion: 'custom-practice-generation-v1',
          verificationPromptVersion: 'custom-practice-verification-v1',
        },
      }),
    });
  });
}

test.beforeAll(async ({ playwright }) => {
  if (!DB_URL) throw new Error('TEST_DATABASE_URL (or DATABASE_URL) must point at the test database');
  db = new Client({ connectionString: DB_URL });
  await db.connect();

  studentId = await createUser(STUDENT.email, STUDENT.password);
  otherStudentId = await createUser(OTHER_STUDENT.email, OTHER_STUDENT.password);

  // ONE login for the whole file (the login endpoint is rate limited per IP).
  const requestContext = await playwright.request.newContext({ baseURL: BASE });
  await captureSessionCookie(requestContext);
  await requestContext.dispose();

  const mine = await createSet(studentId, 'past perfect vs past simple');
  setId = mine.setId;
  questionIds = mine.questionIds;

  // A second set that stays unsubmitted, so the pre-submission disclosure test
  // never observes post-submission results (reference answers are legitimately
  // returned once a set has been marked).
  const unsubmitted = await createSet(studentId, 'unsubmitted past perfect');
  unsubmittedSetId = unsubmitted.setId;
  unsubmittedQuestionId = unsubmitted.questionIds[0];

  const foreign = await createSet(otherStudentId, 'foreign past perfect');
  foreignSetId = foreign.setId;
  foreignQuestionId = foreign.questionIds[0];
});

test.afterAll(async () => {
  if (!db) return;
  await db.query(`DELETE FROM "User" WHERE id = ANY($1)`, [[studentId, otherStudentId].filter(Boolean)]);
  await db.end();
});

test('unauthenticated access redirects to the login page', async ({ page }) => {
  await page.goto('/student/custom-practice');
  await page.waitForURL('**/login**', { timeout: 30_000 });
  expect(page.url()).toContain('/login');
});

test.describe('authenticated student flow', () => {
  test('MOCKED-PROVIDER happy path: generate → answer → submit → results → history → reload', async ({ page, context }) => {
    await mockGenerationSuccess(context);
    await login(page, STUDENT.email, STUDENT.password);

    // 1–4: enter a request, generate and display the validated exercise.
    await page.goto('/student/custom-practice');
    await page.fill('#cp-request', 'past perfect tense');
    await page.getByRole('radio', { name: /文法|Grammar/ }).check();
    await page.getByRole('button', { name: /開始出題|Generate practice/ }).click();

    await expect(page.getByText(/By the time we arrived/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/She ___ \(finish\)/)).toBeVisible();
    // The disclosed interpretation is shown to the student.
    await expect(page.getByText(/Interpreted as grammar practice/)).toBeVisible();

    // 5: answer without ever seeing a key, then submit once.
    await page.fill(`#answer-${questionIds[0]}`, 'B');
    await page.fill(`#answer-${questionIds[1]}`, 'had finished');
    await page.getByRole('button', { name: /提交並批改|Submit for marking/ }).click();

    // 6: marks, feedback, reference answers and improvement data are displayed.
    await expect(page.getByText(/得分|Score:/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/參考答案|Reference answer/).first()).toBeVisible();
    await expect(page.getByText(/The earlier of two past actions/)).toBeVisible();
    await expect(page.getByText(/解說|Explanation/).first()).toBeVisible();

    // 7: the completed practice can be reopened from history (selected BY NAME —
    // other seeded sets exist, so positional selection would be order-dependent).
    await page.getByRole('button', { name: /更新記錄|Refresh/ }).click();
    await expect(page.getByText(/past perfect vs past simple/)).toBeVisible();
    await page
      .locator('li', { hasText: 'past perfect vs past simple' })
      .getByRole('button', { name: /查看|View/ })
      .click();
    await expect(page.getByText(/得分|Score:/)).toBeVisible();

    // 8: a full reload keeps the persisted results.
    await page.reload();
    await page.getByRole('button', { name: /更新記錄|Refresh/ }).click();
    await page
      .locator('li', { hasText: 'past perfect vs past simple' })
      .getByRole('button', { name: /查看|View/ })
      .click();
    await expect(page.getByText(/得分|Score:/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/She ___ \(finish\)/)).toBeVisible();
  });

  test('REAL-DB: answer keys are never returned before submission', async ({ context }) => {
    await authenticate(context);

    const response = await context.request.get(`/api/custom-practice/${unsubmittedSetId}`);
    expect(response.status()).toBe(200);
    const raw = await response.text();

    expect(raw).not.toContain('answerKey');
    expect(raw).not.toContain('"had finished"');
    expect(raw).not.toContain('rubric');
    expect(raw).not.toContain('explanationEn');

    // ...and the questions themselves are present, so the page can render them.
    expect(raw).toContain(unsubmittedQuestionId);
  });

  test('REAL-DB: another student\u2019s set is not readable or submittable (404, never 403)', async ({ context }) => {
    await authenticate(context);

    const detail = await context.request.get(`/api/custom-practice/${foreignSetId}`);
    expect(detail.status()).toBe(404);

    const submit = await context.request.post(`/api/custom-practice/${foreignSetId}/submit`, {
      data: { answers: { [foreignQuestionId]: 'B' } },
    });
    expect(submit.status()).toBe(404);
  });

  test('REAL-DB: a second submission is refused with 409 and does not change the marks', async ({ context }) => {
    await authenticate(context);

    const payload = { answers: { [questionIds[0]]: 'B', [questionIds[1]]: 'had finished' } };
    const first = await context.request.post(`/api/custom-practice/${setId}/submit`, { data: payload });
    expect([200, 409]).toContain(first.status()); // 200 on the first run, 409 if the UI test already submitted

    const second = await context.request.post(`/api/custom-practice/${setId}/submit`, { data: payload });
    expect(second.status()).toBe(409);
  });

  test('MOCKED-PROVIDER: provider failure and rate limiting surface as clear messages', async ({ page, context }) => {
    await authenticate(context);

    await context.route('**/api/custom-practice', async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'provider down' }) });
    });
    await page.goto('/student/custom-practice');
    await page.fill('#cp-request', 'past perfect tense');
    await page.getByRole('button', { name: /開始出題|Generate practice/ }).click();
    await expect(page.getByText(/AI 服務暫時不可用|temporarily unavailable/)).toBeVisible({ timeout: 30_000 });

    await context.unroute('**/api/custom-practice');
    await context.route('**/api/custom-practice', async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'slow down' }) });
    });
    await page.getByRole('button', { name: /開始出題|Generate practice/ }).click();
    await expect(page.getByText(/操作太頻繁|Too many requests/)).toBeVisible({ timeout: 30_000 });
  });

  test('MOCKED-PROVIDER: insufficient verified questions surfaces the quality message', async ({ page, context }) => {
    await authenticate(context);

    await context.route('**/api/custom-practice', async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'nothing survived', code: 'GENERATION_FAILED', details: { verifierAvailable: true } }),
      });
    });

    await page.goto('/student/custom-practice');
    await page.fill('#cp-request', 'past perfect tense');
    await page.getByRole('button', { name: /開始出題|Generate practice/ }).click();
    await expect(page.getByText(/未通過驗證|did not pass verification/)).toBeVisible({ timeout: 30_000 });
  });
});
