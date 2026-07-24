# Sprint AI-Q0 — AI Quality Layer Discovery Report
> Platform v1.0 — Full Audit  
> Generated: 2026-07-24  
> Scope: All 14 AI use cases, all validators, all normalizers, all prompts

---

## Part 1 — AI Request Flow

### 1.1 generateQuestions
```
User → POST /api/ai/generate-questions
  ↓
Route: src/app/api/ai/generate-questions/route.ts → POST handler
  ↓
Facade: src/modules/ai/services/ai-service.ts → export { generateQuestions }
  ↓
Usecase: src/modules/ai/usecases/generate-questions.ts → generateQuestions(input)
  ↓
Stages:
  1. DSE RAG: retrievePastPaperContent() + retrieveMarkingScheme()
  2. callLLM(systemPrompt + dseContext, { temperature, maxTokens:4096, jsonMode, timeoutMs:25000 })
  3. Retry loop (MAX_RETRIES=2): new topic, lower temperature
  4. JSON Repair fallback: callLLM(repairPrompt, { temperature:0, maxTokens:4096 })
  ↓
Pipeline:
  1. parseAIJSON<T[]>(raw) — 5-strategy cascade
  2. normalizeGeneratedQuestions() — choice cleanup, banned filter, answer fix
  3. validateAIResponse(GeneratedQuestionsArraySchema) — Zod
  ↓
Post-Process:
  4. validateAndFixQuestion() per question — MCQ answer→letter, content checks
  5. validateListeningConsistency() — dialogue format, answer-in-content
  6. Reading content length check
  7. DSE topic validation (informational)
  ↓
Return: GeneratedQuestion[]
```

### 1.2 analyzeAnswer
```
User → POST /api/ai/analyze-answer
  ↓
Route: src/app/api/ai/analyze-answer/route.ts
  ↓
Facade: ai-service.ts → export { analyzeAnswer }
  ↓
Usecase: src/modules/ai/usecases/analyze-answer.ts → analyzeAnswer(input)
  ↓
Stages:
  1. DSE RAG: retrieveMarkingScheme()
  2. sanitizeForAI(studentAnswer)
  3. callLLM(systemPrompt + msContext, { temperature:0.3, maxTokens:2048, jsonMode })
  ↓
Pipeline:
  1. parseAIJSON<AnswerAnalysis>(raw)
  2. validateAIResponse(AnswerAnalysisSchema)
  ↓
Post-Process:
  3. MC: force score = isCorrect ? 100 : 0
  ↓
Return: AnswerAnalysis { isCorrect, score, feedbackZh, feedbackEn, mistakeType, ... }
```

### 1.3 analyzeWriting
```
User → POST /api/ai/analyze-writing
  ↓
Route: src/app/api/ai/analyze-writing/route.ts
  ↓
Facade: ai-service.ts → export { analyzeWriting }
  ↓
Usecase: src/modules/ai/usecases/analyze-writing.ts → analyzeWriting(input)
  ↓
Stages:
  1. DSE RAG: retrieveMarkingScheme('Writing', 3)
  2. sanitizeForAI(studentDraft)
  3. TWO parallel calls:
     Call 1 (Grammar): callLLM(grammarPrompt, { temp:0.3, maxTokens:4096, timeoutMs:25000 })
       → Retry x2 on failure
     Call 2 (Style): callLLM(stylePrompt, { temp:0.3, maxTokens:4096, timeoutMs:25000 })
       → No retry
  ↓
Pipeline (per call):
  1. parseAIJSON(raw) independently
  2. Merge results; allow partial failure (both fail → throw)
  ↓
Post-Process:
  3. Deterministic length penalty: ratio-based clamp
  4. Clamp overallScore 0-100
  5. DSE Level mapping from CLO total
  6. Rule-based Chinglish detection via detectChinglish()
  7. Filter false positives: original===correction, explanation contains "無誤"
  8. validateAIResponse(WritingAnalysisSchema)
  ↓
Return: WritingAnalysis { overallScore, contentScore, languageScore, organizationScore, dseLevel, ... }
```

### 1.4 explainMistake
```
User → POST /api/ai/explain-mistake
  ↓
Route: src/app/api/ai/explain-mistake/route.ts
  ↓
Facade: ai-service.ts → export { explainMistake }
  ↓
Usecase: src/modules/ai/usecases/explain-mistake.ts → explainMistake(input)
  ↓
Stages:
  1. DSE RAG: retrieveMarkingScheme()
  2. sanitizeForAI(question, correctAnswer, studentAnswer)
  3. getExplainMistakeSystemPrompt() + buildExplainMistakeUserPrompt()
  4. callLLM(systemPrompt + msContext, { temp:0.5, maxTokens:2048, jsonMode })
  ↓
Pipeline:
  1. parseAIJSON<MistakeExplanation>(raw)
  2. validateAIResponse(MistakeExplanationSchema)
  ↓
Return: MistakeExplanation { reasonZh, reasonEn, ruleExplanation, examples, memoryTip, relatedTopics }
```

### 1.5 analyzeWord
```
User → POST /api/ai/analyze-word
  ↓
Route: src/app/api/ai/analyze-word/route.ts
  ↓
Usecase: src/modules/ai/usecases/analyze-word.ts → analyzeWord(input)
  ↓
Stages:
  1. sanitizeForAI(word)
  2. HALLUCINATION_GUARD + grade-adaptive prompt
  3. callLLM(prompt, { temp:0.3, maxTokens:1024, jsonMode, timeoutMs:15000 })
  ↓
Pipeline:
  1. parseAIJSON(raw)
  2. validateAIResponse(WordAnalysisSchema)
  ↓
Return: WordAnalysis { word, partOfSpeech, meaningZh, synonyms, collocations, ... }
```

