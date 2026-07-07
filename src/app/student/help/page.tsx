// ============================================
// 學生端 — 求助與建議頁面
// ============================================
'use client';

import { useState } from 'react';
import { Lightbulb, BookOpen, AlertTriangle, MessageCircle, ChevronRight, ChevronDown, ThumbsUp } from 'lucide-react';
import { useT } from '@/hooks/use-i18n';

interface QAItem {
  q: string;
  a: string;
}

const helpCategories: { title: string; icon: React.ElementType; items: QAItem[]; color: string }[] = [
  {
    title: '文法問題', icon: BookOpen,
    color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    items: [
      { q: '如何分辨 "who" 和 "which"？', a: '"Who" 用於人，"which" 用於事物或動物。例：The girl who sits next to me is friendly.（人用 who）The book which I bought is interesting.（物用 which）' },
      { q: '什麼時候用 Present Perfect？', a: '1) 過去發生，影響現在：I have lost my keys.（現在找不到）2) 經驗：I have been to Japan twice. 3) 從過去持續到現在：I have lived here since 2010. 注意：有明確過去時間（yesterday, last week）時，必須用 Simple Past。' },
      { q: '條件句三種怎樣區分？', a: 'Type 0（事實）：If you heat water, it boils.（If + present, present）Type 1（可能）：If it rains, I will stay home.（If + present, will）Type 2（現在假設）：If I were you, I would study harder.（If + past, would）Type 3（過去假設）：If I had studied, I would have passed.（If + had p.p., would have p.p.）' },
    ],
  },
  {
    title: '詞彙問題', icon: BookOpen,
    color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    items: [
      { q: '如何有效記憶生字？', a: '1) 在例句中學習，不要單獨背單詞 2) 用詞彙網絡圖（word web）連結相關詞 3) 學習詞彙搭配（collocations），如 "make a decision" 而非 "do a decision" 4) 每天複習，使用間隔重溫法（1天→3天→7天→14天）' },
      { q: 'Phrasal Verbs 怎樣學最快？', a: '不要逐個死記！按主題分類學習：1) UP 系列（向上/完成）：give up, take up, make up 2) DOWN 系列（向下/減少）：calm down, break down 3) OUT 系列（向外/消失）：find out, run out。多看英文影片和劇集，留意母語者如何使用。' },
      { q: 'Collocations 重要嗎？', a: '非常重要！使用自然搭配是英語流暢的關鍵。例："heavy rain"（不是 strong rain）、"make a mistake"（不是 do a mistake）、"high temperature"（不是 tall temperature）。建議每次學新詞時，同時記住它常與哪些詞搭配使用。' },
    ],
  },
  {
    title: '寫作問題', icon: MessageCircle,
    color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    items: [
      { q: '怎樣寫好的 Topic Sentence？', a: '好的主題句 = 主題 + 控制意念。例：Reading offers numerous benefits. → 段落將討論閱讀的好處。避免太籠統（"Reading is good"）或太具體（直接跳到例子）。主題句應讓讀者一眼知道這段要講什麼。' },
      { q: '文章結構應如何組織？', a: 'DSE 建議結構：引言(10%) → 主體段 x3(70%) → 結論(20%)。每段用 PEEL：Point（論點）→ Example（例子）→ Explanation（解釋）→ Link（扣題）。確保每段只講一個中心思想。' },
      { q: '如何避免 Chinglish？', a: '1) Although 和 but 不能同時用（中文「雖然...但是」，英文只用一個）2) Because 和 so 不能同時用 3) "very like"→"really like" 4) "according to my opinion"→"In my opinion" 5) "There have"→"There are"。多閱讀地道英文，培養語感是最好的方法。' },
    ],
  },
  {
    title: '閱讀問題', icon: BookOpen,
    color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
    items: [
      { q: '閱讀理解時間不夠怎麼辦？', a: '1) 先看題目，帶問題閱讀 2) 善用 skimming（略讀找主旨）和 scanning（掃讀找細節）3) 不認識的字不要停，根據上下文猜測 4) 每篇分配時間：DSE Paper 1 約 1.5 小時，Part A 用 30 分鐘，Part B 用 60 分鐘。' },
      { q: '如何快速找出主旨？', a: '閱讀第一段和最後一段（主旨通常在此）。留意重複出現的關鍵詞。問自己：「作者最想傳達的一個信息是什麼？」主旨通常不是太窄的細節，也不是太闊的泛泛之談。' },
      { q: '遇到不認識的字怎麼辦？', a: '1) 根據前後文猜測（context clues）2) 分析詞根/詞綴（如 unhappy = un + happy）3) 如果不影響理解，直接跳過 4) 如果是關鍵詞，看周圍的解釋或同義詞。記住：閱讀理解不是詞彙測驗！' },
    ],
  },
];

const aiAdvice = [
  { title: '建立每日學習習慣', desc: '每天只需 15 分鐘，專注練習一個弱點技能。', icon: '📅' },
  { title: '善用錯題溫習', desc: '重做錯題比做新題更有效。建議每週重溫一次錯題庫。', icon: '🔄' },
  { title: '先理解後記憶', desc: '文法規則不要死記，多看例句，理解使用情境。', icon: '🧠' },
  { title: '多聽多讀', desc: '課餘時間多看英文影片、聽英文歌，讓英文融入生活。', icon: '🎧' },
];

export default function StudentHelpPage() {
  const { t } = useT();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">💡 求助與建議</h1>

      {/* AI 學習建議卡片 */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-yellow-500" /> AI 學習建議
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {aiAdvice.map((advice, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex gap-3">
              <span className="text-2xl">{advice.icon}</span>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white text-sm">{advice.title}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{advice.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 常見學習困難（可展開答案） */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-teal-500" /> 常見學習困難
        </h2>
        <div className="space-y-3">
          {helpCategories.map((cat, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cat.color}`}>
                  <cat.icon className="w-5 h-5" />
                </div>
                <h3 className="font-medium text-gray-900 dark:text-white">{cat.title}</h3>
              </div>
              <div className="px-4 pb-4 space-y-1">
                {cat.items.map((item, j) => {
                  const key = `${i}-${j}`;
                  const isOpen = expanded === key;
                  return (
                    <div key={j}>
                      <button
                        onClick={() => setExpanded(isOpen ? null : key)}
                        className="w-full flex items-center justify-between p-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors text-left"
                      >
                        <span>{item.q}</span>
                        {isOpen ? <ChevronDown className="w-4 h-4 flex-shrink-0 text-teal-500" /> : <ChevronRight className="w-4 h-4 flex-shrink-0" />}
                      </button>
                      {isOpen && (
                        <div className="px-3 py-2 mx-2 mb-1 bg-teal-50 dark:bg-teal-900/20 rounded-lg text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                          {item.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 鼓勵訊息 */}
      <div className="bg-gradient-to-r from-teal-500 to-teal-600 rounded-2xl p-6 text-white text-center">
        <ThumbsUp className="w-8 h-8 mx-auto mb-2 opacity-80" />
        <p className="text-lg font-semibold">你已經做得很好了！</p>
        <p className="text-sm text-teal-100 mt-1">學習英語是一場馬拉松，不是短跑。每次小小的進步，都會累積成大大的成就。繼續加油！💪</p>
      </div>
    </div>
  );
}
