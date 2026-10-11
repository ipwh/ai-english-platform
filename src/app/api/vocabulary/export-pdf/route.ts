// ============================================
// API: POST /api/vocabulary/export-pdf
// 匯出生字簿 — pdfkit 真實 PDF 生成（含 CJK 字型支援）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';
import { getVocabForExport } from '@/modules/vocabulary/services/vocabulary-service';

function tryParse(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  try { const p = JSON.parse(val as string); return Array.isArray(p) ? p.map(String) : []; } catch { return []; }
}

 
function getCJKFont(): Buffer | null {
  const paths = [
    path.join(process.cwd(), 'public', 'fonts', 'NotoSansTC-Regular.ttf'),
    path.join(process.cwd(), 'fonts', 'NotoSansTC-Regular.ttf'),
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return fs.readFileSync(p);
  }
  return null;
}

type ExportVocabRow = {
  word: string;
  partOfSpeech: string;
  meaningZh: string;
  secondaryMeaningZh?: string | null;
  exampleSentence?: string | null;
  exampleZh?: string | null;
  synonyms?: unknown;
  antonyms?: unknown;
  collocations?: unknown;
  masteryLevel?: number | null;
};

/**
 * 產生生字簿 PDF。
 *
 * 2026-09-26 生產事故修正：Turbopack 會把 pdfkit 打包進 server chunk 並將
 * `__dirname` 換成建構期佔位符（`/ROOT/...`），令 PDFKit 標準字型（Helvetica 等）的
 * AFM 檔在執行期讀不到 → `new PDFDocument()` 直接 ENOENT 拋錯 → 舊碼回退成 HTML
 * （HTTP 200），客戶端存成 .pdf 後被判「corrupted」。因此：
 *   1. 建構子傳 `font: ''` 跳過預設 Helvetica 載入（同 writing-analysis 匯出）；
 *   2. 所有文字一律用內嵌 CJK 字型（Noto Sans TC，含 Latin 與 ★☆ 字符）；
 *   3. 沒有字型檔時直接拋錯（由呼叫端轉成結構化錯誤，永不靜默回傳 HTML）；
 *   4. 版式採「逐塊量測（heightOfString）後才排版」的單欄區塊式佈局 —— 舊版的
 *      六欄表格以固定列高 + 固定位移（例：例句譯文硬寫在 `rowY2 + 8`）繪製，
 *      英文例句一換行就會與下方中譯／下一列重疊（使用者回報「文字重疊、難以閱讀」）。
 */
