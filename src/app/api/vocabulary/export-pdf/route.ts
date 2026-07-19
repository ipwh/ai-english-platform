// ============================================
// API: POST /api/vocabulary/export-pdf
// 匯出生字簿 — pdfkit 真實 PDF 生成（含 CJK 字型支援）
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db/db';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';

function tryParse(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  try { const p = JSON.parse(val as string); return Array.isArray(p) ? p.map(String) : []; } catch { return []; }
}

 
function getCJKFont(): Buffer | null {
  const path = require('node:path') as typeof import('node:path');
  const fs = require('node:fs') as typeof import('node:fs');
  const paths = [
    path.join(process.cwd(), 'public', 'fonts', 'NotoSansTC-Regular.ttf'),
    path.join(process.cwd(), 'fonts', 'NotoSansTC-Regular.ttf'),
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return fs.readFileSync(p);
  }
  return null;
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

    let vocab;
    if (wordIds && wordIds.length > 0) {
      vocab = await db.vocabItem.findMany({
        where: { id: { in: wordIds }, studentId },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      vocab = await db.vocabItem.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    }

    if (vocab.length === 0) {
      return NextResponse.json({ error: 'No vocabulary items to export' }, { status: 404 });
    }

    // Real PDF via pdfkit with CJK font support
    if (format === 'pdf') {
      try {
        const PDFDocument = (await import('pdfkit')).default;
        const doc = new PDFDocument({ size: 'A4', margin: 36, layout: 'portrait' });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        const pdfPromise = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

        // Register CJK font for Chinese text (dynamic import avoids NFT tracing)
        const cjkFont = getCJKFont();
        if (cjkFont) {
          doc.registerFont('CJK', cjkFont);
        }

        const PAGE_W = 595 - 72; // A4 width minus margins

        // === HEADER ===
        doc.fontSize(22).font('Helvetica-Bold').fillColor('#0d9488')
          .text('Vocabulary Book  生字簿', { align: 'left' });
        doc.fontSize(9).font('Helvetica').fillColor('#6b7280')
          .text(`${vocab.length} words · ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
        doc.moveDown(0.5);
        doc.moveTo(36, doc.y).lineTo(PAGE_W + 36, doc.y).stroke('#0d9488').moveDown(0.3);

        // === TABLE HEADER ===
        const colX = [36, 130, 180, 260, 380, 500]; // #, Word, POS, Meaning, Example, Mastery
        const headerY = doc.y;
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#6b7280');
        doc.text('#', colX[0], headerY, { width: 80 });
        doc.text('Word', colX[1], headerY, { width: 45 });
        doc.text('POS', colX[2], headerY, { width: 45 });
        doc.text('Meaning 意思', colX[3], headerY, { width: 110 });
        doc.text('Example / Synonyms', colX[4], headerY, { width: 110 });
        doc.text('★', colX[5], headerY, { width: 50, align: 'right' });
        doc.moveTo(36, doc.y + 4).lineTo(PAGE_W + 36, doc.y + 4).stroke('#e5e7eb');
        doc.moveDown(0.5);

        // === ROWS ===
        for (let i = 0; i < vocab.length; i++) {
          const v = vocab[i];
          const synonyms = tryParse(v.synonyms);
          const antonyms = tryParse(v.antonyms);
          const collocations = tryParse(v.collocations);
          const stars = '★'.repeat(v.masteryLevel ?? 0) + '☆'.repeat(5 - (v.masteryLevel ?? 0));
          const rowY = doc.y;

          // Check page break
          if (rowY > 700) {
            doc.addPage();
            // Reprint header
            doc.fontSize(8).font('Helvetica-Bold').fillColor('#6b7280');
            doc.text('#', colX[0], 36, { width: 80 });
            doc.text('Word', colX[1], 36, { width: 45 });
            doc.text('POS', colX[2], 36, { width: 45 });
            doc.text('Meaning', colX[3], 36, { width: 110 });
            doc.text('Example/Synonyms', colX[4], 36, { width: 110 });
            doc.text('★', colX[5], 36, { width: 50, align: 'right' });
            doc.moveTo(36, doc.y + 4).lineTo(PAGE_W + 36, doc.y + 4).stroke('#e5e7eb');
            doc.moveDown(0.3);
          }

          const rowY2 = doc.y;
          // Row background (alternating)
          if (i % 2 === 0) {
            doc.rect(36, rowY2 - 2, PAGE_W, 22).fill('#f9fafb');
          }

          // # (index)
          doc.fontSize(8).font('Helvetica').fillColor('#9ca3af');
          doc.text(String(i + 1), colX[0], rowY2, { width: 80 });

          // Word
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827');
          doc.text(v.word, colX[1], rowY2 - 1, { width: 55 });

          // POS
          doc.fontSize(7).font('Helvetica').fillColor('#6b7280');
          doc.text(v.partOfSpeech, colX[2], rowY2 + 1, { width: 50 });

          // Meaning (CJK)
          const meaningText = v.meaningZh + (v.secondaryMeaningZh ? '; ' + v.secondaryMeaningZh : '');
          if (cjkFont) {
            doc.fontSize(9).font('CJK').fillColor('#374151');
          } else {
            doc.fontSize(9).font('Helvetica').fillColor('#374151');
          }
          doc.text(meaningText, colX[3], rowY2 - 1, { width: 115 });

          // Example / Synonyms / Antonyms (CJK)
          const extraParts: string[] = [];
          if (v.exampleSentence) extraParts.push(`"${v.exampleSentence.slice(0, 60)}${v.exampleSentence.length > 60 ? '...' : ''}"`);
          if (synonyms.length > 0) extraParts.push('Syn: ' + synonyms.slice(0, 2).join(', '));
          if (antonyms.length > 0) extraParts.push('Ant: ' + antonyms.slice(0, 2).join(', '));
          if (collocations.length > 0) extraParts.push('Col: ' + collocations.slice(0, 2).join(', '));
          if (extraParts.length > 0) {
            doc.fontSize(7).font('Helvetica-Oblique').fillColor('#6b7280');
            doc.text(extraParts.join('  |  '), colX[4], rowY2, { width: 115 });
          }
          // CJK example translation
          if (v.exampleZh && cjkFont) {
            doc.fontSize(7).font('CJK').fillColor('#9ca3af');
            doc.text(v.exampleZh.slice(0, 50), colX[4], rowY2 + 8, { width: 115 });
          }

          // Mastery stars
          doc.fontSize(7).font('Helvetica').fillColor('#f59e0b');
          doc.text(stars, colX[5], rowY2, { width: 50, align: 'right' });

          // Separator line
          doc.moveTo(36, doc.y + 6).lineTo(PAGE_W + 36, doc.y + 6).stroke('#f3f4f6');
          doc.moveDown(0.3);
        }

        // === FOOTER ===
        doc.moveDown(1);
        doc.fontSize(7).font('Helvetica').fillColor('#d1d5db');
        doc.text(`Generated by AI English Platform · ${new Date().toISOString().slice(0, 10)}`, { align: 'center' });

        doc.end();
        const pdfBuffer = await pdfPromise;

        logger.info({ module: 'vocabulary-export', sizeKB: (pdfBuffer.length / 1024).toFixed(0), wordCount: vocab.length }, 'PDF generated');
        return new NextResponse(new Uint8Array(pdfBuffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="vocabulary-${new Date().toISOString().slice(0, 10)}.pdf"`,
          },
        });
      } catch (pdfErr) {
        console.error('[export-pdf] pdfkit generation failed, falling back to HTML:', pdfErr);
      }
    }

    // Default: HTML printable page (works as PDF via browser print)
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
    console.error('[export-pdf]', err);
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
