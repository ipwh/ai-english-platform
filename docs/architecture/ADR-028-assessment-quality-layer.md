# ADR-028: Assessment Quality Layer

- **Status**: Accepted
- **Date**: 2026-07-24
- **Sprint**: 106
- **Depends on**: ADR-024, ADR-025, ADR-027

## Context

AI-generated questions need quality validation before reaching students. Previous sprints focused on structural integrity (Sprint 102) and content consistency (Sprint 103), but did not assess whether questions are educationally sound, fair, and aligned with DSE standards.

## Decision

Introduce an **Assessment Quality Layer** that evaluates generated questions against 13 quality rules across 5 dimensions.

### Quality Dimensions
- **Validity (30%)** — correct answer, no ambiguity
- **Reliability (20%)** — consistent results, passage/transcript alignment
- **Fairness (10%)** — free from bias, plausible distractors
- **Difficulty (20%)** — matches target CEFR/grade level
- **Pedagogy (20%)** — educationally sound, clear instructions

### Assessment Rules (13 total)
1. MCQ Quality — exactly 4 options, valid answer, no banned patterns
2. Distractor Quality — plausible options, similar length, no duplicates
3. Answer Uniqueness — only one correct option
4. Difficulty Alignment — vocabulary matches grade level
5. Question Clarity — no double negatives, clear wording
6. Option Balance — similar length/complexity, consistent grammar
7. Passage Alignment — answer supported by passage
8. Listening Alignment — answer exists in transcript
9. Reference Quality — paragraph/line/speaker references valid
10. Vocabulary Level — grade-appropriate vocabulary
11. Grammar Quality — correct grammar, consistent tense
12. Writing Prompt Quality — audience, task, word limit defined
13. Integrated Skills Quality — cross-reference consistency

### Decision Thresholds
- Score ≥ 80 and no critical failures → APPROVED
- Score ≥ 50 and no critical failures → WARNING
- Score ≥ 30 → REPAIR_REQUIRED
- Otherwise → REJECTED

## Consequences
- Prevents low-quality questions from reaching students
- Deterministic assessment (no LLM dependency)
- Integrates with existing Repair Layer for auto-fix recommendations
- Health endpoint exposes assessment quality metrics

## See Also
- ADR-024: AI Quality Layer
- ADR-025: Content Consistency Layer
- ADR-026: Self-Healing Layer
- ADR-027: Intelligent Answer Evaluation
