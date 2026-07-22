// ============================================
// POST /api/export/writing-analysis
// 匯出 AI 作文分析結果 (PDF / DOCX)
// PDF 使用 pdfkit + 內嵌中文字型，支援繁體中文
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/shared/auth/api-auth';
import { logger } from '@/shared/logger/logger';

/** WritingAnalysis 資料結構 */
interface WritingAnalysis {
  overallScore?: number;
  strengths?: string[];
  weaknesses?: string[];
  grammarErrors?: { original: string; correction: string; explanation: string }[];
  chinglishWarnings?: string[];
  vocabularySuggestions?: { word: string; suggestion: string; reason: string }[];
  structureFeedback?: string;
  revisedVersion?: string;
  topic?: string;
  studentDraft?: string;
}

/** 嘗試載入中文字型（支援 Windows 開發 + Vercel 部署） */
 
function loadCJKFont(): Buffer {
  const path = require('node:path') as typeof import('node:path');
  const fs = require('node:fs') as typeof import('node:fs');
  const bundled = path.join(process.cwd(), 'public', 'fonts', 'NotoSansTC-Regular.ttf');
  if (fs.existsSync(bundled)) return fs.readFileSync(bundled);

  const candidates = [
    'C:\\Windows\\Fonts\\msjh.ttc',
    'C:\\Windows\\Fonts\\kaiu.ttf',
    '/System/Library/Fonts/PingFang.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  ];
  for (const fontPath of candidates) {
    try {
      if (fs.existsSync(fontPath)) return fs.readFileSync(fontPath);
    } catch { /* continue */ }
  }
  throw new Error('PDF 匯出需要字型檔。請執行 npx tsx scripts/download-font.ts 下載字型。');
}

/** 建立 PDF 內容（使用 pdfkit，支援繁體中文） */
async function generatePDF(analysis: WritingAnalysis): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;

  const fontData = loadCJKFont();
  if (!fontData) throw new Error('PDF 匯出需要字型檔。請執行 npx tsx scripts/download-font.ts 下載字型。');
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    font: '', // 跳過 PDFKit 內建 Helvetica 載入（Vercel serverless 上 __dirname 路徑不正確）
    info: { Title: `Writing Analysis - ${analysis.topic || 'Report'}`, Author: 'AI English Platform' },
  });

  // 一律使用內嵌字型，不依賴 PDFKit 內建 Helvetica（Vercel 上不存在）
  doc.registerFont('CJK', fontData);
  const font = 'CJK';
  const hasCJK = true;
  const contentWidth = doc.page.width - 100;
  let y = 50;

  // Helper: 安全輸出文字（處理中文換行）
  const addText = (text: string, fontSize: number, opts?: { color?: string; indent?: number }) => {
    doc.font(font).fontSize(fontSize);
    if (opts?.color) doc.fillColor(opts.color);
    else doc.fillColor('#1a1a1a');
    const x = 50 + (opts?.indent || 0);
    doc.text(text, x, y, { width: contentWidth - (opts?.indent || 0), lineGap: 3 });
    y = doc.y + 4;
  };

  const checkPageBreak = (needed: number) => {
    if (y + needed > doc.page.height - 50) {
      doc.addPage();
      y = 50;
    }
  };

  // Title
  doc.font(font).fontSize(20).fillColor('#1a5276');
  doc.text(hasCJK ? 'AI 寫作分析報告' : 'AI Writing Analysis Report', 50, y, { width: contentWidth });
  y = doc.y + 12;

  // Topic
  if (analysis.topic) {
    checkPageBreak(20);
    doc.font(font).fontSize(12).fillColor('#555555');
    const label = hasCJK ? `題目：${analysis.topic}` : `Topic: ${analysis.topic}`;
    doc.text(label, 50, y, { width: contentWidth });
    y = doc.y + 8;
  }

  // Overall Score
  if (analysis.overallScore !== undefined) {
    checkPageBreak(30);
    doc.font(font).fontSize(16).fillColor('#1a5276');
    const scoreLabel = hasCJK ? `總分：${analysis.overallScore}/100` : `Overall Score: ${analysis.overallScore}/100`;
    doc.text(scoreLabel, 50, y, { width: contentWidth });
    y = doc.y + 12;
  }

  // Strengths
  if (analysis.strengths?.length) {
    checkPageBreak(20);
    doc.font(font).fontSize(14).fillColor('#27ae60');
    doc.text(hasCJK ? '優點' : 'Strengths', 50, y);
    y = doc.y + 8;
    for (const s of analysis.strengths) {
      checkPageBreak(16);
      doc.font(font).fontSize(10).fillColor('#333333');
      const bullet = hasCJK ? `• ${s}` : `- ${s}`;
      doc.text(bullet, 60, y, { width: contentWidth - 10 });
      y = doc.y + 4;
    }
    y += 6;
  }

  // Weaknesses
  if (analysis.weaknesses?.length) {
    checkPageBreak(20);
    doc.font(font).fontSize(14).fillColor('#c0392b');
    doc.text(hasCJK ? '待改善' : 'Areas for Improvement', 50, y);
    y = doc.y + 8;
    for (const w of analysis.weaknesses) {
      checkPageBreak(16);
      doc.font(font).fontSize(10).fillColor('#333333');
      const bullet = hasCJK ? `• ${w}` : `- ${w}`;
      doc.text(bullet, 60, y, { width: contentWidth - 10 });
      y = doc.y + 4;
    }
    y += 6;
  }

  // Grammar Errors
  if (analysis.grammarErrors?.length) {
    checkPageBreak(30);
    doc.font(font).fontSize(14).fillColor('#e67e22');
    doc.text(hasCJK ? '文法修正' : 'Grammar Corrections', 50, y);
    y = doc.y + 8;
    for (const err of analysis.grammarErrors) {
      checkPageBreak(20);
      doc.font(font).fontSize(9).fillColor('#c0392b');
      doc.text(err.original, 55, y, { width: contentWidth - 5, strike: true });
      const origY = doc.y;
      doc.font(font).fontSize(9).fillColor('#27ae60');
      doc.text(` → ${err.correction}`, 55 + doc.widthOfString(err.original), y - 11, { width: contentWidth - 10 });
      y = Math.max(origY, doc.y) + 2;
      if (err.explanation) {
        doc.font(font).fontSize(8).fillColor('#888888');
        doc.text(err.explanation, 60, y, { width: contentWidth - 15 });
        y = doc.y + 3;
      }
    }
    y += 6;
  }

  // Structure Feedback
  if (analysis.structureFeedback) {
    checkPageBreak(20);
    doc.font(font).fontSize(14).fillColor('#8e44ad');
    doc.text(hasCJK ? '結構評語' : 'Structure Feedback', 50, y);
    y = doc.y + 8;
    doc.font(font).fontSize(10).fillColor('#333333');
    doc.text(analysis.structureFeedback, 50, y, { width: contentWidth });
    y = doc.y + 8;
  }

  // Revised Version
  if (analysis.revisedVersion) {
    checkPageBreak(20);
    doc.font(font).fontSize(14).fillColor('#2980b9');
    doc.text(hasCJK ? '修改版' : 'Revised Version', 50, y);
    y = doc.y + 8;
    doc.font(font).fontSize(10).fillColor('#333333');
    doc.text(analysis.revisedVersion, 50, y, { width: contentWidth });
    y = doc.y + 8;
  }

  // Vocabulary Suggestions
  if (analysis.vocabularySuggestions?.length) {
    checkPageBreak(20);
    doc.font(font).fontSize(14).fillColor('#16a085');
    doc.text(hasCJK ? '詞彙建議' : 'Vocabulary Suggestions', 50, y);
    y = doc.y + 8;
    for (const v of analysis.vocabularySuggestions) {
      checkPageBreak(16);
      doc.font(font).fontSize(9).fillColor('#333333');
      const vText = hasCJK
        ? `• ${v.word} → ${v.suggestion} (${v.reason})`
        : `- ${v.word} -> ${v.suggestion} (${v.reason})`;
      doc.text(vText, 60, y, { width: contentWidth - 10 });
      y = doc.y + 3;
    }
  }

  // Footer — 先 flush pages 確保所有頁面已寫入緩衝，再添加頁尾
  // switchToPage 必須在 flushPages() 之後呼叫，否則可能拋出 "out of bounds" 錯誤
  try {
    doc.flushPages();
    const pageCount = doc.bufferedPageRange().count;
    if (pageCount > 0) {
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.font(font).fontSize(8).fillColor('#aaaaaa');
        const footerText = hasCJK
          ? `第 ${i + 1}/${pageCount} 頁 | AI English Platform 生成`
          : `Page ${i + 1}/${pageCount} | Generated by AI English Platform`;
        doc.text(footerText, 50, doc.page.height - 40, { width: contentWidth, align: 'center' });
      }
    }
  } catch (e) {
    // switchToPage 在 pdfkit 某些版本中可能失敗，略過頁尾（非關鍵功能）
    console.warn('[export/writing-analysis] Footer skipped:', e instanceof Error ? e.message : String(e));
  }

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
}

