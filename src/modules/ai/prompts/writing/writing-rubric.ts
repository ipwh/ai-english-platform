// ============================================
// Canonical HKDSE Paper 2 Writing CLO Rubric
// Single source of truth for Content/Language/Organization scoring.
//
// Used by:
//   - writing-coach-service.ts (AI-powered essay analysis)
//   - ai/prompts/writing/v2.ts (writing analysis prompt)
//
// NOT the same as the detailed Chinese rubric in writing/v1.ts
// (which includes Marker's Two Gates, 五大鋪墊法, 十大常見錯誤).
//
// IMPORTANT: The CLO total is an internal 0–21 rubric score.
// Any platform-level performance estimate must be treated as an
// internal pedagogical estimate and must not be represented as
// an official HKEAA grade conversion. The canonical analyzeWriting
// pipeline uses Level 1–5 for internal estimates.
// ============================================

/**
 * HKDSE Paper 2 Writing CLO Rubric (0-7 each dimension, total 0-21).
 * Format: Markdown table suitable for LLM system prompts.
 *
 * The "Level" column uses descriptive labels (not official HKEAA grades).
 */
export const CLO_RUBRIC = `
## HKDSE Paper 2 Writing CLO Rubric (0-7 each, total 0-21)

### C: Content（內容）— 0-7
| Score | Description |
|-------|-------------|
| 7 | Fully addresses all requirements; rich, well-developed ideas; specific examples; creative/imaginative; strong audience awareness |
| 6 | Addresses all requirements; almost all relevant; most ideas well-developed; shows creativity |
| 5 | Addresses requirements; mostly relevant; most ideas developed; some creativity |
| 4 | Generally addresses requirements; mostly relevant; some ideas developed |
| 3 | Partially meets requirements; gaps or repetition; some ideas not fully developed |
| 2 | Barely meets requirements; intermittently relevant; few undeveloped ideas |
| 1 | Insufficient content; heavily relies on prompt wording; very few undeveloped ideas |
| 0 | Completely off-topic, memorized, or unrecognizable as writing |

### L: Language（語言）— 0-7
| Score | Description |
|-------|-------------|
| 7 | Very wide range of sentence structures; highly accurate grammar; precise vocabulary; perfect register/tone |
| 6 | Wide range of accurate structures; generally accurate grammar; good vocabulary range |
| 5 | Variety of accurate structures; occasional complex-structure errors; adequate vocabulary range |
| 4 | Simple structures generally good; some complex attempts; errors sometimes affect clarity |
| 3 | Short simple sentences mostly accurate; frequent errors affect understanding |
| 2 | Some simple structures accurate; frequent errors; very simple vocabulary |
| 1 | Multiple errors make text incomprehensible |
| 0 | Language insufficient to evaluate |

### O: Organization（組織）— 0-7
| Score | Description |
|-------|-------------|
| 7 | Highly effective structure; logical progression; excellent cohesion; sophisticated cohesive ties |
| 6 | Effective organization; logical development; good paragraph cohesion; solid cohesive ties |
| 5 | Generally effective; logical development; most paragraphs coherent; reasonable cohesive ties |
| 4 | Some clear paragraphs; some coherence; basic cohesive ties |
| 3 | Some paragraphing attempted; simple cohesive ties; coherence sometimes unclear |
| 2 | Some organizational attempt; limited cohesive devices |
| 1 | Minimal organizational attempt; very limited cohesive devices |
| 0 | Cohesive devices almost entirely absent |

### Internal CLO Total Reference
The CLO total (0–21) is an internal rubric score used for pedagogical estimation.
Any level estimate derived from it is an internal platform estimate,
NOT an official HKEAA grade conversion.
`.trim();
