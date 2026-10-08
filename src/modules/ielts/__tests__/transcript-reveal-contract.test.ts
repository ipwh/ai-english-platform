// ============================================
// 學生端 IELTS 逐字稿揭示契約（source scan）
// ============================================
// 2026-10-08 使用者回報：IELTS 聆聽練習「提交答案後，未有顯示逐字稿」。
//
// 取證（生產庫唯讀）：該卷 4 段逐字稿**都在資料庫中**（1587/2222/3247/2914 字），
// 學生也已提交（40 題）。即資料無損 —— 缺陷在於**交付與渲染**：
//   * UI 文案承諾「逐字稿將於提交後顯示」（`ielts.transcriptAfterSubmit`），
//   * 服務 `getSectionTranscriptForDelivery()` 存在，但**只接在 TTS 語音路由**上，
//   * runner 只渲染 `section.passageText`（閱讀篇章），**從未**渲染逐字稿。
//
// 本測試把「承諾 → 實作」釘死：文案存在時，runner 必須真的有渲染路徑，
// 且必須由**提交後的結果**帶入（伺服器以 SUBMITTED 為閘門，作答前永不交付）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../../..');

const runner = readFileSync(resolve(ROOT, 'src/app/student/ielts/tests/[id]/page.tsx'), 'utf-8');
const i18n = readFileSync(resolve(ROOT, 'src/shared/utils/i18n-ielts.ts'), 'utf-8');
const attemptService = readFileSync(resolve(ROOT, 'src/modules/ielts/services/attempt-service.ts'), 'utf-8');

describe('IELTS listening transcript reveal', () => {
  it('the runner renders a transcript block and consumes it from the submitted result', () => {
    // 承諾（作答前的提示文案）仍在
    expect(runner).toContain("t('ielts.transcriptAfterSubmit')");
    // 真的有渲染路徑（而不是只有提示字）
    expect(runner).toContain("t('ielts.transcript')");
    expect(runner).toMatch(/transcriptBySectionId/);
    // 逐字稿來自提交結果，作答前為空
    expect(runner).toContain('result?.transcripts');
  });

  it('every rendered i18n key is translated', () => {
    for (const key of ['ielts.transcriptAfterSubmit', 'ielts.transcript']) {
      expect(runner, `${key} must be rendered`).toContain(`t('${key}')`);
      expect(i18n, `${key} must be translated`).toContain(`'${key}':`);
    }
  });

  it('the server releases transcripts only for a SUBMITTED attempt', () => {
    // 提交回傳一定要帶 transcripts（否則提交後仍然看不到）
    expect(attemptService).toMatch(/transcripts: toDeliveredTranscripts\(test\.sections\)/);
    // 讀取路徑必須以 SUBMITTED 為閘門（作答前洩題是最嚴重的回歸）
    expect(attemptService).toMatch(
      /if \(row\.status === 'SUBMITTED'\) \{\s*transcripts = toDeliveredTranscripts\(await ieltsRepo\.listSectionsForTest\(row\.testId\)\);/,
    );
    // 交付閘門必須是單一函式（不得在各處另寫一份）
    expect(attemptService).toMatch(/function toDeliveredTranscripts\(/);
  });

  it('the attempt detail contract carries transcripts (refresh must not lose them)', () => {
    expect(attemptService).toMatch(/interface IeltsAttemptDetail[\s\S]*transcripts: IeltsSectionTranscript\[\];/);
    expect(attemptService).toMatch(/interface IeltsSubmissionSummary[\s\S]*transcripts: IeltsSectionTranscript\[\];/);
    // 重新載入已提交的嘗試時也要還原（否則重新整理就消失）
    expect(runner).toContain('transcripts: detail.attempt.transcripts ?? []');
  });
});
