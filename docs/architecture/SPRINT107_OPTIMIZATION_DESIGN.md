# Sprint 107 — AI Output Optimization Layer: Architecture Proposal

> **Status**: Design Phase (Pre-Implementation)  
> **Date**: 2026-07-24  
> **Type**: Architecture Review & Proposal  
> **Depends on**: Sprint 101-106 (Quality, Repair, Evaluation, Assessment)  

---

## Part 1 — UX Failure Audit

Based on analysis of the current platform's AI generation pipeline, here are the recurring UX failures classified by root cause:

### 1.1 Generation Defects (AI Prompt → LLM Output)

| # | Failure | UX Impact | Frequency | Root Cause |
|---|---------|-----------|-----------|------------|
| G1 | Missing answer field | Student sees blank answer — cannot grade | Medium | LLM omits field; Zod catches but rejects entire batch |
| G2 | MCQ has weak distractors | Student guesses correctly 90% — not learning | High | Prompt focuses on structure, not distractor quality |
| G3 | Answer key incorrect | Student marked wrong for correct answer | Low | No post-generation answer verification against passage |
| G4 | Explanation contradicts answer | Student confused — trusts wrong information | Medium | LLM generates explanation independently from answer |
| G5 | Generated question too easy/hard | Wastes student time or causes frustration | High | Difficulty estimation is heuristic (word count only) |
| G6 | Passage doesn't support answer | Unanswerable question — student gives up | Medium | No semantic answer-to-passage verification |
| G7 | Listening transcript mismatch | TTS reads wrong answer — confusing | Low | Verbatim check is strict; synonym mismatch rejected |
| G8 | Duplicated options | MCQ has 2 identical choices — invalid | Low | Set dedup catches this but rejects question |
| G9 | "All of the above" options | Not DSE-compatible format | Low | Banned pattern filter catches but rejects |
| G10 | Writing prompt too vague | No clear task — student writes generic essay | High | Prompt quality check is basic (length only) |

### 1.2 Evaluation Defects (Student Answer → Grade)

| # | Failure | UX Impact | Frequency | Root Cause |
|---|---------|-----------|-----------|------------|
| E1 | Grading too strict (exact match) | Correct answer marked wrong | Very High | Only fixed in Sprint 105; not yet integrated into all paths |
| E2 | Synonym not accepted | "automobile" marked wrong for "car" | High | Synonym dictionary is static (40 groups) |
| E3 | Partial credit not awarded | Student gets 0 for 80% correct answer | Medium | Only keyword-based; semantic partial credit missing |
| E4 | Feedback unhelpful | "Correct answer: X" — no explanation | High | AI evaluator returns feedback; legacy path doesn't use it |

### 1.3 Assessment Defects (Question Quality → Approval)

| # | Failure | UX Impact | Frequency | Root Cause |
|---|---------|-----------|-----------|------------|
| A1 | MCQ approved with weak distractors | Student not challenged | Medium | Distractor check is structural, not semantic |
| A2 | Difficulty mismatch undetected | Frustration or boredom | Medium | Vocabulary check is word-level, not contextual |
| A3 | Writing prompt approved despite vagueness | Poor writing task | Medium | Only checks length + keyword presence |

### 1.4 Repair Defects (Failed Check → Fix)

| # | Failure | UX Impact | Frequency | Root Cause |
|---|---------|-----------|-----------|------------|
| R1 | Repair replaces entire question | Better to fix one field | Low | Planner groups all repairs; no field-level targeting |
| R2 | Repair budget exceeded — question lost | Student gets no question | Low | Budget too conservative (2 patches max) |
| R3 | No regeneration capability | Can't fix passage-level issues | Medium | REGENERATE action is reserved but unimplemented |

### 1.5 Prompt Defects (System Prompt → LLM Behavior)

| # | Failure | UX Impact | Frequency | Root Cause |
|---|---------|-----------|-----------|------------|
| P1 | LLM returns "All of the above" | Caught by filter; question lost | Low | Prompt doesn't explicitly forbid this strongly enough |
| P2 | LLM favors certain topics | Monotonous questions | Medium | Topic rotation is random but LLM gravitates to familiar patterns |
| P3 | LLM generates too-short passages | Can't support comprehension | Medium | Word count in prompt, but LLM ignores under pressure |

---

## Part 2 — Taxonomy of Optimization Opportunities

### 2.1 Question Quality
- **Structural completeness**: All required fields present, types correct
- **Grammatical correctness**: Question text free of errors
- **Natural language**: Reads as native-like English, not "translation English"
- **Cultural appropriateness**: Relevant to HK student experience

