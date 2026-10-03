# IELTS Scoring — Deterministic Contracts

Date: 2026-10-03. Sources: see `IELTS_SOURCES.md` (official IELT organisations pages).

This document defines the platform's **deterministic** scoring behaviour. Anything
non-deterministic (AI writing/speaking assessment) is clearly separated in
`IELTS_ASSESSMENT_GOVERNANCE.md`.

---

## 1. Band scale fundamentals

- Bands are on a **1–9** scale, in **whole or half bands** only (never e.g. 7.13).
- Objective components (Listening, Reading): 40 questions × 1 mark; raw score is
  converted to a band; results reported in whole/half bands.
- Writing task band = average of its four criterion bands (each criterion is a
  whole/half band).
- Writing section band: **Task 2 contributes twice as much as Task 1**:
  `writingBand = roundToHalfBand((task1Band + 2 × task2Band) / 3)`.
- Speaking band = equally weighted average of the four criteria **in the real
  test**. The platform does **not** produce any speaking band: simulated
  examiner dialogue and automated pronunciation/fluency judgement cannot be
  produced honestly, so Speaking is preparation coaching only (phase II,
  2026-10-03). See `IELTS_ASSESSMENT_GOVERNANCE.md` §6.
- Overall band = average of Listening, Reading, Writing, Speaking, rounded per the
  official rule.

### Official rounding rule (verified against official examples)

| Example average | Official reported band |
|---|---|
| 6.25 | 6.5 |
| 3.875 | 4.0 |
| 6.125 | 6.0 |

Rule: if the average ends in **.25 → round up to next half band**; if **.75 →
round up to next whole band**; otherwise round to nearest half.
Implementation: `Math.round((average + Number.EPSILON) * 2) / 2` (verified by
official examples above; see `domain/bands.ts`).

## 2. Raw score → band conversion (versioned configuration)

The official source states the precise number of marks needed for each band
**varies slightly from test version to test version**. Therefore the platform
does **not** hard-code a false universal table. Instead:

```ts
type IELTSScoreConversionTable = {
  id: string;               // e.g. "listening-avg-2026-10"
  testType: 'ACADEMIC' | 'GENERAL_TRAINING';
  component: 'LISTENING' | 'READING';
  version: string;          // e.g. "official-average-2026-10"
  source: string;           // official URL
  sourceKind: 'OFFICIAL_PUBLIC_AVERAGE';
  anchors: Array<{ band: number; marks: number }>;
  notes: string;            // states the exact-cutoff variance caveat
};
```

Anchor values (official averages, checked 2026-10-03):

| Component | Band | Marks |
|---|---|---|
| Listening | 5 | 16 |
| Listening | 6 | 23 |
| Listening | 7 | 30 |
| Listening | 8 | 35 |
| Academic Reading | 5 | 15 |
| Academic Reading | 6 | 23 |
| Academic Reading | 7 | 30 |
| Academic Reading | 8 | 35 |
| GT Reading | 4 | 15 |
| GT Reading | 5 | 23 |
| GT Reading | 6 | 30 |
| GT Reading | 7 | 35 |

### Estimate semantics (no false precision)

`estimateBandFromRawScore(table, rawScore)` returns:

```ts
{
  tableId, component, version, source, sourceKind,
  estimate: true,                       // ALWAYS true — never an exact claim
  scoringMethod: 'DETERMINISTIC_OBJECTIVE', // where this number came from
  minBand,                              // conservative lower bound from anchors
  maxBandExclusive,                     // exclusive upper bound (or 9 inclusive)
  displayRange: "6.5–7.0",              // UI shows a range, never "Band 7.13"
  officialNote: "Precise mark cut-offs vary slightly by test version.",
}
```

Examples: Listening raw 30 ⇒ `[7, 8)` ⇒ display `7.0–7.5`; raw 34 ⇒ same range;
raw 35 ⇒ `[8, 9]`. Below the lowest anchor the platform reports
`below Band {lowestAnchor}` and does not clamp to 0.

## 3. Component and overall combination

- Listening/Reading component band for a **practice subset** is estimated from the
  conversion table only when the practice set covers a full 40-question shape;
  otherwise the platform reports raw score + percentage and marks the band
  estimate as `NOT_COMPARABLE_SUBSET`. This prevents "20/20 = Band 9" illusions.
- Writing: `taskBand = roundToHalfBand(mean(criteriaBands))`; section band per §1.
- Speaking: **no band exists** — the platform offers preparation coaching only
  (no score, no language estimate, no pronunciation judgement). Any code path
  that would produce a speaking band must not exist. See governance doc §6.
