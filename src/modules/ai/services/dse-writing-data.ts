// ============================================
// DSE Writing 文體結構知識庫 + 詞彙升級 + 中式英文修正
// 提取自 ai-service.ts 以保持檔案模組化
// ============================================

// ============================================
// DSE_TEXT_TYPE_GUIDE — 12 種文體結構指引 (2024 新制兼容)
// ============================================

export const DSE_TEXT_TYPE_GUIDE: Record<string, {
  name: string;
  nameZh: string;
  requiredElements: string[];
  structure: { paragraph: number; role: string; roleZh: string; keyContent: string }[];
  commonErrors: { error: string; errorZh: string; fix: string }[];
  usefulOpeners: string[];
  usefulClosers: string[];
}> = {
  'argumentative-essay': {
    name: 'Argumentative Essay',
    nameZh: '議論文',
    requiredElements: ['Thesis statement', '3 supporting arguments', '1 counter-argument', '1 rebuttal', 'PEEL structure per paragraph'],
    structure: [
      { paragraph: 1, role: 'Introduction', roleZh: '引言', keyContent: 'Hook + Background + Clear thesis statement (your stance)' },
      { paragraph: 2, role: 'Body — Reason 1', roleZh: '主體 — 理由一', keyContent: 'PEEL: Point → Explain → Example → Link. Use "Firstly / To begin with"' },
      { paragraph: 3, role: 'Body — Reason 2', roleZh: '主體 — 理由二', keyContent: 'PEEL. Use "Secondly / Furthermore / Moreover". Provide specific real-world example.' },
      { paragraph: 4, role: 'Body — Reason 3', roleZh: '主體 — 理由三', keyContent: 'PEEL. Use "Most importantly / Thirdly". This should be your STRONGEST argument.' },
      { paragraph: 5, role: 'Counter-argument', roleZh: '反方論點', keyContent: '"Admittedly / Some may argue that..." Present the opposing view fairly.' },
      { paragraph: 6, role: 'Rebuttal', roleZh: '駁論', keyContent: '"However / Nevertheless..." Dismantle the counter-argument. This is the HIGHEST-SCORING part.' },
      { paragraph: 7, role: 'Conclusion', roleZh: '結論', keyContent: 'Restate thesis (using different words) + Summarize main points + Call to action or future outlook' },
    ],
    commonErrors: [
      { error: 'Thesis statement unclear or absent', errorZh: '論點陳述模糊或缺失', fix: 'Write ONE clear sentence stating your position at the end of the introduction' },
      { error: 'No counter-argument and rebuttal', errorZh: '缺乏反方論點與駁論', fix: 'Always include at least 1 counter-argument + rebuttal — this is what separates Level 3 from Level 5' },
      { error: 'Arguments are repetitive (saying the same thing 3 ways)', errorZh: '三個論點實質重複', fix: 'Ensure each reason addresses a DIFFERENT angle (e.g., economic, social, environmental)' },
      { error: 'New argument introduced in conclusion', errorZh: '結論段引入新論點', fix: 'Conclusion should ONLY summarize, never introduce new ideas' },
      { error: 'Overuse of "I think / I believe"', errorZh: '過度使用 I think / I believe', fix: 'Replace with objective phrasing: "It is evident that...", "Research demonstrates that..."' },
    ],
    usefulOpeners: [
      'In today\'s society, the debate over [topic] has become increasingly prominent.',
      'Few issues are as contentious as [topic]. While some argue that..., I firmly believe that...',
      'As [topic] continues to dominate headlines, it is time we examined this issue critically.',
    ],
    usefulClosers: [
      'In conclusion, while [counter-view] has its merits, the evidence overwhelmingly supports [your view].',
      'Ultimately, the path forward is clear: [your main recommendation]. The time to act is now.',
      'Let us not be paralyzed by indecision. By [action], we can ensure a brighter future for all.',
    ],
  },
  'letter-formal': {
    name: 'Formal Letter',
    nameZh: '正式書信',
    requiredElements: ['Sender\'s address', 'Date', 'Recipient\'s name and address', 'Appropriate salutation (Dear Mr./Ms./Dr. X or Dear Sir/Madam)', 'Matching closing (Yours sincerely / Yours faithfully)', 'No contractions', 'Formal tone'],
    structure: [
      { paragraph: 1, role: 'Sender Info + Salutation', roleZh: '寄件人資料 + 稱呼', keyContent: 'Address (top-right) → Date → Recipient address (left) → Dear [Title] [Surname],' },
      { paragraph: 2, role: 'Opening — Purpose', roleZh: '開首 — 目的', keyContent: '"I am writing to express my concern regarding..." / "I am writing to apply for..." — State purpose clearly in the FIRST sentence' },
      { paragraph: 3, role: 'Body — Point 1', roleZh: '主體 — 要點一', keyContent: 'Elaborate first reason/concern with specific examples. Use formal connecting phrases: "Furthermore / Moreover / In addition"' },
      { paragraph: 4, role: 'Body — Point 2', roleZh: '主體 — 要點二', keyContent: 'Second point with evidence. "It is also worth noting that..." / "Another pressing concern is..."' },
      { paragraph: 5, role: 'Closing — Call to Action', roleZh: '結尾 — 行動呼籲', keyContent: '"I would be grateful if you could..." / "I urge you to consider..." — Be polite but firm' },
      { paragraph: 6, role: 'Sign-off', roleZh: '結尾敬語', keyContent: 'Yours sincerely, (if you know the name) OR Yours faithfully, (if Dear Sir/Madam) → Signature → Printed Name' },
    ],
    commonErrors: [
      { error: 'Wrong salutation-closing pairing', errorZh: '稱呼與結尾敬語配對錯誤', fix: 'Dear Mr. Chan → Yours sincerely / Dear Sir/Madam → Yours faithfully' },
      { error: 'Using contractions in formal letter', errorZh: '正式信中使用縮寫', fix: "don't → do not, can't → cannot, I'm → I am — NEVER use contractions in formal letters" },
      { error: 'Missing address or date', errorZh: '遺漏地址或日期', fix: 'Always include your address (top-right) and the date below it' },
      { error: 'Tone too casual or aggressive', errorZh: '語氣過於隨便或激進', fix: 'Use polite, measured language: "I would appreciate it if..." NOT "You should..."' },
    ],
    usefulOpeners: [
      'I am writing to express my concern regarding...',
      'I am writing to apply for the position of...',
      'I am writing on behalf of [organization] to bring to your attention...',
    ],
    usefulClosers: [
      'I would be grateful if you could address this matter at your earliest convenience.',
      'I look forward to hearing from you.',
      'Thank you for your time and consideration.',
    ],
  },
  'letter-informal': {
    name: 'Informal Letter / Letter of Advice',
    nameZh: '非正式書信 / 建議信',
    requiredElements: ['Date', 'Dear [First Name],', 'Friendly, conversational tone', 'Contractions allowed', 'Personal anecdotes welcome', 'Appropriate closing (Best wishes / Love / Take care)'],
    structure: [
      { paragraph: 1, role: 'Opening — Greeting & Context', roleZh: '開首 — 問候與背景', keyContent: '"How have you been?" / "I hope this letter finds you well." / "I heard about [situation] and wanted to share some thoughts."' },
      { paragraph: 2, role: 'Body — Advice Point 1', roleZh: '主體 — 建議一', keyContent: '"First of all, I think you should..." — Use empathetic language: "I understand how you feel..."' },
      { paragraph: 3, role: 'Body — Advice Point 2', roleZh: '主體 — 建議二', keyContent: '"Another thing you could try is..." — Share personal experience if relevant: "When I was in a similar situation..."' },
      { paragraph: 4, role: 'Closing — Encouragement', roleZh: '結尾 — 鼓勵', keyContent: '"I\'m always here if you need to talk." / "Don\'t worry — things will get better!" — End on a positive, supportive note' },
    ],
    commonErrors: [
      { error: 'Tone too formal for a friend', errorZh: '對朋友語氣過於正式', fix: 'Use contractions, casual expressions, and personal anecdotes' },
      { error: 'Advice too vague ("just be positive")', errorZh: '建議太空泛', fix: 'Give CONCRETE, actionable suggestions with specific steps' },
      { error: 'Forgetting to show empathy', errorZh: '缺乏同理心表達', fix: 'Start with "I understand how difficult this must be..." before giving advice' },
    ],
    usefulOpeners: [
      'How have you been? I was so happy to receive your letter!',
      'I heard about what happened and I wanted to reach out.',
      'It\'s been ages since we last caught up! I hope everything is going well.',
    ],
    usefulClosers: [
      'Take care and write back soon!',
      'I\'m always just a phone call away if you need anything.',
      'Best wishes and stay strong!',
    ],
  },
  'speech': {
    name: 'Speech',
    nameZh: '演講辭',
    requiredElements: ['Greeting to audience', 'Self-introduction (if needed)', 'Clear topic statement', 'Rhetorical devices (rhetorical questions, repetition, tripling)', 'Audience engagement', 'Call to action', 'Thank you'],
    structure: [
      { paragraph: 1, role: 'Opening — Greeting + Hook', roleZh: '開場 — 問候 + 引入', keyContent: '"Good morning, fellow students and teachers." / "Have you ever wondered why...?" — Start with a rhetorical question, anecdote, or shocking statistic' },
      { paragraph: 2, role: 'Body — Point 1 with Example', roleZh: '主體 — 要點一 + 例子', keyContent: 'Use personal stories or vivid examples. "Let me share a story..." / "Imagine a world where..."' },
      { paragraph: 3, role: 'Body — Point 2 with Example', roleZh: '主體 — 要點二 + 例子', keyContent: 'Use rhetorical devices: repetition ("We must act. We must change. We must..."), tripling, emotive language' },
      { paragraph: 4, role: 'Closing — Call to Action + Thanks', roleZh: '結尾 — 行動呼籲 + 致謝', keyContent: '"Let us work together to..." / "The time to act is now!" / "Thank you for your attention."' },
    ],
    commonErrors: [
      { error: 'Forgetting the greeting', errorZh: '忘記開場問候', fix: 'Always start with "Good morning/afternoon, [audience]" — this is a basic format requirement' },
      { error: 'Tone too written/formal — reads like an essay', errorZh: '語氣太書面化，不像演講', fix: 'Use contractions, direct address ("you"), rhetorical questions, and shorter sentences' },
      { error: 'No audience engagement', errorZh: '缺乏與聽眾的互動', fix: 'Use "As we all know...", "You may have experienced...", "Raise your hand if..."' },
      { error: 'Weak ending', errorZh: '結尾平淡無力', fix: 'End with a powerful call to action and thank the audience. Make the last sentence MEMORABLE.' },
    ],
    usefulOpeners: [
      'Good morning, fellow students and teachers. Have you ever stopped to think about [topic]?',
      'Good afternoon, everyone. Today, I want to talk about something that affects every single one of us: [topic].',
      'Good morning. Imagine waking up one day to find that [scenario]. This is not a distant fantasy — it is a reality that...',
    ],
    usefulClosers: [
      'Let us not wait until it is too late. The time to act is now — together, we can make a difference. Thank you.',
      'So I leave you with this question: what kind of future do you want to create? Thank you for your attention.',
      'Remember, change begins with each and every one of us. Let\'s start today. Thank you.',
    ],
  },
  'article': {
    name: 'Article',
    nameZh: '文章',
    requiredElements: ['Catchy headline/title', 'Engaging lead paragraph', 'Clear sub-topics (may use sub-headings)', 'Personal voice and style', 'Short paragraphs for readability', 'Memorable conclusion'],
    structure: [
      { paragraph: 1, role: 'Headline + Lead', roleZh: '標題 + 導言', keyContent: 'Write a catchy title (can be a question). Lead paragraph: hook the reader — use a surprising fact, anecdote, or provocative question' },
      { paragraph: 2, role: 'Body — Angle 1', roleZh: '主體 — 角度一', keyContent: 'Develop the first angle with examples, quotes, or data. Keep paragraphs SHORT (3-4 sentences max for readability)' },
      { paragraph: 3, role: 'Body — Angle 2', roleZh: '主體 — 角度二', keyContent: 'Contrasting or complementary angle. Use sub-headings if appropriate. Maintain an engaging, personal tone' },
      { paragraph: 4, role: 'Conclusion — Takeaway', roleZh: '結論 — 要點', keyContent: 'Leave the reader with something to think about. End with a powerful statement or question.' },
    ],
    commonErrors: [
      { error: 'Boring or generic title', errorZh: '標題平淡無奇', fix: 'Use a question: "Is Social Media Destroying Our Society?" or a provocative statement' },
      { error: 'Paragraphs too long (wall of text)', errorZh: '段落過長，不易閱讀', fix: 'Keep paragraphs to 3-4 sentences. Use short sentences for impact. Vary paragraph length.' },
      { error: 'Lack of personal voice — reads like a textbook', errorZh: '缺乏個人風格', fix: 'Inject your personality — use vivid descriptions, personal observations, and unique perspectives' },
    ],
    usefulOpeners: [
      'Did you know that [shocking statistic]? This little-known fact reveals a much larger problem: [topic].',
      'It was 7:30 am on a Monday when I first realized that [topic] was about to change my life.',
      'Walk down any street in Hong Kong and you\'ll see it — [observation]. But what does this mean for us?',
    ],
    usefulClosers: [
      'So the next time you [action], remember: [takeaway message].',
      'The question is no longer whether we should act, but how soon we can start.',
      'Perhaps it\'s time we all asked ourselves: [provocative question]?',
    ],
  },
  'report': {
    name: 'Report',
    nameZh: '報告',
    requiredElements: ['Title', 'Introduction (purpose + scope)', 'Findings (with sub-headings)', 'Data presentation', 'Recommendations (if applicable)', 'Conclusion', 'Objective, impersonal tone'],
    structure: [
      { paragraph: 1, role: 'Title + Introduction', roleZh: '標題 + 引言', keyContent: 'Title: "Report on [Topic]". Introduction: state purpose, scope, and methodology. "This report aims to..."' },
      { paragraph: 2, role: 'Findings — Sub-heading 1', roleZh: '調查結果 — 副標題一', keyContent: 'Use sub-headings. Present data clearly. "According to the survey..." / "The data shows that..." Use passive voice for objectivity.' },
      { paragraph: 3, role: 'Findings — Sub-heading 2', roleZh: '調查結果 — 副標題二', keyContent: 'Second finding. Use specific numbers: "65% of respondents indicated..." NOT "Most people think..."' },
      { paragraph: 4, role: 'Recommendations', roleZh: '建議', keyContent: '"Based on the findings, the following recommendations are proposed:..." Use bullet points if appropriate. Each recommendation should link to findings.' },
      { paragraph: 5, role: 'Conclusion', roleZh: '結論', keyContent: 'Summarize key findings and reiterate main recommendation. Keep it concise and professional.' },
    ],
    commonErrors: [
      { error: 'Using first person (I, we) too much', errorZh: '過度使用第一人稱', fix: 'Use passive voice: "It was found that..." / "It is recommended that..." NOT "I found that..."' },
      { error: 'Vague data ("many people", "a lot")', errorZh: '數據含糊', fix: 'Use specific numbers: "65% of respondents", "three out of five students"' },
      { error: 'No sub-headings — wall of text', errorZh: '缺乏副標題，結構混亂', fix: 'Use clear sub-headings to organize findings. Each sub-section should address ONE topic.' },
      { error: 'Recommendations not linked to findings', errorZh: '建議與調查結果脫節', fix: 'Each recommendation should directly follow from a finding. Reference the data.' },
    ],
    usefulOpeners: [
      'This report aims to investigate [topic] and provide recommendations based on the findings.',
      'The purpose of this report is to examine [topic] following [context/event].',
      'This report presents the findings of a survey conducted among [group] regarding [topic].',
    ],
    usefulClosers: [
      'In conclusion, the findings indicate that [summary]. It is recommended that [action] be implemented.',
      'Based on the evidence presented, it is clear that [conclusion]. The proposed recommendations should be considered for immediate action.',
    ],
  },
  'proposal': {
    name: 'Proposal',
    nameZh: '計劃書',
    requiredElements: ['Title', 'Introduction (background + problem)', 'Objectives (SMART)', 'Proposed Activities/Methods', 'Timeline and resources', 'Expected outcomes', 'Conclusion'],
    structure: [
      { paragraph: 1, role: 'Title + Introduction', roleZh: '標題 + 引言', keyContent: 'Title: "A Proposal for [Project]". Introduction: describe the background, current situation, and the problem you aim to solve.' },
      { paragraph: 2, role: 'Objectives', roleZh: '目標', keyContent: 'List 2-3 SMART objectives (Specific, Measurable, Achievable, Relevant, Time-bound). "The objectives of this proposal are: 1)..."' },
      { paragraph: 3, role: 'Proposed Activities', roleZh: '建議活動', keyContent: 'Describe activities in detail. Include timeline, venue, resources needed. "The campaign will run for 3 weeks, from [date] to [date]..."' },
      { paragraph: 4, role: 'Budget & Resources', roleZh: '預算與資源', keyContent: 'Estimated costs, personnel needed (Person-In-Charge), equipment. Be realistic and detailed.' },
      { paragraph: 5, role: 'Expected Outcomes', roleZh: '預期成果', keyContent: 'What will success look like? "It is expected that..." / "This initiative will result in..." Be specific and measurable.' },
      { paragraph: 6, role: 'Conclusion', roleZh: '結論', keyContent: 'Summarize why this proposal should be accepted. End with a persuasive call to approve.' },
    ],
    commonErrors: [
      { error: 'Objectives too vague and unmeasurable', errorZh: '目標空泛，缺乏可衡量性', fix: 'Make objectives SMART: "Increase participation by 30%" NOT "Get more people involved"' },
      { error: 'No timeline or resource plan', errorZh: '缺乏時間表和資源規劃', fix: 'Always include specific dates, duration, venue, and estimated budget' },
      { error: 'Ignoring potential challenges', errorZh: '忽略潛在困難', fix: 'Address 1-2 potential challenges and how you plan to overcome them — shows critical thinking' },
      { error: 'Expected outcomes unrealistic', errorZh: '預期成效過於理想化', fix: 'Be realistic. "Raise awareness among 200 students" is better than "Solve the problem entirely"' },
    ],
    usefulOpeners: [
      'This proposal outlines a plan to address [problem] at [context/school/organization].',
      'In response to [situation], this proposal presents a comprehensive plan for [solution].',
    ],
    usefulClosers: [
      'I believe this proposal represents a practical and effective solution. I look forward to your approval.',
      'With the support of [stakeholders], this initiative has the potential to create lasting positive change.',
    ],
  },
  'blog-entry': {
    name: 'Blog Entry',
    nameZh: '部落格文章',
    requiredElements: ['Engaging title', 'Personal, conversational tone', 'First-person perspective', 'Personal experience/anecdotes', 'Reflective conclusion', 'Call for reader engagement (comments/discussion)'],
    structure: [
      { paragraph: 1, role: 'Title + Hook', roleZh: '標題 + 引入', keyContent: 'Catchy blog title. Opening hook: a personal moment, a surprising realization, or a relatable question. "I never thought I\'d be writing this, but here I am..."' },
      { paragraph: 2, role: 'Personal Experience', roleZh: '個人經歷', keyContent: 'Share your story. What happened? When? How did you feel? Use vivid, sensory details. Be honest and relatable.' },
      { paragraph: 3, role: 'Reflection & Insights', roleZh: '反思與體會', keyContent: 'What did you learn? How has this changed you? "Looking back, I realize that..." / "This experience taught me..."' },
      { paragraph: 4, role: 'Broader Connection', roleZh: '延伸思考', keyContent: 'Connect your personal story to a wider theme or trend. "I\'m not alone in this — many people my age..."' },
      { paragraph: 5, role: 'Conclusion + Engagement', roleZh: '結語 + 互動', keyContent: 'End with a takeaway message. Invite readers to share: "Have you ever experienced something similar? Let me know in the comments!"' },
    ],
    commonErrors: [
      { error: 'Tone too formal — reads like an essay', errorZh: '語氣太正式，不像部落格', fix: 'Write as if talking to a friend. Use contractions, casual expressions, and rhetorical questions.' },
      { error: 'No personal experience shared', errorZh: '沒有分享個人經歷', fix: 'Blog entries are personal. Include a specific anecdote, memory, or reflection.' },
      { error: 'No reader engagement', errorZh: '缺乏讀者互動', fix: 'End with a question or invitation for comments. Blogs are interactive!' },
      { error: 'No clear takeaway', errorZh: '缺乏明確的體會/收穫', fix: 'Readers want to know what you LEARNED. End with a reflective insight.' },
    ],
    usefulOpeners: [
      'If someone had told me a year ago that I would become vegan, I would have laughed. But here we are.',
      'They say change happens gradually, then all at once. That was certainly true for me.',
      'I used to think [topic] was just a trend. Then [event] happened, and everything changed.',
    ],
    usefulClosers: [
      'So, would I recommend this lifestyle? Absolutely — but not for the reasons you might think.',
      'Have you ever made a change that surprised even yourself? I\'d love to hear your story.',
      'This journey has only just begun, and I can\'t wait to see where it leads. Stay tuned!',
    ],
  },
  'promotional-leaflet': {
    name: 'Promotional Leaflet',
    nameZh: '宣傳單張',
    requiredElements: ['Eye-catching headline/title', 'Organization name and logo area', 'Key information in bullet points or short sections', 'Call to action (contact info, sign-up, visit)', 'Visual layout indicators (use of headings, short paragraphs)', 'Target audience appropriate tone'],
    structure: [
      { paragraph: 1, role: 'Headline + Tagline', roleZh: '標題 + 口號', keyContent: 'Bold, catchy headline. A short tagline that captures the essence. "852 Teen Art Club — Unleash Your Creativity!"' },
      { paragraph: 2, role: 'About Us / Background', roleZh: '關於我們 / 背景', keyContent: 'Who are you? Brief background (2-3 sentences). Mission/vision statement. What makes you special?' },
      { paragraph: 3, role: 'Key Highlight / Testimonial', roleZh: '重點亮點 / 會員心聲', keyContent: 'A member\'s most memorable experience or a success story. Use a quote. "Joining this club was the best decision I ever made..."' },
      { paragraph: 4, role: 'Upcoming Activities / Offers', roleZh: '即將舉行的活動 / 優惠', keyContent: 'List activities, events, or offers. Use bullet points or numbered list. Include dates, times, venues if relevant.' },
      { paragraph: 5, role: 'Call to Action + Contact', roleZh: '行動呼籲 + 聯絡方式', keyContent: '"Join us today!" / "Sign up now!" Include website, email, phone, social media handles. Make it easy to take action.' },
    ],
    commonErrors: [
      { error: 'Too much text — not scannable', errorZh: '文字太多，不易快速閱讀', fix: 'Use bullet points, short paragraphs, and bold headings. A leaflet is meant to be scanned, not read like a book.' },
      { error: 'No clear call to action', errorZh: '缺乏明確的行動呼籲', fix: 'Tell readers exactly what to do: "Visit our website", "Call us at...", "Sign up by [date]"' },
      { error: 'Tone doesn\'t match target audience', errorZh: '語氣不符合目標受眾', fix: 'For teens: energetic and fun. For parents: reassuring and informative. Know your audience.' },
      { error: 'Missing contact information', errorZh: '缺少聯絡資訊', fix: 'Always include at least 2 ways to reach you: email, phone, website, or social media.' },
    ],
    usefulOpeners: [
      'Discover Your Creative Potential at 852 Teen Art Club!',
      'Are you ready to [benefit]? Welcome to [Organization] — where [value proposition].',
      'Join the [number]+ members who have already [achievement]!',
    ],
    usefulClosers: [
      'Don\'t miss out — sign up today at [website] or call [phone]!',
      'Follow us on Instagram @[handle] for the latest updates and events.',
      'Spaces are limited! Register by [date] to secure your spot.',
    ],
  },
  'feature-article': {
    name: 'Feature Article',
    nameZh: '專題報導',
    requiredElements: ['Compelling headline', 'Lead paragraph (5W1H — Who, What, When, Where, Why, How)', 'Interviewee quotes/information', 'Background context', 'Balanced perspective', 'Memorable conclusion'],
    structure: [
      { paragraph: 1, role: 'Headline + Lead', roleZh: '標題 + 導言', keyContent: 'Engaging headline. Lead: summarize the story in 1-2 sentences. Who? What? When? Where? Why? Hook the reader immediately.' },
      { paragraph: 2, role: 'Background / Context', roleZh: '背景 / 脈絡', keyContent: 'Provide context. Why is this story important now? What\'s the bigger picture? "In the wake of [event], [industry] has faced unprecedented challenges."' },
      { paragraph: 3, role: 'Interview Highlights', roleZh: '訪談重點', keyContent: 'Present key quotes and insights from the interviewee. "According to [name], \'[quote].\'" Use direct and indirect speech.' },
      { paragraph: 4, role: 'Analysis / Impact', roleZh: '分析 / 影響', keyContent: 'Analyze the implications. What does this mean for the industry/community? Include statistics, trends, or expert opinions.' },
      { paragraph: 5, role: 'Conclusion / Future Outlook', roleZh: '結論 / 展望', keyContent: 'Wrap up with the interviewee\'s future plans or the broader outlook. End with a forward-looking statement or reflective question.' },
    ],
    commonErrors: [
      { error: 'No direct quotes from the interviewee', errorZh: '缺乏受訪者直接引述', fix: 'Include at least 2-3 direct quotes. Feature articles are about PEOPLE, not just facts.' },
      { error: 'Reads like a news report — too factual, no depth', errorZh: '像新聞報導，缺乏深度', fix: 'Go beyond the facts. Explore the WHY and HOW. Include emotions, struggles, and personal stories.' },
      { error: 'No broader context or analysis', errorZh: '缺乏宏觀背景或分析', fix: 'Connect the individual story to industry trends, social issues, or current events.' },
      { error: 'Weak or abrupt ending', errorZh: '結尾薄弱或倉促', fix: 'End with impact. A powerful quote, a look to the future, or a thought-provoking question.' },
    ],
    usefulOpeners: [
      'When [name] opened [business] in [year], they had no idea that [challenge] would change everything.',
      'In the heart of [location], a quiet revolution is taking place — and [name] is at the center of it.',
      '[Statistics] — but behind these numbers is a human story of resilience and adaptation.',
    ],
    usefulClosers: [
      'As [name] looks to the future, one thing is clear: [key takeaway]. And if their journey so far is any indication, the best is yet to come.',
      'The question now is not whether [industry] will survive, but how it will evolve. If [name]\'s story tells us anything, it\'s that adaptation is not just possible — it\'s essential.',
    ],
  },
  'diary-entry': {
    name: 'Diary Entry',
    nameZh: '日記',
    requiredElements: ['Date (can be "Dear Diary")', 'First-person narrative', 'Personal thoughts and feelings', 'Description of events', 'Reflection/emotional response', 'Informal, intimate tone'],
    structure: [
      { paragraph: 1, role: 'Date + Opening', roleZh: '日期 + 開場', keyContent: '"Dear Diary," or date. Opening line sets the mood. "What a day!" / "I can\'t believe what just happened..." / "Today was [adjective]."' },
      { paragraph: 2, role: 'Event Description', roleZh: '事件描述', keyContent: 'Describe what happened in chronological order. Include sensory details (what you saw, heard, felt). Use past tense.' },
      { paragraph: 3, role: 'Emotional Response', roleZh: '情感反應', keyContent: 'How did you feel? Why? Be honest and vulnerable. "I was terrified." / "I\'ve never felt so alive." / "My heart was racing."' },
      { paragraph: 4, role: 'Reflection + Closing', roleZh: '反思 + 結語', keyContent: 'What does this experience mean? What did you learn? "I guess what I\'m trying to say is..." / "Maybe tomorrow will be better." End with a personal note.' },
    ],
    commonErrors: [
      { error: 'Tone too formal — diary is personal', errorZh: '語氣太正式', fix: 'Write as if talking to yourself. Use informal language, sentence fragments, and emotional expressions.' },
      { error: 'Just listing events without feelings', errorZh: '只列舉事件，缺乏情感', fix: 'A diary is about FEELINGS, not just events. After describing what happened, always add: "I felt..."' },
      { error: 'No reflection or takeaway', errorZh: '沒有反思或體會', fix: 'End with what you learned or how you\'ve changed. Diaries are for processing experiences.' },
      { error: 'Forgetting it\'s a diary — writing an essay instead', errorZh: '忘記這是日記，寫成了文章', fix: 'Use "I" throughout. Write in past tense for events, present tense for feelings. Keep it intimate.' },
    ],
    usefulOpeners: [
      'Dear Diary, today was unlike any other day. I\'m still trying to process everything that happened.',
      'Dear Diary, I don\'t even know where to begin. My hands are still shaking as I write this.',
      'Dear Diary, they say you never forget your first time. Well, today was MY first time [doing something], and they were right.',
    ],
    usefulClosers: [
      'Anyway, that\'s all for now. I need some sleep — tomorrow is another day.',
      'I feel better now that I\'ve written this down. Maybe things aren\'t as bad as they seemed.',
      'Goodnight, Diary. Here\'s hoping tomorrow brings better luck.',
    ],
  },
  'letter-to-editor': {
    name: 'Letter to the Editor',
    nameZh: '致編輯的信',
    requiredElements: ['Formal salutation (Dear Editor,)', 'Reference to the article/issue being responded to', 'Clear opinion/stance', '2-3 supporting arguments with examples', 'Polite but firm tone', 'Appropriate closing (Yours faithfully,)', 'Writer\'s name and optionally district/school'],
    structure: [
      { paragraph: 1, role: 'Salutation + Context', roleZh: '稱呼 + 背景', keyContent: '"Dear Editor," — Reference the article/issue: "I am writing in response to [article] published on [date] regarding [topic]..." State your position clearly.' },
      { paragraph: 2, role: 'Argument 1', roleZh: '論點一', keyContent: 'First reason for your position. Provide specific examples or evidence. "Firstly, research shows that..." / "As a [student/resident], I have observed..."' },
      { paragraph: 3, role: 'Argument 2 + Counter', roleZh: '論點二 + 反駁', keyContent: 'Second reason. Optionally acknowledge the opposing view and rebut it. "While some may argue that..., the evidence suggests otherwise."' },
      { paragraph: 4, role: 'Conclusion + Call', roleZh: '結論 + 呼籲', keyContent: 'Summarize your position. Call for action or change. "I urge [authority] to..." / "It is time for [stakeholders] to..."' },
      { paragraph: 5, role: 'Sign-off', roleZh: '簽署', keyContent: '"Yours faithfully," → Full name → (Optional: district, school, or role, e.g., "Chris Wong, Sha Tin, Secondary 6 student")' },
    ],
    commonErrors: [
      { error: 'Not referencing the original article/issue', errorZh: '未提及原文/原議題', fix: 'Always mention what you\'re responding to in the first paragraph: "I refer to the article..."' },
      { error: 'Too aggressive or emotional', errorZh: '語氣過於激進或情緒化', fix: 'Be firm but respectful. Use measured language: "I respectfully disagree" NOT "This is ridiculous"' },
      { error: 'No call to action', errorZh: '缺乏行動呼籲', fix: 'Letters to the editor should end with what you want to happen: policy change, awareness, discussion, etc.' },
      { error: 'Using "Yours sincerely" instead of "Yours faithfully"', errorZh: '錯誤使用 Yours sincerely', fix: '"Dear Editor" → "Yours faithfully" (you don\'t know the editor\'s name)' },
    ],
    usefulOpeners: [
      'Dear Editor, I am writing in response to the article "[title]" published in your newspaper on [date].',
      'Dear Editor, I wish to express my views on the recent debate regarding [topic] that has been featured in your publication.',
      'Dear Editor, as a regular reader of your newspaper, I feel compelled to respond to the coverage of [issue].',
    ],
    usefulClosers: [
      'I urge the relevant authorities to consider the concerns raised and take appropriate action. Yours faithfully, [Name]',
      'I hope this letter will contribute to a more balanced discussion on this important issue. Yours faithfully, [Name]',
    ],
  },
};

