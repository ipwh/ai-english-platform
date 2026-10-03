# IELTS Sources Registry

Date checked: **2026-10-03** (all entries checked on this date unless noted).
Rule: official IELTS/Cambridge sources take precedence over all third-party
material. Third-party resources are pedagogical references only and never
override official specifications.

| # | Source | Type | URL | Implementation decision supported |
|---|---|---|---|---|
| 1 | IELTS sample test questions (hub: Academic / General Training / Life Skills) | OFFICIAL | https://www.ielts.org/take-a-test/preparation-resources/sample-test-questions | Question type inventory; format reference only (no official material copied) |
| 2 | IELTS Academic Reading format | OFFICIAL | https://www.ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-reading | Academic Reading: 60 min, 3 sections, 40 Q, 2150–2750 words; 11 question types; T/F/NG vs Y/N/NG semantics; word-limit + hyphenation rules |
| 3 | IELTS General Training Reading format | OFFICIAL | https://www.ielts.org/take-a-test/test-types/ielts-general-training-test/ielts-general-training-format-reading | GT Reading: 60 min, 3 sections, 40 Q, 2150–2375 words; Section 1–3 text characteristics; 8 question types; spelling/grammar loses marks |
| 4 | IELTS Academic Writing format | OFFICIAL | https://www.ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-writing | Academic T1 (visual description ≥150 w) / T2 (discursive ≥250 w); four criteria; Task 2 twice as much; no notes/bullets; plagiarism penalty |
| 5 | IELTS General Training Writing format | OFFICIAL | https://www.ielts.org/take-a-test/test-types/ielts-general-training-test/ielts-general-training-format-writing | GT T1 = letter (≥150 w, three bullet points, register by audience, no addresses); GT T2 = semi-formal/neutral essay (≥250 w) |
| 6 | IELTS Listening format | OFFICIAL | https://www.ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-listening (+ GT variant) | Listening: ~30 min, 4 parts × 10 Q; part characteristics; heard once; 6 question types; word-limit + hyphenation rules |
| 7 | IELTS Speaking format (Academic or GT — identical) | OFFICIAL | https://www.ielts.org/take-a-test/test-types/ielts-general-training-test/ielts-general-training-format-speaking | Speaking: 11–14 min, 3 parts; Part 1 4–5 min, Part 2 1 min prep + up to 2 min, Part 3 4–5 min; four criteria equally weighted; pronunciation = understood without too much effort |
| 8 | IELTS scoring in detail | OFFICIAL | https://www.ielts.org/take-a-test/your-results/ielts-scoring-in-detail | Band scale 1–9 (whole/half); overall = average of 4 sections rounded .25↑ / .75↑; 40 Q × 1 mark; anchor marks per band (Listening 5:16/6:23/7:30/8:35; Academic Reading 5:15/6:23/7:30/8:35; GT Reading 4:15/5:23/6:30/7:35); precise cutoffs vary by test version; Writing four criteria + Task 2 weighting; Speaking four criteria equal weight |
| 9 | IELTS Writing Band Descriptors (public PDF) | OFFICIAL | https://ielts.org/cdn/Guides/ielts-writing-band-descriptors.pdf | Criterion-level descriptor structure for bands 0–9 (Task 1 + Task 2 variants); basis of criterion-specific AI prompt design (`IELTS_WRITING_TASK*_V1`) |
| 10 | IELTS Speaking Band Descriptors (public PDF) | OFFICIAL | https://ielts.org/cdn/ielts-guides/ielts-speaking-band-descriptors.pdf | Criterion-level descriptor structure for the four speaking criteria (bands 0–9); basis of the **preparation teaching descriptors** (`speaking/criteria.ts`). The platform does not produce speaking bands (2026-10-03 II) |
| 11 | IELTS Speaking Key Assessment Criteria (public PDF) | OFFICIAL | https://ielts.org/cdn/Guides/ielts-speaking-key-assessment-criteria.pdf | What examiners consider per criterion (fluency/coherence; lexical resource; grammar; pronunciation as intelligibility) |
| 12 | IELTS Writing Key Assessment Criteria (public PDF) | OFFICIAL | https://ielts.org/cdn/Guides/ielts-writing-key-assessment-criteria.pdf | What examiners consider per writing criterion; register/purpose focus for GT letters |
| 13 | Cambridge English — IELTS test format | OFFICIAL (partner) | https://www.cambridgeenglish.org/exams-and-tests/ielts/test-format/ | Cross-check of component structure and timing |
| 14 | IELTS.org — organisations: understanding IELTS scoring | OFFICIAL | https://ielts.org/organisations/ielts-for-organisations/understanding-ielts-scoring | Supplementary scorer guidance; used to confirm Task 2 weighting statement |

