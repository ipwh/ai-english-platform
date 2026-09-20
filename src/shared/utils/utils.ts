// ============================================
// 工具函數 — AI 英語學習平台
// ============================================

/** Milliseconds per day — use instead of inline 86400000 */
export const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * 將答案中的數字詞彙統一轉為數字，例："fifteen" → "15", "15" → "15"。
 * 正典數字詞彙正規化 — 供 practice / diagnostic 客戶端自評使用，
 * 與伺服器 scorer 的 normalizeNumbers 保持同一對照表。
 */
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

export function normalizeNumbers(text: string): string {
  return text.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b/gi,
    match => String(NUMBER_WORDS[match.toLowerCase()] ?? match),
  );
}

/**
 * 格式化日期（支援中英雙語 + 無效日期保護）
 */
export function formatDate(dateStr: string | null | undefined, lang: string = 'zh'): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  if (lang === 'en') {
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * 計算剩餘天數
 */
export function daysRemaining(dueDateStr: string): number {
  const now = new Date();
  const due = new Date(dueDateStr);
  const diff = due.getTime() - now.getTime();
  return Math.ceil(diff / MS_PER_DAY);
}

/**
 * 取得狀態對應顏色類別
 */
export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    'not-started': 'bg-gray-100 text-gray-600',
    'in-progress': 'bg-blue-100 text-blue-700',
    'completed': 'bg-green-100 text-green-700',
    'overdue': 'bg-red-100 text-red-700',
    'pending': 'bg-yellow-100 text-yellow-700',
    'reviewed': 'bg-green-100 text-green-700',
    'returned': 'bg-orange-100 text-orange-700',
  };
  return map[status] || 'bg-gray-100 text-gray-600';
}

/**
 * 取得熟悉度顏色
 */
export function getFamiliarityColor(familiarity: string): string {
  const map: Record<string, string> = {
    'new': 'bg-red-100 text-red-700',
    'learning': 'bg-yellow-100 text-yellow-700',
    'familiar': 'bg-blue-100 text-blue-700',
    'mastered': 'bg-green-100 text-green-700',
  };
  return map[familiarity] || 'bg-gray-100 text-gray-600';
}

/**
 * 取得熟悉度標籤（支援中英雙語）
 */
export function getFamiliarityLabel(familiarity: string, lang: string = 'zh'): string {
  const map: Record<string, { zh: string; en: string }> = {
    'new': { zh: '新學', en: 'New' },
    'learning': { zh: '學習中', en: 'Learning' },
    'familiar': { zh: '已熟悉', en: 'Familiar' },
    'mastered': { zh: '已掌握', en: 'Mastered' },
  };
  const entry = map[familiarity];
  if (!entry) return familiarity;
  return lang === 'en' ? entry.en : entry.zh;
}

/**
 * 打招呼語（根據香港時段 UTC+8，確保 SSR/CSR 一致），支援中英雙語
 */
export function getGreeting(lang?: string): string {
  // 使用 UTC 時間 +8 小時模擬香港時區，避免伺服器/客戶端時區差異導致 hydration mismatch
  const now = new Date();
  const hkHour = (now.getUTCHours() + 8) % 24;
  const isEn = lang === 'en';
  if (hkHour < 12) return isEn ? 'Good morning' : '早晨';
  if (hkHour < 18) return isEn ? 'Good afternoon' : '午安';
  return isEn ? 'Good evening' : '晚安';
}

/**
 * 將 Prisma 回傳的 JSON 字串欄位轉為陣列，確保前端拿到一致的格式。
 * 詞彙 API 與 quiz API 共用此函數，避免重複定義。
 */
export function serializeVocab(v: Record<string, unknown>): Record<string, unknown> {
  const result = { ...v };
  for (const field of ['synonyms', 'antonyms', 'collocations', 'allPartOfSpeech']) {
    if (typeof result[field] === 'string') {
      try { result[field] = JSON.parse(result[field] as string); } catch { result[field] = []; }
    }
    if (!result[field]) result[field] = [];
  }
  return result;
}

