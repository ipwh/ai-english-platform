# Human-Marker Protocol — HKDSE Paper 2 Writing Calibration

**R3.10-K Phase 8** · Applies to ALL human marking performed to supply
calibration evidence for this repository.

> **Human-marker evidence is ground truth only after the defined
> verification/adjudication process; publication authority alone does
> not automatically establish verified ground truth.**

## Hard rules

1. **Marker sees the original task.** The marker works from the exact
   task/prompt the candidate answered (`taskId` + verbatim task text).
2. **Marker sees the student script.** The full, verbatim candidate
   script is the only material marked.
3. **Marker sees the applicable marking scheme.** The versioned rubric
   reference (`rubricVersion`) is provided with every script.
4. **Marker does NOT see any AI score.** No platform overallScore,
   C/L/O values, or level estimates may be shown before or during
   marking.
5. **Marker does NOT see any AI feedback.** No AI strengths,
   weaknesses, grammar/chinglish comments, or revision suggestions may
   be shown to the marker.
6. **Marker does NOT see any pedagogical target level.** No
   `pedagogicalTargetLevel` / generation target / model-essay metadata
   may be shown to the marker.
7. **Independent marking before comparison.** Every marker marks
   independently; AI scoring is run only AFTER human scores are frozen.
8. **Marker identity recorded.** Each mark carries an anonymized
   `markerId`.
9. **Timestamp recorded.** Each mark carries `markedAt` (ISO).
10. **Disagreement remains visible.** Multi-marker scores are stored as
    separate `markerScores` entries — never silently collapsed,
    averaged, or merged into one number.
11. **Adjudication is separate from original marks.** An adjudicator
    resolves disagreements via the `adjudication` record; the original
    marker scores are never mutated by adjudication.
12. **Human evidence cannot be generated or altered by runtime AI.** No
    LLM output, AI scorer, generation output, RAG content, or runtime
    student data may write or modify calibration fixtures. Fixtures are
    hash-protected, git-tracked, and runtime read-only.

## Evidence states

```
UNVERIFIED ──(independent human verification: verbatim re-check of
              script text + marker scores against the source artifact)──▶
VERIFIED ──(dataset freeze + fingerprint)──▶ calibration run
```

- `verificationStatus` may only become `"verified"` through an explicit,
  documented independent verification act (`verifiedBy` / `verifiedAt`).
- AI predictions NEVER participate in any step of this chain.

## Comparability

- Human overall scores on the `clo-total-0-21` scale require a declared
  single-part task scope (`taskPartScope`, e.g. `paper-2-part-b`).
  Missing or `full-paper` scope is NEVER compared.
- Publication star levels (5*/5**) are comparable to the platform 1-5
  scale by ordinal distance only, never by string equality.
