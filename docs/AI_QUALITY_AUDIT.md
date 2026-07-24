# AI Quality Audit
> Platform v1.0 — Post-Sprint 102.5  
> Generated: 2026-07-24  
> Based on: actual implementation inspection (read-only)

---

## 1. Execution Flow

### Full AI Request Lifecycle

Every AI request follows this execution path. Here is the actual call chain with real files and function names:

```
┌─────────────────────────────────────────────────────────────┐
│ ROUTE LAYER (src/app/api/...)                               │
│   ai/generate-questions/route.ts → POST handler             │
│   ai/analyze-writing/route.ts → POST handler                │
│   ai/analyze-answer/route.ts → POST handler                 │
│   reading/route.ts → POST handler (handleLegacyGeneration,  │
│                       handleExerciseGeneration,              │
│                       handleAnswerAnalysis)                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│ FACADE (src/modules/ai/services/ai-service.ts)              │
│   Pure re-export hub. No business logic.                    │
│   export { generateQuestions } from '../usecases/...'       │
│   export { analyzeAnswer } from '../usecases/...'           │
│   export { analyzeWriting } from '../usecases/...'          │
│   export { callLLM } from './llm-call'                      │
│   export { sanitizeForAI } from './sanitizer'               │
│   export { isAIConfigured, getLastAIProvider, ... }         │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│ USECASE LAYER (src/modules/ai/usecases/)                    │
│   ┌─ generateQuestions(input) → GeneratedQuestion[]         │
│   │    Steps:                                               │
│   │    1. Build system prompt (DSE topic DB + skill rules)  │
│   │    2. DSE RAG: retrievePastPaperContent() +             │
│   │       retrieveMarkingScheme() (if enabled)              │
│   │    3. Call callLLM() with prompt + DSE context          │
│   │    4. MAX_RETRIES=2 loop with topic changes on retry    │
│   │    5. parseGeneratedQuestions() → parseAIJSON()         │
│   │    6. normalizeGeneratedQuestions() → cleanup + filter  │
│   │    7. validateAIResponse(GeneratedQuestionsArraySchema) │
│   │    8. validateAndFixQuestion() per question             │
│   │    9. validateListeningConsistency() (if listening)     │
│   │    10. Reading content length check (if reading)        │
│   │    11. JSON repair fallback if parse fails              │
│   │    12. DSE topic validation (informational only)        │
│   │    Retry trigger: count < expected OR critical failures │
│   │                     OR listening consistency fails >50% │
│   │    Used by: /api/ai/generate-questions                  │
│   │                                                        │
│   ├─ analyzeAnswer(input) → AnswerAnalysis                  │
│   │    Steps:                                               │
│   │    1. DSE RAG: retrieveMarkingScheme() (if enabled)     │
│   │    2. Build system prompt with HKDSE descriptors        │
│   │    3. Sanitize student answer via sanitizeForAI()       │
│   │    4. Call callLLM() with prompt + context              │
│   │    5. parseAIJSON<AnswerAnalysis>()                     │
│   │    6. validateAIResponse(AnswerAnalysisSchema)          │
│   │    7. MC: force score = isCorrect ? 100 : 0             │
│   │    Used by: /api/ai/analyze-answer                      │
│   │                                                        │
│   ├─ analyzeWriting(input) → WritingAnalysis                │
│   │    Steps:                                               │
│   │    1. DSE RAG: retrieveMarkingScheme('Writing', 3)      │
│   │    2. Two parallel LLM calls:                           │
│   │       Call 1: Grammar + Chinglish + CLO scores          │
│   │         (CLO 0-7 per dimension, retry x2 if fails)     │
│   │       Call 2: Style + vocabulary + structure + revised  │
│   │    3. Each call: parseAIJSON() independently            │
│   │    4. Merge results; allow partial failure              │
│   │    5. Deterministic length penalty (ratio-based)        │
│   │    6. DSE Level mapping from CLO total                  │
│   │    7. Rule-based Chinglish detection (supplement)       │
│   │    8. Filter false positives (original===correction)    │
│   │    9. validateAIResponse(WritingAnalysisSchema)         │
│   │    Used by: /api/ai/analyze-writing                     │
│   │                                                        │
│   └─ explainMistake / analyzeProgress / analyzeWord /       │
│      answerStudyHelp  (similar pattern: prompt→callLLM→     │
│      parseAIJSON→validate)                                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│ PROVIDER LAYER (src/modules/ai/providers/)                  │
│   providerRegistry.call(messages, options?)                 │
│   Priority chain: DeepSeek → Vertex Gemini → Gemini API →   │
│                   Claude → OpenAI                           │
│   Each provider: provider.call(messages, options?)          │
│   Returns: ProviderCallResult { text, provider, latencyMs } │
│   Circuit breaker: 5 failures → open (30s) → half-open      │
│                    (2 successes → closed)                    │
│   Used by: callLLM() in llm-call.ts                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│ POST-PROCESSING PIPELINE                                    │
│   1. parseAIJSON<T>(raw) — json-utils.ts                    │
│      5 strategies: direct→balanced→object pattern→array     │
│      pattern→repair truncation                              │
│   2. validateAIResponse(schema, data) — ai-schema.ts        │
│      Zod schema validation with stripNulls() pre-processing │
│   3. normalizeGeneratedQuestions() — question-normalizer.ts │
│      Choice cleanup, banned pattern filtering, answer fix   │
│   4. validateAndFixQuestion() — question-validator.ts        │
│      MCQ answer→letter, choice quality, content checks      │
│   5. validateListeningConsistency() — listening-normalizer  │
│      Dialogue format, answer-in-content, time format checks  │
│   6. sanitizeForAI() — sanitizer.ts                         │
│      HKID/phone/email removal, prompt injection filter      │
└─────────────────────────────────────────────────────────────┘
```