### 1.6 analyzeProgress
```
User → POST /api/ai/analyze-progress
  ↓
Route: src/app/api/ai/analyze-progress/route.ts
  ↓
Usecase: src/modules/ai/usecases/analyze-progress.ts → analyzeProgress(input)
  ↓
Stages:
  1. getProgressAnalysisSystemPrompt() + buildProgressAnalysisUserPrompt()
  2. callLLM(prompt, { temp:0.5, maxTokens:2048, jsonMode })
  ↓
Pipeline:
  1. parseAIJSON<ProgressAnalysis>(raw)
  2. validateAIResponse(ProgressAnalysisSchema)
  ↓
Return: ProgressAnalysis { summary, strengthsAreas, urgentAreas, studyPlan, ... }
```

### 1.7 answerStudyHelp
```
User → POST /api/ai/study-help
  ↓
Route: src/app/api/ai/study-help/route.ts
  ↓
Facade: ai-service.ts → export { answerStudyHelp }
  ↓
Usecase: src/modules/ai/usecases/study-help.ts → answerStudyHelp(input)
  ↓
Stages:
  1. callLLM(prompt, { temp:0.7, maxTokens:2048, jsonMode, timeoutMs:20000 })
  ↓
Pipeline:
  1. parseAIJSON<StudyHelpResponse>(raw)
  2. validateAIResponse(StudyHelpResponseSchema)
  ↓
Return: StudyHelpResponse { answer, followUpTips, recommendedFocus }
```

### 1.8 analyzeMaterial
```
User → POST /api/ai/analyze-material
  ↓
Usecase: (inline in route or ai-service)
  ↓
Pipeline: parseAIJSON → validateAIResponse(MaterialAnalysisSchema)
  ↓
Return: MaterialAnalysis { summary, keyVocabulary, suggestedQuestions, difficultyLevel }
```

### 1.9 generateWritingPrompt
```
User → POST /api/writing (action=prompt)  or  /api/teacher/copilot/generate
  ↓
Service: src/modules/ai/services/writing-generation.ts → generateWritingPrompt(input)
  ↓
Stages:
  1. DSE text type guide lookup
  2. callLLM(prompt, { temp:0.7, maxTokens:2048, timeoutMs:20000 })
  ↓
Pipeline:
  1. Returns raw string (NOT JSON — natural language prompt)
  2. DSE topic validation: validateDSEtopicMatch()
  ↓
Return: string (the writing prompt)
  File: src/modules/ai/services/writing-generation.ts (lines ~1-350)
```

### 1.10 generateWritingOutline
```
User → POST /api/writing (action=outline)
  ↓
Service: src/modules/ai/services/writing-generation.ts → generateWritingOutline(input)
  ↓
Stages:
  1. getWritingOutlineSystemPrompt() + buildWritingOutlineUserPrompt()
  2. callLLM(prompt, { temp:0.5, maxTokens:3072, jsonMode, timeoutMs:25000 })
  ↓
Pipeline:
  1. parseAIJSON(raw)
  2. Schema validation (inline)
  ↓
Return: { sections: { heading, content, tips }[] }
  File: src/modules/ai/services/writing-generation.ts
```

### 1.11 generateWritingGuide
```
User → POST /api/writing (action=guide)
  ↓
Service: src/modules/ai/services/writing-generation.ts → generateWritingGuide(input)
  ↓
Stages:
  1. callLLM(prompt, { temp:0.5, maxTokens:3072, jsonMode, timeoutMs:25000 })
  ↓
Pipeline:
  1. parseAIJSON<WritingGuide>(raw)
  ↓
Return: WritingGuide { structureGuide, usefulPhrases, commonMistakes, vocabularyUpgrades }
  File: src/modules/ai/services/writing-generation.ts
```

### 1.12 generateIntegratedSkills
```
User → POST /api/ai/generate-integrated-skills
  ↓
Service: src/modules/ai/services/integrated-skills.ts → generateIntegratedSkills(input)
  ↓
Stages:
  1. DSE RAG: retrieveMarkingScheme('Listening', 5)
  2. buildIntegratedSkillsGenPrompt()
  3. callLLM(prompt, { temp:0.5, maxTokens:4096, jsonMode, timeoutMs:35000 })
  ↓
Pipeline:
  1. parseAIJSON<IntegratedSkillsTask>(raw)
  2. normalizeListeningContent() on listeningContent
  3. DSE topic validation
  ↓
Return: IntegratedSkillsTask { listeningContent, dataFile, noteTakingGuide, writingTask, ... }
  File: src/modules/ai/services/integrated-skills.ts
```

### 1.13 analyzeIntegratedSkills
```
User → POST /api/ai/analyze-integrated-skills
  ↓
Service: src/modules/ai/services/integrated-skills.ts → analyzeIntegratedSkills(input)
  ↓
Stages:
  1. DSE RAG: retrieveMarkingScheme()
  2. sanitizeForAI(studentNotes, studentWriting)
  3. buildIntegratedSkillsAnalysisPrompt()
  4. callLLM(prompt, { temp:0.3, maxTokens:4096, jsonMode, timeoutMs:30000 })
  ↓
Pipeline:
  1. parseAIJSON<IntegratedSkillsAnalysis>(raw)
  2. Schema validation (inline type checks)
  ↓
Return: IntegratedSkillsAnalysis { overallScore, listeningAccuracy, capturedPoints, missedPoints, ... }
  File: src/modules/ai/services/integrated-skills.ts
```