### 2.2 Answer Quality
- **Correctness**: Answer is factually/logically correct for the question
- **Uniqueness**: Only one valid interpretation exists (no ambiguity)
- **Verifiability**: Answer can be located in source material

### 2.3 Distractor Quality
- **Plausibility**: Each wrong option could be chosen by someone who doesn't fully understand
- **Diversity**: Options test different misconceptions, not variations of the same error
- **Balance**: Similar length, complexity, and grammatical form

### 2.4 Difficulty Quality
- **Calibration**: Matches target CEFR/grade level
- **Consistency**: All elements (passage, question, options) at similar difficulty
- **Progression**: Questions within a set progress from easier to harder

### 2.5 Feedback Quality
- **Explanatory**: Explains WHY, not just WHAT
- **Actionable**: Student can learn from it
- **Encouraging**: Maintains motivation

### 2.6 Writing Prompt Quality
- **Specificity**: Clear task, audience, purpose, format
- **Scaffolding**: Appropriate guidance for target level
- **Engagement**: Interesting and relevant topic

### 2.7 Reading Quality
- **Passage authenticity**: Reads like real-world text, not generated filler
- **Question sequencing**: Follows passage order
- **Reference accuracy**: Line/paragraph references correct

### 2.8 Listening Quality
- **Transcript authenticity**: Natural dialogue patterns
- **TTS compatibility**: Speaker labels, formatting
- **Information density**: Appropriate amount of content per question

### 2.9 Integrated Skills Quality
- **Cross-source consistency**: Data file, transcript, and task aligned
- **Task authenticity**: Mirrors real DSE Paper 3 format
- **Scoring clarity**: What constitutes a complete answer

### 2.10 Student Experience
- **Fairness**: No trick questions, no ambiguous wording
- **Engagement**: Topics are interesting and varied
- **Confidence**: System is clearly on the student's side

---

## Part 3 — Optimization Analysis (Per-Problem)

### P0: Grading too strict (E1)
- **Current flow**: Student answer → AI evaluator (if wired) or exact match (legacy)
- **Root cause**: Legacy `submitAnswer` uses `===` comparison; AI evaluator not wired everywhere
- **Deterministic fix?** Yes — use Evaluation Engine (Sprint 105) in all grading paths
- **Need AI regeneration?** No
- **Expected UX improvement**: Very High — dramatically reduces false negatives
- **Risk**: Low — Evaluation Engine is already tested

### P1: MCQ weak distractors (G2, A1)
- **Current flow**: LLM generates choices → MCQOptionRule checks count → Assessment checks structure
- **Root cause**: No semantic check on distractor plausibility
- **Deterministic fix?** Partially — can detect obviously-bad patterns; semantic quality needs heuristics
- **Need AI regeneration?** Only for rejected questions — regenerate choices field specifically
- **Expected UX improvement**: High — better learning outcomes
- **Risk**: Medium — false positives possible (flagging acceptable distractors)

### P2: Difficulty miscalibration (G5, A2)
- **Current flow**: Prompt specifies CEFR mapping → DifficultyAlignmentRule checks C1/A1 word lists
- **Root cause**: Word-list based check is coarse; doesn't account for sentence complexity or concept difficulty
- **Deterministic fix?** Partially — can add sentence complexity metrics (Flesch-Kincaid, etc.)
- **Need AI regeneration?** Yes for rejected questions — rewrite at target level
- **Expected UX improvement**: High — appropriate challenge level
- **Risk**: Medium — difficulty is inherently subjective

### P3: Explanation contradicts answer (G4)
- **Current flow**: LLM generates both fields independently → AnswerConsistencyRule detects contradictions
- **Root cause**: LLM treats answer and explanation as separate generation tasks
- **Deterministic fix?** Partially — current heuristic check catches letter mismatches
- **Need AI regeneration?** Yes — regenerate explanation to match verified answer
- **Expected UX improvement**: Medium — less confusion
- **Risk**: Low — contradiction detection is already implemented

### P4: Writing prompt vagueness (G10, A3)
- **Current flow**: LLM generates → WritingPromptQualityRule checks keywords
- **Root cause**: Prompt requirements are soft; LLM can produce minimal prompts
- **Deterministic fix?** Partially — add specificity checks (named entities, concrete scenarios)
- **Need AI regeneration?** Yes — regenerate prompt with more details
- **Expected UX improvement**: Medium — better writing tasks
- **Risk**: Low