### Key Timing & Fallback Points

| Stage | Fallback | Retry |
|-------|----------|-------|
| `callLLM()` | Provider chain fallback (5 providers) | Via `executeWithRetry()` in retry.ts |
| `parseAIJSON()` | 5-strategy parsing cascade | Triggers JSON repair LLM call in generateQuestions |
| `parseAIResponse()` | Attempts repair → returns error | Caller decides |
| `validateAIResponse()` | Returns `{ success: false, error }` | Caller throws or handles |
| `generateQuestions` | 2-retry loop with new topics | Falls through to JSON repair stage |

---

## 2. Question Generation

**File**: `src/modules/ai/usecases/generate-questions.ts` (lines 1-707)

### Main Execution Steps

1. **Input Processing**: Parse `GenerateQuestionsInput` (count, skill, difficulty, gradeLevel, topic, questionType)
2. **Prompt Construction**: Build ~400-line system prompt with DSE empirical topic database, HKDSE level descriptors, skill-specific rules (Listening/Reading/Writing/Speaking)
3. **DSE RAG** (optional): Retrieve past paper chunks + marking schemes if `isDSERAGEnabled()`
4. **Primary Generation**: `callLLM()` with system + user prompt, temperature 0.45-0.7, jsonMode=true, timeoutMs=25000
5. **Retry Loop** (MAX_RETRIES=2): On count < expected or critical failures → retry with new random topic + lower temperature
6. **JSON Repair** (fallback): If primary + retries fail JSON parse → call LLM with "format repair" prompt (temperature=0)
7. **Normalization**: `normalizeGeneratedQuestions()` → choice cleanup, banned pattern filtering, answer fixing
8. **Validation**: `validateAIResponse(GeneratedQuestionsArraySchema)` → Zod schema check
9. **Per-Question Fix**: `validateAndFixQuestion()` → MCQ answer→letter mapping, listening content checks, reading keyword checks
10. **Listening QA**: `validateListeningConsistency()` → dialogue format, answer-in-content verification
11. **Reading QA**: Check readingContent length ≥ 50 chars
12. **DSE Topic Check** (info only): `validateDSEtopicMatch()` logs warning if low match

### Validations Performed
- Zod schema: type enum, prompt min 1, answer min 1, explanationZh/En min 1, commonMistake min 1
- Question count matches request
- Listening: dialogue format, speaker labels, answer verbatim in content
- Reading: content length ≥ 50 chars
- MCQ: answer is valid letter A-D, choices count = 4
- Choice quality: no banned patterns, no time fragments, no "All of the above"

### Normalizations Performed
- Choice prefix stripping (A./B./1./etc.)
- Choice deduplication
- Banned pattern filtering (from mcq-filters.ts)
- Time fragment filtering
- Choice count enforcement (fallback fillers if < 2 valid)
- Listening content speaker label normalization
- Multi-role line splitting

### Repairs Performed
- Answer→letter mapping: text answer matched to choice index
- Listening content: split multi-role single lines, sanitize speaker labels
- JSON: truncated JSON repair, balanced extraction, markdown code block removal

### Retry Conditions
1. Generated count < requested count
2. Listening consistency: errors ≥ 50% of questions
3. Reading: insufficient content ≥ 50% of questions