### 1.14 Reading & Exercise Generation (reading/route.ts)
```
User → POST /api/reading (no action → handleLegacyGeneration)
  OR   POST /api/reading (action=exercise → handleExerciseGeneration)
  ↓
Route: src/app/api/reading/route.ts
  ↓
Direct LLM call (does NOT go through facade):
  handleLegacyGeneration(body)
    → callLLM() from ai-service
    → Passage transform: paragraph markers, line markers
    → splitTFNGSubQuestions()
    → Question format transform to legacy frontend format
  handleExerciseGeneration(body)
    → callLLM() → handleLegacyGeneration({ _preParsedResult: parsed })
  handleAnswerAnalysis(body) — uses evaluateWithAI() from ai-evaluator.ts
    → Promise.all of per-question AI evaluation
```

---

## Part 2 — Existing Validation Layer

| # | Validator | File | Functions | Called By | Purpose | Lines |
|---|-----------|------|-----------|-----------|---------|-------|
| 1 | **Question Validator** | `src/modules/ai/services/question-validator.ts` | `validateAndFixQuestion()`, `normalizeMcqAnswer()`, `normalizeAnswer()`, `stripMcqPrefix()`, `toMcqLetter()` | `question-normalizer.ts`, `ai-service.ts` | MCQ answer→letter mapping, choice quality check, listening/reading content presence check | 197 |
| 2 | **Listening Validator** | `src/modules/ai/services/listening-normalizer.ts` | `validateListeningContent()`, `validateListeningConsistency()`, `normalizeListeningContent()`, `sanitizeListeningLine()` | `question-normalizer.ts`, `generate-questions.ts` | Dialogue format validation, speaker label check, answer-in-content verification, time format warnings | 215 |
| 3 | **Schema Validator** | `src/modules/ai/schemas/ai-schema.ts` | `validateAIResponse<T>(schema, data)`, `stripNulls()` | ALL usecases | Zod schema validation for 9 AI output types, null→undefined pre-processing | 200 |
| 4 | **Hallucination Guard** | `src/modules/ai/services/hallucination-guard.ts` | `scoreHallucinationRisk()`, `checkHallucinationBreaker()`, `injectHallucinationGuard()` | `generate-questions.ts`, `analyze-answer.ts`, `analyze-writing.ts`, `analyze-word.ts` | Pattern-based hallucination detection, circuit breaker, prompt injection | 178 |
| 5 | **JSON Validator** | `src/modules/ai/services/json-utils.ts` | `parseAIJSON<T>()`, `extractBalancedJson()`, `repairTruncatedJSON()` | ALL usecases | 5-strategy JSON parsing + repair cascade | 147 |
| 6 | **Response Parser** | `src/modules/ai/services/response-parser.ts` | `parseAIResponse<T>()`, `validateAIResponseStrict<T>()` | Workflows | Wraps parseAIJSON + schema validation with repair fallback | 65 |
| 7 | **MCQ Filters** | `src/modules/ai/services/mcq-filters.ts` | `BANNED_PATTERNS`, `TIME_FRAGMENT_PATTERNS`, `getFallbackFillers()` | `question-normalizer.ts` | DSE-incompatible choice filtering, time fragment removal, fallback filler injection | 59 |
| 8 | **Topic Validator** | `src/modules/ai/services/dse-topics.ts` | `validateDSEtopicMatch()`, `getDSEEmpiricalTopics()` | `generate-questions.ts`, `writing-generation.ts`, `integrated-skills.ts` | DSE empirical topic database validation (informational only) | ~200 |
| 9 | **Sanitizer** | `src/modules/ai/services/sanitizer.ts` | `sanitizeForAI()` | ALL usecases | PII removal (HKID, phone, email), prompt injection filtering, length clamping | 37 |
| 10 | **Writing Validator** | `src/modules/ai/usecases/analyze-writing.ts` | Inline: false positive filters, length penalty calculator | Self-contained | Grammar error false positive filter, Chinglish false positive filter, deterministic length penalty | 559 |
| 11 | **Circuit Breaker** | `src/modules/ai/runtime/circuit-breaker.ts` | `checkCircuitBreaker()`, `getCircuitBreakerState()` | `provider-registry.ts` | 5 failures → open (30s) → half-open (2 successes → closed) | ~80 |
| 12 | **Retry Policy** | `src/modules/ai/services/retry.ts` | `executeWithRetry<T>()` | Available to all usecases (not universally used) | Exponential backoff retry for retryable errors (JSON/timeout/rate-limit) | 41 |
| 13 | **Saturation Detector** | `src/modules/ai/runtime/saturation-detector.ts` | `detectSaturation()`, `getSaturationReport()` | Runtime monitoring | Retry storm detection, provider overload detection | ~80 |

---

## Part 3 — Existing Normalizers