**Audit re-verification (2026-10-03).** During the 2026-10-03 engineering audit
the Academic Writing format, General Training Writing format and Academic test
format pages (rows #4/#5, academic test outline) were re-fetched live and their
facts re-confirmed against this registry: 60 min / 2 tasks; Task 2 counts twice;
four criteria (Task Achievement/Response, Coherence & Cohesion, Lexical
Resource, Grammatical Range & Accuracy); Task 1 ≥150 words / ~20 min; Task 2
≥250 words / ~40 min; short answers "may not provide enough evidence of the
language features needed in order to award higher bands" — mirrored verbatim in
`word-count.ts` `officialNote`. Off-topic, note/bullet-form and plagiarism
penalties are documented boundaries the platform never claims to reproduce
mechanically (no partial-credit invention, no automated plagiarism verdicts).

A second re-fetch (same day) confirmed the Listening format, Speaking format and
**scoring in detail** pages: Listening ~30 min / 4 parts × 10 Q / **heard once
only** / questions follow the recording order / **contracted words are not
tested** (now enforced: `LISTENING_CONTRACTION_KEY`) / over-limit answers lose
the mark / hyphenated words count as single words; Speaking 11–14 min, three
parts, Part 1 4–5 min, Part 2 1-min preparation + 2-min turn (3–4 min total),
Part 3 4–5 min, four equally-weighted criteria; overall band = average of four
sections with **.25 ↑ next half / .75 ↑ next whole** (official examples A
6.25→6.5, B 3.875→4.0, C 6.125→6.0 — mirrored in `roundToHalfBand` tests);
section anchors Listening 5:16/6:23/7:30/8:35 · Academic Reading
5:15/6:23/7:30/8:35 · GT Reading 4:15/5:23/6:30/7:35 — identical to
`IELTS_CONVERSION_TABLES`; Writing criteria equally weighted within a task with
**Task 2 carrying more weight**; Reading variants share one scale while GT
usually requires more correct marks. No conversion-table change was needed.

## Source usage rules

1. **No copying**: official sample questions/passages/scripts are reference only.
   All served content is `ORIGINAL_GENERATED` or `USER_CREATED`.
2. **No false equivalence**: the platform never claims to be official IELTS or a
   certified examiner; UI wording requirements are stated in
   `IELTS_SPECIFICATION.md` §7.
3. **Versioned conversion**: the raw-score→band anchors (§8) are stored as a
   versioned `IELTSScoreConversionTable` with `source` + `sourceKind`
   (`OFFICIAL_PUBLIC_AVERAGE`). Because the official source states the precise
   number of marks per band varies by test version, conversions are reported as
   **ranges/estimates**, never as exact universal cutoffs.
4. **Re-check cadence**: if any source above changes, re-review the affected
   implementation decision and note it here with a new date row.

## Out of scope (avoids unsupported claims)

- No claim of validated automarking accuracy (IELTS publishes no per-response
  automarking equivalence data for our platform).
- No claim that AI band estimates equal examiner bands. Human evidence state is
  `INSUFFICIENT` and marker equivalence is `UNPROVEN`
  (`IELTS_ASSESSMENT_GOVERNANCE.md`).

## Third-party pedagogical references (PATTERN-ONLY; checked 2026-10-03)

These are secondary learning-method sources. They are **never** authoritative,
their recalled questions are **unverified**, and **no content is copied** from
them into the platform. They inform *technique teaching* and *task shaping* only
(see `IELTS_PRACTICE_PATTERNS.md`).

| # | Source | Type | URL | What it legitimately informs |
|---|---|---|---|---|
| T1 | openIELTS (mcxiaoxiao) — 0-cost IELTS study plan, notes & prompts | THIRD_PARTY (GitHub, pattern-only) | https://github.com/mcxiaoxiao/openIELTS | Study-loop structure; Part 2 four-quadrant note grid + tense flags; 串題 story-merging method; anti-memorisation practice; listening/reading/writing technique notes; raw-score table used only as cross-check (platform uses official anchors) |
| T2 | IELTS Online Tests — exam library (speaking / writing / reading / listening) | THIRD_PARTY (pattern-only) | https://ieltsonlinetests.com/zh-hans/ielts-exam-library?skill=speaking (and writing/reading/listening variants) | Confirms seasonal question-bank rotation and four-skill practice-library structure (mock test → section practice) |
| T3 | IELTS Online Tests — recent speaking question-bank pages (Part 2 category summaries: 人物 / 地点 / 物品 / 事件) | THIRD_PARTY (pattern-only) | e.g. https://ieltsonlinetests.com/zh-hans/speaking-recent-actual-tests/18886159.html , /18885455.html , /18885223.html , /18885073.html | Cue-card taxonomy (People/Places/Objects/Events) and typical cue topics used to shape ORIGINAL platform cue cards; preparation advice themes (detail, logic, fluency) |
| T4 | Threads @judy.ielts — free speaking question-bank promo post | THIRD_PARTY (promotional; content not retrievable — login wall) | https://www.threads.com/@judy.ielts/post/DKD6_gKSb9V/ | Confirms seasonal speaking-bank distribution culture; **no content used** |
| T5 | BaixuanLi/IELTS-Prompt (writing scoring prompt template, referenced by T1) | THIRD_PARTY (method reference) | https://github.com/BaixuanLi/IELTS-Prompt | Prompt-design ideas only; platform band descriptors summarised from OFFICIAL PDFs, not from this template |

## Local study materials — `materials/IELTS/` (pattern reference only)

These books were reviewed locally (2026-10-03) to distil **format-level
patterns** for AI generation and teaching. **No passages, questions, options,
keys, transcripts or band comments from these books are stored in code, prompts
or the database, and the PDFs are excluded from the deployment image**
(`.dockerignore`: `materials/**/*.pdf`, `materials/_extracted/`). Text
extraction (`materials/_extracted/`) exists only in the local dev workspace.

| # | Material | Type | What it legitimately informs |
|---|---|---|---|
| M1 | Cambridge IELTS 21 Academic (practice tests with answers) | COMMERCIAL (pattern-only) | Question-set composition blueprints per reading passage (completion+T/F/NG → matching information/headings → Y/N/NG+MC+summary) and per listening part; official instruction phrasings; writing task scaffolding ("You should spend about X minutes…", "Give reasons…", bullet letters); confirmation that "Choose TWO letters" occupies TWO numbered questions (platform: one answer per item) |
| M2 | Crack IELTS Reading (question-type techniques) | COMMERCIAL (pattern-only) | Reading question-type strategy framing used in teaching copy; reinforces skim/scan-first workflow, keyword prediction, and the TRUE-vs-NOT-GIVEN distinction taught in the generation prompt |
| M3 | Mastering the IELTS test 2024 (comprehensive guide) | COMMERCIAL (pattern-only) | Exam-day/format framing, timing guidance, and criterion vocabulary used to sanity-check platform teaching copy |

The distilled patterns live in `src/modules/ai/prompts/ielts/materials-reference.ts`
(blueprints, instruction phrasings, writing scaffolding — all original
platform-written text) and in `IELTS_PRACTICE_PATTERNS.md`.

Additional obligations in `IELTS_PRACTICE_PATTERNS.md` §0 (no ingestion; no recall
claims; anti-memorisation; official precedence). IELTS is a registered trademark;
none of these sources imply any endorsement of this platform.