// ============================================
// VOCAB_UPGRADES — DSE Writing 詞彙升級對照表
// ============================================

export const VOCAB_UPGRADES: { basic: string; advanced: string; context: string }[] = [
  { basic: 'important', advanced: 'crucial / vital / essential / paramount', context: '強調重要性' },
  { basic: 'good', advanced: 'beneficial / advantageous / favorable / commendable', context: '正面評價' },
  { basic: 'bad', advanced: 'detrimental / harmful / adverse / undesirable', context: '負面評價' },
  { basic: 'show', advanced: 'demonstrate / illustrate / reveal / indicate', context: '呈現/展示' },
  { basic: 'think', advanced: 'believe / contend / argue / assert / maintain', context: '表達觀點' },
  { basic: 'many', advanced: 'numerous / a multitude of / a plethora of / countless', context: '數量多' },
  { basic: 'big', advanced: 'substantial / considerable / significant / immense', context: '形容大小/程度' },
  { basic: 'get', advanced: 'obtain / acquire / attain / secure', context: '獲得' },
  { basic: 'say', advanced: 'claim / assert / contend / emphasize / highlight', context: '表達/說話' },
  { basic: 'because', advanced: 'due to / owing to / as a result of / on account of', context: '因果關係' },
  { basic: 'but', advanced: 'however / nevertheless / nonetheless / on the contrary', context: '對比轉折' },
  { basic: 'so', advanced: 'consequently / therefore / thus / hence / as a result', context: '因果結論' },
  { basic: 'very', advanced: 'exceedingly / remarkably / exceptionally / profoundly', context: '程度加強' },
  { basic: 'problem', advanced: 'issue / concern / challenge / dilemma / predicament', context: '問題/困境' },
  { basic: 'solve', advanced: 'resolve / address / tackle / remedy / alleviate', context: '解決' },
];

