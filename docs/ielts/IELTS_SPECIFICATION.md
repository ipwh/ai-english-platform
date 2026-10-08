# IELTS Specification — Platform Implementation Contracts

Status: **IMPLEMENTED CONTRACT** (authoritative for `src/modules/ielts/`)
Date: 2026-10-03
Scope: IELTS-style practice inside AI English Platform. This is **practice**, not an official test.

> Governance note: this subsystem is architecturally **isolated** from HKDSE scoring,
> calibration, evidence and XP semantics. No IELTS code path writes HKDSE evidence,
> HKDSE accuracy, HKDSE mastery, mistakes, or XP.

---

## 1. Test structure (official)

### 1.1 Shared across Academic and General Training

| Component | Parts/Sections | Time | Questions | Notes |
|---|---|---|---|---|
| Listening | 4 parts (10 Q each) | ~30 min | 40 | Same test for both variants; recordings heard **once** |
| Speaking | 3 parts | 11–14 min | — | Same test for both variants; face-to-face interview (recorded) |

Listening part character (official):
- Part 1: conversation between two speakers — everyday/social
- Part 2: monologue — everyday/social
- Part 3: conversation between two main speakers (up to 4) — educational/training
- Part 4: monologue on an academic subject

Speaking parts (official):
- Part 1: introduction & interview — familiar topics — 4–5 min
- Part 2: long turn — task card, 1 min preparation, up to 2 min speaking
- Part 3: discussion — abstract/deeper discussion linked to Part 2 topic — 4–5 min

### 1.2 Academic

| Component | Sections | Time | Questions | Text length |
|---|---|---|---|---|
| Reading | 3 sections | 60 min | 40 | 2150–2750 words total |
| Writing | 2 tasks | 60 min | — | Task 1 ≥150 words (~20 min), Task 2 ≥250 words (~40 min) |

- Academic Reading: texts from books/journals/magazines/newspapers written for a
  non-specialist audience; at least one text contains detailed logical argument;
  narrative/descriptive/discursive styles; diagrams/graphs possible.
- Academic Writing Task 1: describe visual information (graph/chart/table/diagram/process)
  in own words; academic or semi-formal/neutral style.
- Academic Writing Task 2: discursive essay responding to a point of view, argument
  or problem; academic or semi-formal/neutral style.

### 1.3 General Training

| Component | Sections | Time | Questions | Text length |
|---|---|---|---|---|
| Reading | 3 sections | 60 min | 40 | 2150–2375 words total |
| Writing | 2 tasks | 60 min | — | Task 1 ≥150 words (~20 min), Task 2 ≥250 words (~40 min) |

- GT Reading Section 1: everyday texts (notices, advertisements, timetables) —
  two or three short texts or several shorter texts
- GT Reading Section 2: work topics (job descriptions, contracts, staff development)
- GT Reading Section 3: one long text, general interest, descriptive/narrative,
  longer and more complex than Sections 1–2
- GT Writing Task 1: **letter** responding to a situation (three bullet points),
  personal / semi-formal / formal depending on audience; **no addresses required**
- GT Writing Task 2: semi-formal/neutral discursive essay

### 1.4 What is shared vs different (implementation contract)

- Listening and Speaking: **identical** for Academic and GT.
- Reading: different text types/lengths (2150–2750 vs 2150–2375), identical
  40-question 1-mark structure and band scale. Academic texts may be harder;
  GT usually needs more correct answers for the same band.
- Writing: both have Task 1 + Task 2 with the same four criteria and Task 2
  weighting (Task 2 contributes twice as much as Task 1); **Task 1 fundamentally
  differs** (visual description vs letter). The domain model MUST NOT treat
  Academic and GT Writing as identical.
- The platform MUST encode `testType` on every test, question and attempt; no
  shared "generic IELTS" item bank may blur the two variants. Bands are estimates,
  labelled as such.

## 2. Official format invariants (enforced in code)

### 2.1 Listening
- Structure: 4 parts × 10 questions = 40 (any practice subset is allowed but the
  full-test definition uses this shape).
- Question types: multiple choice, matching, plan/map/diagram labelling,
  form/note/table/flow-chart completion, sentence completion, short-answer.
