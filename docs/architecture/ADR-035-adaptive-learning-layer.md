# ADR-035: Adaptive Learning Intelligence Layer

- **Status**: Accepted
- **Date**: 2026-07-24
- **Deciders**: Sprint 114 architecture review
- **Module**: `src/modules/ai/adaptive/`

---

## Context

The platform generated AI content but did not adapt to individual students. Every student received the same difficulty, the same skill distribution, and the same question patterns — regardless of their actual ability, progress, or learning needs.

This violated core pedagogical principles:
- Students should be challenged at their appropriate level
- Weak skills need focused practice
- Previous mistakes should be revisited (spaced repetition)
- Session fatigue should be managed
- Learning should progress gradually

## Decision

Insert an **Adaptive Learning Layer** at the very beginning of the pipeline, before the Prompt Builder:

```
Student Profile → Adaptive Learning → Prompt Builder → LLM → ...
```

This layer analyzes student profiles (skill scores, performance history, streaks, session state) and produces:
1. Adjusted difficulty level
2. Focus skill domains
3. Pedagogical recommendations (review/practice/advance/revision)
4. An adaptive quality score across 6 dimensions

All fully deterministic — no AI calls.

## Architecture

### Student Profile (per-student, in-memory)

Each student has:
- **6 skill scores** (reading, listening, grammar, vocabulary, writing, integrated): 0-100
- **Performance history**: last 100+ answer records with domain, correctness, difficulty
- **Streaks**: current correct streak, current loss streak
- **Rolling accuracy**: last 50 questions
- **Session state**: questions answered, failures, start time
- **Config**: mastery threshold, failure threshold, streak threshold, spacing intervals

### Rules (12)

| # | Rule | Priority | What It Does |
|---|------|----------|-------------|
| 1 | DifficultyAdjustment | critical | Adjusts difficulty after streaks (5 correct → up, 3 wrong → down) |
| 2 | WeakSkillFocus | critical | Prioritizes weakest skill domains (gap ≥30pt = critical) |
| 3 | MasteryProgression | high | Gradual challenge increase when skills mastered |
| 4 | RepeatedMistake | high | Detects 3+ recent failures in same domain |
| 5 | VocabularyRecycling | high | Spaced repetition intervals: 1/6/24/72/168/336 hours |
| 6 | GrammarRecycling | high | Recycles weak grammar topics |
| 7 | QuestionVariety | medium | Prevents 4/5 same question type |
| 8 | ConfidenceAdjustment | high | Reduce after ≥3 failures, increase after ≥8 streak |
| 9 | ChallengeBalance | medium | Maintains 70% comfortable / 20% challenging / 10% stretch |
| 10 | SessionFatigue | high | Reduces complexity for long/failing sessions |
| 11 | LearningObjective | medium | Ensures all 6 skills practiced regularly |
| 12 | AdaptiveRecommendation | critical | 4 recommendations: review (declining), practice (plateau), advance (90%+), revision (weak) |

### Scoring (6 dimensions)

| Dimension | Weight | Focus |
|-----------|--------|-------|
| difficultyMatching | 25% | Appropriate challenge level |
| weakSkillCoverage | 25% | Weak skills prioritized |
| learningProgression | 20% | Gradual advancement |
| variety | 10% | Question type diversity |
| studentConfidence | 10% | Session fatigue, failure management |
| pedagogicalBalance | 10% | Challenge ratio, learning objectives |

### Decisions

| Score | Decision |
|-------|----------|
| 95+ | excellent_adaptation |
| 85+ | good |
| 70+ | acceptable |
| <70 | needs_adjustment |

### Architecture Rules

- Deterministic only — no AI calls
- No Provider/Workflow/Prisma imports
- No network/database calls (in-memory profiles)
- Open/Closed: new adaptive rules auto-register

## Consequences

### Positive
- Each student receives personalized difficulty and skill focus
- Spaced repetition ensures vocabulary/grammar mistakes are revisited
- Session fatigue detected automatically (reduces student frustration)
- Challenge balance maintained (70/20/10 ratio)
- Recommendations provide clear pedagogical guidance

### Negative
- Student profiles are in-memory (reset on server restart)
- Profile data not persisted to database (future sprint)
- Spaced repetition requires sufficient history to be effective (cold start)
- 70/20/10 challenge ratio requires tuning per subject

## Alternatives Considered

1. **ML-based adaptation**: Use reinforcement learning to optimize difficulty. Rejected: requires training data, non-deterministic.
2. **Fixed difficulty**: Same level for all students. Rejected: not personalized.
3. **Teacher-managed**: Teachers manually set difficulty per student. Rejected: doesn't scale, adds teacher workload.
