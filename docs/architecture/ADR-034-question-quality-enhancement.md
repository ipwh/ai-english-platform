# ADR-034: Question Quality Enhancement & Distractor Intelligence

- **Status**: Accepted
- **Date**: 2026-07-24
- **Deciders**: Sprint 113 architecture review
- **Module**: `src/modules/ai/question-quality/`

---

## Context

The existing pipeline generates questions via LLM but does not validate question quality in depth before they reach students. Issues include:

- Implausible distractors (obviously wrong, different category, too short/long)
- Ambiguous questions (double negatives, unclear pronouns)
- Incomplete stems (ending unexpectedly, missing context)
- Unbalanced answer distribution (AAAAAA/BBBBBB patterns)
- Writing prompts missing elements (scenario, role, audience, purpose)
- Vocabulary/grammar inappropriate for target CEFR level
- No evidence linking for reading/listening questions

These issues directly impact student experience and assessment fairness.

## Decision

Insert a **Question Quality Layer** between Output Calibration and Self-Reflection:

```
LLM → Output Calibration → Question Quality → Self Reflection → Quality → ...
```

This layer applies 14 deterministic rules that validate and score question quality across 7 dimensions.

## Architecture

### Rules (14)

| # | Rule | Priority | What It Does |
|---|------|----------|-------------|
| 1 | DistractorPlausibility | critical | Rejects forbidden distractors (all/none of above, too short, too long) |
| 2 | CorrectAnswerUniqueness | critical | Exactly one correct answer, no overlapping |
| 3 | OptionSimilarity | high | Rejects >85% Jaccard-similar or >70% shared-prefix options |
| 4 | DifficultyBalance | high | Detects giveaway words, obscure vocab, verbatim answers in prompt |
| 5 | QuestionClarity | high | Double negatives, multiple questions, missing question word |
| 6 | StemCompleteness | high | Empty/short stems, ellipsis endings, pronoun-only starts |
| 7 | ReadingEvidence | high | Answer words in passage, paragraph/line references |
| 8 | ListeningEvidence | high | Answer in transcript, speaker/recording references |
| 9 | WritingPromptQuality | high | 6 elements: scenario, role, audience, purpose, tone, word count |
| 10 | IntegratedSkillsAlignment | medium | Shared scenario terms across reading/listening/writing |
| 11 | VocabularyLevel | medium | Syllable counts, rare word detection per CEFR level |
| 12 | GrammarComplexity | low | Complex grammar patterns vs. target CEFR level |
| 13 | QuestionVariety | medium | Detects repeated "which-of-following" templates (3+ consecutive) |
| 14 | AnswerDistribution | low | Tracks A/B/C/D distribution, warns at >50% dominance |

### Scoring (7 dimensions)

| Dimension | Weight | Focus |
|-----------|--------|-------|
| questionDesign | 20% | Stem clarity, answer uniqueness |
| distractorQuality | 20% | Plausibility, option similarity |
| evidenceSupport | 15% | Reading/listening passage alignment |
| difficulty | 15% | Appropriate level, balanced |
| clarity | 15% | No ambiguity, clear references |
| pedagogy | 10% | Vocabulary, grammar, writing elements |
| variety | 5% | Template rotation, distribution |

### Decisions

| Score | Decision |
|-------|----------|
| 95+ | excellent |
| 85+ | good |
| 70+ | acceptable |
| <70 | needs_improvement |

### Architecture Rules

- Deterministic only — no AI calls
- No Provider/Workflow/Prisma imports
- No network/database calls
- Open/Closed: new quality rules auto-register

## Consequences

### Positive
- Questions validated against 14 HKDSE-quality standards
- Distractors must be plausible (no "all of the above" by default)
- Reading/listening questions linked to evidence locations
- Writing prompts complete with all 6 required elements
- Vocabulary and grammar age-appropriate for CEFR level
- Template variety enforced (no 3+ consecutive "which of the following")

### Negative
- More validation adds latency (~1ms per rule, ~14ms total)
- Vocabulary level detection uses syllable counting (approximate)
- Template detection uses regex patterns (may miss some variations)

## Alternatives Considered

1. **LLM-based quality check**: Use another LLM call to validate questions. Rejected: expensive, non-deterministic.
2. **Human review**: Manual teacher review of all AI questions. Rejected: doesn't scale.
3. **Statistical sampling**: Check 10% of questions. Rejected: students deserve consistent quality.
