# ADR-027: Intelligent Answer Evaluation

- **Status**: Accepted
- **Date**: 2026-07-24
- **Sprint**: 105
- **Depends on**: ADR-024, ADR-025

## Context

Previous answer grading used simple string equality. This produced high rates of false negatives — correct answers marked wrong because of minor differences in wording, punctuation, capitalization, or spelling.

## Decision

Introduce an **Intelligent Answer Evaluation Layer** that upgrades grading from exact match to semantic + rule-based evaluation.

### Key Components

1. **Answer Normalizer** — deterministic normalization: whitespace, Unicode, British/American spelling, contractions, punctuation removal
2. **11 Evaluation Rules** — pluggable rules from exact match through semantic comparison
3. **Semantic Comparator** — heuristic similarity using token overlap, synonym matching, bigram comparison, character similarity (no LLM)
4. **Flexible Grading Policies** — STRICT, STANDARD, LENIENT, CUSTOM with configurable thresholds
5. **Keyword Scoring** — required/optional/weighted keyword matching with synonym fallback
6. **Scoring** — multi-dimensional: exact (15%), case (5%), semantic (45%), keyword (25%), grammar (10%)

### Grading Decision Logic
```
Exact match OR case-insensitive match → CORRECT
Semantic ≥ threshold AND keyword ≥ threshold → CORRECT
Semantic ≥ 0.3 OR keyword ≥ 0.3 → PARTIALLY_CORRECT
Otherwise → INCORRECT
```

### Policy Thresholds

| Policy | Semantic | Keyword | Spelling | Tense | Articles |
|--------|----------|---------|----------|-------|----------|
| STRICT | 0.95 | 1.0 | 0.0 | No | No |
| STANDARD | 0.70 | 0.60 | 0.15 | Yes | Yes |
| LENIENT | 0.40 | 0.30 | 0.30 | Yes | Yes |

## Consequences

### Positive
- Dramatically reduced false negatives for legitimate answers
- Explainable decisions (each rule contributes measurable score)
- Configurable per-question-type policies
- No LLM dependency — fully deterministic

### Limitations
- Synonym dictionary is static (40 groups) — may miss domain-specific synonyms
- Semantic comparison is token-based, not true NLP
- Does not understand grammar structure (e.g., passive vs active voice equivalence)
- Future AI-assisted mode reserved for optional extension

## Future Extension
- AI-assisted semantic comparison (optional, behind feature flag)
- Domain-specific synonym dictionaries (science, history, etc.)
- Grammar structure awareness (passive/active equivalence)
- Progressive policy tightening based on student level

## See Also
- ADR-024: AI Quality Layer
- ADR-025: Content Consistency Layer
- ADR-026: Self-Healing Layer
