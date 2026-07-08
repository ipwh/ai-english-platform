// ============================================
// POST /api/export/writing-analysis
// 匯出 AI 作文分析結果 (PDF / DOCX)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/jwt';
import { auth } from '@/lib/auth-next';

/** 驗證使用者已登入 */
async function authenticateUser(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get('session_token')?.value;
  if (token) {
    const payload = await verifySessionToken(token);
    if (payload) return payload.userId;
  }
  const session = await auth();
  if (session?.user?.id) return session.user.id;
  return null;
}

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

/** 建立 PDF 內容（使用 jsPDF） */
async function generatePDF(analysis: WritingAnalysis): Promise<Buffer> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // 載入中文字型支援（使用內建字型，僅支援基本 ASCII）
  // 若要完整中文支援，需 embed 中文字型檔，此處使用英文標籤
  let y = 20;
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;

  // Title
  doc.setFontSize(18);
  doc.text('AI Writing Analysis Report', margin, y);
  y += 10;

  // Topic
  if (analysis.topic) {
    doc.setFontSize(11);
    doc.text(`Topic: ${analysis.topic}`, margin, y);
    y += 7;
  }

  // Overall Score
  if (analysis.overallScore !== undefined) {
    doc.setFontSize(14);
    doc.text(`Overall Score: ${analysis.overallScore}/100`, margin, y);
    y += 10;
  }

  // Strengths
  if (analysis.strengths && analysis.strengths.length > 0) {
    doc.setFontSize(13);
    doc.text('Strengths', margin, y);
    y += 7;
    doc.setFontSize(10);
    for (const s of analysis.strengths) {
      const lines = doc.splitTextToSize(`- ${s}`, contentWidth);
      for (const line of lines) {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(line, margin, y);
        y += 5;
      }
    }
    y += 4;
  }

  // Weaknesses
  if (analysis.weaknesses && analysis.weaknesses.length > 0) {
    doc.setFontSize(13);
    doc.text('Areas for Improvement', margin, y);
    y += 7;
    doc.setFontSize(10);
    for (const w of analysis.weaknesses) {
      const lines = doc.splitTextToSize(`- ${w}`, contentWidth);
      for (const line of lines) {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(line, margin, y);
        y += 5;
      }
    }
    y += 4;
  }

  // Grammar Errors table
  if (analysis.grammarErrors && analysis.grammarErrors.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFontSize(13);
    doc.text('Grammar Corrections', margin, y);
    y += 8;
    doc.setFontSize(9);
    for (const err of analysis.grammarErrors) {
      if (y > 270) { doc.addPage(); y = 20; }
      const line = `${err.original} → ${err.correction}`;
      const lines = doc.splitTextToSize(line, contentWidth);
      for (const l of lines) {
        doc.text(l, margin, y);
        y += 4;
      }
      if (err.explanation) {
        doc.setTextColor(100, 100, 100);
        const expl = doc.splitTextToSize(`  ${err.explanation}`, contentWidth);
        for (const el of expl) { doc.text(el, margin, y); y += 4; }
        doc.setTextColor(0, 0, 0);
      }
      y += 2;
    }
    y += 4;
  }

  // Structure Feedback
  if (analysis.structureFeedback) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFontSize(13);
    doc.text('Structure Feedback', margin, y);
    y += 7;
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(analysis.structureFeedback, contentWidth);
    for (const line of lines) {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(line, margin, y);
      y += 5;
    }
    y += 4;
  }

  // Revised Version
  if (analysis.revisedVersion) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(13);
    doc.text('Revised Version', margin, y);
    y += 7;
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(analysis.revisedVersion, contentWidth - 5);
    for (const line of lines) {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(line, margin, y);
      y += 5;
    }
  }

  // Vocabulary Suggestions
  if (analysis.vocabularySuggestions && analysis.vocabularySuggestions.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFontSize(13);
    doc.text('Vocabulary Suggestions', margin, y);
    y += 7;
    doc.setFontSize(9);
    for (const v of analysis.vocabularySuggestions) {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(`${v.word} → ${v.suggestion} (${v.reason})`, margin, y);
      y += 5;
    }
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.text(`Page ${i}/${pageCount}  |  Generated by AI English Platform`, pageWidth / 2, 290, { align: 'center' });
  }

  return Buffer.from(doc.output('arraybuffer'));
}

/** 建立 DOCX 內容 */
async function generateDOCX(analysis: WritingAnalysis): Promise<Buffer> {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType } = await import('docx');

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
  try {
    const userId = await authenticateUser(request);
    if (!userId) {
      return NextResponse.json({ error: '請先登入' }, { status: 401 });
    }

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
    console.error('[export/writing-analysis] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
