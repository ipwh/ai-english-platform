// Sprint 94: Writing Guide Use Case (synchronous — no LLM call)
import { DSE_TEXT_TYPE_GUIDE, VOCAB_UPGRADES } from '../services/dse-writing-data';
import type { GenerateWritingGuideInput, WritingGuide } from './writing-prompt';

export function generateWritingGuide(input: GenerateWritingGuideInput): WritingGuide {
  const guide = DSE_TEXT_TYPE_GUIDE[input.textType];
  const structureGuide: WritingGuide['structureGuide'] = guide
    ? guide.structure.map(s => ({ paragraph: s.paragraph, role: s.role, roleZh: s.roleZh, tips: s.keyContent, tipsZh: s.keyContent }))
    : [
        { paragraph: 1, role: 'Introduction', roleZh: '引言', tips: 'Hook + Background + Thesis/Context', tipsZh: '開首語 + 背景 + 論點/情境' },
        { paragraph: 2, role: 'Body Paragraph 1', roleZh: '主體段落一', tips: 'Topic sentence + Example + Explanation', tipsZh: '主題句 + 例子 + 解釋' },
        { paragraph: 3, role: 'Body Paragraph 2', roleZh: '主體段落二', tips: 'Topic sentence + Example + Explanation', tipsZh: '主題句 + 例子 + 解釋' },
        { paragraph: 4, role: 'Conclusion', roleZh: '結論', tips: 'Summary + Final thought + Call to action', tipsZh: '總結 + 最終觀點 + 行動呼籲' },
      ];
  const usefulPhrases: WritingGuide['usefulPhrases'] = guide
    ? [...guide.usefulOpeners.map(o => ({ english: o, chinese: '開首句式', purpose: 'opening' })), ...guide.usefulClosers.map(c => ({ english: c, chinese: '結尾句式', purpose: 'closing' }))]
    : [
        { english: 'In recent years, [topic] has become a subject of considerable debate.', chinese: '近年來，[主題] 已成為廣受討論的議題。', purpose: 'opening' },
        { english: 'It is widely believed that... However, I would argue that...', chinese: '普遍認為...但我想指出...', purpose: 'opening' },
        { english: 'In conclusion, it is clear that...', chinese: '總括而言，顯然...', purpose: 'closing' },
      ];
  const commonMistakes: WritingGuide['commonMistakes'] = guide
    ? guide.commonErrors.map(e => ({ mistake: e.error, mistakeZh: e.errorZh, correction: e.fix, correctionZh: e.fix }))
    : [
        { mistake: 'Off-topic', mistakeZh: '離題', correction: 'Circle keywords in the prompt.', correctionZh: '圈出題目關鍵詞。' },
        { mistake: 'No examples', mistakeZh: '缺乏例子', correction: 'Add concrete examples.', correctionZh: '加入具體例子。' },
        { mistake: 'Repetitive vocabulary', mistakeZh: '詞彙重複', correction: 'Use vocabulary upgrade suggestions.', correctionZh: '參考詞彙升級建議。' },
      ];
  const vocabularyUpgrades: WritingGuide['vocabularyUpgrades'] = VOCAB_UPGRADES.slice(0, 10);
  return { structureGuide, usefulPhrases, commonMistakes, vocabularyUpgrades };
}