### Regenerate Conditions
- Retry loop changes: different random topic, lower temperature (0.3 minimum)

### Output Schema
```typescript
GeneratedQuestion[] = {
  type: 'mc'|'fill-blank'|'error-correction'|'short-writing'|'matching',
  prompt: string, promptZh?: string,
  choices: string[], answer: string,
  explanationZh: string, explanationEn: string,
  commonMistake: string, grammarPoint?: string,
  listeningContent?: string, listeningContentZh?: string,
  readingContent?: string, readingContentZh?: string
}[]
```

### Where Failures Can Still Escape
- JSON parses but schema passes with hallucinated content (valid shape, wrong facts)
- Listening: synonyms/paraphrase mismatch (v2.1 downgraded to warnings)
- Reading: keyword-level check only, doesn't verify semantic correctness
- No answer accuracy verification beyond schema validation
- Retry loop exits after 2 attempts regardless of quality

---

## 3. Question Validator

**File**: `src/modules/ai/services/question-validator.ts` (lines 1-197)

### Validation Rules

| # | Rule Name | Purpose | Function | Used By |
|---|-----------|---------|----------|---------|
| 1 | `mcq-answer-valid-letter` | MCQ answer must point to valid choice index | `validateAndFixQuestion()` L91-106 | question-normalizer, ai-service |
| 2 | `mcq-answer-text-match` | Match text answer to choice text, convert to letter | `normalizeMcqAnswer()` L48-79 | question-normalizer |
| 3 | `mcq-answer-number-match` | Convert digit answer (1-4) to letter (A-D) | `normalizeMcqAnswer()` L55 | question-normalizer |
| 4 | `mcq-answer-tf-match` | Match T/F/True/False to TF-labelled choices | `normalizeMcqAnswer()` L64-68 | question-normalizer |
| 5 | `choice-fragment-check` | Detect number/time fragments in choices | `validateAndFixQuestion()` L109-114 | question-normalizer |
| 6 | `choice-dse-compat` | Reject "All of the above" choices (not DSE format) | `validateAndFixQuestion()` L115-119 | question-normalizer |
| 7 | `listening-answer-presence` | Answer text must appear in listeningContent | `validateAndFixQuestion()` L122-141 | question-normalizer |
| 8 | `reading-keyword-presence` | Answer keywords should appear in readingContent | `validateAndFixQuestion()` L144-157 | question-normalizer |
| 9 | `answer-letter-bounds` | Letter index must be within choices array bounds | `validateAndFixQuestion()` L95 | question-normalizer |
| 10 | `listening-verbatim-check` | Exact match check (v2.1: downgraded to warning for synonym tolerance) | `validateAndFixQuestion()` L136 | question-normalizer |

### Key Functions

| Function | Purpose | Input | Output |
|----------|---------|-------|--------|
| `stripMcqPrefix(choice)` | Remove A./1./T:/F: prefixes | `"A. option text"` | `"option text"` |
| `normalizeMcqAnswer(answer, choices)` | Convert any answer format to A-D letter | answer string + normalized choices | `"A"`-`"D"` |
| `normalizeAnswer(text)` | Normalize text for comparison | raw text | lowercased, whitespace-collapsed |
| `validateAndFixQuestion(q, index)` | Full validation + auto-fix | ValidatableQuestion + index | `{ fixed, warnings, rejected }` |
| `toMcqLetter(index)` | Index to letter | `0-3` | `"A"`-`"D"` |

### Listening Answer Check Detail
- For MCQ: resolves answer letter to choice text, then checks presence
- Uses normalized comparison (lowercase, whitespace collapsed)
- Falls back to last-2-words and last-3-words check if full answer not found
- v2.1: Failure is logged as WARNING, not rejection (synonyms/paraphrase allowed)

---

## 4. Question Normalizer

**File**: `src/modules/ai/services/question-normalizer.ts` (lines 1-149)

### Normalization Pipeline (in order)

