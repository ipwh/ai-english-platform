// Sprint 7: Knowledge Graph — HKDSE grammar skill dependency DAG
// Pedagogically ordered: each skill's prerequisites must be mastered first
import type { SkillNode } from '../types';

// ============================================
// HKDSE Grammar Dependency Graph
// Based on ELE KLACG 2017 and HKDSE English Language curriculum
// ============================================

export const GRAMMAR_GRAPH: SkillNode[] = [
  // === Foundation (S1) ===
  {
    id: 'tenses-simple',
    name: 'Simple Tenses',
    nameZh: '簡單時態',
    dseLevel: 'S1', category: 'grammar',
    prerequisites: [],
    estimatedHours: 4,
  },
  {
    id: 'parts-of-speech',
    name: 'Parts of Speech',
    nameZh: '詞性',
    dseLevel: 'S1', category: 'grammar',
    prerequisites: [],
    estimatedHours: 3,
  },
  {
    id: 'sentence-structure',
    name: 'Basic Sentence Structure',
    nameZh: '基本句型',
    dseLevel: 'S1', category: 'grammar',
    prerequisites: ['parts-of-speech'],
    estimatedHours: 4,
  },
  {
    id: 'articles',
    name: 'Articles (a/an/the)',
    nameZh: '冠詞',
    dseLevel: 'S1', category: 'grammar',
    prerequisites: ['parts-of-speech'],
    estimatedHours: 3,
  },
  {
    id: 'subject-verb-agreement',
    name: 'Subject-Verb Agreement',
    nameZh: '主謂一致',
    dseLevel: 'S1', category: 'grammar',
    prerequisites: ['sentence-structure', 'tenses-simple'],
    estimatedHours: 3,
  },

  // === Lower Intermediate (S2) ===
  {
    id: 'tenses-continuous',
    name: 'Continuous Tenses',
    nameZh: '進行時態',
    dseLevel: 'S2', category: 'grammar',
    prerequisites: ['tenses-simple'],
    estimatedHours: 4,
  },
  {
    id: 'present-perfect',
    name: 'Present Perfect Tense',
    nameZh: '現在完成式',
    dseLevel: 'S2', category: 'grammar',
    prerequisites: ['tenses-simple', 'tenses-continuous'],
    estimatedHours: 5,
  },
  {
    id: 'comparatives-superlatives',
    name: 'Comparatives & Superlatives',
    nameZh: '比較級與最高級',
    dseLevel: 'S2', category: 'grammar',
    prerequisites: ['parts-of-speech'],
    estimatedHours: 3,
  },
  {
    id: 'modal-verbs-basic',
    name: 'Basic Modal Verbs',
    nameZh: '基本情態動詞',
    dseLevel: 'S2', category: 'grammar',
    prerequisites: ['tenses-simple', 'sentence-structure'],
    estimatedHours: 4,
  },
  {
    id: 'prepositions',
    name: 'Prepositions',
    nameZh: '介詞',
    dseLevel: 'S2', category: 'grammar',
    prerequisites: ['sentence-structure'],
    estimatedHours: 4,
  },

  // === Intermediate (S3) ===
  {
    id: 'passive-voice',
    name: 'Passive Voice',
    nameZh: '被動語態',
    dseLevel: 'S3', category: 'grammar',
    prerequisites: ['present-perfect', 'tenses-continuous', 'subject-verb-agreement'],
    estimatedHours: 6,
  },
  {
    id: 'conditionals-type-0-1',
    name: 'Conditionals (Type 0-1)',
    nameZh: '條件句（零類及一類）',
    dseLevel: 'S3', category: 'grammar',
    prerequisites: ['tenses-simple', 'modal-verbs-basic'],
    estimatedHours: 4,
  },
  {
    id: 'relative-clauses',
    name: 'Relative Clauses',
    nameZh: '關係子句',
    dseLevel: 'S3', category: 'grammar',
    prerequisites: ['sentence-structure', 'passive-voice'],
    estimatedHours: 5,
  },
  {
    id: 'gerunds-infinitives',
    name: 'Gerunds & Infinitives',
    nameZh: '動名詞與不定詞',
    dseLevel: 'S3', category: 'grammar',
    prerequisites: ['present-perfect', 'sentence-structure'],
    estimatedHours: 5,
  },
  {
    id: 'connectors',
    name: 'Connectors & Linkers',
    nameZh: '連接詞',
    dseLevel: 'S3', category: 'grammar',
    prerequisites: ['sentence-structure'],
    estimatedHours: 3,
  },

  // === Upper Intermediate (S4) ===
  {
    id: 'conditionals-type-2-3',
    name: 'Conditionals (Type 2-3)',
    nameZh: '條件句（二類及三類）',
    dseLevel: 'S4', category: 'grammar',
    prerequisites: ['conditionals-type-0-1', 'present-perfect'],
    estimatedHours: 5,
  },
  {
    id: 'reported-speech',
    name: 'Reported Speech',
    nameZh: '報告式說話',
    dseLevel: 'S4', category: 'grammar',
    prerequisites: ['relative-clauses', 'tenses-continuous'],
    estimatedHours: 6,
  },
  {
    id: 'modal-verbs-advanced',
    name: 'Advanced Modal Verbs',
    nameZh: '進階情態動詞',
    dseLevel: 'S4', category: 'grammar',
    prerequisites: ['modal-verbs-basic', 'present-perfect'],
    estimatedHours: 4,
  },
  {
    id: 'phrasal-verbs',
    name: 'Phrasal Verbs',
    nameZh: '片語動詞',
    dseLevel: 'S4', category: 'grammar',
    prerequisites: ['prepositions', 'gerunds-infinitives'],
    estimatedHours: 5,
  },
  {
    id: 'inversion',
    name: 'Inversion',
    nameZh: '倒裝句',
    dseLevel: 'S4', category: 'grammar',
    prerequisites: ['sentence-structure', 'passive-voice'],
    estimatedHours: 4,
  },

  // === Advanced (S5-S6) ===
  {
    id: 'subjunctive',
    name: 'Subjunctive Mood',
    nameZh: '虛擬語氣',
    dseLevel: 'S5', category: 'grammar',
    prerequisites: ['conditionals-type-2-3', 'reported-speech'],
    estimatedHours: 5,
  },
  {
    id: 'participle-phrases',
    name: 'Participle Phrases',
    nameZh: '分詞短語',
    dseLevel: 'S5', category: 'grammar',
    prerequisites: ['relative-clauses', 'passive-voice'],
    estimatedHours: 4,
  },
  {
    id: 'cleft-sentences',
    name: 'Cleft Sentences',
    nameZh: '分裂句',
    dseLevel: 'S5', category: 'grammar',
    prerequisites: ['relative-clauses', 'inversion'],
    estimatedHours: 3,
  },
  {
    id: 'cohesion-coherence',
    name: 'Cohesion & Coherence',
    nameZh: '篇章連貫',
    dseLevel: 'S6', category: 'grammar',
    prerequisites: ['connectors', 'reported-speech', 'subjunctive'],
    estimatedHours: 5,
  },

  // === Writing Skills ===
  {
    id: 'paragraph-structure',
    name: 'Paragraph Structure (PEEL)',
    nameZh: '段落結構',
    dseLevel: 'S2', category: 'writing',
    prerequisites: ['sentence-structure'],
    estimatedHours: 4,
  },
  {
    id: 'essay-organization',
    name: 'Essay Organization',
    nameZh: '文章組織',
    dseLevel: 'S3', category: 'writing',
    prerequisites: ['paragraph-structure', 'connectors'],
    estimatedHours: 5,
  },
  {
    id: 'register-tone',
    name: 'Register & Tone',
    nameZh: '語域與語氣',
    dseLevel: 'S4', category: 'writing',
    prerequisites: ['essay-organization', 'modal-verbs-advanced'],
    estimatedHours: 4,
  },
  {
    id: 'argumentation',
    name: 'Argumentation Techniques',
    nameZh: '議論技巧',
    dseLevel: 'S5', category: 'writing',
    prerequisites: ['essay-organization', 'register-tone', 'cohesion-coherence'],
    estimatedHours: 6,
  },

  // === Vocabulary Skills ===
  {
    id: 'word-formation',
    name: 'Word Formation',
    nameZh: '構詞法',
    dseLevel: 'S3', category: 'vocabulary',
    prerequisites: ['parts-of-speech'],
    estimatedHours: 3,
  },
  {
    id: 'collocations',
    name: 'Collocations',
    nameZh: '詞語搭配',
    dseLevel: 'S4', category: 'vocabulary',
    prerequisites: ['word-formation', 'phrasal-verbs'],
    estimatedHours: 5,
  },
  {
    id: 'idioms',
    name: 'Idioms & Fixed Expressions',
    nameZh: '成語及固定表達',
    dseLevel: 'S5', category: 'vocabulary',
    prerequisites: ['collocations'],
    estimatedHours: 4,
  },
];