| # | Normalizer | File | Input | Output | Called By |
|---|-----------|------|-------|--------|-----------|
| 1 | **Question Normalizer** | `src/modules/ai/services/question-normalizer.ts` | `GeneratedQuestion[]` (raw AI output) | Cleaned, filtered, answer-fixed `GeneratedQuestion[]` | `generate-questions.ts` |
| 2 | **Listening Normalizer** | `src/modules/ai/services/listening-normalizer.ts` | Raw dialogue string | Formatted dialogue with corrected speaker labels | `question-normalizer.ts`, `integrated-skills.ts` |
| 3 | **Sanitizer** | `src/modules/ai/services/sanitizer.ts` | Any string | PII-redacted, injection-filtered string | ALL usecases |
| 4 | **Response Parser** | `src/modules/ai/services/response-parser.ts` | Raw LLM output + Zod schema | `{ success, data, repaired }` | Workflow engine |
| 5 | **JSON Utils** | `src/modules/ai/services/json-utils.ts` | Raw LLM string | Parsed `T` (throws if all strategies fail) | ALL usecases |
| 6 | **MCQ Filters** | `src/modules/ai/services/mcq-filters.ts` | Choice array | Filtered choices + fallback fillers | `question-normalizer.ts` |
| 7 | **Question Answer Normalizer** | `src/modules/ai/services/question-validator.ts` | Answer string + choices | A-D letter | `question-normalizer.ts` |
| 8 | **AI Evaluator** | `src/modules/ai/services/ai-evaluator.ts` | `(studentAnswer, correctAnswer, questionText, marks)` | `AIEvaluationResult { score, isCorrect, feedbackZh, feedbackEn }` | `reading/route.ts` (handleAnswerAnalysis) |
| 9 | **Semantic Evaluator** | `src/modules/ai/services/semantic-evaluator.ts` | `(studentAnswer, rubric)` | `RubricEvaluation` | Legacy (mostly unused after evaluator refactor) |
| 10 | **Topic Selector** | `src/modules/ai/services/topic-selector.ts` | Grade level, skill flags | Random topic string | `generate-questions.ts` |

---

## Part 4 — AI Failure Inventory

