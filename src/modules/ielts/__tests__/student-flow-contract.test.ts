// ============================================
// 學生端 IELTS 自學流程契約（source scan）
// ============================================
// 2026-10-07 使用者要求（改善流程及 UI）：
//   1. 學生必須**先選組別**（學術組／通用組），並看到「學術組＝較高級的程度、
//      通用組＝較適合中學生」的說明，之後才列出卷別。
//   2. 選組後列出**該組全部卷別**（聆聽／閱讀／寫作／口說），每個卷別都可即時
//      AI 生成練習（未經教師審核）供隨時自學。
// 治理不變：AI 永不自動發佈；口說永不出現評分路徑。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../../..');

const dashboard = readFileSync(resolve(ROOT, 'src/app/student/ielts/page.tsx'), 'utf-8');
const writingPage = readFileSync(resolve(ROOT, 'src/app/student/ielts/writing/page.tsx'), 'utf-8');
const i18n = readFileSync(resolve(ROOT, 'src/shared/utils/i18n-ielts.ts'), 'utf-8');

describe('IELTS student dashboard — variant-first flow', () => {
  it('gates every paper behind an explicit variant choice', () => {
    // 未選組別前只顯示第一步（卷別清單在 `variant !== null` 分支內）
    expect(dashboard).toContain('{variant === null ? (');
    // 本次尚未選擇 ⇒ sessionVariant = undefined ⇒ 用已記住的組別（或 null = 未選過）
    expect(dashboard).toContain(
      'const [sessionVariant, setSessionVariant] = useState<IeltsVariant | null | undefined>(undefined);',
    );
  });

  it('explains the level of each variant and offers both choices', () => {
    const requiredKeys = [
      'ielts.dashboard.step1Title',
      'ielts.dashboard.step1Desc',
      'ielts.dashboard.selectAcademic',
      'ielts.dashboard.selectGeneral',
      'ielts.dashboard.academicLevel',
      'ielts.dashboard.generalLevel',
    ];
    for (const key of requiredKeys) {
      expect(dashboard, `${key} must be rendered`).toContain(`t('${key}')`);
      expect(i18n, `${key} must be translated`).toContain(`'${key}':`);
    }
    // 使用者要求的語意：學術組＝較高級；通用組＝較適合中學生
    expect(i18n).toMatch(/'ielts\.dashboard\.academicLevel':\s*\{\s*zh: '[^']*較高級/);
    expect(i18n).toMatch(/'ielts\.dashboard\.generalLevel':\s*\{\s*zh: '[^']*較適合中學生/);
  });

  it('lists all four papers with an instant (unreviewed) AI option', () => {
    expect(dashboard).toContain("const PAPER_ORDER: IeltsPaper[] = ['LISTENING', 'READING', 'WRITING', 'SPEAKING'];");
    expect(dashboard).toContain("t('ielts.paper.instantLabel')");
    expect(dashboard).toContain("fetch('/api/ielts/practice/instant'");
    expect(dashboard).toContain("t('ielts.instant.fullComponent')");
    // 寫作與口說由各自的頁面承接（寫作帶入組別＋任務）
    expect(dashboard).toContain('/student/ielts/writing?mode=${variant}&task=${task}');
    expect(dashboard).toContain('href="/student/ielts/speaking"');
  });

  it('never exposes a scored speaking path', () => {
    expect(dashboard).toContain("t('ielts.speaking.noScoreNotice')");
    expect(dashboard).not.toMatch(/startInstantPractice\('SPEAKING'/);
  });
});

describe('IELTS variant preference — 記住上次組別', () => {
  const hook = readFileSync(resolve(ROOT, 'src/hooks/use-ielts-variant-preference.ts'), 'utf-8');

  it('偏好以 useSyncExternalStore 讀取（server snapshot = null ⇒ 不會 hydration mismatch）', () => {
    expect(hook).toContain("import { useCallback, useSyncExternalStore } from 'react';");
    expect(hook).toContain('useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)');
    expect(hook).toContain('const getServerSnapshot = (): IeltsVariantPreference | null => null;');
    // localStorage 不可用（隱私模式）只失去「記住」能力，絕不拋錯
    expect(hook).toContain('catch {');
  });

  it('主頁以已記住的組別作為預設，選組別時寫入偏好，並說明已記住', () => {
    expect(dashboard).toContain(
      "import { usePreferredIeltsVariant } from '@/hooks/use-ielts-variant-preference';",
    );
    expect(dashboard).toContain('usePreferredIeltsVariant()');
    // `sessionVariant === undefined`（本次尚未選）⇒ 用已記住的組別
    expect(dashboard).toContain('sessionVariant === undefined ? storedVariant : sessionVariant');
    expect(dashboard).toContain('rememberVariant(v);');
    // 「更改組別」只清本次選擇（偏好保留，下次進入仍自動套用）
    expect(dashboard).toContain('setSessionVariant(null);');
    expect(dashboard).toContain("t('ielts.dashboard.rememberedVariant')");
    expect(i18n).toContain("'ielts.dashboard.rememberedVariant':");
  });
});

describe('IELTS writing page — dashboard deep link', () => {
  it('honours ?mode=&task= as the initial selection (validated against the variant)', () => {
    expect(writingPage).toContain('const initialSelection = useMemo(() => {');
    expect(writingPage).toContain("searchParams.get('mode')");
    expect(writingPage).toContain("TASKS_BY_MODE[resolvedMode].find(");
    expect(writingPage).toContain("searchParams.get('task')");
    // useSearchParams 需要 Suspense 邊界
    expect(writingPage).toContain('<Suspense');
  });
});
