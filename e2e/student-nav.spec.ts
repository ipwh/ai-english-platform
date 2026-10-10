// ============================================
// E2E — student left sidebar: custom practice entry + knowledge-graph position
// ============================================
// Requirement (2026-10-10, teacher request):
//   1. add 「自訂文法與詞彙練習」 (the custom-practice page heading) to the left
//      menu, directly BELOW 「AI 練習」;
//   2. move 「知識圖譜」 so it sits directly ABOVE 「個人檔案」.
//
// The sidebar is rendered from `studentNavItems` (src/shared/utils/nav.ts), so the
// order is asserted on the real DOM of the running app — not on the config file.
// Prerequisites: BASE_URL + TEST_DATABASE_URL (a student is seeded below).
// ============================================

import { test, expect, type BrowserContext } from '@playwright/test';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const RUN = randomUUID().slice(0, 8);
const STUDENT = { email: `e2e-nav-${RUN}@test.local`, password: 'test-password-1' };

let db: Client;
let sessionCookie: string | null = null;

async function createStudent(): Promise<string> {
  const id = `e2e-nav-${randomUUID()}`;
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

/** Hrefs of the first sidebar nav, in DOM order (viewport-independent). */
async function sidebarHrefs(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const nav = document.querySelector('aside nav');
    if (!nav) return [];
    return Array.from(nav.querySelectorAll('a')).map(anchor => anchor.getAttribute('href') ?? '');
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

test('sidebar places the custom-practice entry below AI practice and the knowledge graph above Profile', async ({ page, context }) => {
  await authenticate(context);
  await page.goto('/student/dashboard');

  const hrefs = await sidebarHrefs(page);
  expect(hrefs.length).toBeGreaterThan(10);

  const aiPractice = hrefs.indexOf('/student/practice');
  const customPractice = hrefs.indexOf('/student/custom-practice');
  const knowledgeGraph = hrefs.indexOf('/student/knowledge-graph');
  const profile = hrefs.indexOf('/student/profile');

  expect(aiPractice).toBeGreaterThanOrEqual(0);
  expect(customPractice, 'the custom-practice entry must be in the sidebar').toBeGreaterThanOrEqual(0);
  expect(knowledgeGraph).toBeGreaterThanOrEqual(0);
  expect(profile).toBeGreaterThanOrEqual(0);

  // 1. custom practice sits directly BELOW AI practice.
  expect(customPractice).toBe(aiPractice + 1);
  // 2. knowledge graph sits directly ABOVE Profile.
  expect(profile).toBe(knowledgeGraph + 1);
});

test('the entry is labelled like the page heading and opens the page', async ({ page, context }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, 'the left sidebar is hidden on small viewports (mobile uses the bottom tab bar)');
  await authenticate(context);
  await page.goto('/student/dashboard');

  const entry = page.locator('aside nav a[href="/student/custom-practice"]').first();
  await expect(entry).toBeVisible();
  // Same wording as the page's own heading (one source of truth: customPractice.title).
  await expect(entry).toHaveText(/自訂文法與詞彙練習|Self-Directed Grammar & Vocabulary Practice/);

  await entry.click();
  await page.waitForURL('**/student/custom-practice', { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /自訂文法與詞彙練習|Self-Directed Grammar & Vocabulary Practice/ })).toBeVisible();
});
