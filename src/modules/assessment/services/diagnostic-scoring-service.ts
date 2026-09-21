// ============================================
// 診斷測驗 — 伺服器評分與可驗證證據（D2b / D3）
// ============================================
// 2026-09-20 稽核：診斷原本只在前端以 `checkAnswer` 自評，並且只寫入
// `DiagnosticResult`（自評列，永不進入 trusted state）。結果是：
//   - 學生做完診斷後「準確率」仍是 0%（因為沒有可驗證證據）；
//   - admin 看到自評的分數與 practice-based 準確率並列，看似矛盾。
//
// 本服務把「伺服器持有答案鍵」的診斷題目（文法 / 閱讀）經**正典練習提交管道**
// （`submitPractice` → `server-key-resolved` / `reading-server-exact-match`）
// 評分並持久化 → 成為可驗證證據（計入準確率與掌握度），分數即為伺服器評分（D3）。
//
// 邊界（不得默默放寬證據契約）：
//   - 只有 `server-key-resolved` / `reading-server-exact-match` /
//     `listening-server-exact-match` 三種權威方法存在；
//     詞彙 / 寫作尚無權威評分法 → 維持自評並由呼叫端標示為「不計入準確率」。
//   - 2026-09-21 ADR-045：聆聽題目現有伺服器題庫（ListeningQuestion），
//     因此與閱讀同一路徑可評分；題目 id 解析不到（舊資料）→ 該組整組略過。
//   - 伺服器無法評分（題目 id 非正典、AI 評分不可用）→ **該組整組略過**，
//     回退為自評顯示值，永不製造假分數。
// ============================================

import { logger } from '@/shared/logger/logger';
import { clearDiagnosticResults, createDiagnosticResult } from '../repositories/diagnostic-repo';
import { submitPractice } from '@/modules/exercise/services/practice-submission-service';
import { classifyPracticeSubmission } from '@/modules/exercise/services/practice-submission-classification';

export interface DiagnosticAnswerInput {
  questionIndex: number;
  questionId: string;
  studentAnswer: string;
  /** 練習提交用的技能鍵（文法組 = grammarItem，閱讀組 = 'reading'） */
  skill: string;
  skillZh: string;
  /** 對應的診斷結果技能 id（'grammar' | 'reading' | 'listening'…）；預設同 `skill` */
  resultSkill?: string;
  dseType?: string;
  timeSpent?: number;
}

export interface DiagnosticResultInput {
  skill: string;
  skillZh: string;
  accuracy: number;
  weakAreas?: string[];
  recommendedGrammar?: string;
  recommendedSkill?: string;
}

export interface AuthoritativeSkillScore {
  /** 診斷結果技能 id（用於對回結果頁） */
  skill: string;
  skillZh: string;
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
}

export interface DiagnosticSubmitOutcome {
  /** 每個技能的（最終）分數；authoritative = 由伺服器評分（計入準確率） */
  results: Array<DiagnosticResultInput & { authoritative: boolean }>;
  authoritative: AuthoritativeSkillScore[];
}

interface AnswerGroup {
  key: 'grammar' | 'reading' | 'listening';
  skill: string;
  skillZh: string;
  resultSkill: string;
  source: string;
  answers: Array<{ questionIndex: number; questionId: string; studentAnswer: string; dseType?: string; timeSpent?: number }>;
}

/** 解析並過濾客戶端答案列（只保留結構完整者） */
function normalizeAnswers(raw: unknown): DiagnosticAnswerInput[] {
  if (!Array.isArray(raw)) return [];
  const out: DiagnosticAnswerInput[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const a = (item ?? {}) as Partial<DiagnosticAnswerInput>;
    const questionId = typeof a.questionId === 'string' ? a.questionId.trim() : '';
    const skill = typeof a.skill === 'string' ? a.skill.trim() : '';
    if (!questionId || !skill || seen.has(questionId)) continue;
    if (typeof a.questionIndex !== 'number' || !Number.isFinite(a.questionIndex) || a.questionIndex < 0) continue;
    seen.add(questionId);
    out.push({
      questionIndex: a.questionIndex,
      questionId,
      studentAnswer: typeof a.studentAnswer === 'string' ? a.studentAnswer : '',
      skill,
      skillZh: typeof a.skillZh === 'string' && a.skillZh ? a.skillZh : skill,
      resultSkill: typeof a.resultSkill === 'string' && a.resultSkill ? a.resultSkill : undefined,
      dseType: typeof a.dseType === 'string' ? a.dseType : undefined,
      timeSpent: typeof a.timeSpent === 'number' && Number.isFinite(a.timeSpent) ? a.timeSpent : undefined,
    });
  }
  return out;
}

