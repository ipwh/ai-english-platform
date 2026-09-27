// ============================================
// 2026-09-27 事故補救（使用者回報：轉述句題目答案有誤）— 一次性、可重跑（idempotent）
//
// 背景（CHANGELOG 2026-09-26 (VI) / 2026-09-27）：
//   GrammarQuestion 05f1815e-…（2026-09-26 18:53 HKT 生成）四個選項中沒有任何
//   一個同時滿足其解說列出的兩條轉換規則（must→had to 且 we→they）：
//     A we must（全未轉換）/ B we have to（時態未後退）/
//     C they must（代詞對、動詞未後退）/ D we had to（動詞對、代詞未後退，但被當成答案鍵）
//   唯一正解「they had to」不在選項中 → 系統以不存在的正解把學生判錯。
//
// 本腳本（預設 dry-run；--apply 才寫入）：
//   1. 修題：把選項 D 文字 "we had to" 改為 "they had to"（答案鍵維持 D）。
//   2. 補償該場唯一一次作答：
//      · PracticeAnswer：result 'incorrect' → 'ungradable'、countsTowardScore → false
//        （證據投影「跳過不計」；錯題閘門亦不再把它當可建立錯題的證據）
//      · 刪除由它建立的 Mistake（若仍在）
//      · 反向一次 session 級 mastery 累積（practiceCount/correctCount 或 mistakeCount -1，
//        以正典 calculateMasteryScore 重算；practiceCount 歸零則刪除該列）
//   3. 以正典 `syncActivityMetrics` 重算該生準確率／週快照（排除已 void 的列）。
//
// 可重跑性：所有寫入都以「目前狀態」為前置條件（result='incorrect' 才 void；
// 舊選項文字存在才改字），重跑不會二次反轉 mastery 或二次扣分。
//
// 用法：
//   npx tsx scripts/remediate-20260927-defective-question.ts          # dry-run
//   npx tsx scripts/remediate-20260927-defective-question.ts --apply
// ============================================

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const QUESTION_ID = '05f1815e-ea20-41c7-bea3-a92bf25ed833';
const ANSWER_ID = 'cmuia00j600en01s6p8z0xhj3';
const MISTAKE_ID = '533a0de0-c478-44a0-80f1-786f570cb338';
const OLD_CHOICE_D = 'The campaigner said that we had to ban single-use plastics to protect marine life.';
const NEW_CHOICE_D = 'The campaigner said that they had to ban single-use plastics to protect marine life.';

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
  throw new Error('找不到 DATABASE_URL（請確認 .env.local 存在）');
}

