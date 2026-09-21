# ADR-044: Measurable Practice, Honest Empty States & Teacher Monitoring Signals

- **Status**: Accepted
- **Date**: 2026-09-21
- **Related**: ADR-041 (mistake attribution), ADR-042 (answer verification), ADR-043 (delivery integrity / roster)

## Context

A read-only audit of every student and teacher surface (static review of the whole request path, plus `check-i18n`) found six defects that either corrupted what the platform reported or prevented teachers from acting on what it already knew:

1. **`User.overallAccuracy` was `Float? @default(0)`.** The only writer that ever sets `null` (`syncActivityMetrics`) runs *after* a student submits practice or an assignment. Every imported student who had never used the platform therefore stayed at `0`, which teacher lists rendered as a red "0 %" and class / school averages silently included. The same column was read as "no data" by the export route (`value ? … : null`) and as "0 %" by the class average — two contradictory readings of one field.
2. **`/api/admin/export/students` used `sessions: { take: 50 }` fed into `aggregateStudentPracticeTotals`.** Columns named `totalQuestionsAnswered` / `sessionAccuracy` only covered the newest 50 sessions (the project's own forbidden pattern: a windowed value presented as cumulative). The report's average streak was the cached `User.streakDays` (written only when a student opens the dashboard), and `joinedAt` used a UTC `toISOString().split('T')[0]` date.
3. **Reading generation was all-or-nothing.** `assignServerOwnedQuestionIds` threw when *any* question failed pre-delivery answer verification, after the retry loop, and the client mapped the resulting 500 to a generic, non-actionable message. Verification also only covered MC / summary cloze / sentence transformation / comma-answers, leaving AI-scored short answers (`reference`, `inference`, `vocabulary_in_context`, `short_answer`) unchecked even though their keys drive scoring.
4. **Practice could be invisible.** Submission authority was decided from client-supplied `skill` / `source`. The AI-practice page persists its reading MC items as server-owned `ReadingQuestion` rows with server answer keys, but sends no `dseType` and `source: 'ai-generated'`, so those submissions were classified `legacy-language-skill`: no verified evidence, no `StudentMastery` update, no mistake records — while the *same* questions scored through the diagnostic path (`source: 'dse-reading'`).
5. **Vocabulary quiz answer keys had no semantic grounding.** The key was the LLM's own `word` field, validated only as "in the student's word list" and "present in the choices". A prompt about 「環境」 keyed to `pollution` was deliverable, and same-meaning distractors could make two options defensible.
6. **Teachers could not act on the monitoring signals that existed.** `lastActiveAt`, `dominantDifficulty` and `shortWritingCount` were already computed, but the roster had no activity/accuracy filter or sort, the dashboard's at-risk list showed `slice(0, 6)` with no total and linked to an unfiltered list, `dominantDifficulty` was never rendered, "never started" was shown with the same red badge as "long inactive", activity ignored writing drafts and submissions, and every roster request loaded the full text of every writing draft.

## Decision

1. **Empty means empty.** `User.overallAccuracy` has **no default**; the migration drops `DEFAULT 0`, and existing rows are corrected by the one-time backfill (`npm run db:backfill:accuracy:apply`). `0` now always means a genuine 0 %. Readers are null-safe and render `—`.
2. **Cumulative numbers come from the canonical full-history projection.** `aggregateVerifiedTotalsForStudents()` (batched, `skip`-paged, delegating to `aggregateStudentPracticeTotals` → `classifySessionEvidence` → `evaluatePracticeEvidence`) is the only source for exported totals; **no `take` window may feed a total**. Export streaks come from `getPracticeStreaksForStudents()`, which applies the same pure `countStreak()` as the student UI, and dates use `hkDayKey()`.
3. **Authority is resolved on the server.** Before classification, `submitPractice` resolves the submitted `questionId`s against the canonical question stores. All ids resolving to one family ⇒ that family is authoritative regardless of client `skill`/`source`; partial / mixed / unresolved input falls back to the existing client-marker classification, so legacy data keeps behaving identically. If a server-resolved reading submission cannot be scored (e.g. AI semantic evaluation unavailable) the session still persists through the legacy path as **unverified** — a learner never loses a session, and no unverified row becomes trusted evidence.
4. **Verification drops items, never the whole task — and says so.** Reading delivery keeps every verified item; when fewer than `MIN_VERIFIED_READING_QUESTIONS` survive, the API returns a structured `422 ANSWER_VERIFICATION_FAILED` (code + `details`) instead of an opaque 500, and the client shows an actionable message and retries once automatically. Dropped counts are reported in `_metadata.verificationDropped` so "generation failed" and "verification rejected" are distinguishable. Key-graded short answers are now verified too: deterministic types keep exact equality, AI-scored types accept content-word overlap (`verificationAnswerMatch: 'overlap'`) so rewording does not drop legitimate items.
5. **Vocabulary keys are grounded in the student's own record.** The quiz drops any item whose stated meaning disagrees with the word list, whose prompt does not contain that meaning, or that has a same-meaning distractor.
6. **Monitoring has one threshold owner and is actionable.** `activity-service` owns `classifyActivityStatus()` (HK day boundary; `never-started` ≠ `inactive` ≠ `low` ≠ `active`), and `/api/teacher/students` returns `activityStatus` + `daysInactive`. Activity counts logins, practice sessions, writing-draft updates and assignment submissions. The roster gains activity/accuracy filters, sorting, and a rendered dominant difficulty; the dashboard shows the at-risk total and deep-links to the filtered list. Short-writing counting moved into SQL (with an in-memory fail-open fallback) and Copilot loads its class snapshots in parallel.

## Consequences

- A student who has never used the platform is now visibly distinct from one who answers everything incorrectly, and class / school averages exclude students with no verifiable evidence.
- Reading practice from the student practice page now produces verified evidence, mastery and mistakes — the same questions were already scored that way from the diagnostic.
- A verification failure is no longer a dead end: learners receive a partial task or a retryable, explained error.
- Teachers can answer "who has not used this for two weeks" and "whose results need attention" with a filter and a count instead of scanning a table.
- **Known limitation (unchanged by design):** listening, vocabulary-quiz and speaking practice still carry no server-owned answer key, so they remain self-assessed and are excluded from accuracy/mastery. The practice page now states this explicitly. The dormant `ListeningSession`/`ListeningAnswer` tables remain unused; giving listening a measurable path requires a server-owned listening question store (tracked as future work).
- **Deliberate non-change:** teacher access to `/api/admin/export/students` and `/api/admin/export/stream/students` stays school-wide (not narrowed to taught classes) per owner instruction; the route documents this so it is not "helpfully" tightened later.
- Deployment requires migration `20260923_user_overall_accuracy_drop_default` **and** the backfill script; Cloud Run deployment does not apply migrations.

## Evidence

- New regression tests: server-derived submission authority (9), batched cumulative totals incl. >1-page pagination and "no evidence ⇒ null" (6), activity status thresholds / HK boundary / all four activity sources / DB-side counting + fail-open fallback (10), batch streaks equal to per-student streaks (4), lenient vs exact answer matching (5), reading verification coverage extensions (4), admin stats null semantics (5).
- Updated contract test: admin export no longer contains a `take` window feeding totals.
- Release validation on 2026-09-21: `npm test` **3,136 passed / 1 skipped** (161 files passed / 1 skipped); `npx tsc --noEmit`, `node scripts/check-i18n.js`, `npx prisma validate` all pass.

## Addendum (2026-09-21, post-deployment re-verification)

The migration and backfill ran against production. The backfill reported **0 rows changed**, so the result was verified independently with a temporary read-only script (removed after use) rather than trusting the script's own summary:

- `information_schema.columns` for `User.overallAccuracy` → `column_default = null`, `is_nullable = YES` (the default really is gone).
- Of 852 students: **`null` = 832, `0` = 0, `> 0` = 20**; no student with graded assignment evidence is `null`, and no student with a score has zero verifiable evidence.
- Of the 44 students who have practice sessions, **20 have at least one server-authoritative answer row** (and a real accuracy) while the remaining **24 have only unverifiable client-key legacy rows** and are therefore correctly `null` under the evidence contract.

That check surfaced **seven further occurrences of the same truthiness defect**, now fixed:

- `/api/admin/stats`: `byLevel[]/byClass[].avgAccuracy` and `monthlyTrend[].accuracy` used `value ? round(value) : 0` → a level, class or month with no verifiable evidence was reported as **0 %** (red) in the admin report. Now `null`, rendered as `—`, with the Recharts tooltip no longer printing `null%`.
- `/api/parent-report`: overall and weekly accuracy used the same pattern → the parent report told families of never-practising students that accuracy was 0 % and advised "practise 5–6 times a week". Now `null`/`—` with advice that states there is no verifiable record yet.
- Inverse error (a genuine 0 % read as no data): the teacher student-detail badge and its CSV export, plus the `overallAccuracy` column of `/api/admin/export-sheets`, used truthiness and rendered a real 0 % as `—` / `-` / empty. Now all use an explicit null check.