### P5: Synonym not accepted (E2)
- **Current flow**: Synonym dictionary (40 groups) checked → semantic comparator uses it
- **Root cause**: Static dictionary; domain-specific synonyms missing
- **Deterministic fix?** Yes — expand dictionary with DSE-specific vocabulary (academic, subject-specific)
- **Need AI regeneration?** No
- **Expected UX improvement**: High — reduces false negatives
- **Risk**: Very Low — adding more synonym groups is safe

### P6: Missing answer field (G1)
- **Current flow**: Zod catches → rejects entire question batch
- **Root cause**: LLM occasionally omits field
- **Deterministic fix?** Yes — repair engine can generate placeholder
- **Need AI regeneration?** Only as last resort — regenerate just the answer field
- **Expected UX improvement**: Medium — fewer lost questions
- **Risk**: Low — placeholder is better than no question

### P7: Repair budget too restrictive (R2)
- **Current flow**: Max 2 patches, 1 regeneration → many repairs fail
- **Root cause**: Conservative budget from Sprint 104
- **Deterministic fix?** Yes — increase budget or make it adaptive
- **Need AI regeneration?** No
- **Expected UX improvement**: Medium — more questions salvaged
- **Risk**: Low — just number tuning

### P8: Listening transcript issues (G7)
- **Current flow**: TranscriptConsistencyRule checks verbatim → PATCH_OPTIONS for mismatch
- **Root cause**: Verbatim check is strict; natural dialogue uses synonyms
- **Deterministic fix?** Partially — add fuzzy matching, synonym tolerance
- **Need AI regeneration?** For severe mismatches — regenerate transcript
- **Expected UX improvement**: Medium — fewer listening questions rejected
- **Risk**: Medium — balancing accuracy vs tolerance

---

## Part 4 — Module Design: `src/modules/ai/optimization/`

### 4.1 Directory Structure

```
src/modules/ai/optimization/
├── optimization-types.ts       # Core types (OptimizationRule, OptimizationResult, etc.)
├── optimization-engine.ts      # Orchestrates optimization pipeline
├── optimization-registry.ts    # Pluggable optimization rule registry
├── optimization-report.ts      # Structured optimization reports
├── optimization-dashboard.ts   # Real-time optimization quality dashboard
├── rules/                      # Optimization rules (see §4.2)
│   ├── distractor-optimization.rule.ts
│   ├── explanation-optimization.rule.ts
│   ├── difficulty-optimization.rule.ts
│   ├── vocabulary-optimization.rule.ts
│   ├── naturalness-optimization.rule.ts
│   ├── answer-coverage.rule.ts
│   ├── student-tolerance.rule.ts
│   ├── hint-quality.rule.ts
│   ├── feedback-tone.rule.ts
│   ├── writing-prompt-optimization.rule.ts
│   ├── passage-optimization.rule.ts
│   ├── distractor-balance.rule.ts
│   └── index.ts
├── strategies/                 # How to fix each type of issue
│   ├── repair-strategy.ts      # Deterministic fixes (existing repair engine)
│   ├── rewrite-strategy.ts     # Field-level LLM regeneration
│   ├── rebalance-strategy.ts   # Adjust difficulty/distractors
│   ├── regenerate-strategy.ts  # Full question regeneration
│   └── index.ts
├── metrics/
│   ├── optimization-metrics.ts # Track optimization effectiveness
│   └── ux-metrics.ts          # Track learner-facing quality signals
├── history/
│   └── optimization-history.ts # Audit trail of optimizations
└── index.ts                    # Barrel export
```

### 4.2 Core Types (`optimization-types.ts`)

```typescript
// Optimization action (what to do)
type OptimizationAction = 'none' | 'repair' | 'rewrite' | 'rebalance' | 'regenerate' | 'accept' | 'reject' | 'escalate';

// Optimization target (what to optimize)
type OptimizationTarget = 'question' | 'answer' | 'choices' | 'explanation' | 'passage' | 'transcript' | 'difficulty' | 'distractors' | 'feedback';

// Optimization strategy (how to do it)
type OptimizationStrategy = 'deterministic' | 'heuristic' | 'ai-assisted';

// Single optimization check
interface OptimizationCheck {
  ruleId: string;
  target: OptimizationTarget;
  action: OptimizationAction;
  strategy: OptimizationStrategy;
  score: number;         // 0-100 improvement potential
  priority: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  canAutoFix: boolean;
}

// Full optimization result
interface OptimizationResult {
  originalScore: number;     // Assessment score before optimization
  optimizedScore: number;    // After optimization
  checks: OptimizationCheck[];
  applied: OptimizationCheck[];  // Optimizations that were applied
  rejected: OptimizationCheck[]; // Optimizations rejected (budget/risk)
  metrics: OptimizationMetrics;
}
```