// ============================================
// CHINGLISH_FIXES — DSE Writing 常見中式英文修正
// ============================================

export const CHINGLISH_FIXES: { chinglish: string; correct: string; explanationZh: string }[] = [
  { chinglish: 'According to my opinion', correct: 'In my opinion / From my perspective', explanationZh: '"According to" 後接客觀來源（如研究、報告），不可接個人意見。' },
  { chinglish: 'Although... but...', correct: 'Although... (no "but")...', explanationZh: '英文中 although 和 but 不可並用，選其一即可。' },
  { chinglish: 'Because... so...', correct: 'Because... (no "so")...', explanationZh: '英文中 because 和 so 不可並用，如同 although 和 but。' },
  { chinglish: 'I very like it', correct: 'I really like it / I like it very much', explanationZh: '"Very" 修飾形容詞/副詞，不可直接修飾動詞。' },
  { chinglish: 'There have many people', correct: 'There are many people', explanationZh: '"There have" 是中式直譯，應用 "There is/are"。' },
  { chinglish: 'I am agree', correct: 'I agree', explanationZh: '"Agree" 是動詞，前面不需要 be 動詞。' },
  { chinglish: 'Discuss about', correct: 'Discuss (no "about")', explanationZh: '"Discuss" 是及物動詞，直接接賓語，不需要 about。' },
  { chinglish: 'More and more + adjective', correct: 'increasingly + adjective', explanationZh: '"More and more important" → "increasingly important" 更正式、更地道。' },
  { chinglish: 'Every coin has two sides', correct: 'There are two sides to every issue / The issue is double-edged', explanationZh: '"Every coin has two sides" 是中式英語 cliché，評卷員已看膩。' },
  { chinglish: 'Last but not least', correct: 'Finally / Most importantly', explanationZh: '"Last but not least" 過度使用已成為 cliché，用更簡潔的替代。' },
];