async function main() {
  const apply = process.argv.includes('--apply');
  const repair = process.argv.includes('--repair-mastery');
  configureDatabaseUrl();

  const { db } = await import('@/shared/db/db');
  console.log(`mode: ${apply || repair ? 'APPLY（會寫入）' : 'DRY-RUN（只讀）'}${repair ? ' + repair-mastery' : ''}\n`);

  // ---------- 0. --repair-mastery：修正首次執行誤配對的 mastery 列 ----------
  // （2026-09-27：首次 --apply 以「時間窗內最新」誤選了 動名詞與不定詞 列，
  //   已將其上調的值 -1/-1；同時 轉述句 列的預定反轉未執行。此模式把兩列
  //   各自修回正確狀態，以確切現值為前置條件，重跑安全。）
  if (repair) {
    const studentId = 'cmrbd6lxj005r04jv4ga1lobx';
    const { calculateMasteryScore } = await import('@/modules/student/mastery/services/mastery-formula');

    // 0a. 還原誤改的 動名詞與不定詞 列（被錯誤 -1/-1：1/1 → 應為 2/2）
    const wrong = await db.studentMastery.findUnique({
      where: { studentId_skill_subSkill: { studentId, skill: 'grammar', subSkill: '動名詞與不定詞' } },
    });
    if (!wrong) {
      console.log('0a) 動名詞與不定詞 列不存在 — 略過');
    } else if (wrong.practiceCount === 1 && wrong.correctCount === 1 && wrong.mistakeCount === 0) {
      const scores = calculateMasteryScore({ correctCount: 2, practiceCount: 2, mistakeCount: 0, lastPracticedAt: wrong.lastPracticedAt });
      await db.studentMastery.update({
        where: { id: wrong.id },
        data: { practiceCount: 2, correctCount: 2, ...scores, updatedAt: new Date() },
      });
      console.log(`0a) ✅ 已還原 動名詞與不定詞：1/1 → 2/2（masteryScore=${scores.masteryScore}）`);
    } else if (wrong.practiceCount === 2 && wrong.correctCount === 2) {
      console.log('0a) 動名詞與不定詞 已是 2/2 — 略過');
    } else {
      throw new Error(`動名詞與不定詞 列現值不符預期（practice=${wrong.practiceCount} correct=${wrong.correctCount} mistake=${wrong.mistakeCount}），中止`);
    }

    // 0b. 補做 轉述句 列的預定反轉（應由 3/3 → 2/2；目標場次 isCorrect=true）
    const target = await db.studentMastery.findUnique({
      where: { studentId_skill_subSkill: { studentId, skill: 'grammar', subSkill: '轉述句' } },
    });
    if (!target) {
      console.log('0b) 轉述句 列不存在 — 略過');
    } else if (target.practiceCount === 3 && target.correctCount === 3 && target.mistakeCount === 0) {
      const scores = calculateMasteryScore({ correctCount: 2, practiceCount: 2, mistakeCount: 0, lastPracticedAt: target.lastPracticedAt });
      await db.studentMastery.update({
        where: { id: target.id },
        data: { practiceCount: 2, correctCount: 2, ...scores, updatedAt: new Date() },
      });
      console.log(`0b) ✅ 已補做反轉 轉述句：3/3 → 2/2（masteryScore=${scores.masteryScore}）`);
    } else if (target.practiceCount === 2 && target.correctCount === 2) {
      console.log('0b) 轉述句 已是 2/2 — 略過');
    } else {
      throw new Error(`轉述句 列現值不符預期（practice=${target.practiceCount} correct=${target.correctCount} mistake=${target.mistakeCount}），中止`);
    }
    console.log('');
  }

  // ---------- 1. 修題 ----------
  const question = await db.grammarQuestion.findUnique({ where: { id: QUESTION_ID } });
  if (!question) throw new Error(`找不到題目 ${QUESTION_ID}`);

  const choices: string[] = JSON.parse(question.choices ?? '[]');
  const currentD = choices[3];
  if (currentD === NEW_CHOICE_D) {
    console.log('1) 選項 D 已是修正後文字 — 略過');
  } else if (currentD === OLD_CHOICE_D) {
    console.log('1) 選項 D 需要修正：');
    console.log(`   舊：${OLD_CHOICE_D}`);
    console.log(`   新：${NEW_CHOICE_D}`);
    if (apply) {
      choices[3] = NEW_CHOICE_D;
      await db.grammarQuestion.update({
        where: { id: QUESTION_ID },
        data: { choices: JSON.stringify(choices) },
      });
      console.log('   ✅ 已更新（answer 維持 D）');
    } else {
      console.log('   （dry-run：未寫入）');
    }
  } else {
    throw new Error(`選項 D 文字與預期不符，為避免誤改而中止：${currentD}`);
  }
  console.log(`   目前答案鍵：${question.answer}；選項：${JSON.stringify(JSON.parse(question.choices ?? '[]'))}\n`);

  // ---------- 2. 補償 ----------
  const answer = await db.practiceAnswer.findUnique({
    where: { id: ANSWER_ID },
    include: { session: { select: { id: true, studentId: true, skill: true, skillZh: true, totalQuestions: true, correctCount: true, completedAt: true, masteryAppliedAt: true } } },
  });
  if (!answer) throw new Error(`找不到作答列 ${ANSWER_ID}`);
  if (answer.questionId !== QUESTION_ID) throw new Error('作答列與目標題目不符，中止');
  if (answer.studentAnswer !== 'C') throw new Error(`作答列答案非 C（實際 ${answer.studentAnswer}），中止`);

  const { studentId, session } = { studentId: answer.session.studentId, session: answer.session };
  console.log('2) 目標作答 / 場次：');
  console.log(`   answer.id=${answer.id} result=${answer.result} countsTowardScore=${answer.countsTowardScore} isCorrect=${answer.isCorrect}`);
  console.log(`   session.id=${session.id} skill=${session.skill} skillZh=${session.skillZh} total=${session.totalQuestions} correct=${session.correctCount}`);
  console.log(`   masteryAppliedAt=${session.masteryAppliedAt?.toISOString() ?? 'null'}\n`);

  // session 級 mastery 判定（與 student-mastery-repo.applyPracticeMasteryOnce 同一公式）
  const sessionIsCorrect = session.correctCount >= Math.ceil(session.totalQuestions / 2);

  if (answer.result !== 'incorrect') {
    console.log('   ⏭ 作答列已非 incorrect（先前已 void）→ 略過補償反轉\n');
  } else if (!apply) {
    console.log('   （dry-run：未寫入；預定動作）');
    console.log(`   · result → ungradable、countsTowardScore → false`);
    console.log(`   · 刪除 Mistake ${MISTAKE_ID}`);
    console.log(`   · 反向 mastery（sessionIsCorrect=${sessionIsCorrect} → practiceCount-1、${sessionIsCorrect ? 'correctCount-1' : 'mistakeCount-1'}）\n`);
  } else {
    // 2a. void 作答列（以 result 為閘，確保只反轉一次）
    const flipped = await db.practiceAnswer.updateMany({
      where: { id: ANSWER_ID, result: 'incorrect' },
      data: { result: 'ungradable', countsTowardScore: false },
    });
    if (flipped.count === 1) {
      console.log('   ✅ 作答列已 void（ungradable / 不計分）');
    } else {
      console.log('   ⏭ 作答列已被其他執行 void — 僅做冪等的清除');
    }

    // 2b. 刪除錯題（冪等）
    const deleted = await db.mistake.deleteMany({ where: { id: MISTAKE_ID, studentId } });
    console.log(deleted.count === 1 ? '   ✅ 錯題紀錄已刪除' : '   ⏭ 錯題紀錄不存在（先前已刪除）');

    // 2c. 反向 mastery（只在本次確實翻轉時執行，避免重跑二次反轉）
    if (flipped.count === 1) {
      if (!session.masteryAppliedAt) {
        console.log('   ⚠️ 此場次未曾套用 mastery（masteryAppliedAt=null）→ 無需反轉（請人工確認）');
      } else {
        const candidates = await db.studentMastery.findMany({
          where: { studentId },
          orderBy: { lastPracticedAt: 'desc' },
          take: 8,
        });
        // 2026-09-27 修正：配對必須以 subSkill === session.skillZh 為第一準則。
        // （原以「時間窗內最新」配對，曾誤選鄰近場次的 mastery 列；已由
        //   --repair-mastery 修正。時間窗僅作後備，且不在多個候選時亂選。）
        const withinWindow = candidates.filter(m =>
          m.lastPracticedAt &&
          session.completedAt &&
          Math.abs(m.lastPracticedAt.getTime() - session.completedAt.getTime()) <= 10 * 60 * 1000,
        );
        const exact = withinWindow.find(m => m.subSkill === session.skillZh);
        const target = exact ?? (withinWindow.length === 1 ? withinWindow[0] : undefined);
        console.log(`   mastery 候選（${candidates.length} 筆，時間窗內 ${withinWindow.length} 筆）：`);
        for (const m of candidates) {
          console.log(`     skill=${m.skill} subSkill=${m.subSkill} practice=${m.practiceCount} correct=${m.correctCount} mistake=${m.mistakeCount} last=${m.lastPracticedAt?.toISOString() ?? 'null'}`);
        }
        if (!target) {
          console.log('   ⚠️ 找不到與場次 subSkill／時間相符的唯一 mastery 列 → 未反轉（請人工確認）');
        } else {
          const newPractice = target.practiceCount - 1;
          if (newPractice <= 0) {
            await db.studentMastery.delete({ where: { id: target.id } });
            console.log(`   ✅ mastery 列已刪除（反轉後 practiceCount=0）：skill=${target.skill} subSkill=${target.subSkill}`);
          } else {
            const { calculateMasteryScore } = await import('@/modules/student/mastery/services/mastery-formula');
            const newCorrect = sessionIsCorrect ? Math.max(0, target.correctCount - 1) : target.correctCount;
            const newMistake = sessionIsCorrect ? target.mistakeCount : Math.max(0, target.mistakeCount - 1);
            const scores = calculateMasteryScore({
              correctCount: newCorrect,
              practiceCount: newPractice,
              mistakeCount: newMistake,
              lastPracticedAt: target.lastPracticedAt,
            });
            await db.studentMastery.update({
              where: { id: target.id },
              data: {
                practiceCount: newPractice,
                correctCount: newCorrect,
                mistakeCount: newMistake,
                ...scores,
                updatedAt: new Date(),
              },
            });
            console.log(`   ✅ mastery 已反轉：skill=${target.skill} subSkill=${target.subSkill} practice=${newPractice} correct=${newCorrect} mistake=${newMistake} masteryScore=${scores.masteryScore}`);
          }
        }
      }
    }
    console.log('');
  }

  // ---------- 3. 重算指標 ----------
  const { studentStateMutationService } = await import('@/modules/student/state/StudentStateMutationService');
  const before = await db.user.findUnique({ where: { id: studentId }, select: { overallAccuracy: true } });
  if (apply) {
    const after = await studentStateMutationService.syncActivityMetrics(studentId);
    console.log(`3) 指標重算：overallAccuracy ${before?.overallAccuracy ?? 'null'} → ${after.accuracy ?? 'null'}（weekStart=${after.weekStart}）\n`);
  } else {
    console.log(`3) （dry-run：未重算）目前 overallAccuracy=${before?.overallAccuracy ?? 'null'}\n`);
  }

  // ---------- 4. 驗證輸出 ----------
  const sessionWithAnswers = await db.practiceSession.findUnique({
    where: { id: session.id },
    include: { answers: { orderBy: { questionIndex: 'asc' } } },
  });
  const { evaluatePracticeEvidence } = await import('@/modules/exercise/services/practice-evidence-service');
  const evidence = evaluatePracticeEvidence(sessionWithAnswers?.answers ?? []);
  console.log('4) 驗證：');
  console.log(`   場次證據投影：${JSON.stringify(evidence)}`);
  const afterAnswer = await db.practiceAnswer.findUnique({ where: { id: ANSWER_ID }, select: { result: true, countsTowardScore: true } });
  console.log(`   作答列現況：${JSON.stringify(afterAnswer)}`);
  const mistakeLeft = await db.mistake.findUnique({ where: { id: MISTAKE_ID }, select: { id: true } });
  console.log(`   殘留錯題：${mistakeLeft ? '仍有（異常）' : '無'}`);
  const finalQuestion = await db.grammarQuestion.findUnique({ where: { id: QUESTION_ID }, select: { choices: true, answer: true } });
  console.log(`   題目選項 D：${JSON.parse(finalQuestion?.choices ?? '[]')[3]}`);

  const clientLike = db as unknown as { $disconnect?: () => Promise<void> };
  await clientLike.$disconnect?.();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
