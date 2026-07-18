// ============================================
// Writing Plagiarism / Over-Copy Detection
// 檢測 Integrated Skills 寫作是否過度抄襲聆聽文稿
// 用於 DSE Paper 3 Part B 寫作品質評估
// ============================================

/**
 * 檢測結果
 */
export interface OverCopyResult {
  /** 是否過度抄襲（抄襲比例 > 閾值） */
  isOverCopy: boolean;
  /** 抄襲比例 (0-1) */
  copyRatio: number;
  /** 被檢測到的抄襲片段 */
  copiedPhrases: { original: string; suggestion: string }[];
  /** 總體建議 */
  overallSuggestion: string;
}

/**
 * 從文本中提取 n-gram
 */
function extractNgrams(text: string, n: number): Set<string> {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1);
  const ngrams = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.add(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

/**
 * 檢測學生寫作是否過度抄襲原始聆聽文稿。
 *
 * 使用 sliding window + n-gram overlap 方法：
 * 1. 將原始文稿和學生寫作分別拆成 n-grams (3-5 詞)
 * 2. 計算重合度
 * 3. 標記連續抄襲片段
 *
 * @param sourceText - 原始聆聽文稿（Integrated Skills listening content）
 * @param studentWriting - 學生寫作內容
 * @param threshold - 抄襲閾值，超過此比例視為過度抄襲（預設 0.5 = 50%）
 * @returns OverCopyResult
 */
export function detectOverCopying(
  sourceText: string,
  studentWriting: string,
  threshold: number = 0.5,
): OverCopyResult {
  if (!sourceText || !studentWriting) {
    return {
      isOverCopy: false,
      copyRatio: 0,
      copiedPhrases: [],
      overallSuggestion: '',
    };
  }

  // 清理文本
  const cleanSource = sourceText.toLowerCase().replace(/[^a-z0-9\s.,!?'"-]/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanWriting = studentWriting.toLowerCase().replace(/[^a-z0-9\s.,!?'"-]/g, ' ').replace(/\s+/g, ' ').trim();

  if (!cleanWriting) {
    return { isOverCopy: false, copyRatio: 0, copiedPhrases: [], overallSuggestion: '' };
  }

  // 使用 4-gram 和 5-gram 進行檢測
  const source4grams = extractNgrams(cleanSource, 4);
  const source5grams = extractNgrams(cleanSource, 5);

  // 將學生寫作按句子分割
  const sentences = cleanWriting.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const writingWords = cleanWriting.split(/\s+/).filter(w => w.length > 1);

  if (writingWords.length === 0) {
    return { isOverCopy: false, copyRatio: 0, copiedPhrases: [], overallSuggestion: '' };
  }

  // 檢測抄襲片段
  const copiedPhrases: { original: string; suggestion: string }[] = [];
  let copiedWordCount = 0;

  // Sliding window: 對每個句子中的 5-word window 檢查是否在原始文稿中出現
  const checkedWindows = new Set<string>();

  for (let i = 0; i <= writingWords.length - 5; i++) {
    const window5 = writingWords.slice(i, i + 5).join(' ');

    if (checkedWindows.has(window5)) continue;
    checkedWindows.add(window5);

    if (source5grams.has(window5)) {
      // 擴展窗口找到最長匹配
      let end = i + 5;
      while (end < writingWords.length) {
        const extended = writingWords.slice(i, end + 1).join(' ');
        const extended5grams = extractNgrams(extended, 5);
        const hasMatch = [...extended5grams].some(g => source5grams.has(g) || source4grams.has(g));
        if (hasMatch) {
          end++;
        } else {
          break;
        }
      }

      const matchedPhrase = writingWords.slice(i, end).join(' ');
      if (matchedPhrase.split(' ').length >= 6) {
        copiedPhrases.push({
          original: matchedPhrase,
          suggestion: `Consider paraphrasing: "${matchedPhrase}" — use your own words to express the same idea.`,
        });
        copiedWordCount += end - i;
      }
      i = end - 1; // 跳過已匹配的詞
    }
  }

  // 句級檢測：整句幾乎相同
  for (const sentence of sentences) {
    const sentenceWords = sentence.trim().split(/\s+/).filter(w => w.length > 2);
    if (sentenceWords.length < 5) continue;

    const sentence4grams = extractNgrams(sentence, 4);
    const sourceSentences = cleanSource.split(/[.!?]+/).filter(s => s.trim().length > 0);

    for (const srcSentence of sourceSentences) {
      const src4grams = extractNgrams(srcSentence, 4);
      const intersection = [...sentence4grams].filter(g => src4grams.has(g));
      const overlapRatio = intersection.length / Math.max(1, sentence4grams.size);

      if (overlapRatio > 0.7 && sentenceWords.length >= 5) {
        const alreadyRecorded = copiedPhrases.some(p =>
          p.original.includes(sentence.trim().slice(0, 30))
        );
        if (!alreadyRecorded) {
          copiedPhrases.push({
            original: sentence.trim(),
            suggestion: 'This sentence is very similar to the source. Paraphrase using your own words and sentence structure.',
          });
          copiedWordCount += sentenceWords.length;
        }
      }
    }
  }

  const copyRatio = Math.min(1, copiedWordCount / Math.max(1, writingWords.length));
  const isOverCopy = copyRatio > threshold;

  const overallSuggestion = isOverCopy
    ? `⚠️ Over-copying detected: ${Math.round(copyRatio * 100)}% of your writing matches the source text. In DSE Paper 3, you must paraphrase and use your own words. Copying directly from the data file will lose marks. Try: (1) Change the sentence structure, (2) Use synonyms, (3) Combine or split ideas differently.`
    : copyRatio > 0.2
      ? `Some similarity to source detected (${Math.round(copyRatio * 100)}%). Make sure you are paraphrasing, not copying.`
      : '';

  return {
    isOverCopy,
    copyRatio,
    copiedPhrases: copiedPhrases.slice(0, 5), // Top 5
    overallSuggestion,
  };
}