| # | Function | Purpose | Input | Output |
|---|----------|---------|-------|--------|
| 1 | Field trimming | Trim all string fields | Raw AI output | Cleaned strings |
| 2 | `normalizeListeningContent()` | Speaker label normalization | Raw dialogue | Formatted dialogue |
| 3 | `stripMcqPrefix()` per choice | Remove A./1./T: prefixes | `["A. text"]` | `["text"]` |
| 4 | Choice deduplication | `Array.from(new Set(...))` | Duplicate choices | Unique choices |
| 5 | Punctuation addition | Add "." to likely-sentence choices | Sentence fragments | Punctuated sentences |
| 6 | Choice length filter | Remove choices < 3 chars | Short fragments | Filtered |
| 7 | Numeric fragment filter | Remove bare digit-only choices < 6 chars | `"30"`, `"00"` | Removed |
| 8 | `BANNED_PATTERNS` filter | Remove banned patterns (All of above, etc.) | Banned choices | Removed |
| 9 | `TIME_FRAGMENT_PATTERNS` filter | Remove time fragments (non-listening only) | `"00 PM"`, `"30 PM"` | Removed |
| 10 | Fallback filler injection | Add generic options if < 2 valid choices | Insufficient choices | Padded to 4 |
| 11 | `normalizeMcqAnswer()` | Convert answer to letter | Mixed answer formats | `"A"`-`"D"` |
| 12 | `validateAndFixQuestion()` | Final validation pass | Normalized question | Validated question |
| 13 | Non-MC empty answer check | Reject non-MC with empty answer | Empty answer | Rejected |

### Repair Logic
- Insufficient valid choices → inject fallback fillers from `getFallbackFillers(isListening, isReading)`
- MCQ answer not matching choices → `normalizeMcqAnswer` resolves text→letter
- Type coercion: `q.choices` forced to array, string fields trimmed

---

## 5. Listening Normalizer

**File**: `src/modules/ai/services/listening-normalizer.ts` (lines 1-215)

### Consistency Checks

| Check | What It Validates | Errors | Warnings |
|-------|-------------------|--------|----------|
| Dialogue line count | ≥ 2 non-empty lines | ❌ Error, triggers retry | — |
| Speaker format | Lines must match `^(Woman|Man|Boy|Girl)\s*:\s*(.+)$` | ❌ Error (dev only) | — |
| Speaker whitelist | Only Woman/Man/Boy/Girl allowed | ❌ Error (dev only) | — |
| Quote characters | No `"` or `'` in lines | ❌ Error (dev only) | — |
| Empty dialogue | Speaker with no text | ❌ Error (dev only) | — |
| Excessive blank lines | blank lines > dialogue lines | ❌ Error (dev only) | — |
| Answer-in-content | MCQ answer text present verbatim in listeningContent | ❌ Error, triggers retry | — |
| Time format | Numeric `HH:MM` in content | — | ⚠️ Warning |
| Choice time format | Numeric time in choices | — | ⚠️ Warning |
| Short choices | Choice < 3 chars | — | ⚠️ Warning |
| Bare clock word | `"o'clock"` as standalone choice | — | ⚠️ Warning |
| Mixed digit+word | `"3 o'clock"` in content | — | ⚠️ Warning |

### Repairs Performed

| Repair | Function | Description |
|--------|----------|-------------|
| Multi-role line split | `normalizeListeningContent()` | Splits `"Boy: ... Girl: ..."` into separate lines |
| Speaker label normalize | `sanitizeListeningLine()` | Normalizes `"boy:"`, `"WOMAN :"`, `"[Girl]:"` → `"Boy:"`, `"Woman:"`, `"Girl:"` |
| Blank line dedup | `normalizeListeningContent()` | Collapses 3+ consecutive blank lines to 2 |
| Quote stripping | `sanitizeListeningLine()` | Removes surrounding quotes/brackets from lines |

### Failures NOT Handled
- Answer semantics: only checks verbatim string match (synonyms accepted as warnings)
- Speaker consistency: doesn't verify Boy/Girl are used for students, Man/Woman for adults
- Content quality: doesn't check dialogue coherence or authenticity
- Tone/emotion cues: no validation of intonation/emotion markers
- Cross-question consistency: no check that different questions don't contradict

---

## 6. Answer Analysis

**File**: `src/modules/ai/usecases/analyze-answer.ts` (lines 1-162)

### Scoring Method

The `analyzeAnswer()` function uses **AI-only evaluation** via `callLLM()`. There is NO local comparison or keyword matching — the entire answer judgment is delegated to the LLM.

### Scoring Rules (from system prompt)

| Rule | Description |
|------|-------------|
| MC scoring | `isCorrect` → score=100; not correct → score=0. Binary only. |
| Fill-blank / error-correction | Fully correct ≥90; partial understanding ≤70 |
| Error-correction format tolerance | Complete sentences accepted (not just the corrected word). Format differences (15 vs fifteen, full sentence vs keyword) should NOT penalize. |
| Short-writing | Content + organization + language considered, NOT just grammar. < 8 words + no response → ≤35 |
| Off-topic | `mistakeType=comprehension`, score ≤30 |
| Explanation quality | Minimum 80 Chinese characters. Must explain WHY each option is right/wrong. |