| # | Problem | Repair Strategy | File | Function |
|---|---------|-----------------|------|----------|
| 1 | **Invalid JSON** | 5-strategy parse cascade: direct→balanced→object pattern→array pattern→repair truncation | `json-utils.ts` | `parseAIJSON<T>()` |
| 2 | **Truncated JSON** | Find last complete object, close brackets/braces | `json-utils.ts` | `repairTruncatedJSON()` |
| 3 | **JSON with markdown wrapper** | Strip ```json``` and ``` blocks | `json-utils.ts` | `parseAIJSON()` L97-99 |
| 4 | **Null values (Gemini vs DeepSeek)** | Recursively convert null→undefined before Zod validation | `ai-schema.ts` | `stripNulls()` |
| 5 | **JSON repair via LLM** | Second LLM call with repair prompt (temperature=0) | `generate-questions.ts` | Lines 687-707 |
| 6 | **MCQ answer as text, not letter** | Match text to choice index, convert to A-D letter | `question-validator.ts` | `normalizeMcqAnswer()` |
| 7 | **MCQ answer as number (1-4)** | Convert to letter A-D | `question-validator.ts` | `normalizeMcqAnswer()` L55 |
| 8 | **MCQ answer as T/F/True/False** | Match to TF-prefixed choices | `question-validator.ts` | `normalizeMcqAnswer()` L64-68 |
| 9 | **MCQ answer not matching any choice** | Log warning, default to "A" | `question-validator.ts` | `normalizeMcqAnswer()` L71-73 |
| 10 | **Duplicate MCQ choices** | `Array.from(new Set(...))` deduplication | `question-normalizer.ts` | L64 |
| 11 | **Choices < 3 chars (fragments)** | Filter out choices < 3 chars | `question-normalizer.ts` | L78 |
| 12 | **Numeric-only choices ("30", "00")** | Filter out bare digit strings < 6 chars | `question-normalizer.ts` | L79 |
| 13 | **Banned patterns (All of the above, etc.)** | Filter via regex patterns | `mcq-filters.ts` | `BANNED_PATTERNS` |
| 14 | **Time fragments ("00 PM", "4:00")** | Filter via regex (non-listening only) | `mcq-filters.ts` | `TIME_FRAGMENT_PATTERNS` |
| 15 | **Insufficient valid choices (<2)** | Inject fallback fillers to pad to 4 | `mcq-filters.ts` | `getFallbackFillers()` |
| 16 | **Choice prefix stripping (A./B./1./T:)** | Strip via regex replacement | `question-validator.ts` | `stripMcqPrefix()` |
| 17 | **Multi-role single-line dialogue** | Split "Boy: ... Girl: ..." into separate lines | `listening-normalizer.ts` | `normalizeListeningContent()` L108 |
| 18 | **Speaker label format issues** | Normalize "boy:", "WOMAN :", "[Girl]:" → "Boy:", "Woman:", "Girl:" | `listening-normalizer.ts` | `sanitizeListeningLine()` |
| 19 | **Excessive blank lines in dialogue** | Collapse 3+ blank lines to 2 | `listening-normalizer.ts` | `normalizeListeningContent()` L111 |
| 20 | **Retry on insufficient questions** | Re-generate with new topic + lower temperature (max 2 retries) | `generate-questions.ts` | Lines 571-684 |
| 21 | **Hallucination circuit breaker open** | Reject output, force regeneration | `hallucination-guard.ts` | `checkHallucinationBreaker()` |
| 22 | **Grammar false positives (original===correction)** | Filter out entries where no actual change | `analyze-writing.ts` | Lines 503-509 |
| 23 | **Grammar false positives (AI says "無誤")** | Filter by explanation containing 無誤/正確/no error | `analyze-writing.ts` | Lines 503-509 |
| 24 | **Too-short grammar entries (<3 chars)** | Filter out | `analyze-writing.ts` | Lines 503-509 |
| 25 | **Chinglish false positives (original===suggestion)** | Filter out | `analyze-writing.ts` | Lines 512-516 |
| 26 | **TFNG sub-question explanation bleed** | Split explanation per sub-statement markers (i)(ii)(iii) | `reading/route.ts` | `splitTFNGSubQuestions()` |
| 27 | **TFNG answer as letter vs text** | Multi-index lookup (float/string/int) + normalize | `reading/route.ts` | `handleAnswerAnalysis()` |
| 28 | **Missing paragraph/line markers** | Recalculate and insert [N] + [line N] markers | `reading/route.ts` | `handleLegacyGeneration()` |
| 29 | **AI timeout / rate limit / 503/429** | Retry via executeWithRetry() with exponential backoff | `retry.ts` | `executeWithRetry()` |
| 30 | **Provider failure** | Chain fallback: DeepSeek→Vertex→Gemini→Claude→OpenAI | `provider-registry.ts` | `registry.call()` |
| 31 | **PII in student input** | Regex replacement: HKID, phone, email | `sanitizer.ts` | `sanitizeForAI()` |
| 32 | **Prompt injection attempt** | Regex filtering: "ignore previous instructions", "DAN", "system:" | `sanitizer.ts` | `sanitizeForAI()` |

---

## Part 5 — Prompt Inventory

### By Skill Category

| Category | File | Functions | Output Format | Strict JSON? | Contains Answer Constraints? | Contains Validation Rules? | Contains Scoring Rules? |
|----------|------|-----------|---------------|-------------|----------------------------|----------------------------|-------------------------|
| **Grammar** | `prompts/grammar/v1.ts` | `buildQuestionGenerationPrompt()`, `STRICT_ANSWER_RULES`, `GEMINI_JSON_INSTRUCTION` | JSON array | ✅ Yes | ✅ MCQ 4-option, verbatim answers | ✅ Self-check instructions | ❌ No |
| **Grammar (Answer)** | `prompts/grammar/answer-analysis.ts` | `buildAnswerAnalysisPrompt()` | JSON object | ✅ Yes | ✅ Explanation ≥80 chars, analyze each option | ✅ HKDSE descriptors | ✅ MC=100/0, fill-blank≥90 |
| **Writing** | `prompts/writing/v1.ts` | `buildWritingGrammarPrompt()`, `buildWritingStylePrompt()`, `getWritingOutlineSystemPrompt()`, `buildWritingOutlineUserPrompt()`, `buildIntegratedSkillsGenPrompt()`, `buildIntegratedSkillsAnalysisPrompt()`, `buildPartACLOPrompt()`, `buildQuestionAnalysisPrompt()` | JSON object | ✅ Yes | ✅ CLO rubric 0-7, 10 error checklist | ✅ CLO descriptors 7 levels | ✅ CLO→DSE mapping, length penalties |
| **Reading** | `prompts/reading/v1.ts` | `buildReadingSectionPrompt()`, `buildFullDSEPaperPrompt()`, `buildReadingExercisePrompt()` | JSON object | ✅ Yes | ✅ DSE question types, word limits | ✅ Passage structure rules | ❌ No (generation only) |
| **Speaking** | `prompts/speaking/v1.ts` | `buildSpeakingPrompt()` | JSON object | ✅ Yes | ✅ Discussion/response formats | ❌ Minimal | ❌ No |
| **Vocabulary** | `usecases/analyze-word.ts` | Inline prompt | JSON object | ✅ Yes | ✅ POS, grade-adaptive examples | ❌ Minimal | ❌ No |
| **Study Help** | `usecases/study-help.ts` | Inline prompt | JSON object | ✅ Yes | ✅ Follow-up tips, focus areas | ❌ Minimal | ❌ No |
| **Progress** | `usecases/analyze-progress.ts` | Via `prompts/grammar/v1.ts` | JSON object | ✅ Yes | ✅ Priority levels, study plan | ❌ Minimal | ❌ No |
| **Integrated Skills** | `services/integrated-skills.ts` | Via `prompts/writing/v1.ts` | JSON object | ✅ Yes | ✅ Data file, note-taking, content points | ✅ Listening format rules | ✅ Weighted scoring |
| **Reading Training** | `prompts/reading/training-*.ts` | Summary Cloze, Paraphrase, Idiom training prompts | JSON object | ✅ Yes | ✅ DSE-aligned question types | ✅ Answer-in-passage rules | ❌ No |

### All 13 Prompt Files

| # | File | Category | Approx Lines |
|---|------|----------|-------------|
| 1 | `prompts/grammar/v1.ts` | Grammar + Answer Analysis | ~200 |
| 2 | `prompts/grammar/answer-analysis.ts` | Answer Analysis | ~80 |
| 3 | `prompts/writing/v1.ts` | Writing + Integrated Skills | ~650 |
| 4 | `prompts/reading/v1.ts` | Reading | ~300 |
| 5 | `prompts/reading/types.ts` | Reading Types | ~470 |
| 6 | `prompts/reading/dse-question-templates.ts` | Reading | ~200 |
| 7 | `prompts/reading/dse-level-descriptors.ts` | Reading | ~100 |
| 8 | `prompts/reading/text-types.ts` | Reading | ~80 |
| 9 | `prompts/reading/training-summary-cloze.ts` | Reading | ~150 |
| 10 | `prompts/reading/training-paraphrase.ts` | Reading | ~150 |
| 11 | `prompts/reading/training-idiom.ts` | Reading | ~150 |
| 12 | `prompts/speaking/v1.ts` | Speaking | ~80 |
| 13 | `prompts/index.ts` | Barrel export | ~49 |

---

## Part 6 — Quality Problems (Technical Debt)

### Source Files with AI Quality Technical Debt

| # | File | Issue | Severity |
|---|------|-------|----------|
| 1 | `ai/services/writing-generation.ts:2` | `TODO(Sprint 45): Split further (~750 lines)` — monolithic file needs refactoring | High |
| 2 | `ai/usecases/generate-questions.ts` | Inline retry loop (~100 lines) duplicates retry.ts — not using centralized retry | Medium |
| 3 | `ai/usecases/analyze-answer.ts` | No local fallback if LLM fails — single point of failure | High |
| 4 | `ai/services/question-normalizer.ts` | Rejection silently drops questions — no quality scoring for dropped questions | Medium |
| 5 | `ai/usecases/analyze-writing.ts` | Only grammar call has retry; style call has none — inconsistent | Medium |
| 6 | `ai/services/semantic-evaluator.ts` | Reduced to minimal stub after duplicate code fix — `evaluateAnswer()` is basic keyword matching, real evaluation in ai-evaluator.ts | Low |
| 7 | `ai/services/ai-evaluator.ts` | Uses callLLM directly, bypasses retry.ts — no retry on failure | Medium |
| 8 | `app/api/reading/route.ts` | Passage transform (~200 lines) intertwined with question generation — hard to test in isolation | High |
| 9 | `app/api/reading/route.ts` | Duplicate question transform blocks (with-passage vs without-passage) — ~70 lines each | Medium |
| 10 | `ai/services/hallucination-guard.ts` | Not automatically applied to all LLM outputs — only added where developers remember | Medium |
| 11 | `ai/usecases/analyze-word.ts` | No DSE RAG integration — missing contextual awareness | Low |
| 12 | `ai/usecases/study-help.ts` | Uses temperature 0.7 — highest of all usecases, higher hallucination risk | Low |
| 13 | `ai/services/integrated-skills.ts` | No schema validation via Zod — uses inline type checks | Medium |
| 14 | `ai/services/mcq-filters.ts` | Fallback fillers are generic English phrases — may not match question context | Low |
| 15 | `ai/services/listening-normalizer.ts` | Dev-only validation — errors silently pass in production | Medium |
| 16 | `ai/services/runtime-metrics.ts` | Not wired into all usecases — partial coverage | Medium |

---

## Part 7 — AI Output Types (Zod Schemas)

| # | Schema | Fields Required | Fields Optional | Validation Strictness |
|---|--------|----------------|-----------------|----------------------|
| 1 | `GeneratedQuestionSchema` | type, prompt, answer, explanationZh, explanationEn, commonMistake | promptZh, choices[], grammarPoint, listeningContent, listeningContentZh, readingContent, readingContentZh | High: type enum, all strings min(1), answer min(1). No content quality checks. |
| 2 | `GeneratedQuestionsArraySchema` | Array of #1 | — | High: wraps #1 in z.array() |
| 3 | `AnswerAnalysisSchema` | isCorrect, score(0-100), feedbackZh, feedbackEn, mistakeType, explanation, improvementTip | relatedGrammarPoint | High: score range check, mistakeType enum (7 values). No content quality check. |
| 4 | `WritingAnalysisSchema` | overallScore(0-100), dseLevel, strengths[], weaknesses[], grammarErrors[], chinglishWarnings[], vocabularySuggestions[], structureFeedback, generalComment | contentScore, languageScore, organizationScore, cloTotalScore, revisedVersion | High: score range, dseLevel min(1). CLO scores 0-7 optional. |
| 5 | `MistakeExplanationSchema` | reasonZh, reasonEn, ruleExplanation, examples[], memoryTip, relatedTopics[] | — | High: all strings min(1). Examples array of {wrong, correct}. |
| 6 | `ProgressAnalysisSchema` | summary, strengthsAreas[], urgentAreas[], recommendedFocus[], studyPlan, encouragementMessage, estimatedTimeToImprove | — | High: priority enum with preprocess normalization. |
| 7 | `StudyHelpResponseSchema` | answer, followUpTips[], recommendedFocus[] | — | Medium: answer min(1), arrays default []. |
| 8 | `MaterialAnalysisSchema` | summary, keyVocabulary[], keyGrammarPoints[], suggestedQuestions[], difficultyLevel, suggestedGrade | — | High: difficultyLevel enum (remedial/core/challenge). |
| 9 | `WordAnalysisSchema` | word, partOfSpeech, meaningZh, exampleSentence, exampleZh | allPartOfSpeech[], secondaryMeaningZh, synonyms[], antonyms[], collocations[] | Medium: word min(1). Arrays default []. |

---

## Part 8 — AI Error Statistics

### Current Runtime Metrics (`src/modules/ai/services/runtime-metrics.ts`)

| Metric | Tracked? | Function | Detail |
|--------|----------|----------|--------|
| **JSON failures** | ❌ No | — | Not separately tracked from validation failures |
| **Validation failures** | ✅ Yes | `recordValidationFailure()` | Counts schema validation failures |
| **Repair count** | ✅ Yes | `recordJsonRepair()` | Counts JSON repair attempts |
| **Retry count** | ✅ Yes | `recordRetry()` | Counts retry attempts |
| **Fallback count** | ✅ Yes | `recordProviderCall(provider, success, latency, isFallback)` | Tracks per-provider fallback count |
| **Hallucination count** | ⚠️ Partial | In hallucination-guard.ts (circuit breaker) | Tracks `totalRejections` but not per-request |
| **Invalid MCQ count** | ❌ No | — | Logged as warnings only |
| **Missing answer count** | ❌ No | — | Logged as warnings only |
| **Duplicate option count** | ❌ No | — | Handled silently by Set dedup |
| **Writing score adjustment** | ❌ No | — | Calculated deterministically, not tracked |
| **False positive correction** | ❌ No | — | Filtered silently in analyze-writing.ts |

### Additional Metrics in ai-service.ts (in-memory, not persisted)

| Metric | Tracked? |
|--------|----------|
| `retryStats.totalAttempts` | ✅ |
| `retryStats.retryCount` | ✅ |
| `retryStats.retrySuccesses` | ✅ |
| `retryStats.failedTopics` | ✅ |

### Additional Metrics in saturation-detector.ts

| Metric | Tracked? |
|--------|----------|
| Retry amplification rate | ✅ |
| Fallback amplification rate | ✅ |
| Provider overload status | ✅ |
| Memory pressure | ✅ |

### NOT Tracked
- Per-question-type failure rates
- Per-difficulty-level failure rates
- Per-provider hallucination rates
- Average repair latency
- Question rejection reasons distribution

---

## Part 9 — Current Quality Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                         LLM OUTPUT                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   JSON REPAIR   │  ← json-utils.ts
                    │  5 strategies   │     (parseAIJSON)
                    │  + truncation   │
                    └────────┬────────┘
                             │ (may call LLM again for repair)
                    ┌────────▼────────┐
                    │    SANITIZE     │  ← sanitizer.ts
                    │  PII removal    │     (sanitizeForAI)
                    │  Injection filt │     (for student inputs BEFORE LLM)
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │    SCHEMA       │  ← ai-schema.ts
                    │   VALIDATION    │     (validateAIResponse)
                    │   Zod + stripNulls│
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼────────┐    │    ┌─────────▼────────┐
     │    QUESTION     │    │    │    LISTENING     │
     │   NORMALIZER    │    │    │    VALIDATOR     │
     │ choice cleanup  │    │    │ dialogue format  │
     │ banned filter   │    │    │ answer-in-content│
     │ answer fix      │    │    │ time format warn │
     │ filler injection│    │    └─────────────────┘
     └────────┬────────┘    │
              │              │
     ┌────────▼────────┐    │
     │   PER-QUESTION  │    │
     │   VALIDATION    │    │
     │ MCQ→letter map  │    │
     │ content checks  │    │
     └────────┬────────┘    │
              │              │
              └──────┬───────┘
                     │
            ┌────────▼────────┐
            │  HALLUCINATION  │  ← hallucination-guard.ts
            │     GUARD       │     (NOT always applied)
            │ pattern scoring │
            │ circuit breaker │
            └────────┬────────┘
                     │
            ┌────────▼────────┐
            │     RETURN      │
            │  cleaned data   │
            └─────────────────┘
```