### 4.3 Optimization Engine (`optimization-engine.ts`)

Responsibilities:
1. Receive a question that has passed all quality gates but may have suboptimal UX
2. Run all optimization rules to identify improvement opportunities
3. Prioritize by impact × feasibility
4. Apply deterministic fixes immediately
5. Queue AI-assisted fixes for regeneration
6. Re-validate through Assessment Engine
7. Return optimized question with before/after scores

### 4.4 Optimization Rules (12 rules)

| Rule | Target | Strategy | Action | Priority |
|------|--------|----------|--------|----------|
| DistractorOptimizationRule | distractors | heuristic | rebalance | High |
| ExplanationOptimizationRule | explanation | heuristic | rewrite | Medium |
| DifficultyOptimizationRule | difficulty | deterministic | rebalance | High |
| VocabularyOptimizationRule | choices, passage | heuristic | rewrite | Medium |
| NaturalnessOptimizationRule | question, passage | heuristic | rewrite | Low |
| AnswerCoverageRule | answer | deterministic | repair | High |
| StudentToleranceRule | grading | deterministic | accept | Critical |
| HintQualityRule | explanation | heuristic | rewrite | Low |
| FeedbackToneRule | feedback | deterministic | rewrite | Low |
| WritingPromptOptimizationRule | prompt | heuristic | rewrite | Medium |
| PassageOptimizationRule | passage | heuristic | rewrite | Medium |
| DistractorBalanceRule | distractors | deterministic | rebalance | High |

---

## Part 5 — Runtime Position

### 5.1 Recommended Position

```
AI Generation
     ↓
Workflow Engine
     ↓
Quality Engine (Sprint 101-103)    ← structural validation
     ↓
Repair Pipeline (Sprint 104)       ← auto-fix critical defects
     ↓
Evaluation Engine (Sprint 105)     ← grading quality validation
     ↓
Assessment Engine (Sprint 106)     ← question quality scoring
     ↓
OPTIMIZATION ENGINE (Sprint 107)   ← UX quality improvement ← NEW
     ↓
API Response
```

### 5.2 Rationale

The Optimization Layer must execute AFTER assessment because:
1. Assessment provides the baseline quality score — we need to know CURRENT quality before optimizing
2. Optimization decisions depend on: which dimensions scored low, which repairs were applied, what the decision was
3. Optimization is optional — approved questions with high scores can skip optimization
4. Optimization is expensive — only apply when there's demonstrable room for improvement

The Optimization Layer must execute BEFORE API response because:
1. It transforms the final output that reaches the student
2. It can add value (better distractors, clearer explanations) without changing correctness

### 5.3 Execution Flow

```
AssessmentResult { score: 65, decision: 'warning', dimensions: {...} }
     ↓
Should optimize? (score < 80 OR dimension scores imbalanced)
     ↓ Yes
OptimizationEngine.optimize(question, assessmentResult)
     ↓
Run optimization rules → produce OptimizationChecks
     ↓
Filter by budget + priority
     ↓
Apply deterministic fixes (StudentToleranceRule, AnswerCoverageRule)
     ↓
Apply heuristic fixes (DifficultyOptimizationRule, DistractorBalanceRule)
     ↓
Queue AI-assisted fixes (ExplanationOptimizationRule, VocabularyOptimizationRule)
     ↓
Re-assess → new AssessmentResult
     ↓
Return optimized question
```

---

## Part 6 — Strategy Analysis

### 6.1 Deterministic vs Heuristic vs AI-Assisted

| Strategy | Use When | Examples | Risk |
|----------|----------|----------|------|
| **Deterministic** | Fix is mathematically certain | Expand synonym dictionary, trim whitespace, normalize formatting | Zero |
| **Heuristic** | Pattern-based with high confidence | Detect weak distractors (length imbalance), estimate difficulty (word lists + sentence metrics) | Low |
| **AI-Assisted** | Requires semantic understanding | Regenerate distractors, rewrite explanation, rephrase for naturalness | Medium |

### 6.2 Recommended Split
- **70% deterministic/heuristic**: Most UX improvements are pattern-based
- **30% AI-assisted**: Reserved for true semantic improvements (regeneration)
- **Never fully AI-dependent**: Deterministic fallback always available