// ============================================
// 共用：技能名稱正規化 + 弱項分析
// 由 diagnostic/page.tsx 與 help/page.tsx 共用
// ============================================

export function normalizeSkillName(skill: string): { name: string; nameZh: string } {
  const key = skill.toLowerCase();
  if (key.includes('read')) return { name: 'reading', nameZh: '閱讀' };
  if (key.includes('writ')) return { name: 'writing', nameZh: '寫作' };
  if (key.includes('vocab') || key.includes('phrasal')) return { name: 'vocabulary', nameZh: '詞彙' };
  if (key.includes('listen')) return { name: 'listening', nameZh: '聆聽' };
  return { name: 'grammar', nameZh: '文法' };
}

export interface PracticeSessionLite {
  skill: string;
  skillZh: string;
  totalQuestions: number;
  correctCount: number;
  startedAt: string;
  /** R3.10-C: verified row-derived totals (null when unverifiable) */
  verified?: {
    status: 'verified' | 'unverifiable';
    totalQuestions?: number;
    correctCount?: number;
  } | null;
}

export interface MistakeLite {
  mistakeType: string;
  questionId?: string;
  createdAt: string;
}

export interface WeakSkill {
  name: string;
  nameZh: string;
  accuracy: number;
}

export function buildWeakSkills(sessions: PracticeSessionLite[], mistakes: MistakeLite[]): WeakSkill[] {
  const accuracyMap = new Map<string, { nameZh: string; correct: number; total: number }>();

  for (const session of sessions) {
    const normalized = normalizeSkillName(session.skill || session.skillZh || 'grammar');
    const current = accuracyMap.get(normalized.name) || { nameZh: normalized.nameZh, correct: 0, total: 0 };
    // R3.10-C: 優先使用 verified row-derived 聚合值；不可驗證的 session 不計入。
    if (session.verified && session.verified.status === 'verified') {
      current.correct += session.verified.correctCount ?? 0;
      current.total += session.verified.totalQuestions ?? 0;
    }
    accuracyMap.set(normalized.name, current);
  }

  const penaltyMap: Record<string, number> = { grammar: 0, vocabulary: 0, reading: 0, writing: 0, chinglish: 0 };
  for (const mistake of mistakes) {
    if (mistake.mistakeType === 'grammar') penaltyMap.grammar += 10;
    else if (mistake.mistakeType === 'chinglish') penaltyMap.chinglish += 10;
    else if (mistake.mistakeType === 'vocabulary') penaltyMap.vocabulary += 10;
    else if (mistake.mistakeType === 'comprehension') penaltyMap.reading += 10;
  }

  const base = Array.from(accuracyMap.entries()).map(([name, value]) => ({
    name,
    nameZh: value.nameZh,
    accuracy: Math.max(0, Math.round((value.correct / Math.max(1, value.total)) * 100) - (penaltyMap[name] || 0)),
  }));

  // 將 chinglish penalty 分散到 grammar 和 writing（中式英文影響兩個範疇）
  if (penaltyMap.chinglish > 0) {
    const existingGrammar = base.find(b => b.name === 'grammar');
    const existingWriting = base.find(b => b.name === 'writing');
    if (existingGrammar) existingGrammar.accuracy = Math.max(0, existingGrammar.accuracy - Math.round(penaltyMap.chinglish / 2));
    if (existingWriting) existingWriting.accuracy = Math.max(0, existingWriting.accuracy - Math.round(penaltyMap.chinglish / 2));
  }

  const defaults = [
    { name: 'grammar', nameZh: '文法', accuracy: -1 },
    { name: 'vocabulary', nameZh: '詞彙', accuracy: -1 },
    { name: 'reading', nameZh: '閱讀', accuracy: -1 },
    { name: 'writing', nameZh: '寫作', accuracy: -1 },
  ];

  // -1 = 無證據（未測過）≠ 弱（0）。舊版用 0 令每個新學生所有技能全被視為弱項，
  // 導致診斷加題全開、弱項建議隨機指向文法。
  for (const item of defaults) {
    if (!base.some(b => b.name === item.name)) base.push(item);
  }

  return base.sort((a, b) => a.accuracy - b.accuracy);
}
