// ============================================
// R3.10-K Phase 7: RAG Exclusion Guard (pure, dependency-free)
//
// Structural guard — human-marker calibration reference material
// (scored scripts, ground-truth fixtures) must NEVER enter RAG
// retrieval. Retrieval into scoring prompts would be data leakage:
// the model being evaluated would see the answers.
//
// Kept dependency-free so the guard itself can be tested without
// loading the database layer.
// ============================================

const RAG_EXCLUSION_RULES: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /_hkeaa_scored_scripts/i, reason: "human-marker calibration source directory" },
  { pattern: /5\*?\*?\s*scripts|5starstar\s*scripts/i, reason: "human-marker scored-scripts compilation" },
  { pattern: /scored\s*scripts/i, reason: "human-marker scored scripts" },
  { pattern: /calibration[-_\s]?reference/i, reason: "calibration reference material" },
  { pattern: /retrieval[-_\s]?excluded/i, reason: "explicit retrieval-excluded tag" },
];

export interface RAGExclusionInput {
  title?: string | null;
  tags?: string[] | null;
  sourcePath?: string | null;
}

export function shouldExcludeMaterialFromRAG(material: RAGExclusionInput): {
  excluded: boolean;
  reason: string | null;
} {
  const haystacks: string[] = [];
  if (material.title) haystacks.push(material.title);
  if (material.tags && material.tags.length > 0) haystacks.push(material.tags.join(" "));
  if (material.sourcePath) haystacks.push(material.sourcePath);
  const haystack = haystacks.join(" ");
  for (const rule of RAG_EXCLUSION_RULES) {
    if (rule.pattern.test(haystack)) {
      return { excluded: true, reason: rule.reason };
    }
  }
  return { excluded: false, reason: null };
}

/** Parse the Material.tags JSON string into an array (never throws). */
export function parseMaterialTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((t): t is string => typeof t === "string");
  } catch {
    // fall through — non-JSON tag string is still a matchable haystack
    return [raw];
  }
  return [];
}
