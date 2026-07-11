// ============================================
// 歷屆試題匯入 Script
// 讀取 materials/_extracted/ 中的 OCR 提取文字，
// 建立 Material 紀錄並自動進行 RAG 向量索引。
//
// 用法：
//   npx tsx scripts/import-past-papers.ts
//   npx tsx scripts/import-past-papers.ts --dry-run   (預覽不寫入)
//   npx tsx scripts/import-past-papers.ts --file "Paper 1_Part A"  (只匯入指定檔案)
// ============================================

import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/lib/db';
import { indexMaterial } from '../src/lib/rag-service';

// ============================================
// 檔案分類規則
// ============================================

interface PastPaperMeta {
  fileName: string;
  title: string;
  type: 'reading_passage' | 'qa' | 'marking_scheme' | 'writing_question' | 'writing_ms' | 'sample' | 'curriculum' | 'other';
  paper: 'Paper 1' | 'Paper 2' | 'Paper 3' | 'Paper 4' | 'General';
  part?: 'Part A' | 'Part B1' | 'Part B2';
  yearRange?: string;
  strand: 'Reading' | 'Writing' | 'Listening' | 'Speaking' | 'Integrated' | 'General';
  gradeLevel: string;
  description: string;
}

function classifyFile(fileName: string): PastPaperMeta {
  const name = fileName.replace(/\.pdf\.txt$/i, '');

  // Paper 1
  if (name.includes('Paper 1')) {
    const yearMatch = name.match(/(\d{4}-\d{4})/);
    const yearRange = yearMatch ? yearMatch[1] : '2020-2025';

    if (name.includes('Marking Scheme')) {
      const partMatch = name.match(/Part ([AB]\d?)/i) || name.match(/Part A/i);
      const part = partMatch
        ? (partMatch[1] === 'A' ? 'Part A' : partMatch[1] === 'B1' ? 'Part B1' : 'Part B2')
        : 'Part A';
      return {
        fileName,
        title: `DSE ${yearRange} Paper 1 Reading ${part} — Marking Scheme`,
        type: 'marking_scheme',
        paper: 'Paper 1',
        part: part as 'Part A' | 'Part B1' | 'Part B2',
        yearRange,
        strand: 'Reading',
        gradeLevel: 'S4-S6',
        description: `HKDSE ${yearRange} English Paper 1 Reading ${part} 官方評分參考（Marking Scheme），含逐題答案與評分指引。`,
      };
    }

    if (name.includes('Q&A') || name.includes('Q & A')) {
      const partMatch = name.match(/Part ([AB]\d?)/i);
      const part = partMatch
        ? (partMatch[1] === 'A' ? 'Part A' : partMatch[1] === 'B1' ? 'Part B1' : 'Part B2')
        : 'Part A';
      return {
        fileName,
        title: `DSE ${yearRange} Paper 1 Reading ${part} — Questions & Answers`,
        type: 'qa',
        paper: 'Paper 1',
        part: part as 'Part A' | 'Part B1' | 'Part B2',
        yearRange,
        strand: 'Reading',
        gradeLevel: 'S4-S6',
        description: `HKDSE ${yearRange} English Paper 1 Reading ${part} 試題與參考答案。`,
      };
    }

    if (name.includes('Reading Passage')) {
      const partMatch = name.match(/Part ([AB]\d?)/i);
      const part = partMatch
        ? (partMatch[1] === 'A' ? 'Part A' : partMatch[1] === 'B1' ? 'Part B1' : 'Part B2')
        : 'Part A';
      return {
        fileName,
        title: `DSE ${yearRange} Paper 1 Reading ${part} — Reading Passages`,
        type: 'reading_passage',
        paper: 'Paper 1',
        part: part as 'Part A' | 'Part B1' | 'Part B2',
        yearRange,
        strand: 'Reading',
        gradeLevel: 'S4-S6',
        description: `HKDSE ${yearRange} English Paper 1 Reading ${part} 閱讀文章原文。`,
      };
    }
  }

  // Paper 2
  if (name.includes('Paper 2')) {
    const yearMatch = name.match(/(\d{4}-\d{4})/);
    const yearRange = yearMatch ? yearMatch[1] : '2020-2025';

    if (name.includes('Marking Scheme')) {
      return {
        fileName,
        title: `DSE ${yearRange} Paper 2 Writing — Marking Scheme`,
        type: 'writing_ms',
        paper: 'Paper 2',
        yearRange,
        strand: 'Writing',
        gradeLevel: 'S4-S6',
        description: `HKDSE ${yearRange} English Paper 2 Writing 官方評分參考（Marking Scheme），含 Content / Language / Organization 評分等級描述。`,
      };
    }

    if (name.includes('Q&A') || name.includes('Q & A')) {
      return {
        fileName,
        title: `DSE ${yearRange} Paper 2 Writing — Questions & Sample Answers`,
        type: 'qa',
        paper: 'Paper 2',
        yearRange,
        strand: 'Writing',
        gradeLevel: 'S4-S6',
        description: `HKDSE ${yearRange} English Paper 2 Writing 試題與範例答案。`,
      };
    }

    if (name.includes('Question Only')) {
      return {
        fileName,
        title: `DSE ${yearRange} Paper 2 Writing — Question Paper`,
        type: 'writing_question',
        paper: 'Paper 2',
        yearRange,
        strand: 'Writing',
        gradeLevel: 'S4-S6',
        description: `HKDSE ${yearRange} English Paper 2 Writing 試題（純題目）。`,
      };
    }
  }

  // Samples
  if (name.includes('Paper 1 Samples')) {
    return {
      fileName,
      title: `HKDSE Paper 1 Reading — Student Samples with Marks`,
      type: 'sample',
      paper: 'Paper 1',
      strand: 'Reading',
      gradeLevel: 'S4-S6',
      description: 'HKDSE English Paper 1 Reading 考生樣本答卷與評分。',
    };
  }

  if (name.includes('Paper 2 Samples')) {
    return {
      fileName,
      title: `HKDSE Paper 2 Writing — Student Samples with Marks`,
      type: 'sample',
      paper: 'Paper 2',
      strand: 'Writing',
      gradeLevel: 'S4-S6',
      description: 'HKDSE English Paper 2 Writing 考生樣本答卷與評分。',
    };
  }

  if (name.includes('Paper 3 Samples')) {
    return {
      fileName,
      title: `HKDSE Paper 3 Listening — Student Samples with Marks`,
      type: 'sample',
      paper: 'Paper 3',
      strand: 'Listening',
      gradeLevel: 'S4-S6',
      description: 'HKDSE English Paper 3 Listening 考生樣本答卷與評分。',
    };
  }

  if (name.includes('Paper 4')) {
    return {
      fileName,
      title: `HKDSE Paper 4 Speaking — Introduction & Samples`,
      type: 'sample',
      paper: 'Paper 4',
      strand: 'Speaking',
      gradeLevel: 'S4-S6',
      description: 'HKDSE English Paper 4 Speaking 考試簡介與樣本。',
    };
  }

  // Curriculum / ELE documents
  if (name.includes('ELE KLACG') || name.includes('Curriculum') || name.includes('Briefing')) {
    return {
      fileName,
      title: name.includes('Examples')
        ? 'ELE KLACG 2017 — Curriculum Examples'
        : name.includes('Briefing')
          ? 'HKDSE English 2020-2025 Briefing'
          : 'ELE KLACG 2017 — Curriculum Guide',
      type: 'curriculum',
      paper: 'General',
      strand: 'General',
      gradeLevel: 'S1-S6',
      description: '官方課程指引文件（ELE KLACG 2017 / HKDSE Briefing），用於對齊題目設計與課程要求。',
    };
  }

  // Fallback
  return {
    fileName,
    title: name.substring(0, 80),
    type: 'other',
    paper: 'General',
    strand: 'General',
    gradeLevel: 'S4-S6',
    description: `Extracted text from: ${name}`,
  };
}

