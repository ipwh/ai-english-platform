// ============================================
// 下載中文字型供 PDF 生成使用
// 執行: npx tsx scripts/download-font.ts
// ============================================

import fs from 'fs';
import path from 'path';

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts');
const FONT_PATH = path.join(FONT_DIR, 'NotoSansTC-Regular.ttf');

// Google Fonts 提供的 Noto Sans TC Regular 直接下載連結
const FONT_URL =
  'https://github.com/google/fonts/raw/main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf';

async function downloadFont() {
  if (fs.existsSync(FONT_PATH)) {
    console.log('Font already exists:', FONT_PATH);
    return;
  }

  console.log('Downloading CJK font for PDF generation...');
  console.log('URL:', FONT_URL);

  fs.mkdirSync(FONT_DIR, { recursive: true });

  const res = await fetch(FONT_URL);
  if (!res.ok) {
    console.error(`Failed to download font: ${res.status}`);
    console.log('You can manually place any .ttf CJK font at:', FONT_PATH);
    console.log('Windows: copy C:\\Windows\\Fonts\\msjh.ttc to', FONT_PATH);
    return;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(FONT_PATH, buffer);
  const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
  console.log(`Downloaded CJK font: ${sizeMB} MB -> ${FONT_PATH}`);
  console.log('PDF export will now support Chinese characters.');
}

downloadFont().catch(console.error);