/** 建立 DOCX 內容 */
async function generateDOCX(analysis: WritingAnalysis): Promise<Buffer> {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType } = await import('docx');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = [];

  // Title
  children.push(new Paragraph({
    text: 'AI Writing Analysis Report',
    heading: HeadingLevel.TITLE,
    spacing: { after: 200 },
  }));

  // Topic & Score
  if (analysis.topic) {
    children.push(new Paragraph({
      children: [new TextRun({ text: 'Topic: ', bold: true }), new TextRun(analysis.topic)],
      spacing: { after: 100 },
    }));
  }

  if (analysis.overallScore !== undefined) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `Overall Score: ${analysis.overallScore}/100`, bold: true, size: 28 })],
      spacing: { after: 200 },
    }));
  }

  // Strengths
  if (analysis.strengths?.length) {
    children.push(new Paragraph({ text: 'Strengths', heading: HeadingLevel.HEADING_2 }));
    for (const s of analysis.strengths) {
      children.push(new Paragraph({ text: s, bullet: { level: 0 }, spacing: { after: 60 } }));
    }
  }

  // Weaknesses
  if (analysis.weaknesses?.length) {
    children.push(new Paragraph({ text: 'Areas for Improvement', heading: HeadingLevel.HEADING_2 }));
    for (const w of analysis.weaknesses) {
      children.push(new Paragraph({ text: w, bullet: { level: 0 }, spacing: { after: 60 } }));
    }
  }

  // Grammar Errors
  if (analysis.grammarErrors?.length) {
    children.push(new Paragraph({ text: 'Grammar Corrections', heading: HeadingLevel.HEADING_2 }));
    const tableRows = analysis.grammarErrors.map(err => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: err.original, strike: true, color: '999999' })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: err.correction, bold: true, color: '2E7D32' })] })] }),
        new TableCell({ children: [new Paragraph(err.explanation || '')] }),
      ],
    }));
    children.push(new Table({
      rows: [
        new TableRow({
          children: ['Original', 'Correction', 'Explanation'].map(h =>
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })
          ),
        }),
        ...tableRows,
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }));
  }

  // Structure Feedback
  if (analysis.structureFeedback) {
    children.push(new Paragraph({ text: 'Structure Feedback', heading: HeadingLevel.HEADING_2 }));
    children.push(new Paragraph({ text: analysis.structureFeedback, spacing: { after: 120 } }));
  }

  // Revised Version
  if (analysis.revisedVersion) {
    children.push(new Paragraph({ text: 'Revised Version', heading: HeadingLevel.HEADING_2 }));
    children.push(new Paragraph({ text: analysis.revisedVersion, spacing: { after: 120 } }));
  }

  // Vocab Suggestions
  if (analysis.vocabularySuggestions?.length) {
    children.push(new Paragraph({ text: 'Vocabulary Suggestions', heading: HeadingLevel.HEADING_2 }));
    for (const v of analysis.vocabularySuggestions) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: v.word, strike: true, color: '999999' }),
          new TextRun({ text: ` → ${v.suggestion} `, bold: true, color: '1565C0' }),
          new TextRun({ text: `(${v.reason})`, italics: true, color: '666666' }),
        ],
        spacing: { after: 60 },
      }));
    }
  }

  // Footer
  children.push(new Paragraph({
    text: 'Generated by AI English Platform',
    alignment: AlignmentType.CENTER,
    spacing: { before: 400 },
    style: 'Footer',
  }));

  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

// ---- API Handler ----

export async function POST(request: NextRequest) {
  const authResult = await verifyApiAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }
  const userId = authResult.userId!;
  try {

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'pdf';
    const body = await request.json();
    const analysis: WritingAnalysis = body.analysis || body;

    if (!analysis || (!analysis.studentDraft && !analysis.overallScore)) {
      return NextResponse.json({ error: '請提供 AI 分析結果' }, { status: 400 });
    }

    let buffer: Buffer;
    let contentType: string;
    let filename: string;

    if (format === 'docx') {
      buffer = await generateDOCX(analysis);
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      filename = `writing-analysis-${Date.now()}.docx`;
    } else {
      buffer = await generatePDF(analysis);
      contentType = 'application/pdf';
      filename = `writing-analysis-${Date.now()}.pdf`;
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '匯出失敗';
    logger.error({ module: 'export-writing-analysis', error: msg }, 'Export writing analysis failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
