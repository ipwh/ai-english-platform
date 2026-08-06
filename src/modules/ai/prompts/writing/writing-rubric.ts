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
// ============================================

/**
 * HKDSE Paper 2 Writing CLO Rubric (0-7 each dimension, total 0-21).
 * Format: Markdown table suitable for LLM system prompts.
 */
export const CLO_RUBRIC = `
## HKDSE Paper 2 Writing CLO Rubric (0-7 each, total 0-21)

### C: Content（內容）— 0-7
| Score | Level | Description |
|-------|-------|-------------|
| 7 | 5** | Fully addresses all requirements; rich, well-developed ideas; specific examples; creative/imaginative; strong audience awareness |
| 6 | 5 | Addresses all requirements; almost all relevant; most ideas well-developed; shows creativity |
| 5 | 4 | Addresses requirements; mostly relevant; most ideas developed; some creativity |
| 4 | 3 | Generally addresses requirements; mostly relevant; some ideas developed |
| 3 | 2 | Partially meets requirements; gaps or repetition; some ideas not fully developed |
| 2 | 1 | Barely meets requirements; intermittently relevant; few undeveloped ideas |
| 1 | U | Insufficient content; heavily relies on prompt wording; very few undeveloped ideas |
| 0 | U | Completely off-topic, memorized, or unrecognizable as writing |

### L: Language（語言）— 0-7
| Score | Level | Description |
|-------|-------|-------------|
| 7 | 5** | Very wide range of sentence structures; highly accurate grammar; precise vocabulary; perfect register/tone |
| 6 | 5 | Wide range of accurate structures; generally accurate grammar; good vocabulary range |
| 5 | 4 | Variety of accurate structures; occasional complex-structure errors; adequate vocabulary range |
| 4 | 3 | Simple structures generally good; some complex attempts; errors sometimes affect clarity |
| 3 | 2 | Short simple sentences mostly accurate; frequent errors affect understanding |
| 2 | 1 | Some simple structures accurate; frequent errors; very simple vocabulary |
| 1 | U | Multiple errors make text incomprehensible |
| 0 | U | Language insufficient to evaluate |

### O: Organization（組織）— 0-7
| Score | Level | Description |
|-------|-------|-------------|
| 7 | 5** | Highly effective structure; logical progression; excellent cohesion; sophisticated cohesive ties |
| 6 | 5 | Effective organization; logical development; good paragraph cohesion; solid cohesive ties |
| 5 | 4 | Generally effective; logical development; most paragraphs coherent; reasonable cohesive ties |
| 4 | 3 | Some clear paragraphs; some coherence; basic cohesive ties |
| 3 | 2 | Some paragraphing attempted; simple cohesive ties; coherence sometimes unclear |
| 2 | 1 | Some organizational attempt; limited cohesive devices |
| 1 | U | Minimal organizational attempt; very limited cohesive devices |
| 0 | U | Cohesive devices almost entirely absent |

### HKDSE Level Mapping (total score → estimated level)
- 19-21: 5**
- 17-18: 5*
- 15-16: 5
- 12-14: 4
- 9-11: 3
- 6-8: 2
- 3-5: 1
- 0-2: U
`.trim();
