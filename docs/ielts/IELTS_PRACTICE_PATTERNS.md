# IELTS Practice Patterns — Third-Party Reference Digest

Date: 2026-10-03 (II) · Status: **PATTERN REFERENCE ONLY — NOT SERVED CONTENT**

This document distils *techniques and question taxonomies* observed in public
IELTS preparation resources (see `IELTS_SOURCES.md` §Third-party). It exists to
make the platform's AI-generated preparation material and AI-assisted marking
**closer to real IELTS task shapes**.

Hard rules applied when using this digest:

1. **No content ingestion.** Recalled/observed test questions are third-party,
   unverified and potentially copyrighted. Nothing from those sites is copied
   into the platform; every platform prompt/model item is ORIGINAL English text
   written for this platform, only *shaped* like real tasks.
2. **Official sources remain authoritative** (formats, criteria, word limits,
   scoring) — this digest only informs pedagogy and task variety.
3. **Recall accuracy is unverified.** "Recent actual test" question banks reflect
   test-taker recall, not official releases; they must never be quoted as
   confirmation that "this exact question will appear".
4. **Anti-memorisation** (official guidance + third-party consensus): memorised
   answers/templates are penalised in Speaking and Writing; the platform teaches
   *methods and language*, never fixed scripts to recite.

---

## 1. Speaking — what the test banks look like

### 1.1 Seasonal rotation (换题月)

- Question banks rotate roughly every four months (**January / May / September**
  cycles; e.g. "Jan–Apr", "May–Aug", "Sep–Dec" sets).
- Preparation implication: cover *topic families broadly* rather than memorise a
  single season's list; build transferable stories (see §1.4 串題).

### 1.2 Part 1 — recurring theme inventory (pattern)

Common Part 1 themes observed across banks (platform uses its own question wording):

`work/study · hometown · home/accommodation · daily routine · free time/hobbies ·
weekends · music · films/TV · reading · food/cooking · weather/seasons ·
technology/phones · social media · photos · shopping · transport · sports ·
festivals · gifts · friends · neighbours · childhood`

Typical question shapes: *Do you…? / How often…? / Did you…when you were
younger? / Would you…in the future? / What kind of…do you like? / Why do you
think…?*

### 1.3 Part 2 — cue card taxonomy (4 macro-categories)

Observed in the biggest public banks as **人物 People / 地点 Places /
物品事物 Objects & things / 事件 Events & experiences** (plus activities):

| Category | Typical cue cards (pattern, NOT copied) |
|---|---|
| People | an interesting older person; someone you enjoy talking with; a person you would like to study/work with; a helpful/popular person; a neighbour; someone you met at a party |
| Places | a place to relax at home; a noisy place; an ideal house; a city you briefly stayed in; a new shop; an outdoor sport place; somewhere you visited that left an impression |
| Objects/Things | a piece of clothing you often wear; a novel you re-read; an invention; a childhood game; a useful website; a difficult-to-use tech product; an expensive gift you would like to give; a skill you want to learn |
| Events/Experiences | a time you made an important decision; getting lost; a car journey; a speech you gave; a time you complained; something you are proud of; a happy childhood memory; a first day at school; an occasion when you were late |

Cue card format pattern (platform mirrors the *shape*, not the text):

> Describe **<target>**. You should say: **<4 facets>** and explain **<why/how>**.

### 1.4 Techniques worth teaching (method, not script)

1. **Part 2 one-minute note grid (四宮格筆記法)** — draw a cross into 4 quadrants;
   fill the four "You should say" facets in Z order; join parallel ideas with `&`,
   stack cause→effect vertically; mark each cell by time frame **P / N / F**
   (past / now / future). Trains fast, organised note-taking — NOT a memorised script.
2. **串題 (one story, many cards)** — build 2–3 rich *personal* experience
   stories; practise re-aiming the same story at several cue cards by emphasising
   the facet the card asks about. Reduces preparation load; must stay honest
   (your real experiences) and be re-phrased each time so it never sounds recited.
3. **Recording loop (自錄自聽)** — record on your device, listen back for: wasted
   repetition, missing connectors, tense slips, and places where one more detail
   would extend the answer. The platform does not analyse the audio; the loop is
   a self-check method.
4. **Part 3 question functions** — most Part 3 questions do one of:
   compare/contrast, opinion + justification, prediction/future, cause, solution,
   society-level generalisation, speculation. Good preparation = practising the
   *function*, not the specific question. Useful spine: **Answer → Reason →
   Example → (Counterpoint)**.
5. **Extension habits for Part 1** — answer + reason + mini-example; avoid
   one-word answers and avoid over-long speeches (4–6 sentences typical).

### 1.5 What the platform explicitly does NOT do (product decision)

- No simulated examiner conversation (no fake human dialogue).
- No automated Speaking band/scoring (not shown anywhere).
- No pronunciation judgement (no acoustic analysis; accent is never graded here).
- Instead: **preparation coaching** — methods, original topic banks, note-grid
  and story-mapping tools, language functions, pitfalls, follow-up practice
  questions, self-check lists. See `IELTS_ASSESSMENT_GOVERNANCE.md` §6.

---

## 2. Writing — task-type shapes (used to align AI marking)

### 2.1 Task 2 question types (pattern matrix)

