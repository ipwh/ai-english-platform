# ADR-032: AI Output Calibration Layer

- **Status**: Accepted
- **Date**: 2026-07-24
- **Deciders**: Sprint 111 architecture review
- **Module**: `src/modules/ai/calibration/`

---

## Context

The existing pipeline applies Quality, Repair, Evaluation, Assessment, and Optimization layers AFTER Self-Reflection. These layers validate and repair AI output, but they operate on already-reflected content.

There was no layer that improves AI output *before* it enters the quality pipeline. This meant LLM artifacts (awkward wording, placeholders, unbalanced MCQ options) passed through multiple layers before being caught.

The pipeline was:

```
LLM → Self Reflection → Quality → Repair → Evaluation → Assessment → Optimization → Feedback → API Response
```

## Decision

Insert a new **Output Calibration Layer** between the LLM and Self-Reflection:

```
LLM → Output Calibration → Self Reflection → Quality → Repair → Evaluation → Assessment → Optimization → Feedback → API Response
```

This layer applies 11 deterministic calibration rules that improve user-facing content quality BEFORE it enters the quality gates.

## Architecture

### Rules (11)

| Rule | Priority | What It Does |
|------|----------|-------------|
| `answer-length` | medium | Expands answers shorter than 5 chars (never fabricates) |
| `explanation-quality` | high | Replaces "Because A is correct" with reference-based explanations |
| `mcq-distribution` | medium | Avoids AAAA/BBBB answer patterns (rotates positions) |
| `option-length` | low | Flags unbalanced option lengths (flags only, no modification) |
| `placeholder-removal` | high | Removes TODO/N/A/TBD/.../lorem ipsum |
| `natural-language` | high | Removes LLM artifacts (Note:/As an AI/etc.), polishes text |
| `reading-support` | high | Ensures reading answers reference the passage |
| `listening-support` | high | Ensures listening answers reference the transcript |
| `writing-completeness` | high | Ensures task/audience/purpose/word limit in writing prompts |
| `grammar-example` | medium | Ensures grammar examples are complete sentences |
| `vocabulary-naturalness` | medium | Replaces overly formal words (utilize→use, commence→start, etc.) |

### Scoring

6 dimensions (weighted):

| Dimension | Weight | What |
|-----------|--------|------|
| completeness | 25% | All required fields present/filled |
| naturalness | 20% | No LLM artifacts, natural vocabulary |
| readability | 15% | Clean formatting, spacing, punctuation |
| balance | 10% | MCQ options balanced, answer distribution even |
| pedagogy | 20% | Explanations/examples educationally sound |
| supportability | 10% | Reading/listening answers passage-supported |

### Decisions

| Score | Decision |
|-------|----------|
| 90+ | PASS |
| 75+ | MINOR_CALIBRATION |
| 50+ | MAJOR_CALIBRATION |
| <50 | REJECT |

### Open/Closed Principle

New calibration rules auto-register via `registerRule()`. The engine contains no business rules — all logic is in individual rule modules.

### Architecture Rules

- Deterministic only — no AI calls
- No Provider imports
- No Workflow imports
- No Prisma imports
- No database writes
- No network calls
- No business logic in engine

## Consequences

### Positive
- AI output becomes cleaner before entering quality pipeline
- LLM artifacts caught early (reduces downstream failures)
- Explains *why* each answer is correct (pedagogical improvement)
- MCQ answer distribution balanced (fairer assessments)
- All changes are deterministic and auditable

### Negative
- Adds one more processing step (negligible: all in-memory, <1ms per rule)
- Some rules (option-length) can only flag, not fix (requires content knowledge)
- Vocabulary naturalness mappings are opinionated (but configurable via `AWKWARD_MAPPINGS`)

## Alternatives Considered

1. **LLM-based polishing**: Use another LLM call to polish output. Rejected: expensive, non-deterministic, adds latency.
2. **Skip calibration, fix in Quality**: Quality layer already catches some of these issues. Rejected: fixing earlier reduces downstream work and improves user experience.
3. **Template-based post-processing**: Use mustache templates for output formatting. Rejected: too rigid, doesn't handle LLM variability.