- Overall: only produced when all four component bands are available **and** the
  attempt represents a full four-component practice run (with a scored Writing
  task); otherwise `null` with an explicit reason. Never impute missing
  components — and because speaking is never scored, a full four-component
  overall band is currently unreachable in practice.

## 4. Word count semantics (Writing / Speaking transcripts)

`countIeltsWords(text)` policy (tested against the edge cases below):

| Input | Count | Rule |
|---|---|---|
| `well-known` | 1 | Hyphenated words count as **single** words (official) |
| `check-in` | 1 | same |
| `it's` / `they're` | 1 | Contractions count as one word |
| `15` / `1,500` | 1 | Numbers count as one word (figures or words both accepted in answers) |
| `U.S.A.` | 1 | Abbreviations count as one word; internal dots do not split |
| `e.g.` | 1 | same |
| `word — word` (em dash) | 2 | Unicode punctuation separates words |
| `hello\u00A0world` (NBSP) | 2 | Unicode whitespace splits |
| `中文 英文` | 2 | Non-Latin tokens count per whitespace-delimited token |

Rules:
- Split on Unicode whitespace, then treat a token as one word; do **not** split
  on internal hyphen, apostrophe, or abbreviation dots.
- No `text.split(' ').length` shortcuts.
- UI shows: current count, minimum required, warning below minimum — and **no**
  "band penalty" claim; the platform states the official position that a short
  answer may not provide enough evidence for higher bands.

## 5. Word limit validation (completion / short-answer items)

- `wordLimit` is part of the question definition, e.g.
  `{ maxWords: 2, allowsNumber: true }` for "NO MORE THAN TWO WORDS AND/OR A NUMBER".
- Scoring order: **limit check first**; an over-limit answer is `incorrect`
  with `reason: 'WORD_LIMIT_EXCEEDED'` (official: lose the mark).
- `allowsNumber: false` ⇒ an answer that is only a number is over-policy
  (authoring must not create such combinations unless the official instruction
  allows it; validator flags it).
- Hyphenated words count as one word per §4.

## 6. Deterministic answer scoring

**Official item model (enforced by the validator, 2026-10-03 audit):** one
numbered question = one answer = one mark. Official papers number multi-answer
instructions as separate questions (a "Choose TWO letters" item occupies TWO
question numbers), so the platform's validator **rejects** any objective item
carrying more than one answer key (`MC_KEY_COUNT` / `MATCHING_KEY_COUNT` /
`COMPLETION_KEY_COUNT`). Alternative correct forms belong in `acceptedAnswers`
(still a single key). The scorer keeps a defensive all-or-nothing path so an
un-migrated legacy row can never be *over*-credited, but such items cannot be
published.

`scoreIeltsItem(answer, question)` — pure function, no AI:

| Question family | Matching rule |
|---|---|
| Multiple choice | Letter (A/B/C/D…) case-insensitive; full option text accepted **only** on an unambiguous exact normalized match to one option |
| True/False/Not Given | Canonical tokens only: `TRUE\|FALSE\|NOT GIVEN` (+ case-insensitive; `NOTGIVEN`/space/hyphen tolerant) |
| Yes/No/Not Given | `YES\|NO\|NOT GIVEN` (same tolerance) |
| Matching (information/headings/features/sentence endings) | Option code (letter or roman numeral) case-insensitive; option text accepted only on unambiguous exact match |
| Completion / short answer / sentence completion | Normalize → exact compare against key ∪ accepted variants; number words ↔ figures equivalence (`fifteen` = `15`) |
| Plan/map/diagram label completion | Same as completion (+ option-list variants use code matching) |
| Writing / Speaking tasks | `ungradable` by deterministic scorer — routed to AI-assisted assessment (clearly labelled estimate) |

Normalization (deterministic, conservative):
- trim, collapse whitespace, lowercase
- unify apostrophes/quotes/dashes; strip one trailing terminal punctuation mark
- number-word ↔ figure equivalence
- **No stemming, no spell-correction, no synonym expansion** — official IELTS
  penalises incorrect spelling/grammar, and an over-loose normalizer could turn
  an invalid answer into a correct one (forbidden by platform policy).
- Accepted variants must be authored/generated and validated **before
  publication**; they are never invented by an LLM at scoring time.

Client-submitted correctness claims are **always ignored**; scoring is
server-side only (`ielts-server-deterministic`).

## 7. Scoring provenance & audit

Every scored response stores:
`scoredBy: 'ielts-server-deterministic'`, word count where applicable, limit
exceeded flag, and the conversion table id/version when a band estimate is
derived. Band estimates always carry `estimate: true` and the official caveat.