// ============================================
// 取得系統管理員 ID（用於 uploadedBy）
// ============================================

async function getAdminUserId(): Promise<string> {
  const admin = await db.user.findFirst({
    where: { role: 'admin' },
    select: { id: true },
  });
  if (admin) return admin.id;

  // Fallback: 使用第一個教師
  const teacher = await db.user.findFirst({
    where: { role: 'teacher' },
    select: { id: true },
  });
  if (teacher) return teacher.id;

  throw new Error('找不到 admin 或 teacher 使用者。請先執行 db:seed 或確保至少有一位管理員/教師。');
}

// ============================================
// 主流程
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const fileFilter = args.find(a => a.startsWith('--file='))?.split('=')[1];
  const skipRag = args.includes('--skip-rag');

  const extractedDir = path.join(process.cwd(), 'materials', '_extracted');

  if (!fs.existsSync(extractedDir)) {
    console.error(`❌ 目錄不存在: ${extractedDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(extractedDir)
    .filter(f => f.endsWith('.pdf.txt'))
    .filter(f => !fileFilter || f.includes(fileFilter));

  console.log(`📂 找到 ${files.length} 個 .txt 檔案${fileFilter ? ` (篩選: ${fileFilter})` : ''}`);
  if (isDryRun) console.log('🔍 DRY RUN 模式 — 僅預覽，不寫入資料庫\n');
  if (skipRag) console.log('⏩ --skip-rag 模式 — 僅建立 Material，不建立向量索引\n');

  const adminUserId = isDryRun ? 'dry-run-user-id' : await getAdminUserId();
  if (!isDryRun) console.log(`👤 使用上傳者 ID: ${adminUserId}\n`);

  const results: {
    fileName: string;
    title: string;
    type: string;
    status: 'created' | 'updated' | 'skipped' | 'error';
    chunkCount?: number;
    error?: string;
  }[] = [];

  for (const file of files) {
    const meta = classifyFile(file);
    const filePath = path.join(extractedDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileSize = Buffer.byteLength(content, 'utf-8');

    console.log(`\n📄 ${meta.title}`);
    console.log(`   檔案: ${file} (${(fileSize / 1024).toFixed(1)} KB)`);
    console.log(`   類別: ${meta.type} | 卷別: ${meta.paper} | 技能: ${meta.strand}`);

    if (isDryRun) {
      results.push({
        fileName: file,
        title: meta.title,
        type: meta.type,
        status: 'skipped',
      });
      continue;
    }

    try {
      // Upsert: 以 title 為準查重
      const existing = await db.material.findFirst({
        where: { title: meta.title },
        select: { id: true, ragStatus: true },
      });

      if (existing) {
        // 更新現有紀錄
        await db.material.update({
          where: { id: existing.id },
          data: {
            content,
            description: meta.description,
            type: 'text',
            tags: JSON.stringify([meta.paper, meta.strand, meta.type, meta.gradeLevel]),
            gradeLevel: meta.gradeLevel,
            strand: meta.strand,
            fileSize,
            ocrStatus: 'done',
            ragStatus: skipRag ? existing.ragStatus : 'none',
          },
        });

        let chunkCount: number | undefined;

        if (!skipRag) {
          console.log('   🔄 重新建立 RAG 索引...');
          const result = await indexMaterial(existing.id);
          chunkCount = result.chunkCount;
          console.log(`   ✅ 索引完成 (${chunkCount} chunks)`);
        }

        results.push({
          fileName: file,
          title: meta.title,
          type: meta.type,
          status: 'updated',
          chunkCount,
        });
      } else {
        // 建立新紀錄
        const material = await db.material.create({
          data: {
            title: meta.title,
            description: meta.description,
            type: 'text',
            content,
            tags: JSON.stringify([meta.paper, meta.strand, meta.type, meta.gradeLevel]),
            gradeLevel: meta.gradeLevel,
            strand: meta.strand,
            fileSize,
            ocrStatus: 'done',
            ragStatus: skipRag ? 'none' : 'chunking',
            uploadedBy: adminUserId,
          },
        });

        let chunkCount: number | undefined;

        if (!skipRag) {
          console.log('   🔄 建立 RAG 索引...');
          const result = await indexMaterial(material.id);
          chunkCount = result.chunkCount;
          console.log(`   ✅ 索引完成 (${chunkCount} chunks)`);
        }

        results.push({
          fileName: file,
          title: meta.title,
          type: meta.type,
          status: 'created',
          chunkCount,
        });
      }
    } catch (err: any) {
      console.error(`   ❌ 錯誤: ${err.message}`);
      results.push({
        fileName: file,
        title: meta.title,
        type: meta.type,
        status: 'error',
        error: err.message,
      });
    }
  }

  // 匯總報告
  console.log('\n' + '='.repeat(60));
  console.log('📊 匯入報告');
  console.log('='.repeat(60));

  const created = results.filter(r => r.status === 'created');
  const updated = results.filter(r => r.status === 'updated');
  const skipped = results.filter(r => r.status === 'skipped');
  const errors = results.filter(r => r.status === 'error');
  const totalChunks = results.reduce((sum, r) => sum + (r.chunkCount || 0), 0);

  console.log(`   ✅ 新增: ${created.length}`);
  console.log(`   🔄 更新: ${updated.length}`);
  console.log(`   ⏭️  跳過 (dry-run): ${skipped.length}`);
  console.log(`   ❌ 錯誤: ${errors.length}`);
  if (!isDryRun && !skipRag) console.log(`   📦 總 Chunks: ${totalChunks}`);

  if (errors.length > 0) {
    console.log('\n❌ 錯誤詳情:');
    errors.forEach(e => console.log(`   - ${e.fileName}: ${e.error}`));
  }

  // 顯示各類別分佈
  console.log('\n📂 類別分佈:');
  const typeCounts: Record<string, number> = {};
  results.forEach(r => { typeCounts[r.type] = (typeCounts[r.type] || 0) + 1; });
  Object.entries(typeCounts).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });

  if (isDryRun) {
    console.log('\n💡 移除 --dry-run 參數以正式執行匯入。');
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('💥 未預期的錯誤:', err);
  process.exit(1);
});
