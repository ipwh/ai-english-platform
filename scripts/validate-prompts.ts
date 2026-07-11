/**
 * Prompt 驗證腳本 — validate-prompts.ts
 *
 * 使用當前 AI prompt 生成測試題目並自動驗證答案一致性。
 * 用途：HKDSE 更新後、prompt 修改後、每月 QA 檢查。
 *
 * 用法：npx tsx scripts/validate-prompts.ts
 *
 * 退出碼：
 *   0 — 全部通過
 *   1 — 有答案一致性警告（需檢查）
 */

// 模擬 generateQuestions 的輸入組合
const TEST_COMBINATIONS = [
  // 基礎文法 MCQ
  { grammarItem: 'tenses', difficulty: 'core' as const, gradeLevel: 'S4', count: 3, questionType: 'mc' as const },
  { grammarItem: 'conditionals', difficulty: 'challenge' as const, gradeLevel: 'S5', count: 3, questionType: 'mc' as const },

  // 聆聽題（高風險：答案需與 listeningContent 一致）
  { languageSkill: 'listening', difficulty: 'core' as const, gradeLevel: 'S4', count: 3, questionType: 'mc' as const },

  // 閱讀題
  { languageSkill: 'reading', difficulty: 'core' as const, gradeLevel: 'S4', count: 2, questionType: 'mc' as const },

  // 填充題
  { grammarItem: 'prepositions', difficulty: 'remedial' as const, gradeLevel: 'S3', count: 2, questionType: 'fill-blank' as const },

  // 高中挑戰題
  { grammarItem: 'inversion', difficulty: 'challenge' as const, gradeLevel: 'S6', count: 2, questionType: 'mc' as const },
];

async function main() {
  console.log('🔍 AI Prompt Validation — 答案一致性自動檢查\n');
  console.log(`測試組合數: ${TEST_COMBINATIONS.length}\n`);

  let totalQuestions = 0;
  let totalWarnings = 0;
  let failedCombos = 0;

  for (const [i, combo] of TEST_COMBINATIONS.entries()) {
    const label = combo.grammarItem
      ? `grammar=${combo.grammarItem}`
      : `skill=${combo.languageSkill}`;

    process.stdout.write(`[${i + 1}/${TEST_COMBINATIONS.length}] ${label} (${combo.difficulty}, ${combo.gradeLevel})... `);

    try {
      const { generateQuestions, validateAndFixQuestion } = await import('../src/lib/ai-service');

      const questions = await generateQuestions(combo);
      totalQuestions += questions.length;

      const comboWarnings: string[] = [];
      for (const [j, q] of questions.entries()) {
        const { warnings } = validateAndFixQuestion(q as any, j + 1);
        comboWarnings.push(...warnings);
      }

      totalWarnings += comboWarnings.length;

      if (comboWarnings.length === 0) {
        console.log('✅ PASS');
      } else {
        failedCombos++;
        console.log(`⚠️  ${comboWarnings.length} warning(s):`);
        for (const w of comboWarnings) {
          console.log(`    - ${w}`);
        }
      }
    } catch (err: unknown) {
      failedCombos++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`❌ FAIL (${msg.slice(0, 100)})`);
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Total Questions: ${totalQuestions}`);
  console.log(`   Total Warnings:  ${totalWarnings}`);
  console.log(`   Failed Combos:   ${failedCombos}/${TEST_COMBINATIONS.length}`);
  console.log(`   Warning Rate:    ${totalQuestions > 0 ? ((totalWarnings / totalQuestions) * 100).toFixed(1) : 0}%`);

  if (failedCombos > 0 || totalWarnings > 2) {
    console.log('\n❌ Validation FAILED — check warnings above.');
    process.exit(1);
  }

  console.log('\n✅ All prompts validated successfully.');
  process.exit(0);
}

main();
