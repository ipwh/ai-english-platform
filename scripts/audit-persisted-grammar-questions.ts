// ============================================
// Read-only audit for persisted grammar questions created before ADR-042.
//
// Usage:
//   npx tsx scripts/audit-persisted-grammar-questions.ts
//   npx tsx scripts/audit-persisted-grammar-questions.ts --quarantine
//
// This applies the same deterministic gate used before new delivery. It does
// not change questions or claim to semantically re-solve legacy items.
// ============================================

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readDatabaseUrl(path: string): string | null {
  try {
    const content = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
    const match = content.match(/^DATABASE_URL\s*[:=]\s*"?([^"\r\n]+?)"?\s*$/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function configureDatabaseUrl(): void {
  if (process.env.DATABASE_URL) return;
  for (const path of ['.env.local', '.env', 'cloud-run-env.yaml']) {
    const url = readDatabaseUrl(resolve(process.cwd(), path));
    if (url) {
      process.env.DATABASE_URL = url;
      return;
    }
  }
  throw new Error('找不到 DATABASE_URL（請設定環境變數，或確認 .env.local / cloud-run-env.yaml 存在）');
}

async function main() {
  const quarantine = process.argv.includes('--quarantine');
  configureDatabaseUrl();
  const { db } = await import('@/shared/db/db');
  const { inspectGeneratedQuestion } = await import('@/modules/ai/services/answer-verification');

  const questions = await db.grammarQuestion.findMany({
    select: {
      id: true,
      questionType: true,
      prompt: true,
      promptZh: true,
      choices: true,
      answer: true,
      explanationZh: true,
      explanationEn: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const flagged = questions.flatMap(question => {
    let choices: string[] = [];
    try {
      const parsed = question.choices ? JSON.parse(question.choices) : [];
      choices = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [{ id: question.id, prompt: question.prompt, reasons: ['選項 JSON 無法解析'] }];
    }
    const reasons = inspectGeneratedQuestion({
      type: question.questionType as 'mc',
      prompt: question.prompt,
      promptZh: question.promptZh ?? undefined,
      choices,
      answer: question.answer,
      explanationZh: question.explanationZh ?? '',
      explanationEn: question.explanationEn ?? '',
      commonMistake: '',
    });
    return reasons.length > 0 ? [{ id: question.id, prompt: question.prompt, reasons }] : [];
  });

  console.log(`已掃描 ${questions.length} 題；決定性缺陷 ${flagged.length} 題。`);
  for (const item of flagged) {
    console.log(`${item.id}\t${item.reasons.join('；')}\t${item.prompt.slice(0, 160)}`);
  }
  if (quarantine && flagged.length > 0) {
    await db.grammarQuestion.updateMany({
      where: { id: { in: flagged.map(item => item.id) } },
      data: { provenance: 'invalid' },
    });
    console.log(`已隔離 ${flagged.length} 題；保留題目與歷史作答紀錄。`);
  }
  await db.$disconnect();
  if (flagged.length > 0 && !quarantine) process.exitCode = 1;
}

main().catch(error => {
  console.error('題目稽核失敗：', error instanceof Error ? error.message : error);
  process.exitCode = 2;
});