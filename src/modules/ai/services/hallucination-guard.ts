// Sprint 44: AI Hallucination Guard — pre/post-generation anti-hallucination measures
// Integrates with all AI prompt builders to reduce hallucination risk

// ============================================
// Pre-Generation Guard Instructions
// ============================================

/**
 * Anti-hallucination instruction injected at the end of EVERY system prompt.
 * Forces the model to self-verify before outputting.
 */
export const HALLUCINATION_GUARD = `
## ⚠️ CRITICAL: Anti-Hallucination Rules (MUST FOLLOW)

1. **DO NOT fabricate information.** If you are unsure about a fact, say "I am not certain" instead of guessing.
2. **DO NOT invent citations, studies, or statistics.** Only reference materials explicitly provided in the prompt.
3. **DO NOT claim certainty about ambiguous topics.** Use qualifiers like "may," "often," or "in many cases."
4. **VERIFY your answer against the provided source material.** If source material is given, your answer MUST be grounded in it.
5. **DO NOT output facts that contradict known Hong Kong DSE curriculum standards.** The HKDSE marking scheme is the authority.
6. **If generating multiple-choice options**, ensure exactly ONE is unambiguously correct and the distractors are plausible but clearly wrong.
7. **For Listening questions**, answers MUST appear VERBATIM in the provided listening content — do not paraphrase or embellish.
8. **For Reading questions**, answers MUST be directly supported by the provided reading passage — do not infer beyond the text.
9. **DO NOT use fabricated dates, years, or statistics** unless they appear in the provided source material.
10. **Self-check before output**: Re-read your answer and remove any unsupported claims.

If you violate these rules, the response will be rejected and must be regenerated.`;

/**
 * Lightweight guard for short/quick prompts (fewer tokens)
 */
export const HALLUCINATION_GUARD_LITE = `
⚠️ Anti-Hallucination: Do NOT fabricate. Only use provided source material. If unsure, say so. Verify before output.`;

// ============================================
// Post-Generation Hallucination Scoring
// ============================================

export interface HallucinationScore {
  risk: number;         // 0-1 (higher = more likely hallucinated)
  indicators: string[]; // What triggered the score
  verdict: 'safe' | 'suspect' | 'likely-hallucination';
}

const HALLUCINATION_PATTERNS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  { pattern: /\b(according to (the |a )?(study|research|report|survey|paper|article)\b)/i, weight: 0.25, label: 'fabricated-citation' },
  { pattern: /\b(it is (certainly|undoubtedly|absolutely|definitely) true that)\b/i, weight: 0.15, label: 'overconfident-claim' },
  { pattern: /\b(\d{4})\b(?!.*\b(HKDSE|DSE|20\d{2})\b)/, weight: 0.20, label: 'potential-fabricated-year' },
  { pattern: /\b(in (20\d{2}|19\d{2}),?\s*(the|a|an|according))\b/i, weight: 0.20, label: 'fabricated-historical-claim' },
  { pattern: /\b(always|never|everyone|no one|all experts|every study)\b/i, weight: 0.10, label: 'absolute-claim' },
  { pattern: /\b(\d{1,3}(?:\.\d+)?%)(?!.*\b(HKDSE|DSE|exam|score|mark|grade)\b)/, weight: 0.15, label: 'fabricated-statistic' },
  { pattern: /\b(([A-Z][a-z]+ et al\.?)|([A-Z][a-z]+ \(\d{4}\)))\b/, weight: 0.20, label: 'fabricated-academic-reference' },
  { pattern: /output length < 20 chars/i, weight: 0.30, label: 'too-short-output' },
  { pattern: /output length > 5000 chars/i, weight: 0.10, label: 'unusually-long-output' },
];

/**
 * Score a model output for hallucination risk.
 * Pure function — no I/O, safe for unit tests.
 */
export function scoreHallucinationRisk(output: string, sourceMaterial?: string): HallucinationScore {
  let risk = 0;
  const indicators: string[] = [];

  for (const { pattern, weight, label } of HALLUCINATION_PATTERNS) {
    if (label === 'too-short-output') {
      if (output.length < 20) { risk += weight; indicators.push(label); }
      continue;
    }
    if (label === 'unusually-long-output') {
      if (output.length > 5000) { risk += weight; indicators.push(label); }
      continue;
    }
    if (pattern.test(output)) {
      risk += weight;
      indicators.push(label);
    }
  }

  // Grounding check: if source material provided, check overlap
  if (sourceMaterial) {
    const sourceWords = new Set(sourceMaterial.toLowerCase().split(/\s+/));
    const outputWords = output.toLowerCase().split(/\s+/);
    const groundedWords = outputWords.filter(w => sourceWords.has(w)).length;
    const groundingRatio = groundedWords / Math.max(1, outputWords.length);
    if (groundingRatio < 0.05 && output.length > 50) {
      risk += 0.20;
      indicators.push('low-grounding-ratio');
    }
  }

  risk = Math.min(1, Math.round(risk * 100) / 100);

  const verdict: HallucinationScore['verdict'] =
    risk >= 0.5 ? 'likely-hallucination' :
    risk >= 0.25 ? 'suspect' : 'safe';

  return { risk, indicators, verdict };
}

