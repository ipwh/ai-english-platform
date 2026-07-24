# ADR-036: Human Review Layer

- **Status**: Accepted
- **Date**: 2026-07-24
- **Deciders**: Sprint 115 architecture review
- **Module**: `src/modules/ai/human-review/`

---

## Context

The platform had 8 quality layers (Quality, Repair, Evaluation, Assessment, Optimization, Calibration, Question Quality, Fairness) — all rule-based and deterministic.

However, **Rule Pass ≠ Human Pass**. A question can pass all automated checks yet still feel wrong to a real teacher or student. Examples:

- Two options are both technically plausible (ambiguity)
- Distractors are obviously wrong to any student (no challenge)
- Explanations say "A is correct" without teaching why
- Writing prompts say "Write an essay" without authentic context
- All questions start with "Which of the following..."
- Passages read like AI-generated text (uniform sentence length, no transitions)

These issues cannot be caught by structural validation alone. They require a "human teacher" perspective.

## Decision

Create a **Human Review Layer** that simulates a teacher's final quality check. Position it after all automated layers, just before the API response:

```
... → Optimization → Human Review → Adaptive Learning → Feedback Learning → API Response
```

This layer applies 12 rules from a teacher's perspective, asking "Would a student find this confusing?" rather than "Did all rules pass?"

## Architecture

### Rules (12)

| # | Rule | Priority | Perspective |
|---|------|----------|-------------|
| 1 | Ambiguity | critical | Are two answers both plausible? |
| 2 | DistractorNaturalness | critical | Do wrong answers look obviously wrong? |
| 3 | ExplanationQuality | critical | Does the explanation actually teach? |
| 4 | WordingNaturalness | high | Does it sound like AI wrote it? |
| 5 | QuestionFlow | medium | Is every question "Which of the following..."? |
| 6 | AnswerSupport | critical | Is the answer supported by passage/transcript? |
| 7 | OptionFairness | high | Are all options similar in length/structure? |
| 8 | WritingAuthenticity | critical | Does the prompt feel like a real teacher? |
| 9 | ReadingNaturalness | medium | Does the passage have natural paragraphs/transitions? |
| 10 | ListeningNaturalness | medium | Does the transcript sound like real conversation? |
| 11 | IntegratedSkillsFlow | medium | Do reading/listening/writing share a natural scenario? |
| 12 | StudentConfusion | high | Would a first-time reader be confused? |

### Scoring (6 dimensions)

| Dimension | Weight | Teacher Question |
|-----------|--------|-----------------|
| studentExperience | 25% | Would a student find this engaging and clear? |
| naturalness | 20% | Does it read like human-written content? |
| teachingValue | 20% | Does it actually teach something? |
| authenticity | 15% | Does it feel like a real exam question? |
| fairness | 10% | Are options balanced? No trick questions? |
| confidence | 10% | How confident is this review? |

### Decisions

| Score | Decision |
|-------|----------|
| 95+ | excellent |
| 90+ | good |
| 80+ | acceptable |
| 65+ | needs_improvement |
| <65 | reject |

### Responsibility Boundaries

| Layer | Checks | Human Review checks |
|-------|--------|-------------------|
| Quality | Structure, fields | — |
| Assessment | Validity, reliability | — |
| Optimization | Readability, formatting | — |
| **Human Review** | — | **Teacher perspective, student experience** |

Human Review does NOT duplicate existing checks. It adds the missing dimension: "Does this feel right to a human?"

## Consequences

### Positive
- Catches issues invisible to structural validation
- Simulates teacher intuition deterministically
- Improves student trust (content feels authentic)
- Writing prompts feel like real exam questions
- Explanations actually teach, not just label

### Negative
- Some checks are heuristic (sentence length uniformity, transition word presence)
- "Naturalness" is inherently subjective — rules are approximations
- Adds latency (~15ms for 12 rules over a typical question set)

## Alternatives Considered

1. **Actual human review**: Send flagged questions to teachers. Rejected: doesn't scale, adds latency.
2. **LLM-based review**: Use Claude/GPT to review content. Rejected: non-deterministic, expensive, violates architecture.
3. **Skip human-like review**: Trust automated layers only. Rejected: Rule Pass ≠ Human Pass as demonstrated by real testing.