/**
 * 依**權威來源**分組：只有 grammar（server-key-resolved）、reading
 * （reading-server-exact-match / reading-ai-semantic-evaluation）與
 * listening（listening-server-exact-match，ADR-045）可提交。
 * 無法由伺服器評分的技能（詞彙／寫作）不建立題組。
 */
function groupByAuthority(answers: DiagnosticAnswerInput[]): AnswerGroup[] {
  const groups = new Map<'grammar' | 'reading' | 'listening', AnswerGroup>();

  for (const a of answers) {
    const isReading = a.skill === 'reading';
    const isListening = a.skill === 'listening';
    const source = isReading ? 'dse-reading' : isListening ? 'dse-listening' : 'diagnostic';
    const cls = classifyPracticeSubmission({ source, skill: a.skill, answers: [{ dseType: a.dseType }] });
    if (cls !== 'grammar' && cls !== 'reading' && cls !== 'listening') continue; // 非權威類別（詞彙/寫作）→ 不提交

    const key = cls;
    const existing = groups.get(key);
    const group: AnswerGroup = existing ?? {
      key,
      skill: isReading ? 'reading' : isListening ? 'listening' : a.skill,
      skillZh: isReading ? 'reading' : a.skillZh,
      resultSkill: a.resultSkill || (isReading ? 'reading' : isListening ? 'listening' : 'grammar'),
      source,
      answers: [],
    };
    group.answers.push({
      questionIndex: a.questionIndex,
      questionId: a.questionId,
      studentAnswer: a.studentAnswer,
      ...(a.dseType ? { dseType: a.dseType } : {}),
      ...(a.timeSpent !== undefined ? { timeSpent: a.timeSpent } : {}),
    });
    groups.set(key, group);
  }

  return Array.from(groups.values());
}

/**
 * 提交診斷作答：權威題組經正典管道評分＋持久化，然後寫入（先清後寫）
 * `DiagnosticResult`，權威技能以**伺服器分數**覆寫自評值。
 */
export async function submitDiagnostic(input: {
  studentId: string;
  runId: string;
  results: DiagnosticResultInput[];
  answers?: unknown;
}): Promise<DiagnosticSubmitOutcome> {
  const groups = groupByAuthority(normalizeAnswers(input.answers));
  const authoritative: AuthoritativeSkillScore[] = [];

  for (const group of groups) {
    try {
      const res = await submitPractice({
        studentId: input.studentId,
        skill: group.skill,
        skillZh: group.skillZh,
        difficulty: 'core',
        source: group.source,
        answers: group.answers,
        clientSubmissionId: `${input.runId}-${group.key}`,
      });

      if (!res.ok) {
        // 伺服器無法評分（例如題目 id 非正典）→ 略過，維持自評顯示值
        logger.warn(
          { module: 'diagnostic-submit', studentId: input.studentId, group: group.key, error: res.error },
          'Diagnostic canonical scoring skipped (self-reported fallback)',
        );
        continue;
      }
      if (res.totalQuestions > 0) {
        authoritative.push({
          skill: group.resultSkill,
          skillZh: group.skillZh,
          totalQuestions: res.totalQuestions,
          correctCount: res.correctCount,
          accuracy: Math.round((res.correctCount / res.totalQuestions) * 100),
        });
      }
    } catch (err) {
      logger.error(
        { module: 'diagnostic-submit', studentId: input.studentId, group: group.key, error: err instanceof Error ? err.message : String(err) },
        'Diagnostic canonical scoring failed (self-reported fallback)',
      );
    }
  }

  const results = input.results.map((r) => {
    const scored = authoritative.find((a) => a.skill === r.skill);
    if (!scored) return { ...r, authoritative: false };
    return {
      ...r,
      accuracy: scored.accuracy,
      weakAreas: scored.accuracy < 60 ? [r.skill] : [],
      authoritative: true,
    };
  });

  await clearDiagnosticResults(input.studentId);
  await Promise.all(
    results.map((r) =>
      createDiagnosticResult({
        studentId: input.studentId,
        skill: r.skill,
        skillZh: r.skillZh,
        // -1 = 未評估（例如寫作未作答）；範圍與 /api/diagnostic 一致
        accuracy: Math.min(100, Math.max(-1, r.accuracy)),
        weakAreas: r.weakAreas || [],
        recommendedGrammar: r.recommendedGrammar || null,
        recommendedSkill: r.recommendedSkill || null,
      }),
    ),
  );

  return { results, authoritative };
}
