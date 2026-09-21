# ADR-045: Server-Owned Listening Question Store (Listening Becomes Measurable)

- **Status**: Accepted
- **Date**: 2026-09-21
- **Related**: ADR-044 (measurable practice / authority resolution), ADR-042 (pre-delivery answer verification), ADR-041 (mistake attribution)

## Context

ADR-044 gave practice submissions a *server-resolved* authority: the canonical family of the submitted `questionId`s decides whether a submission is scored, regardless of what the client claims. That closed the "reading practice is invisible" defect, but explicitly left one hole open:

> **Known limitation:** listening … still carries no server-owned answer key, so it remains self-assessed and is excluded from accuracy/mastery. … the dormant `ListeningSession`/`ListeningAnswer` tables remain unused; giving listening a measurable path requires a server-owned listening question store.

Evidence for the hole (audit, 2026-09-21):

1. **No store.** `GrammarQuestion` (R3.10-D) and `ReadingQuestion` (2026-09-20) persist generated items *before delivery* so scoring can use a server-owned key. Listening had none: `/api/ai/generate-questions` returned items with client-local `ai-*` ids, so `resolveSubmissionAuthorityClass()` could never resolve them.
2. **The dormant tables were never a store.** `ListeningSession` / `ListeningAnswer` were created in an early sprint and never written to (production: 0 rows; the only writer, `createListeningSession`, had no callers).
3. **Consequences visible to students and teachers.** A student who completed listening practice saw "已完成" but their accuracy, skill mastery and mistake book were unchanged; a listening weakness diagnosed in the diagnostic was self-assessed, so the same weakness never appeared in teacher monitoring as an evidence-backed weakness. The practice page had to print an honesty note saying listening is not counted.
4. **Attribution was client-trusted.** With no canonical definition, mistake rows for listening fell back to the client-claimed `listeningType`, i.e. `skillSource: 'client-claimed'`.

## Decision

**Listening practice is measured through the same contract as grammar and reading: a server-owned question store, server-resolved authority, and a server-owned answer key.**

1. **New `ListeningQuestion` store** (`prisma/migrations/20260924_listening_question_store`). Each generated listening item is persisted *before delivery* with its answer key, choices, question type, marks, order index and **dialogue** (`dialogue` / `dialogueZh`). Generated items are returned to the client with the server-assigned id, exactly like grammar/reading.
   - The dialogue is stored because a listening item cannot be understood, replayed or re-checked without it; reading stores only a passage title, but listening depends on the content itself.
2. **Only deliverable items are persisted.** `isDeliverableListeningMc()` (owner: `modules/listening/services/listening-question-service.ts`) is the single predicate: `mc`, non-empty dialogue, ≥2 choices, and the answer key **appearing verbatim in the dialogue** (word-boundary match, option prefixes tolerated). Items without a verbatim basis cannot be graded deterministically and would produce "marked wrong but actually right" outcomes, so they are dropped with a warning log.
   - If *no* item survives, the route returns a structured, retryable `422 LISTENING_QUESTIONS_NOT_DELIVERABLE` instead of delivering ungradable questions.
   - If persistence fails, the route returns an error and delivers nothing (never a client-side key).