- Word limits are **validation rules**, not display text ("NO MORE THAN TWO WORDS
  AND/OR A NUMBER" ⇒ `wordLimit = { maxWords: 2, allowsNumber: true }`).
- Over-limit answers are scored **incorrect** (official: you lose the mark).
- Hyphenated words count as **single** words (`check-in` = 1).
- Contracted words are not tested in completion items; if encountered they count
  per platform word-count policy (see `IELTS_SCORING.md` §4).
- Answers must be locatable in the transcript (provenance) — enforced by
  `validateIeltsQuestion()`. Items without transcript provenance are rejected.

### 2.2 Reading
- Question types (Academic & GT union): multiple choice, True/False/Not Given,
  Yes/No/Not Given (Academic only, writer views/claims), matching information,
  matching headings, matching features, matching sentence endings, sentence
  completion, summary/note/table/flow-chart completion, diagram label completion,
  short answer.
- Every objective item must carry machine-checkable evidence spans into the
  passage (`IELTSReadingItemEvidence`). Spans must match the passage text exactly
  (slice equality). No span ⇒ invalid.
- "False" must contradict the passage; "Not Given" must neither agree nor
  contradict (and must not be answerable from world knowledge); "No" must
  contradict the writer's view/claim. Enforced by generation-time checks +
  validator `evidence`/`answerType` contracts, and reviewed at QA.
- One canonical answer unless the rubric explicitly allows multiple answers
  (`answerMode: 'multiple-order-insensitive'` with exact count).
- Answers must come from the text where the task type requires it
  (completion + short answer: verbatim words from the passage).

### 2.3 Writing
- Task 1 ≥150 words, Task 2 ≥250 words (minimums; over-length allowed but noted).
- Notes/bullet points are penalised; plagiarised/formulaic writing is penalised.
- Four criteria per task: **Task Achievement** (Task 1) / **Task Response** (Task 2),
  Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy.
- Each task assessed independently; criterion bands equally weighted; task band =
  average of the four criteria; **Task 2 contributes twice as much as Task 1** to
  the Writing section band.
- Word count semantics: see `IELTS_SCORING.md` §4. Under-length responses are
  flagged as a limitation ("may not provide sufficient evidence of the language
  features needed for higher bands") — the platform never claims a mechanical
  band penalty.

### 2.4 Speaking — preparation only (no score, no examiner simulation)
- Three parts as §1.1; timing information displayed to the user.
- The four criteria, equally weighted in the real test, are taught as what the
  examiner looks for; the platform **never produces a Speaking score/band**,
  **never simulates an examiner** and **never judges pronunciation**
  (`NOT_VERIFIED` by definition — no acoustic pipeline exists).
- Scope decision (2026-10-03, phase II): the previous transcript-based language
  estimate was retired; simulated examiner dialogue and automated
  pronunciation/fluency judgement cannot be produced honestly with the
  available technology, so the platform teaches preparation instead:
  - preparation topic bank (original Part 1/2/3 material),
  - note-grid & story-merging methods, self-recording loop and self-check list,
  - an AI preparation coach (`prepareIeltsSpeaking`) that outputs plans,
    outlines, language functions and follow-up questions — score language is
    stripped server-side (`SCORE_LANGUAGE_FILTERED`) and the response is typed
    `kind: 'PREPARATION_ONLY'`.
- See `IELTS_ASSESSMENT_GOVERNANCE.md` §6 and `IELTS_PRACTICE_PATTERNS.md`.

## 3. Reading item validity (machine-checkable)

```ts
type IELTSReadingItemEvidence = {
  passageId: string
  evidenceSpans: Array<{ start: number; end: number; text: string }>
  reasoning: string
  answerType: string
}
```

Rules enforced by `src/modules/ielts/validation/question-validator.ts`:
1. Exactly one canonical answer unless `answerMode` explicitly allows multiple.
2. At least one evidence span; each span must exactly match the passage slice.
3. `False`/`No` items must include an explanation describing the contradiction;
   `Not Given` items must explain what is absent (QA promotes to `HUMAN_APPROVED`
   only after review — the validator only screens, it does not certify semantics).
4. MC distractors: options unique; key ∈ options; key letter valid; a distractor
   that is textually identical to the key is rejected (case/whitespace-insensitive
   comparison).
5. No "all/none of the above"-style options (platform authoring policy: they are
   frequently ambiguous under IELTS-style scoring and are rejected by default).
6. Duplicate items within a batch (same prompt text after normalization) rejected.

## 4. Listening item validity

```ts
type IELTSListeningItemEvidence = {
  audioId?: string
  transcriptSpan?: { start: number; end: number; text: string }
  expectedAnswer: string | string[]
  acceptedVariants?: string[]
  wordLimit?: { maxWords?: number; allowsNumber?: boolean }
}
```

Rules:
1. Answer (or an accepted variant) must appear **verbatim** in the transcript
   (word-boundary match), mirroring the platform's HKDSE listening deliverability
   rule. Items failing this are **rejected** (never delivered).
2. The answer key must fit its own word limit.
3. `audioId` is optional in Phase 1: the platform synthesises listening audio at
   delivery time from the platform-owned transcript using AI voices (existing TTS
   service) and labels it as an **AI voice**, not an official recording.
   Longer term, `audioId` will reference stored audio assets. See
   `IELTS_IMPLEMENTATION_REPORT.md` §Known limitations (production audio assets
   remain `PARTIALLY_IMPLEMENTED`).
   **Speaker labels are never spoken** (2026-10-04): `parseDialogueForTTS` strips
   every recognisable speaker label — known voices (`Man:`/`Woman:`/`Boy:`/`Girl:`),
   role words (`Librarian:`, `RECEPTIONIST:`), markdown-decorated and inline labels
   (single-line transcripts) — and assigns one voice per role (unknown roles
   alternate female/male). Label-only lines are silent. The stored transcript is
   **never rewritten** (evidence quotes keep matching); stripping happens only on
   the synthesis path.
4. **Contracted words are never tested** (official Listening wording, re-fetched
   2026-10-03): word-limited Listening keys that are contractions (`isn't`,
   `they're`, `don't`…) are **rejected** (`LISTENING_CONTRACTION_KEY`). Names
   and possessives with apostrophes (`O'Brien`, `Halley's`) remain valid
   (dictionary-based pattern, not any apostrophe).
5. **Answer leakage is rejected**: the prompt must not already contain the answer
   (or an accepted variant) in plain text (`ANSWER_LEAKED_IN_PROMPT`) — the
   learner must take the answer from the recording, not the question paper.
6. **Question order mirrors the recording** (official: "the questions are in the
   same order as the information in the recording") and recordings are heard
   **once only**. Ordering is an authoring constraint carried by the generation
   prompt — it is design-verified, not asserted (NOT machine-checkable).

## 5. Question generation pipeline (status machine)

> **STATUS (2026-10-03 IV): IMPLEMENTED for Reading / Listening / Writing.**
> AI authoring runs through the canonical pipeline (DeepSeek primary) with the
> following guarantees:
> 1. **Generation** — `generateIeltsQuestionSetWithAI` (one section: passage or
>    transcript + N single-answer items) or `generateIeltsWritingPromptWithAI`
>    (one Task 1/2 prompt). Official-format rules and materials-derived
>    blueprints are embedded in the prompts (`ai/prompts/ielts/`,
>    `ai/prompts/ielts/materials-reference.ts`); recent prompts/excerpts are
>    supplied for cross-request dedupe.
> 2. **Deterministic machine screen** — the real `question-validator.ts` runs on
>    the generated content (evidence spans recomputed by indexOf, verbatim
>    answers in transcripts/option text, word limits, one-answer-per-number,
>    duplicate prompts). No AI is involved in this step.
> 3. **Independent BLIND-SOLVE verification** — `verifyIeltsItemsWithAI` sees the
>    text and questions **without any answer key**; every item must yield a
>    soundness `ok` verdict AND score `correct` against the key through the real
>    deterministic scorer. Writing prompts pass a separate conformance check
>    (task shape, word minimum, scaffolding, no official-copy suspicion).
> 4. **QA_REQUIRED persistence** — surviving items are stored at QA_REQUIRED
>    inside a DRAFT test with the generator version + verification notes.
>    Items that fail ANY gate are dropped and reported (reason + count); nothing
>    is persisted when nothing survives; shortfall is reported honestly.
> 5. **Human approval** — a reviewer must still move questions to
>    HUMAN_APPROVED → PUBLISHED. **AI can NEVER publish.**
>
> **Per-section top-up (2026-10-08 III).** A section's passage/transcript is FROZEN
> once accepted (every item must be supported by that exact text), so a section that
> comes back short is NOT regenerated — that would author a new text. Instead the
> deficit is filled by `extendIeltsSectionWithAI` (`IELTS_SECTION_EXTENSION_V1`),
> which writes ADDITIONAL questions for the SAME text and returns questions only
> (never a passage/transcript/title). Top-up items pass the SAME gates (machine
> screen → blind-solve); the rejected reasons are fed into the next round's prompt;
> at most `IELTS_SECTION_TOPUP_MAX_ROUNDS` (3) rounds run per section, each bounded by a
> wall-clock budget (`IELTS_GENERATION_TOPUP_TIME_BUDGET_MS`, recorded as `TOPUP_DEADLINE`)
> because content is persisted only after EVERY section finishes — a request timeout would
> lose the whole component, so a shortfall is preferred over that risk. Each
> section never exceeds its official item count (a small over-ask is trimmed back,
> recorded as `TOPUP_TRIMMED` — never silently). Accepted items are NEVER discarded:
> a provider failure (`TOPUP_<FAILURE>`) or an exhausted AI budget (`TOPUP_ABORTED`)
> simply stops the top-up and delivers the partial section with an honest shortfall.
> No gate is relaxed to reach the target. Measured on the real path (2026-10-08):
> reading full component 33 → **40/40**, listening 23 → **37–40/40**, with the final
> 3-round setting reaching **40/40 for both** (reading 77s, listening 103s).
>
> **Listening transcript reveal (2026-10-08 V).** A listening section's transcript is
> WITHHELD while the attempt is open — delivering it early would hand over every
> answer — and is released together with the submitted result
> (`toDeliveredTranscripts()`, inserted into both the submit response and the attempt
> detail, so a refresh keeps it). Empty transcripts are never delivered. Note that
> `catalog-service.getSectionTranscriptForDelivery()` deliberately does NOT gate on
> submission: it feeds the platform TTS audio route, which must work BEFORE the
> student answers. Any new TEXT transcript surface must use the attempt gate instead.
>
> Entry point: `POST /api/ielts/admin/generate` (teacher/admin; budget→503,
> timeout→504, provider→502, refused/empty/non-conforming→422). Scope `set`
> (3–14 reading / 3–10 listening items) or `full_component` (official 40-question
> shapes: 13+13+14 reading / 10×4 listening — generated sets total 40 so band
> conversion becomes comparable). The status name `AI_VALIDATED` refers to this
> verified pipeline; nothing generated can bypass it.
>
> **Immediate availability (2026-10-03 V).** Students get platform-authored
> starter practice on first catalogue load: `ensureStarterContent()` provisions
> `content/starter-sets.ts` (hand-authored, repo-reviewed) as PUBLISHED — this
> carve-out NEVER applies to AI content. Teacher/admin console at `/teacher/ielts`
> provides generation + per-question approval + test publishing; students only
> ever see PUBLISHED items.
>
> **Instant self-study (2026-10-03 VII · writing + complete components 2026-10-04).**
> `POST /api/ielts/practice/instant` lets a student generate practice on demand —
> explicitly NOT publication. The set is stored as a DRAFT test with
> `origin='INSTANT'` + `ownerUserId` and QA_REQUIRED questions; it is deliverable
> ONLY to its owner, is never listed in the catalogue, and is labelled “AI instant
> self-study (NOT teacher-reviewed)” on every surface. Reading/listening sets pass
> the machine screen + blind-solve gates; writing tasks (`skill:'WRITING'` +
> `writingTaskType`, which must match the variant) pass the same prompt-conformance
> check used for authoring (`generateIeltsWritingTask` with `deliveryMode:'INSTANT'`).
> `scope:'full_component'` generates the complete official component (reading
> 3 passages / listening 4 parts, 40 items) and reports the shortfall honestly
> (partial components are delivered with the exact dropped-item explanation —
> fail-closed, never padded). Each section is topped up against its own text first
> (see per-section top-up above), which is what makes the official 40-item shape
> reachable rather than merely attempted.
> Caps: **8 sets per Hong Kong day shared across reading, listening and writing**;
> complete components have their own cap (**2 per day**) because they cost ~8× a
> set. The Cloud Run request timeout is **900s** (a component needs 4 generations +
> 4 blind-solve verifications).
> Writing self-study is solved and assessed on `/student/ielts/writing` (the prompt
> is read from the canonical owner-only record; the AI assessment flow is unchanged).
> Attempts are **reload-safe**: an unfinished attempt is resumed and a submitted one
> is returned as-is (the runner restores the student's answers and result; an
> explicit “practise again” sends `force:true`) — refreshing never mints a second
> attempt nor discards a result.
> A teacher can review any generated set/task in the console; publishing it flips
> `origin` to 'CATALOGUE' (graduation through the normal human path — AI still never
> publishes).
>
> **Student entry flow (2026-10-07, UI contract).** `/student/ielts` is
> **variant-first**: the student must choose Academic or General Training before any
> paper is listed, and the choice cards state that Academic is the more advanced level
> while General Training suits secondary students. The choice is remembered in
> `localStorage` (`src/hooks/use-ielts-variant-preference.ts`, read through
> `useSyncExternalStore` with a `null` server snapshot so hydration can never
> mismatch; unavailable storage only loses the memory, never blocks practice) and can
> be changed at any time. Step 2 lists the variant's four papers, each combining
> **instant AI generation** (reading/listening: 5- or 10-item sets, or the complete
> component; writing: Task 1 / Task 2 links that carry `?mode=&task=` into
> `/student/ielts/writing`; speaking: preparation centre only, never scored) with the
> **published, teacher-reviewed** sets for that paper. Instant material remains
> labelled unreviewed everywhere it appears, and the flow never offers a scored
> Speaking path.

```
SOURCE → CONTENT EXTRACTION → QUESTION GENERATION → STRUCTURAL VALIDATION
→ ANSWER VALIDATION → DISTRACTOR VALIDATION → EVIDENCE VALIDATION
→ DIFFICULTY / SKILL TAGGING → HUMAN/QA REVIEW STATUS → PUBLISHABLE
```

Statuses (Prisma `IeltsQuestion.validationStatus`):
`DRAFT → AI_VALIDATED → QA_REQUIRED → HUMAN_APPROVED → PUBLISHED`, plus
`REJECTED` (from any state; PUBLISHED → REJECTED means retired).

Enforced transitions (`validation/pipeline.ts`):
- An item NEVER becomes `PUBLISHED` without `HUMAN_APPROVED` (reviewer id + timestamp).
- AI validation may only move `DRAFT → AI_VALIDATED` (or `REJECTED`).
- Scoring-critical content defaults to `QA_REQUIRED` after AI validation.
- Delivery endpoints serve `PUBLISHED` questions from catalogue tests; the ONLY
  exception is an owner-scoped INSTANT self-study set (not catalogue delivery —
  see §5): its QA_REQUIRED items are deliverable to their owner only and are
  labelled as unreviewed on every surface.

## 6. Difficulty model

- Difficulty is a **PLATFORM_DIFFICULTY_ESTIMATE** — never presented as an official
  IELTS psychometric parameter.
- Versioned model: `ielts-platform-difficulty-v1` — features: lexical/syntactic
  complexity, inference depth, distractor similarity, number of processing steps.
  Initial implementation uses curator/AI-assigned labels recorded with the model
  version and `difficultyBasis: 'PLATFORM_ESTIMATE'`.
- **TARGET_BAND authoring labels (2026-10-03).** Generation accepts the
  `TARGET_BAND_4 … TARGET_BAND_9` labels as an *authoring heuristic* mapped
  deterministically to the difficulty buckets (`domain/difficulty.ts`:
  4–5.5 ⇒ EASY, 6–7 ⇒ MEDIUM, 7.5–9 ⇒ HARD). This is a platform product
  decision — **not** an official difficulty taxonomy, **not** a claim that an
  item “is” a Band-N question, and **no** CEFR⇄IELTS numerical equivalence is
  asserted anywhere.
- Future: item facility / discrimination / distractor analysis can be added once
  response data accumulates; schema keeps a free-form `difficultyModel` field.

## 7. Content provenance & copyright

- All practice content is platform-original or user-created:
  `ORIGINAL_GENERATED | OFFICIAL_REFERENCE | USER_CREATED | LICENSED`.
- Official IELTS sample questions are used **only as format reference** (see
  `IELTS_SOURCES.md`); no copyrighted official test material is stored or served.
- Generated content must never be represented as an official IELTS question.
- The following wording is forbidden in serving code and UI:
  "official IELTS score", "certified IELTS examiner", "guaranteed band",
  "official IELTS assessment".
  Required wording: "IELTS-style practice", "estimated band",
  "AI-assisted feedback", "practice estimate".

## 8. Feature status vocabulary (used across code and report)

`IMPLEMENTED | PARTIALLY_IMPLEMENTED | NOT_AVAILABLE | NOT_CALIBRATED | NOT_VERIFIED`

Current: Objective scoring `IMPLEMENTED`; Writing AI assessment `IMPLEMENTED`
(as AI estimate); Speaking preparation coaching `IMPLEMENTED` (no scoring by
design); Speaking assessment & pronunciation scoring `NOT_AVAILABLE`;
listening production audio assets `PARTIALLY_IMPLEMENTED` (platform TTS only);
human calibration `NOT_CALIBRATED`.
