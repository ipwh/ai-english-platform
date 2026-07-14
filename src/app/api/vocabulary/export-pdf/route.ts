// ============================================
// API: POST /api/vocabulary/export-pdf
// 匯出生字簿 — 支援真實 PDF（pdfkit）或 HTML printable 格式
// 預設: HTML printable page（無依賴）；?format=pdf 生成真正 PDF
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyApiAuth } from '@/lib/api-auth';

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

    // Real PDF via pdfkit (when format=pdf)
    if (format === 'pdf') {
      try {
        const PDFDocument = (await import('pdfkit')).default;
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        const pdfPromise = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

        doc.fontSize(20).font('Helvetica-Bold').text('Vocabulary Book');
        doc.fontSize(10).font('Helvetica').fillColor('#6b7280')
          .text(`${vocab.length} words · ${new Date().toLocaleDateString('zh-HK')}`);
        doc.moveDown(0.5);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#0d9488').moveDown(0.5);

        for (let i = 0; i < vocab.length; i++) {
          const v = vocab[i];
          const synonyms = tryParse(v.synonyms);
          const collocations = tryParse(v.collocations);
          const stars = '★'.repeat(v.masteryLevel ?? 0) + '☆'.repeat(5 - (v.masteryLevel ?? 0));
          if (doc.y > 720) doc.addPage();
          doc.fontSize(14).font('Helvetica-Bold').fillColor('#111827')
            .text(`${i + 1}. ${v.word}`, { continued: true });
          doc.fontSize(9).font('Helvetica').fillColor('#6b7280')
            .text(`  ${v.partOfSpeech}  ${stars}`);
          doc.fontSize(11).font('Helvetica').fillColor('#374151')
            .text(v.meaningZh + (v.secondaryMeaningZh ? ' · ' + v.secondaryMeaningZh : ''));
          if (v.exampleSentence) {
            doc.fontSize(9).font('Helvetica-Oblique').fillColor('#6b7280')
              .text(`"${v.exampleSentence}"${v.exampleZh ? ` (${v.exampleZh})` : ''}`);
          }
          doc.moveDown(0.3);
        }
        doc.end();
        const pdfBuffer = await pdfPromise;
        return new NextResponse(new Uint8Array(pdfBuffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="vocabulary-${new Date().toISOString().slice(0, 10)}.pdf"`,
          },
        });
      } catch (pdfErr) {
        console.warn('[export-pdf] pdfkit failed, falling back to HTML:', pdfErr);
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

function tryParse(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