### Pipeline Coverage by Usecase

| Usecase | JSON Repair | Schema | Normalizer | Listening Validator | Hallucination Guard |
|---------|:-----------:|:------:|:----------:|:--------------------:|:--------------------:|
| generateQuestions | ✅ | ✅ | ✅ | ✅ (if listening) | ✅ (in prompt) |
| analyzeAnswer | ✅ | ✅ | ❌ | ❌ | ✅ (in prompt) |
| analyzeWriting | ✅ | ✅ | ❌ | ❌ | ✅ (in prompt) |
| explainMistake | ✅ | ✅ | ❌ | ❌ | ❌ |
| analyzeWord | ✅ | ✅ | ❌ | ❌ | ✅ (in prompt) |
| analyzeProgress | ✅ | ✅ | ❌ | ❌ | ❌ |
| answerStudyHelp | ✅ | ✅ | ❌ | ❌ | ❌ |
| analyzeMaterial | ✅ | ✅ | ❌ | ❌ | ❌ |
| generateWritingPrompt | ❌ (raw string) | ❌ | ❌ | ❌ | ❌ |
| generateWritingOutline | ✅ | ⚠️ (inline) | ❌ | ❌ | ❌ |
| generateWritingGuide | ✅ | ❌ | ❌ | ❌ | ❌ |
| generateIntegratedSkills | ✅ | ⚠️ (inline) | ✅ (listening) | ❌ | ❌ |
| analyzeIntegratedSkills | ✅ | ⚠️ (inline) | ❌ | ❌ | ❌ |
| reading/route.ts (exercise) | ✅ | ❌ | ✅ (passage) | ❌ | ❌ |