| Type | Typical instruction phrasing | Response obligations the marker checks |
|---|---|---|
| Opinion (agree/disagree) | "To what extent do you agree or disagree?" / "Do you agree or disagree?" | A clear position throughout + justified reasons; not necessarily both sides |
| Discuss both views (+ opinion) | "Discuss both views and give your own opinion." | BOTH views discussed + own opinion stated; balanced development |
| Advantages & disadvantages | "Do the advantages outweigh the disadvantages?" / "Discuss advantages and disadvantages." | Both sides + (if asked) a judgement |
| Problem–solution | "What problems…? What solutions…?" / "What can be done about…?" | Problems AND measures; links between them |
| Two-part question | Two related questions (reasons… and measures… / opinion… and explanation) | BOTH questions answered and developed |
| Positive/negative development | "Is this a positive or negative development?" | A stance + development |
| Direct question(s) | "Why…? Is this a good thing?" | Every question answered |

Platform implementation: `classifyWritingTask2()` + `describeTaskTypeExpectations()`
in `writing/criteria.ts`; the classified type and obligations are passed into the
AI assessment prompt so Task Response marking checks the RIGHT obligations
(e.g. "discuss both views" demands both views; a two-part question demands both
answers) instead of a generic checklist.

### 2.2 GT Task 1 letter types (register is task-determined)

`request · complaint · apology · invitation/thanks · application · explanation/
information`. Marker expectations passed to the prompt: cover the three bullet
points; pick register (person, semi-formal, formal) from the *stated audience*;
letter conventions (greeting/closing); **no addresses required** (official).

### 2.3 Academic Task 1 visual types

`line graph · bar chart · pie chart · table · mixed charts · process/flow
diagram · map`. Expectations: overview of main features, selected key data,
comparisons, no invented data; maps/processes use appropriate positional/
sequence language (third-party notes confirm examiners reward a clear overview).

### 2.4 Checklists distilled from third-party notes (teaching use)

- Reserve ~5–10 minutes to check tense agreement, articles, singular/plural,
  spelling and punctuation (affects Coherence/Lexical/Grammar).
- Punctuation that supports meaning counts toward coherence.
- Copy the task line accurately if embedding the prompt; do not misquote it.
- Positional preposition precision (e.g. `to the south of`, `on the coast`) for maps.

---

## 3. Reading — technique digest

- **Question-order behaviour**: most question types run in passage order; T/F/NG
  and Y/N/NG are ordered too; matching types are NOT — collect their keywords and
  answer them opportunistically while reading sequentially (parallel reading).
- **T/F/NG semantics reminder** (official): FALSE contradicts the passage;
  NOT GIVEN is neither supported nor contradicted — and must not be answered from
  outside knowledge. (Platform validator already enforces evidence spans + QA flags.)
- **Completion exactness**: take words from the text; singular/plural follows the
  passage ("所看即所得"); do not repeat words already given around the gap.
- **Time strategy** observed as useful: roughly 15/20/25 minutes across
  increasing difficulty; never let one hard passage consume the section.
- Platform caution: our own passages are ORIGINAL; techniques are taught as
  method, and band estimates remain range estimates only.

## 4. Listening — technique digest

- **Preview + predict**: read questions before each part; identify what kind of
  answer is needed (name/number/price/time) and predict singular/plural using
  articles/quantifiers already printed in the question (`a`→singular; `many`→plural).
- **Paraphrase awareness**: question wording rarely matches the audio verbatim;
  train signals ("become more interesting" ↔ "was boring before").
- **Single play discipline**: if an answer is missed, immediately re-anchor to the
  next question — cascading loss is the most common failure.
- **Answer format conventions** (platform scoring honours these):
  dates `25 November` / `25.11.2020`; times `5.30 pm`; thousands `321,000`;
  case-insensitive matching; hyphenated words count as one word.
- Platform usage: these techniques are taught in the patterns digest; the
  deterministic scorer already implements the format/hyphen/number rules.

---

## 5. How this digest is used in code

| Area | Implementation | Guardrail |
|---|---|---|
| Speaking preparation | `speaking/topic-bank.ts` (original prompts), `speaking/strategies.ts` (methods incl. note-grid & 串題), AI prep coach (`prepareIeltsSpeakingWithAI`) | No scoring fields; anti-memorisation instruction; no examiner simulation |
| Writing marking | `classifyWritingTask2()`, `classifyGeneralLetterType()`, extended `extractTaskRequirements()`; obligations injected into the assessment prompt | AI still cannot award a task band; server computes it; evidence quotes still verified |
| Listening/Reading teaching | Technique copy in UI/report only; no content ingestion | Original practice content only |
| Sources hygiene | `IELTS_SOURCES.md` third-party section labels each source as pattern-only | Never quoted as proof a question will appear |
| AI question generation (2026-10-03 IV) | `generation-service.ts` + `ai/prompts/ielts/{question-generation,materials-reference}.ts`: set blueprints, instruction phrasings and writing scaffolding distilled from official-format patterns (incl. local materials M1–M3) | Machine screen + independent blind-solve verification + QA_REQUIRED ceiling; dropped/undeliverable items are reported, never delivered; AI never publishes |
| Materials-derived exemplars | `ai/prompts/ielts/materials-reference.ts` — blueprints and functional instruction wording only; every example is platform-original | Books' passages/questions/keys are never stored or served; PDFs excluded from the deployment image |
