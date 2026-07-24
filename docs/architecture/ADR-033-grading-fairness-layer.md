# ADR-033: Grading Fairness Layer

- **Status**: Accepted
- **Date**: 2026-07-24
- **Deciders**: Sprint 112 architecture review
- **Module**: `src/modules/ai/fairness/`

---

## Context

The existing evaluation layer used strict answer matching with limited tolerance for variations. Students could be marked incorrect for:

- Articles (a/an/the differences)
- Punctuation (periods, commas, quotes)
- Capitalization
- British vs. American spelling (colour/color)
- Minor spelling mistakes (typos)
- Verb tense variations (is/was)
- Singular/plural (child/children)
- Abbreviations (USA vs. United States)
- Number formatting (five vs. 5 vs. V)
- Synonym usage (big vs. large)
- Keyword coverage (missing one keyword out of many)

This creates unfair grading that penalizes students for surface-level language differences rather than testing actual knowledge.

## Decision

Insert a **Grading Fairness Layer** between the Semantic Evaluation and the Evaluation Engine:

```
Student Answer → Answer Normalization → Semantic Evaluation → Grading Fairness Layer → Evaluation Engine → ...
```

This layer applies 14 deterministic fairness rules that normalize student answers to their canonical form before grading, and then computes fairness scores, confidence, and partial credit.

## Architecture

### Rules (14)

| # | Rule | Priority | What It Does |
|---|------|----------|-------------|
| 1 | ArticleTolerance | medium | Strips a/an/the for comparison |
| 2 | PunctuationTolerance | medium | Strips .,!?;:'" etc. for comparison |
| 3 | CaseTolerance | low | Lowercases both answers |
| 4 | WhitespaceTolerance | low | Normalizes repeated spaces/line breaks |
| 5 | BritishAmerican | high | 300+ British↔American mappings |
| 6 | SpellingTolerance | high | Levenshtein distance ≤ configurable threshold |
| 7 | VerbTenseTolerance | medium | 100+ present↔past verb pairs |
| 8 | SingularPlural | medium | 70+ irregular plural pairs, regular -s/-es handling |
| 9 | Abbreviation | medium | 120+ abbreviation↔expansion mappings |
| 10 | NumberNormalization | low | Number words, Roman numerals, leading zeros |
| 11 | SynonymExpansion | high | 1000+ synonyms in 12 categories (400+ groups) |
| 12 | KeywordCoverage | high | Weighted keywords (core/supporting/optional) |
| 13 | SemanticConfidence | high | Jaccard similarity + length ratio → confidence |
| 14 | PartialCredit | critical | 90%/80%/70%/50% automatic partial credit |

### Scoring

5 dimensions:

| Dimension | Weight | What |
|-----------|--------|------|
| semanticFairness | 30% | Semantic similarity to reference |
| languageFairness | 15% | British/American, abbreviations handled |
| spellingFairness | 15% | Spelling tolerance applied |
| grammarFairness | 15% | Tense, articles, singular/plural handled |
| keywordCoverage | 25% | Weighted keyword match |

### Decisions

| Score | Decision | Partial Credit |
|-------|----------|---------------|
| 95+ | correct | 100% |
| 80+ | accept | 90% |
| 60+ | partially_correct | 70-80% |
| <60 | incorrect | 50% |

### Synonym Categories (1000+ words)

- Actions (25 groups): start/begin, make/create, get/obtain, give/provide...
- Qualities (25 groups): big/large, good/excellent, important/crucial...
- Nature (13 groups): forest/woods, mountain/hill, river/stream...
- People/Society (18 groups): person/individual, student/pupil, teacher/instructor...
- Abstract (30 groups): idea/concept, problem/issue, solution/answer...
- Time (10 groups): now/currently, before/previously, after/subsequently...
- Space/Location (12 groups): above/over, below/under, inside/within...
- Communication (17 groups): talk/speak, write/compose, agree/concur...
- Quantity (12 groups): many/numerous, few/scarce, all/every...

### British/American (300+ mappings)

- -our/-or: colour/color, honour/honor, behaviour/behavior...
- -re/-er: centre/center, metre/meter, theatre/theater...
- -ise/-ize: organise/organize, realise/realize, recognise/recognize...
- -ll-/-l-: travelling/traveling, cancelled/canceled...
- -ce/-se: defence/defense, licence/license...
- Vocabulary: programme/program, tyre/tire, cheque/check, flat/apartment...

### Architecture Rules

- Deterministic only — no AI calls
- No Provider/Workflow/Prisma imports
- No network/database calls
- Open/Closed: new fairness rules auto-register
- Engine contains no grading logic — rules own their behavior

## Consequences

### Positive
- Students no longer unfairly penalized for surface language differences
- British/American spelling treated as equivalent
- Minor spelling mistakes tolerated (configurable threshold)
- Synonyms recognized across 12 topic categories
- Partial credit awarded automatically (more human-like grading)
- Confidence scores instead of binary correct/incorrect
- False negative rate significantly reduced

### Negative
- Large lookup tables (300+ British/American, 1000+ synonyms) increase memory footprint
- Sequential rule application adds latency (~0.5ms per rule, ~7ms total)
- Some rules (tense, singular/plural) require word-order alignment (limited to same-length sentences)
- Partial credit may be too generous for some use cases (configurable via COMPUTE_PARTIAL_CREDIT)

## Alternatives Considered

1. **LLM-based grading**: Use AI to evaluate fairness. Rejected: non-deterministic, expensive, slow.
2. **Simpler normalization**: Only normalize case and whitespace. Rejected: insufficient for real-world student answers.
3. **Student-side normalization**: Ask students to answer in a specific format. Rejected: poor UX, doesn't solve the problem.