✅ = Applied | ⚠️ = Partial | ❌ = Not Applied

---

## Part 10 — Quality Layer Proposal

### Recommended Location

```
src/modules/ai/quality/
```

### Recommended Structure

| File | Purpose |
|------|---------|
| `quality-engine.ts` | Orchestrates all quality checks. Single entry point called by every usecase after LLM response. |
| `quality-rules.ts` | Declarative rule definitions: what checks apply to which usecase, thresholds, severities. |
| `quality-fixes.ts` | Standardized fix functions: repairMissingAnswer(), fixDuplicateOptions(), normalizeExplanation(). Consolidates fixes currently scattered across normalizer/validator. |
| `quality-scoring.ts` | Assigns quality score (0-100) to AI output based on checks passed, repairs needed, warnings generated. |
| `quality-report.ts` | Generates structured quality report per request: checks passed, repairs applied, warnings, overall score. |
| `quality-metrics.ts` | Centralized metrics collection: tracks ALL failure types, repair types, hallucination flags. |
| `quality-plugin.ts` | Plugin interface for domain-specific quality checks (reading, writing, listening, speaking, integrated). |

### Why This Location

1. **Currently scattered**: Quality checks are spread across `services/question-normalizer.ts`, `services/question-validator.ts`, `services/listening-normalizer.ts`, `services/hallucination-guard.ts`, `services/mcq-filters.ts`, `usecases/analyze-writing.ts` (inline), `reading/route.ts` (inline). Consolidating reduces duplication.