### What the Analyzer Supports

| Feature | Supported? | Method |
|---------|------------|--------|
| String equality | ✅ | Via LLM judgment |
| Case insensitive | ✅ | LLM handles naturally |
| Synonym support | ✅ | LLM prompt instructs to accept synonyms |
| Semantic similarity | ✅ | LLM evaluates meaning |
| AI judgement | ✅ | Primary mechanism |
| Rubric-based | ❌ | No structured rubric — uses prompt instructions only |
| Grammar tolerance | ✅ | LLM instructed to be tolerant |
| Meaning tolerance | ✅ | LLM instructed to accept paraphrases |
| Partial credit | ⚠️ | score is 0-100, but implementation only uses binary for MC |

### DSE RAG Integration
- Retrieves marking scheme chunks for context
- Injects HKDSE Level Descriptors (Level 1-5) for Reading/Listening

### Limitations
- Single LLM call, no fallback evaluation if LLM fails
- No local grammar/rubric check as safety net
- Score is LLM-determined, not rule-verified
- No answer-text-matches-content verification (unlike question generation)

---

## 7. Writing Analysis

**File**: `src/modules/ai/usecases/analyze-writing.ts` (lines 1-559)

### Scoring Dimensions

| Dimension | Scale | Method | Source |
|-----------|-------|--------|--------|
| Content | 0-7 | LLM CLO rubric evaluation | Call 1 (grammar) |
| Language | 0-7 | LLM CLO rubric evaluation | Call 1 (grammar) |
| Organization | 0-7 | LLM CLO rubric evaluation | Call 1 (grammar) |
| CLO Total | 0-21 | Sum of C+L+O | Deterministic from LLM scores |
| DSE Level | U→5** | Threshold mapping | Deterministic from CLO total |
| Overall Score | 0-100 | `round(CLO/21*100) + lengthPenalty + offTopicPenalty` | Deterministic from LLM + penalties |
| Length Penalty | 0 to -25 | Ratio-based: <30% → -25, <50% → -15, <70% → -8 | Deterministic |
| Off-topic Penalty | 0 to -10 | LLM assessment | Call 1 |

### DSE CLO Framework (fully specified in prompt)
- **Content (0-7)**: 7 levels with detailed descriptors for each (5**, 5, 4, 3, 2, 1, 0)
- **Language (0-7)**: Same, with emphasis on accuracy, range, sophistication
- **Organization (0-7)**: Cohesion, paragraph structure, cohesive ties

### Two-Call Architecture

| Call | Purpose | Timeout | Tokens | Retry |
|------|---------|---------|--------|-------|
| Call 1 (Grammar) | CLO scores + grammar errors + Chinglish + overall score | 25000ms | 4096 | Yes (x2) |
| Call 2 (Style) | Strengths + weaknesses + vocabulary + structure + revised version | 25000ms | 4096 | No |

### Hallucination Protection

| Protection | Method |
|------------|--------|
| False positive grammar errors | Filter: `original === correction` → remove |
| Self-contradictory explanations | Filter: `explanation` contains "無誤"/"正確"/"no error" → remove |
| Too-short entries | Filter: `original.length < 3` → remove |
| False positive Chinglish | Filter: `original === suggestion` → remove |
| Rule-based supplement | `detectChinglish()` from assessment module adds pattern-based detection |

### Feedback Generation
- Grammar errors: `{ original, correction, explanation }` triple from LLM
- Chinglish warnings: `{ original, suggestion, explanation }` from LLM + rule-based merger
- Vocabulary suggestions: `{ original, suggestion, reason }` from LLM
- Structure feedback: Free text from LLM
- Revised version: Full rewritten essay from LLM
- General comment: Free text from LLM

### DSE Level Mapping
```
CLO ≥ 19 → 5**   CLO ≥ 16 → 5*   CLO ≥ 13 → 5
CLO ≥ 10 → 4     CLO ≥ 7  → 3    CLO ≥ 4  → 2
CLO ≥ 1  → 1     else    → U
```

### Limitations
- No local CLO scoring fallback if LLM fails
- Length penalty is deterministic, not LLM-verified
- Only grammar call has retry; style call has none
- No cross-validation between CLO scores and actual essay content

---

## 8. JSON Parser

**File**: `src/modules/ai/services/json-utils.ts` (lines 1-147)

### Parse Strategies (in order)