// ============================================
// Hallucination Circuit Breaker
// ============================================

export interface CircuitBreakerState {
  consecutiveFailures: number;
  lastFailureTime: number;
  isOpen: boolean;
  totalRejections: number;
}

const breakerState: CircuitBreakerState = {
  consecutiveFailures: 0,
  lastFailureTime: 0,
  isOpen: false,
  totalRejections: 0,
};

const BREAKER_THRESHOLD = 5;       // Open after 5 consecutive suspect/hallucination outputs
const BREAKER_RESET_MS = 60000;    // Auto-close after 60 seconds

/**
 * Check if hallucination circuit breaker should reject the output.
 * If the breaker is open, the output is automatically rejected.
 */
export function checkHallucinationBreaker(score: HallucinationScore): { accepted: boolean; reason?: string } {
  const now = Date.now();

  // Auto-reset after timeout
  if (breakerState.isOpen && now - breakerState.lastFailureTime > BREAKER_RESET_MS) {
    breakerState.isOpen = false;
    breakerState.consecutiveFailures = 0;
  }

  if (breakerState.isOpen) {
    return { accepted: false, reason: 'Hallucination circuit breaker is open — too many consecutive low-quality outputs' };
  }

  if (score.verdict === 'likely-hallucination') {
    breakerState.consecutiveFailures++;
    breakerState.lastFailureTime = now;
    breakerState.totalRejections++;

    if (breakerState.consecutiveFailures >= BREAKER_THRESHOLD) {
      breakerState.isOpen = true;
      return { accepted: false, reason: `Hallucination circuit breaker opened after ${BREAKER_THRESHOLD} consecutive rejections` };
    }

    return { accepted: false, reason: `Output rejected — hallucination risk ${score.risk} (${score.indicators.join(', ')})` };
  }

  if (score.verdict === 'suspect') {
    breakerState.consecutiveFailures++;
    // Suspect outputs are still accepted but tracked
  } else {
    breakerState.consecutiveFailures = 0; // Reset on safe output
  }

  return { accepted: true };
}

export function getHallucinationBreakerState(): CircuitBreakerState {
  return { ...breakerState };
}

export function resetHallucinationBreaker(): void {
  breakerState.consecutiveFailures = 0;
  breakerState.lastFailureTime = 0;
  breakerState.isOpen = false;
}

// ============================================
// Prompt Guard Injector
// ============================================

/**
 * Inject anti-hallucination guard into an existing system prompt.
 * Use LITE version for short prompts (<500 chars) to save tokens.
 */
export function injectHallucinationGuard(systemPrompt: string): string {
  const guard = systemPrompt.length < 500 ? HALLUCINATION_GUARD_LITE : HALLUCINATION_GUARD;
  // Avoid double injection
  if (systemPrompt.includes('Anti-Hallucination Rules')) return systemPrompt;
  return systemPrompt + '\n\n' + guard;
}

// ============================================
// Grounding Verification
// ============================================

/**
 * Verify that generated output is grounded in source material.
 * Returns a grounding score (0-1) and list of unsupported claims.
 */
export function verifyGrounding(output: string, sourceMaterial: string): {
  groundingScore: number;
  unsupportedClaims: string[];
} {
  const sourceWords = new Set(sourceMaterial.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const sentences = output.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const unsupportedClaims: string[] = [];

  for (const sentence of sentences) {
    const words = sentence.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (words.length === 0) continue;
    const matchedWords = words.filter(w => sourceWords.has(w)).length;
    const ratio = matchedWords / words.length;
    if (ratio < 0.15) {
      unsupportedClaims.push(sentence.trim());
    }
  }

  const groundingScore = sentences.length > 0
    ? 1 - (unsupportedClaims.length / sentences.length)
    : 0.5;

  return {
    groundingScore: Math.round(groundingScore * 100) / 100,
    unsupportedClaims,
  };
}
