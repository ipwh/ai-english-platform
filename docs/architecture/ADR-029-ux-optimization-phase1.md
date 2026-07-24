# ADR-029: UX Optimization Layer (Phase 1)

- **Status**: Accepted
- **Date**: 2026-07-24
- **Sprint**: 108
- **Depends on**: ADR-024, ADR-028, Sprint 107 Design

## Context

Sprint 107 designed an Optimization Layer to improve learner-facing question quality. Sprint 108 implements Phase 1: 12 deterministic optimization rules that improve UX without any LLM calls.

## Decision

Implement a **deterministic-only** Optimization Layer. All rules use string manipulation, pattern matching, and heuristic checks — no AI dependency.

### 12 Rules (by priority)

| Priority | Rule | Action |
|----------|------|--------|
| P0 | StudentToleranceRule | Enables lenient grading (article/punctuation/capitalization tolerance) |
| P0 | AnswerQualityRule | Detects and repairs empty/placeholder answers |
| P1 | DistractorOptimizationRule | Normalizes option lengths, shuffles answer position |
| P1 | MCQBalanceRule | Checks option length balance and position distribution |
| P1 | DuplicateChoiceRule | Removes/merges duplicate options |
| P2 | ExplanationRule | Copies across languages, removes boilerplate |
| P2 | DifficultyRebalanceRule | Flags questions with low assessment scores |
| P2 | WritingPromptRule | Checks for task/audience/word-limit presence |
| P3 | OptionNaturalnessRule | Normalizes option capitalization and formatting |
| P3 | WordingRule | Removes double spaces, repeated words, LLM artifacts |
| P3 | ReadabilityRule | Normalizes line breaks, adds paragraph breaks |
| P3 | VocabularySmoothingRule | Replaces unnecessarily complex words |

### Runtime Position
```
Assessment Engine → Optimization Engine → API Response
```

### Optimization Score
- Student Experience: 30%
- Assessment: 20%
- Readability: 15%
- Consistency: 15%
- Difficulty: 10%
- Repairability: 10%

## Consequences
- All 12 rules are deterministic (zero LLM dependency)
- Average optimization latency <1ms
- Improves UX without architectural changes
- Health endpoint exposes optimization metrics

## See Also
- Sprint 107: Optimization Design
- ADR-024: AI Quality Layer
- ADR-028: Assessment Quality Layer