2. **Inconsistent application**: Only `generateQuestions` passes through the full pipeline. Other usecases receive minimal quality treatment. A centralized quality layer ensures ALL AI outputs are checked.

3. **No quality scoring**: Currently, AI outputs either pass or are rejected. There's no graduated quality score that could drive retry decisions or user feedback.

4. **Missing metrics**: Only 6 of 11 failure types are tracked. A centralized metrics module would capture ALL quality events.

5. **Plugin architecture**: Different domains (reading, writing, listening) have different quality requirements. A plugin interface allows domain-specific checks without cluttering the core quality engine.

---

## Part 11 — High Priority Missing Checks

### Reading
| Check | Status |
|-------|--------|
| ☐ Answer uniqueness | ❌ NOT implemented |
| ☐ Distractor quality | ❌ NOT implemented (only regex filters, no semantic check) |
| ☐ Duplicate options | ✅ Implemented (Set deduplication) |
| ☐ Missing answer | ✅ Implemented (Zod min(1), non-MC rejection) |
| ☐ Impossible question | ❌ NOT implemented |
| ☐ Multiple correct answers | ❌ NOT implemented |

### Writing
| Check | Status |
|-------|--------|
| ☐ Score calibration | ⚠️ Partial (CLO mapping exists, but no cross-validation) |
| ☐ Severity calibration | ⚠️ Partial (false positive filters exist) |
| ☐ Positive feedback balancing | ❌ NOT implemented |
| ☐ DSE rubric consistency | ⚠️ Partial (CLO descriptors in prompt, not verified) |

### Listening
| Check | Status |
|-------|--------|
| ☐ Transcript consistency | ✅ Implemented (validateListeningConsistency) |
| ☐ Option ambiguity | ❌ NOT implemented |

### Vocabulary
| Check | Status |
|-------|--------|
| ☐ Incorrect POS | ❌ NOT implemented |
| ☐ Wrong synonym | ❌ NOT implemented |

### Grammar
| Check | Status |
|-------|--------|
| ☐ Multiple valid answers | ❌ NOT implemented |
| ☐ Over-strict correction | ⚠️ Partial (format tolerance in prompt, not verified) |

### Integrated Skills
| Check | Status |
|-------|--------|
| ☐ Source citation consistency | ❌ NOT implemented |
| ☐ Cross-reference consistency | ❌ NOT implemented |

---

## Part 12 — Priority Ranking

| Priority | Improvement | Difficulty | Impact |
|----------|-------------|------------|--------|
| **P0** | Centralized quality engine (consolidate scattered checks) | Medium | High — eliminates inconsistency, covers all usecases |
| **P0** | Quality metrics (track all failure types) | Low | High — enables data-driven improvement |
| **P1** | Answer accuracy verification (check AI-generated answer is correct for question) | High | High — most impactful gap in question generation |
| **P1** | Semantic distractor quality check (are wrong options plausible?) | High | High — directly affects question quality |
| **P1** | Apply Hallucination Guard to ALL usecases (not just some) | Low | Medium — reduces hallucination risk universally |
| **P2** | Rubric-based answer evaluation (replace free-text prompts with structured rubrics) | High | High — enables consistent, explainable scoring |
| **P2** | Multi-answer detection (flag questions with >1 correct answer) | Medium | Medium — prevents invalid questions |
| **P2** | Difficulty calibration (quantitative difficulty scoring) | High | Medium — ensures appropriate challenge level |
| **P3** | Retry.ts integration for all usecases (currently only some use it) | Low | Medium — improves resilience |
| **P3** | Production-grade listening validation (currently dev-only) | Low | Medium — catches production failures |
| **P3** | Schema validation for integrated-skills + writing-generation outputs | Low | Medium — prevents malformed outputs |
| **P4** | Positive feedback balance check for writing analysis | Low | Low — improves user experience |
| **P4** | POS verification for vocabulary analysis | Medium | Low — domain-specific improvement |
| **P4** | Cross-reference consistency for integrated skills | Medium | Low — domain-specific improvement |