async function generateVocabPdf(vocab: ExportVocabRow[]): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;
  const cjkFont = getCJKFont();
  if (!cjkFont) {
    throw new Error('PDF export requires the bundled CJK font (public/fonts/NotoSansTC-Regular.ttf)');
  }

  const MARGIN = 40;
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, layout: 'portrait', font: '' });
  const chunks: Buffer[] = [];
  const pdfPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.registerFont('CJK', cjkFont);
  const FONT = 'CJK';
  const CONTENT_W = doc.page.width - MARGIN * 2;
  const FOOTER_ZONE = 30;
  const contentBottom = () => doc.page.height - MARGIN - FOOTER_ZONE;

  const startPage = (continuation: boolean) => {
    doc.addPage();
    doc.y = MARGIN;
    if (continuation) {
      doc.font(FONT).fontSize(9).fillColor('#9ca3af')
        .text('Vocabulary Book 生字簿（續）', MARGIN, MARGIN, { width: CONTENT_W });
      doc.moveTo(MARGIN, doc.y + 4).lineTo(MARGIN + CONTENT_W, doc.y + 4).stroke('#e5e7eb');
      doc.y += 14;
    }
  };

  // === HEADER（首頁）===
  doc.font(FONT).fontSize(22).fillColor('#0d9488')
    .text('Vocabulary Book  生字簿', MARGIN, MARGIN, { width: CONTENT_W });
  doc.font(FONT).fontSize(9).fillColor('#6b7280')
    .text(`${vocab.length} words · ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, MARGIN, doc.y + 2, { width: CONTENT_W });
  doc.moveTo(MARGIN, doc.y + 6).lineTo(MARGIN + CONTENT_W, doc.y + 6).stroke('#0d9488');
  doc.y += 16;

  // === WORDS（每字一區塊；先量測、後排版 —— 固定列高／固定位移在例句換行時會與
  // 下一段文字重疊，這正是使用者回報的「文字重疊、難以閱讀」）===
  for (let i = 0; i < vocab.length; i++) {
    const v = vocab[i];
    const synonyms = tryParse(v.synonyms);
    const antonyms = tryParse(v.antonyms);
    const collocations = tryParse(v.collocations);
    const mastery = Math.max(0, Math.min(5, v.masteryLevel ?? 0));
    const stars = '★'.repeat(mastery) + '☆'.repeat(5 - mastery);

    const meaningText = v.meaningZh + (v.secondaryMeaningZh ? `；${v.secondaryMeaningZh}` : '');
    const exampleText = v.exampleSentence ? `"${v.exampleSentence}"` : '';
    const exampleZhText = v.exampleZh || '';
    const extraParts: string[] = [];
    if (synonyms.length > 0) extraParts.push('同義：' + synonyms.join(' · '));
    if (antonyms.length > 0) extraParts.push('反義：' + antonyms.join(' · '));
    if (collocations.length > 0) extraParts.push('搭配：' + collocations.join(' · '));
    const extraText = extraParts.join('　');

    // --- 量測：與繪製使用相同字型大小／寬度 ---
    const WORD_COL_W = CONTENT_W - 150; // 右側留給 POS 與 ★
    doc.font(FONT).fontSize(12);
    const wordH = Math.max(doc.heightOfString(`${i + 1}. ${v.word}`, { width: WORD_COL_W }), 15);
    doc.fontSize(9.5);
    const meaningH = doc.heightOfString(meaningText, { width: CONTENT_W });
    doc.fontSize(8.5);
    const exampleH = exampleText ? doc.heightOfString(exampleText, { width: CONTENT_W }) : 0;
    doc.fontSize(8);
    const exampleZhH = exampleZhText ? doc.heightOfString(exampleZhText, { width: CONTENT_W }) : 0;
    doc.fontSize(7.5);
    const extraH = extraText ? doc.heightOfString(extraText, { width: CONTENT_W }) : 0;

    const GAP = 3;
    const blockH = wordH + (meaningH + GAP) + (exampleH ? exampleH + GAP : 0) + (exampleZhH ? exampleZhH + GAP : 0) + (extraH ? extraH + GAP : 0) + 18;

    if (doc.y + blockH > contentBottom()) startPage(true);

    // --- 繪製（每一段都以實際回報的 doc.y 接著排版，不與任何固定位移混用） ---
    const top = doc.y;
    doc.font(FONT).fontSize(12).fillColor('#111827').text(`${i + 1}. ${v.word}`, MARGIN, top, { width: WORD_COL_W });
    doc.fontSize(8).fillColor('#6b7280').text(v.partOfSpeech, MARGIN + WORD_COL_W, top + 3, { width: 90 });
    doc.fontSize(9).fillColor('#f59e0b').text(stars, MARGIN + WORD_COL_W + 90, top + 2, { width: CONTENT_W - WORD_COL_W - 90, align: 'right' });
    doc.y = top + wordH;

    doc.font(FONT).fontSize(9.5).fillColor('#374151').text(meaningText, MARGIN, doc.y + GAP, { width: CONTENT_W });
    if (exampleText) {
      doc.font(FONT).fontSize(8.5).fillColor('#4b5563').text(exampleText, MARGIN, doc.y + GAP, { width: CONTENT_W });
    }
    if (exampleZhText) {
      doc.font(FONT).fontSize(8).fillColor('#6b7280').text(exampleZhText, MARGIN, doc.y + GAP, { width: CONTENT_W });
    }
    if (extraText) {
      doc.font(FONT).fontSize(7.5).fillColor('#6b7280').text(extraText, MARGIN, doc.y + GAP, { width: CONTENT_W });
    }

    doc.moveTo(MARGIN, doc.y + 7).lineTo(MARGIN + CONTENT_W, doc.y + 7).stroke('#f3f4f6');
    doc.y += 14;
  }

  // === FOOTER ===
  if (doc.y + 24 > contentBottom()) startPage(false);
  doc.y += 6;
  doc.font(FONT).fontSize(7).fillColor('#9ca3af');
  doc.text(`Generated by AI English Platform · ${new Date().toISOString().slice(0, 10)}`, MARGIN, doc.y, { width: CONTENT_W, align: 'center' });

  doc.end();
  return pdfPromise;
}

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { studentId, wordIds, format } = body as { studentId: string; wordIds?: string[]; format?: 'pdf' | 'html' };

    if (!studentId) {
      return NextResponse.json({ error: 'studentId required' }, { status: 400 });
    }

    // 🔒 Ownership (R3.10-L): students may only export their OWN vocabulary
    // book. Previously any authenticated student could export any studentId's
    // entire word list (BOLA).
    if (authResult.role !== 'teacher' && authResult.role !== 'admin' && studentId !== authResult.userId) {
      return NextResponse.json({ error: '只能匯出自己的生字簿 / You can only export your own vocabulary book' }, { status: 403 });
    }

    const vocab = await getVocabForExport(studentId, wordIds);

    if (vocab.length === 0) {
      return NextResponse.json({ error: 'No vocabulary items to export' }, { status: 404 });
    }

    // Real PDF via pdfkit with embedded CJK font
    if (format === 'pdf') {
      try {
        const pdfBuffer = await generateVocabPdf(vocab);

        logger.info({ module: 'vocabulary-export', sizeKB: (pdfBuffer.length / 1024).toFixed(0), wordCount: vocab.length }, 'PDF generated');
        return new NextResponse(new Uint8Array(pdfBuffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="vocabulary-${new Date().toISOString().slice(0, 10)}.pdf"`,
          },
        });
      } catch (pdfErr) {
        // 2026-09-26: format==='pdf' 永不回退成 HTML —— 舊碼把 HTML 以 200 回傳，
        // 客戶端存成 .pdf 後被 PDF 開啟器判為「corrupted」（生產事故）。
        // PDF 生成失敗必須是可辨識的錯誤，讓客戶端能顯示重試提示。
        logger.error({ module: 'export-pdf', error: pdfErr instanceof Error ? pdfErr.message : String(pdfErr) }, 'PDF generation failed');
        return NextResponse.json(
          { error: 'PDF_GENERATION_FAILED', message: 'PDF 匯出失敗，請重試 / PDF export failed, please retry' },
          { status: 500 }
        );
      }
    }

    // 其他 format（如 html）：HTML printable page（可用瀏覽器列印成 PDF）
    const rows = vocab.map((v, i) => {
      const synonyms = tryParse(v.synonyms);
      const antonyms = tryParse(v.antonyms);
      const collocations = tryParse(v.collocations);
      const pronunciationUrl = `https://www.google.com/search?q=${encodeURIComponent(v.word + '+pronunciation')}`;

      return `
      <div class="card" style="page-break-inside: avoid; margin-bottom: 16px;">
        <div class="word-row">
          <span class="index">${i + 1}.</span>
          <span class="word">${escapeHtml(v.word)}</span>
          <span class="pos">${escapeHtml(v.partOfSpeech)}</span>
          <span class="mastery">${'★'.repeat(v.masteryLevel ?? 0)}${'☆'.repeat(5 - (v.masteryLevel ?? 0))}</span>
        </div>
        <div class="meaning">${escapeHtml(v.meaningZh)}${v.secondaryMeaningZh ? ' · ' + escapeHtml(v.secondaryMeaningZh) : ''}</div>
        ${v.exampleSentence ? `<div class="example">"${escapeHtml(v.exampleSentence)}"${v.exampleZh ? ' (' + escapeHtml(v.exampleZh) + ')' : ''}</div>` : ''}
        ${synonyms.length > 0 ? `<div class="extra"><b>同義:</b> ${escapeHtml(synonyms.join(' · '))}</div>` : ''}
        ${antonyms.length > 0 ? `<div class="extra"><b>反義:</b> ${escapeHtml(antonyms.join(' · '))}</div>` : ''}
        ${collocations.length > 0 ? `<div class="extra"><b>搭配:</b> ${escapeHtml(collocations.join(' · '))}</div>` : ''}
        <div class="qr-hint">🔊 發音: ${escapeHtml(pronunciationUrl)}</div>
      </div>`;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html lang="zh-HK">
<head>
<meta charset="utf-8">
<title>生字簿 Vocabulary Book</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', 'Microsoft JhengHei', sans-serif; padding: 32px; color: #1a1a2e; }
  h1 { font-size: 22px; margin-bottom: 4px; color: #0d9488; }
  .subtitle { font-size: 12px; color: #6b7280; margin-bottom: 20px; }
  .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 16px; background: #fafafa; }
  .word-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .index { font-size: 12px; color: #9ca3af; min-width: 24px; }
  .word { font-size: 18px; font-weight: 700; color: #111827; }
  .pos { font-size: 11px; color: #6b7280; background: #e5e7eb; padding: 1px 6px; border-radius: 4px; }
  .mastery { font-size: 12px; color: #f59e0b; margin-left: auto; }
  .meaning { font-size: 14px; color: #374151; margin-bottom: 2px; }
  .example { font-size: 12px; color: #6b7280; font-style: italic; margin-bottom: 2px; }
  .extra { font-size: 11px; color: #4b5563; }
  .qr-hint { font-size: 9px; color: #9ca3af; margin-top: 4px; }
  @media print {
    body { padding: 16px; }
    .card { background: white; }
  }
</style>
</head>
<body>
<h1>📚 生字簿 Vocabulary Book</h1>
<p class="subtitle">${vocab.length} 個單字 · ${new Date().toLocaleDateString('zh-HK')}</p>
${rows}
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="vocabulary-${new Date().toISOString().slice(0, 10)}.html"`,
      },
    });
  } catch (err) {
    logger.error({ module: 'export-pdf', error: err instanceof Error ? err.message : String(err) }, 'Export PDF failed');
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