3. **Scoring has one authority.** `scoreListeningAnswers()` resolves every id against `ListeningQuestion`, ignores all client scoring fields (`correctAnswer`, `isCorrect`, `awardedScore`, `maxScore`, `countsTowardScore`), derives `maxScore` from the stored `marks`, orders rows by the server `orderIndex`, and delegates the actual comparison to the canonical `scorePracticeAnswer()` (no second rule set). Any unresolvable id, invalid `marks`, or non-deterministic type ⇒ **NOT_PROJECTABLE** (no partial scoring, no fabricated verdict).
4. **The evidence contract gains one method.** `practice-evidence-service.ts` whitelists `('server', 'listening-server-exact-match')`. That single string is what turns a stored row into verified evidence, so accuracy, mastery and mistakes follow automatically.
5. **Classification and authority cover listening.** `PracticeSubmissionClass` gains `listening` (marker: `source === 'dse-listening'` or an answer carrying `listeningType`); `resolveSubmissionAuthorityClass()` resolves a third store and returns `'listening'` when *every* id resolves to it. `listening` **stays** in `LEGACY_LANGUAGE_SKILLS` so historical payloads without a marker keep their old, unverified behaviour.
6. **Misclassification guard: only *actually* server-scored submissions are trusted.** `submitPractice()` now tracks `usedServerScoring` and gates **both** mistake creation and mastery updates on it, in addition to the class. A fail-open fallback (reading or listening) persists the session but can no longer create trusted mistakes or mastery from client-supplied `isCorrect`.
7. **Listening failure never blocks the learner.** If listening scoring is unavailable (legacy `ai-*` ids, store temporarily unreadable) the session is still persisted through the legacy path with `scoringMethod: 'client-key-deterministic'` → unverifiable, never evidence. Reading keeps its stricter behaviour (a client claiming `dse-reading` must supply server ids), because reading has been a server-authority contract since R3.7 while listening is *newly* authoritative and must stay backward compatible.
8. **Diagnostics score listening too.** `diagnostic-scoring-service.ts` groups a third authoritative family (`source: 'dse-listening'`, `resultSkill: 'listening'`) and the diagnostic page labels listening answers with their own skill — so a listening score is overwritten by the *server* score (as grammar/reading already are) instead of being sent as grammar.
9. **The dormant tables are deleted.** `DROP TABLE "ListeningAnswer"; DROP TABLE "ListeningSession";` (child first). This is a deletion of dead schema, not a migration of data: they held no rows and no writer existed. `createListeningSession()` is removed with them. No backfill is required — there is nothing to convert, and historical listening rows stay unverifiable by design.
10. **Phase 1 is MC-only, and says so.** `listeningType` is persisted but currently written as `null` (the generation prompt does not yet produce a stable listening sub-type), so mistake buckets fall back to the format (`listening:mc`) and the strategy card falls back to the generic comprehension card. Inventing a sub-type from the prompt text would be speculation; it is deferred to a prompt-version change.

## Consequences

- Listening practice now produces the same artefacts as grammar and reading: verified answer rows, `StudentMastery` movement, mistake records with **canonical** skill attribution (`languageSkill: 'listening'`, `skillSource: 'canonical'`), teacher-visible evidence, and inclusion in accuracy.
- The student-facing honesty note is updated: grammar, reading **and listening** are counted; writing and speaking remain self-assessed.
- Teacher surfaces label listening sessions (`dse-listening`) alongside reading, and `mapPracticeSourceToContext()` maps the new source to the practice family so listening sessions project into student assessment results instead of silently becoming NOT_PROJECTABLE.
- **New invariant:** `submissionClass` alone never authorises side effects. `usedServerScoring` (or the evidence whitelist) must also hold. Any future fail-open path must preserve this.
- **Unchanged:** the strictness asymmetry between reading (400 on unscored claim) and listening (fail-open to unverified). This is deliberate and documented in `practice-submission-service.ts`.
- **Unchanged:** teacher access to the school-wide student export, per owner instruction (see ADR-044).
- Cost: one extra `createMany` per listening generation and one extra `findMany` per submission (shared with the authority resolution that already ran for reading).

## Evidence

- New tests: listening scoring contract — server key wins, forged client key/verdict ignored, `maxScore` from stored marks, server ordering, NOT_PROJECTABLE for unknown ids / partial resolution / invalid marks / open-ended types / empty payloads (**15**); deliverability predicate — verbatim acceptance, prefix tolerance, absent key, word-boundary (no `art`/`start`), non-MC, out-of-range letter (**5**); end-to-end submission — verified evidence, canonical mistake attribution, mastery gating, legacy `ai-*` fail-open, client-claimed listening vs grammar family precedence, mixed-family fallback (**6**); authority resolution for listening (**3**); classification contract incl. reading-over-listening precedence and authority eligibility (**2**); mistake identity canonical listening attribution (**2**); diagnostic listening grouping (**1**, split out of the old "listening/vocabulary/writing are never submitted" test); route plumbing + schema (no dormant tables) (**2**). Total **36** new tests (3,136 → 3,172).
- Updated existing tests: the diagnostic "vocabulary/writing are never submitted" test; mistake-identity and mistakes-route suites now mock the third store.
- Release validation on 2026-09-21: `npm test` **3,172 passed / 1 skipped** (163 files passed / 1 skipped); `npx tsc --noEmit`, `node scripts/check-i18n.js`, `npx prisma validate` all pass; ESLint reports no error-level problem in the changed files.
- **Deployment requires** `npx prisma migrate deploy` for `20260924_listening_question_store`; Cloud Run does not apply migrations. No backfill.

## Verification after deployment (read-only)

1. A new listening session row carries a child answer with `scoredBy = 'server'` and `scoringMethod = 'listening-server-exact-match'`.
2. `StudentMastery` gains/updates a `listening` row only for such sessions.
3. `ListeningQuestion` row count grows on each listening generation; a delivery attempt whose items all fail the verbatim check returns 422 and persists nothing.
4. `ListeningSession` / `ListeningAnswer` no longer exist in `information_schema.tables`.