---

## Part 7 — Reusable Components

| Existing Module | Reuse In | How |
|----------------|----------|-----|
| Quality Engine (Sprint 101) | OptimizationEngine | Same registry pattern, same rule interface |
| Repair Engine (Sprint 104) | strategies/repair-strategy.ts | Direct reuse for deterministic fixes |
| Evaluation Engine (Sprint 105) | StudentToleranceRule | Use semantic comparator for grading tolerance |
| Assessment Engine (Sprint 106) | OptimizationEngine | Baseline scoring, re-assessment after optimization |
| Question Normalizer | NaturalnessOptimizationRule | Reuse normalization pipeline |
| Synonym Dictionary | VocabularyOptimizationRule | Expand with DSE-specific terms |
| Repair Budget | OptimizationEngine | Adapt budget for optimization operations |
| Repair History | optimization-history.ts | Same audit trail pattern |
| Health Endpoint | optimization-dashboard.ts | Expose optimization metrics |

### Duplicate Logic to Avoid
- Do NOT reimplement question validation (use Quality Engine)
- Do NOT reimplement grading (use Evaluation Engine)
- Do NOT reimplement assessment (use Assessment Engine)
- Do NOT reimplement repair (use Repair Engine)
- Do NOT reimplement JSON parsing (use json-utils)

---

## Part 8 — Migration Plan

### Phase 1: Foundation (Sprint 107)
1. Create `src/modules/ai/optimization/` directory structure
2. Implement `optimization-types.ts` with all interfaces
3. Implement `optimization-registry.ts` (pluggable, like other registries)
4. Implement `optimization-engine.ts` (orchestrator, reuses existing modules)
5. Implement `optimization-metrics.ts` and `optimization-history.ts`
6. Create ADR-029-ai-output-optimization.md
7. Wire health endpoint: `runtime.optimization`

### Phase 2: Rules (Sprint 108)
1. Implement 12 optimization rules (deterministic + heuristic only)
2. Integrate with existing Quality/Repair/Evaluation/Assessment modules
3. Add architecture tests
4. All rules use deterministic or heuristic strategies only (no AI-assisted yet)

### Phase 3: AI-Assisted (Sprint 109 — Optional)
1. Implement AI-assisted strategies (regeneration of specific fields)
2. Add budget controls for AI calls
3. Add feature flag for AI-assisted optimization

### Phase 4: Dashboard (Sprint 110 — Optional)
1. Implement `optimization-dashboard.ts` with real-time metrics
2. Add optimization quality trends to health endpoint
3. Track before/after quality score distributions

---

## Part 9 — Priority Roadmap

| Priority | Optimization | Difficulty | Impact | Sprint |
|----------|-------------|------------|--------|--------|
| **P0** | Wire Evaluation Engine to all grading paths (E1 fix) | Low | Very High | Immediate |
| **P0** | Expand synonym dictionary for DSE vocabulary (E2 fix) | Low | High | Sprint 107 |
| **P0** | StudentToleranceRule — default to STANDARD policy | Low | Very High | Sprint 107 |
| **P1** | DistractorOptimizationRule — length balance check | Medium | High | Sprint 108 |
| **P1** | DifficultyOptimizationRule — sentence complexity metrics | Medium | High | Sprint 108 |
| **P1** | Increase repair budget (2→4 patches) | Low | Medium | Sprint 107 |
| **P2** | ExplanationOptimizationRule — contradiction rewrite | Medium | Medium | Sprint 109 |
| **P2** | VocabularyOptimizationRule — DSE-specific vocab upgrade | Medium | Medium | Sprint 109 |
| **P2** | WritingPromptOptimizationRule — specificity enhancement | Medium | Medium | Sprint 109 |
| **P3** | NaturalnessOptimizationRule — native-like phrasing | High | Low | Sprint 110 |
| **P3** | HintQualityRule — educational hint generation | High | Low | Sprint 110 |
| **P3** | FeedbackToneRule — encouraging feedback | Low | Low | Sprint 110 |

---

## Part 10 — Architecture Constraints

1. **No public API changes** — optimization is internal to AI generation pipeline
2. **No workflow changes** — optimization plugs into existing pipeline after assessment
3. **No provider changes** — uses same LLM providers as existing generation
4. **No regression** — optimized output must pass all existing quality gates
5. **Voluntary adoption** — initially opt-in; can be disabled via feature flag
6. **Budget-controlled** — optimization has its own budget (separate from repair budget)
7. **Auditable** — every optimization is logged with before/after values
