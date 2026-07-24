# ADR-025: Content Consistency Layer

- **Status**: Accepted
- **Date**: 2026-07-24
- **Sprint**: 103
- **Depends on**: ADR-024 (AI Quality Layer)

## Context

Sprint 101 introduced the Quality Engine with structural question rules. Sprint 102 added MCQ integrity rules. However, AI outputs can be structurally valid (all fields present, correct types) while being semantically incorrect — e.g., an answer that doesn't match any choice, or a reading question unanswerable from the passage.

## Decision

Introduce a **Content Consistency Layer** as a new rule pack within the Quality Engine. This layer adds 7 rules that validate semantic integrity:

1. **AnswerConsistencyRule** — answer matches choices, explanation doesn't contradict
2. **OptionConsistencyRule** — exactly one distinct correct option, no identical distractors
3. **PassageConsistencyRule** — reading questions answerable from passage
4. **TranscriptConsistencyRule** — listening questions answerable from transcript
5. **ReferenceConsistencyRule** — paragraph/line/speaker references exist
6. **FactConsistencyRule** — facts consistent across question/answer/explanation
7. **DifficultyConsistencyRule** — vocabulary/sentence complexity matches requested level

## New Quality Framework

### Severity Model (replaces simple warning/error)
- **INFO** — minor improvement opportunity
- **WARNING** — acceptable output with quality issue
- **ERROR** — needs repair
- **CRITICAL** — cannot safely grade
- **FATAL** — reject entire output

### Quality Dimensions (replaces single score)
- **Structure** (25%) — fields present, types correct
- **Consistency** (30%) — answers match, facts consistent
- **Pedagogy** (15%) — age-appropriate difficulty
- **Assessment** (20%) — answerable, gradeable
- **Repairability** (10%) — auto-fixable defects

### Rule Categories (declares validation approach)
- **deterministic** — pure logic, no ambiguity
- **heuristic** — pattern-based, reasonable confidence
- **ai-assisted** — requires LLM judgment

## Consequences

### Positive
- Semantic quality validation beyond structural checks
- Multi-dimensional quality scoring for nuanced assessment
- Severity model enables graduated response to quality issues
- All rules are deterministic or heuristic — no LLM dependency for validation

### Negative
- Additional processing overhead (~2-5ms total for all 7 rules)
- Heuristic rules may produce false positives for edge cases
- PassConsistency and TranscriptConsistency rely on keyword matching, not semantic understanding

## Extension

Future sprints may add:
- Semantic similarity checking (AI-assisted)
- Cross-reference validation between question sets
- Answer explanation coherence scoring
- Progressive difficulty calibration against student performance data

## See Also
- ADR-024: AI Quality Layer
- Sprint 101: Quality Engine Foundation
- Sprint 102: Question Quality Rule Pack