| # | Strategy | Function | Description |
|---|----------|----------|-------------|
| 1 | Direct parse | `JSON.parse(cleaned)` | After removing ```json``` blocks |
| 2 | Balanced extraction | `extractBalancedJson()` | Finds balanced `{...}` or `[...]` within noise |
| 3 | Object pattern match | `/{[\s\S]*}/.exec()` | Regex-based extraction |
| 4 | Array pattern match | `/\[[\s\S]*\]/.exec()` | Regex-based extraction |
| 5 | Truncation repair | `repairTruncatedJSON()` | Closes unclosed brackets/braces |

### Balanced JSON Extractor
- Handles string escaping (`\"`, `\\`)
- Properly tracks `{}` and `[]` nesting
- Returns null if brackets are crossed or unbalanced

### Truncation Repair
- Finds last complete object at depth=0
- Truncates to that point
- Appends missing closing brackets

### Remaining Failure Cases
- Malformed JSON inside strings (e.g., unescaped quotes)
- Valid JSON structure but semantically wrong
- Completely non-JSON output (e.g., plain text narrative)
- JSON with trailing commas (not valid per spec)
- Single quotes instead of double quotes

### Usage
- Direct: `parseAIJSON<T>(raw)` in analyze-answer.ts, analyze-writing.ts, generate-questions.ts
- Wrapped: `parseAIResponse<T>(raw, schema)` in response-parser.ts (adds schema validation + repair fallback)

---

## 9. Hallucination Guard

**File**: `src/modules/ai/services/hallucination-guard.ts` (lines 1-178)

### Pre-Generation Protections

| Protection | Description | Scope |
|------------|-------------|-------|
| `HALLUCINATION_GUARD` | 10-rule instruction injected at end of every system prompt | Full: analyze-answer, analyze-writing, generate-questions |
| `HALLUCINATION_GUARD_LITE` | 1-sentence version for short prompts (<500 chars) | Auto-selected by `injectHallucinationGuard()` |
| Rule 7 (Listening) | Answers MUST appear VERBATIM in listening content | Listening questions |
| Rule 8 (Reading) | Answers MUST be directly supported by reading passage | Reading questions |
| Rule 3 (Ambiguity) | Use qualifiers for ambiguous topics | All prompts |
| Rule 6 (MCQ) | Exactly ONE unambiguously correct option | All MC questions |

### Post-Generation Protections

| Protection | Mechanism | Threshold |
|------------|-----------|-----------|
| Hallucination scoring | 9 regex pattern checks + grounding ratio | risk 0-1 |
| Fabricated citations | Match "according to study/research..." | weight 0.25 |
| Overconfident claims | Match "it is certainly/absolutely true that" | weight 0.15 |
| Fabricated years | Match \d{4} without DSE context | weight 0.20 |
| Absolute claims | Match "always/never/everyone" | weight 0.10 |
| Fabricated statistics | Match % without exam context | weight 0.15 |
| Academic references | Match "Author et al." or "Author (YYYY)" | weight 0.20 |
| Grounding check | Output words overlap with source material | <5% overlap → +0.20 |

### Circuit Breaker

| Parameter | Value |
|-----------|-------|
| Threshold | 5 consecutive suspect/hallucination outputs |
| Auto-reset | 60 seconds |
| State tracking | `consecutiveFailures`, `lastFailureTime`, `isOpen`, `totalRejections` |

### Limitations
- Pattern-based only — cannot detect semantic hallucinations (plausible-sounding fiction)
- Does NOT verify factual accuracy against external sources
- Grounding check is word-level, not semantic
- Only used explicitly in `generateQuestions`; NOT automatically applied to all LLM outputs
- Circuit breaker is module-level singleton — shared across all requests

---

## 10. Prompt Summary

### Question Generation Prompt
**File**: `src/modules/ai/usecases/generate-questions.ts` (~400 lines)
**Quality requirements specified**:
- DSE empirical topic database (real 2012-2024 past paper topics)
- HKDSE level alignment (remedial→L1-2, core→L3, challenge→L4-5)
- Skill-specific rules (Listening: natural speech patterns, intonation, trap design; Reading: passage structure; Writing: task types; Speaking: discussion format)
- MCQ: exactly 4 choices, complete phrases ≥3 words, no T/F format, no "All of the above"
- Listening: per-question independent dialogues, verbatim answers, speaker label whitelist (Woman/Man/Boy/Girl only)
- Answer precision rules: MC letter A-D, non-MC verbatim from content
- Self-check instructions before output
- Topic diversity enforcement via forced random topic rotation

**NOT specified**:
- Rubric structure (required concepts, accepted paraphrases, partial credit rules)
- Negative examples or failure patterns to avoid
- Answer explanation quality rubric
- Difficulty calibration beyond vocabulary level