// ============================================
// Graph Query Functions
// ============================================

/** Get all skills */
export function getAllSkills(): SkillNode[] { return GRAMMAR_GRAPH; }

/** Get a skill by ID */
export function getSkill(id: string): SkillNode | undefined {
  return GRAMMAR_GRAPH.find(s => s.id === id);
}

/** Get all prerequisites for a skill (recursive) */
export function getAllPrerequisites(skillId: string): string[] {
  const visited = new Set<string>();
  function walk(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const skill = getSkill(id);
    if (skill) skill.prerequisites.forEach(walk);
  }
  walk(skillId);
  visited.delete(skillId);
  return [...visited];
}

/** Get skills that depend on this skill (reverse lookup) */
export function getDependents(skillId: string): string[] {
  return GRAMMAR_GRAPH.filter(s => s.prerequisites.includes(skillId)).map(s => s.id);
}

/** Get skills appropriate for a grade level (and all prerequisites) */
export function getSkillsForLevel(gradeLevel: string): SkillNode[] {
  const levels = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
  const maxIndex = levels.indexOf(gradeLevel);
  if (maxIndex < 0) return GRAMMAR_GRAPH;
  return GRAMMAR_GRAPH.filter(s => {
    const skillIndex = levels.indexOf(s.dseLevel);
    return skillIndex <= maxIndex;
  });
}

/** Topological sort of the dependency graph */
export function topologicalSort(): SkillNode[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const s of GRAMMAR_GRAPH) {
    inDegree.set(s.id, s.prerequisites.length);
    for (const p of s.prerequisites) {
      if (!adj.has(p)) adj.set(p, []);
      adj.get(p)!.push(s.id);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const result: SkillNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const skill = getSkill(id);
    if (skill) result.push(skill);
    for (const dep of adj.get(id) || []) {
      const newDeg = (inDegree.get(dep) || 1) - 1;
      inDegree.set(dep, newDeg);
      if (newDeg === 0) queue.push(dep);
    }
  }
  return result;
}