### Answer Analysis Prompt
**File**: `src/modules/ai/usecases/analyze-answer.ts` (~80 lines)
**Quality requirements specified**:
- HKDSE Reading/Listening Level Descriptors (Level 1-5 for each skill)
- Explanation must be ≥80 Chinese characters
- Must explain WHY correct answer is correct AND why student's answer is wrong
- MC: must analyze each option
- Error-correction: accept complete sentences, don't penalize format differences
- Scoring rules (MC binary, fill-blank ≥90, short-writing < 8 words → ≤35)

**NOT specified**:
- How to handle partial credit for short-answer (no rubric)
- Synonym acceptance guidelines
- How to judge borderline cases
- What constitutes "comprehension" vs "careless" mistake

### Writing Analysis Prompt
**File**: `src/modules/ai/usecases/analyze-writing.ts` (~350 lines combined)
**Quality requirements specified**:
- Full CLO rubric with 7-level descriptors per dimension
- Content: 5-paragraph development method (context→others' views→position→reasons→concession)
- 10 common DSE writing errors checklist
- Chinglish detection patterns (8 specific patterns)
- High-score techniques checklist (PEEL, show-don't-tell, sentence variety)
- Marker's "Two Gates" process
- Scoring formula: `round(CLO/21*100) + penalties`
- Length penalty thresholds

**NOT specified**:
- Topic-specific evaluation criteria
- Text-type-specific format requirements (beyond checklist mentions)
- Tone/register appropriate for different audiences
- Cultural appropriateness for Hong Kong context

---

## 11. AI Schemas

**File**: `src/modules/ai/schemas/ai-schema.ts` (lines 1-200)

### AI Output Schemas

| # | Schema | Required Fields | Optional Fields | Validation Rules |
|---|--------|-----------------|-----------------|------------------|
| 1 | `GeneratedQuestionSchema` | type, prompt, answer, explanationZh, explanationEn, commonMistake | promptZh, choices[], grammarPoint, listeningContent, listeningContentZh, readingContent, readingContentZh | type enum, prompt min 1, answer min 1, explanationZh/En min 1, commonMistake min 1, choices default [] |
| 2 | `GeneratedQuestionsArraySchema` | (array of above) | — | Wraps #1 in z.array() |
| 3 | `AnswerAnalysisSchema` | isCorrect, score (0-100), feedbackZh, feedbackEn, mistakeType, explanation, improvementTip | relatedGrammarPoint | score min 0 max 100, mistakeType enum (7 values), all strings min 1 |
| 4 | `WritingAnalysisSchema` | overallScore (0-100), dseLevel, strengths[], weaknesses[], grammarErrors[], chinglishWarnings[], vocabularySuggestions[], structureFeedback, generalComment | contentScore, languageScore, organizationScore, cloTotalScore, revisedVersion | CLO scores 0-7 optional, dseLevel min 1, array fields default [] |
| 5 | `MistakeExplanationSchema` | reasonZh, reasonEn, ruleExplanation, examples[], memoryTip, relatedTopics[] | — | All strings min 1, examples array of {wrong, correct} |
| 6 | `ProgressAnalysisSchema` | summary, strengthsAreas[], urgentAreas[], recommendedFocus[], studyPlan, encouragementMessage, estimatedTimeToImprove | — | Priority enum (high/medium/low) with preprocess normalization |
| 7 | `StudyHelpResponseSchema` | answer, followUpTips[], recommendedFocus[] | — | answer min 1 |
| 8 | `MaterialAnalysisSchema` | summary, keyVocabulary[], keyGrammarPoints[], suggestedQuestions[], difficultyLevel, suggestedGrade | — | difficultyLevel enum (remedial/core/challenge) |
| 9 | `WordAnalysisSchema` | word, partOfSpeech, meaningZh, exampleSentence, exampleZh | allPartOfSpeech[], secondaryMeaningZh, synonyms[], antonyms[], collocations[] | word min 1, string fields min 1 |

### Shared Pre-processing
- `stripNulls(obj)`: Recursively converts `null` → `undefined` before Zod validation (handles Gemini vs DeepSeek output differences)
- `validateAIResponse<T>(schema, data)`: Returns `{ success, data }` or `{ success, error }` — never throws

---

## 12. Current Failure Points

| # | Issue | Likelihood | Current Protection | Remaining Gap |
|---|-------|-----------|-------------------|---------------|
| 1 | **Missing answer** (AI generates question with empty answer) | Medium | Zod `answer.min(1)`, non-MC empty answer rejection in normalizer | MC answer could be valid letter but wrong |
| 2 | **Wrong answer** (answer text incorrect for question) | Medium | None — schema only validates shape, not correctness | No factual accuracy check |
| 3 | **Two correct answers** (multiple choices are valid) | Low | Prompt instructs "exactly ONE unambiguously correct" | No automated check |
| 4 | **Invalid options** (choices not plausible) | Low | Banned pattern filter, time fragment filter, length filter | No semantic plausibility check |
| 5 | **Difficulty mismatch** (remedial too hard, challenge too easy) | Medium | Prompt describes levels; DSE topic validation (info only) | No quantitative difficulty assessment |
| 6 | **Overly strict marking** (rejects valid synonyms) | High | analyze-answer prompt says "accept synonyms"; reading route uses AI evaluator | analyzeAnswer() has no local fallback if LLM fails; student reading page only uses AI for clearly-wrong answers |
| 7 | **Missing explanation** (AI returns placeholder) | Low | Zod `min(1)` validation | Could be "..." or meaningless text |
| 8 | **Listening mismatch** (answer not in audio script) | Medium | validateListeningConsistency() checks verbatim match | Synonym mismatch is only a warning, may pass validation |
| 9 | **Writing over-penalization** (too strict on grammar) | Medium | CLO rubric, false positive filters, length penalty caps | LLM may still be too harsh on non-native patterns |
| 10 | **JSON valid but logically incorrect** (schema passes, data wrong) | Medium | Hallucination scoring (optional, not always used) | Schema validation only checks shape, not logic |
| 11 | **Provider failure cascade** (all 5 providers fail) | Low | Circuit breaker, retry logic, provider fallback chain | Only 5 providers, all could be down simultaneously |
| 12 | **RAG retrieval failure** (DSE context missing) | Low | Try/catch with fallback to pure prompt mode | Questions may be less DSE-aligned |
| 13 | **TFNG sub-question explanation bleed** (fixed) | — | Fixed in Sprint 102.5: explanation split per sub-statement | — |
| 14 | **MCQ letter vs text mismatch** (fixed) | — | Fixed in Sprint 102.5: letter→choice text mapping | — |
| 15 | **Sequencing UI missing** (fixed) | — | Fixed in Sprint 102.5: dropdown ordering component | Sequencing answer validation is simple order comparison |

---

## 13. Quality Improvement Opportunities

### Validator Cannot Detect:
1. **Answer accuracy**: validates structure, not whether the answer is actually correct for the question
2. **Distractor quality**: doesn't check if wrong MC options are plausible
3. **Question-answer consistency**: doesn't verify that the answer logically follows from the question
4. **Difficulty calibration**: no quantitative measure of question difficulty
5. **Cultural appropriateness**: no check for Hong Kong context relevance
6. **Cross-question diversity**: doesn't verify questions test different skills/sub-skills

### Normalizer Does Not Repair:
1. **Wrong answer format**: non-MC answer may be semantically correct but formatted wrong
2. **Explanation quality**: doesn't verify explanation explains the answer adequately
3. **Reading content accuracy**: doesn't verify reading passage facts
4. **Listening dialogue coherence**: only checks format, not narrative logic

### Prompt Does Not Require:
1. **Rubric structure**: no instruction to generate `requiredConcepts`, `acceptedAnswers`, `partialCreditRules`
2. **Negative examples**: doesn't show what a BAD question looks like
3. **Answer rationale**: doesn't require explaining WHY the correct answer is correct within the question object
4. **Calibration data**: doesn't request difficulty metadata beyond level labels

### Answer Analysis Lacks:
1. **Local fallback**: if LLM fails, no rule-based scoring as backup
2. **Rubric-based evaluation**: uses free-text prompt, not structured rubric
3. **Content-anchored verification**: doesn't verify student answer against passage content (only against correct answer)
4. **Semantic similarity threshold**: no quantitative measure of answer closeness

### Listening Consistency Missing:
1. **Dialogue coherence**: no check that conversation flows logically
2. **Speaker role consistency**: doesn't verify Boy/Girl = students, Man/Woman = adults
3. **Cross-question validation**: doesn't check that questions don't share the same answer
4. **Audio length estimation**: doesn't verify dialogue is appropriate length for target grade

### Writing Analysis Lacks:
1. **Task achievement rubric**: no structured text-type-specific criteria
2. **Topic relevance check**: no verification that essay addresses the prompt
3. **Plagiarism detection**: no similarity check against known texts
4. **Progressive feedback**: no comparison with previous student submissions
