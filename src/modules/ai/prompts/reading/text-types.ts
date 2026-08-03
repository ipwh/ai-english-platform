// ============================================
// DSE Paper 1 Reading — Text Type Definitions
// 真實 DSE 出現過的所有文本類型 + 推薦閱讀來源
// 來源：chenglish.hk 分析 + 2012-2024 Past Papers
// ============================================

/**
 * DSE Paper 1 文本類型完整定義
 */
export interface DSEtextType {
  id: string;
  nameEn: string;
  nameZh: string;
  description: string;
  dseAppearances: string[];
  typicalSources: string[];
  wordCountRange: string;
  complexity: 'simple' | 'straightforward' | 'fairly complex' | 'complex';
  typicalPart: ('A' | 'B1' | 'B2')[];
  features: string[];
  /** Phase 4A.1: Expected authorial voice for this text type */
  voice?: string;
  /** How strong the authorial stance should be (0-1) */
  stanceStrength?: number;
  /** Expected paragraph movement pattern */
  paragraphMovement?: string;
  /** Degree of subjectivity expected (0-1) */
  subjectivity?: number;
}
}

export const DSE_TEXT_TYPES: DSEtextType[] = [
  {
    id: 'feature_article',
    nameEn: 'Feature Article',
    nameZh: '專題報導',
    description: 'In-depth article on a specific topic, often with expert opinions, statistics, and narrative elements.',
    dseAppearances: ['2022 Part A (HK comic industry)', '2022 B1 (Slasher careers)', '2022 B2 (AI ethics)', '2020 Part A (Tai Kwun)'],
    typicalSources: ['The Guardian', 'BBC News', 'SCMP', 'Coconuts HK', 'Harvard Gazette', 'National Geographic'],
    wordCountRange: '700-1000 words (Part A), 600-900 (Part B)',
    complexity: 'fairly complex',
    typicalPart: ['A', 'B2'],
    features: ['Headings and subheadings', 'Expert quotes', 'Statistics/data', 'Narrative opening', 'Multiple viewpoints'],
    voice: 'Engaging, journalistic. Open with a specific example or anecdote. Include expert perspectives and data. Maintain a balanced but engaging tone.',
    stanceStrength: 0.4,
    paragraphMovement: 'Hook/anecdote → background → data/evidence → expert view → contrasting perspective → forward-looking closing',
    subjectivity: 0.3,
  },
  {
    id: 'newspaper_article',
    nameEn: 'Newspaper Article',
    nameZh: '新聞報導',
    description: 'News report on current events, typically with inverted pyramid structure.',
    dseAppearances: ['2021 B1 (Dog attack - Toronto Sun)', '2021 B2 (Unlicensed rubbish collectors - Financial Times)'],
    typicalSources: ['SCMP', 'Financial Times', 'Toronto Sun', 'The Standard'],
    wordCountRange: '500-800 words',
    complexity: 'straightforward',
    typicalPart: ['B1', 'B2'],
    features: ['Headline + byline', 'Inverted pyramid', 'Factual reporting', 'Direct quotes', 'Date/place dateline'],
    voice: 'Factual and objective. Lead with the most important facts. Include quotes from involved parties. Maintain neutral tone but may include mild evaluative language in feature-news hybrids.',
    stanceStrength: 0.1,
    paragraphMovement: 'Key facts → supporting details → quotes → background context → forward look',
    subjectivity: 0.1,
  },
  {
    id: 'restaurant_review',
    nameEn: 'Restaurant Review',
    nameZh: '餐廳評論',
    description: 'Review of a dining establishment, including food quality, ambiance, service, and overall experience.',
    dseAppearances: ['2021 Part A (Healthy fast food - Viva NZ)'],
    typicalSources: ['Viva NZ', 'SCMP Food & Wine', 'Time Out Hong Kong'],
    wordCountRange: '500-700 words',
    complexity: 'straightforward',
    typicalPart: ['A', 'B1'],
    features: ['Descriptive language', 'Personal opinion', 'Rating/verdict', 'Price information', 'Atmosphere description'],
  },
  {
    id: 'interview',
    nameEn: 'Interview / Profile',
    nameZh: '人物專訪',
    description: 'Interview transcript or profile piece featuring a person\'s views, experiences, and personality.',
    dseAppearances: ['2020 B2 (Graham Norton agony uncle)'],
    typicalSources: ['The Guardian', 'BBC', 'SCMP'],
    wordCountRange: '700-900 words',
    complexity: 'fairly complex',
    typicalPart: ['B2'],
    features: ['Q&A format or narrative profile', 'Direct quotes', 'Personal anecdotes', 'Background context', 'Tone/voice of interviewee'],
  },
  {
    id: 'informational_webpage',
    nameEn: 'Informational Webpage',
    nameZh: '資訊性網頁',
    description: 'Webpage providing practical information, tips, or guides on a specific topic.',
    dseAppearances: ['2020 B1 (Kite flying website)'],
    typicalSources: ['Various .org / .gov websites', 'NGO websites'],
    wordCountRange: '500-700 words',
    complexity: 'straightforward',
    typicalPart: ['B1'],
    features: ['Menu/navigation headers', 'Bullet points', 'Tips/suggestions', 'Clear section headings', 'Practical instructions'],
  },
  {
    id: 'government_guide',
    nameEn: 'Government/NGO Guide',
    nameZh: '政府/機構指南',
    description: 'Official guide or documentation from government or NGOs on public issues.',
    dseAppearances: ['2021 B1 (Waste reduction guide - US)'],
    typicalSources: ['Environmental Protection Department', 'CalRecycle', 'UN publications'],
    wordCountRange: '600-800 words',
    complexity: 'straightforward',
    typicalPart: ['B1'],
    features: ['Official tone', 'Numbered sections', 'Definitions', 'Call to action', 'Formal language'],
  },
  {
    id: 'job_advertisement',
    nameEn: 'Job Advertisement',
    nameZh: '招聘廣告',
    description: 'Job posting listing requirements, responsibilities, and application details.',
    dseAppearances: ['2022 B1 (Job advertisements)'],
    typicalSources: ['JobsDB', 'LinkedIn', 'SCMP Classifieds'],
    wordCountRange: '200-400 words (short form)',
    complexity: 'simple',
    typicalPart: ['B1'],
    features: ['Job title/company', 'Requirements', 'Responsibilities', 'How to apply', 'Bullet-point format'],
  },
  {
    id: 'blog_post',
    nameEn: 'Blog Post',
    nameZh: '網誌文章',
    description: 'Personal or professional blog entry on a specific topic, often with opinion and personal experience.',
    dseAppearances: ['Common in Part A and B1'],
    typicalSources: ['Medium', 'Blogger', 'Personal blogs'],
    wordCountRange: '500-800 words',
    complexity: 'straightforward',
    typicalPart: ['A', 'B1'],
    features: ['Personal voice', 'Opinions', 'Comments section reference', 'Informal tone possible', 'First-person narrative'],
  },
  {
    id: 'literary_excerpt',
    nameEn: 'Literary Excerpt',
    nameZh: '文學節錄',
    description: 'Excerpt from a novel or short story, focusing on narrative, description, and character.',
    dseAppearances: ['2021 B2 (Dog and wolf story)'],
    typicalSources: ['Novels', 'Short story collections'],
    wordCountRange: '600-900 words',
    complexity: 'complex',
    typicalPart: ['B2'],
    features: ['Narrative style', 'Character development', 'Descriptive passages', 'Figurative language', 'Dialogue'],
  },
  {
    id: 'letter_to_editor',
    nameEn: 'Letter to the Editor',
    nameZh: '讀者來信',
    description: 'Letter written to a publication expressing opinion on a current issue.',
    dseAppearances: ['Common in Part A'],
    typicalSources: ['SCMP Letters', 'The Guardian Letters'],
    wordCountRange: '300-500 words',
    complexity: 'straightforward',
    typicalPart: ['A', 'B1'],
    features: ['Salutation/closing', 'Opinion/argument', 'Reference to previous article', 'Formal register', 'Persuasive language'],
  },
  {
    id: 'advertisement_poster',
    nameEn: 'Advertisement / Poster',
    nameZh: '廣告/海報',
    description: 'Promotional material for events, products, or services.',
    dseAppearances: ['Common in Part A and B1'],
    typicalSources: ['Various commercial sources'],
    wordCountRange: '100-300 words (visual + text)',
    complexity: 'simple',
    typicalPart: ['A', 'B1'],
    features: ['Visual layout', 'Slogans/taglines', 'Call to action', 'Date/time/venue', 'Persuasive language'],
  },
  {
    id: 'argumentative_essay',
    nameEn: 'Argumentative / Discursive Essay',
    nameZh: '議論/辯論文章',
    description: 'Formal essay presenting arguments for and against a topic, with a clear thesis.',
    dseAppearances: ['Common in B2'],
    typicalSources: ['The Economist', 'Academic journals (adapted)', 'The Conversation'],
    wordCountRange: '700-1000 words',
    complexity: 'complex',
    typicalPart: ['B2'],
    features: ['Thesis statement', 'Counter-arguments', 'Evidence/reasoning', 'Formal register', 'Conclusion/recommendation'],
    voice: 'Analytical and persuasive. State a clear position early, then develop arguments with evidence. Include and rebut counter-arguments. End with a reasoned conclusion.',
    stanceStrength: 0.8,
    paragraphMovement: 'Thesis → argument 1 → argument 2 → counter-argument + rebuttal → nuanced conclusion',
    subjectivity: 0.7,
  },
];

/**
 * DSE 真實出版物來源列表（用於 passage source 標記）
 */
export const DSE_PUBLICATION_SOURCES = [
  { name: 'The Guardian', region: 'UK', type: 'newspaper', url: 'https://www.theguardian.com' },
  { name: 'BBC News', region: 'UK', type: 'news', url: 'https://www.bbc.com/news' },
  { name: 'SCMP (South China Morning Post)', region: 'HK', type: 'newspaper', url: 'https://www.scmp.com' },
  { name: 'National Geographic', region: 'US', type: 'magazine', url: 'https://www.nationalgeographic.com' },
  { name: 'The Economist', region: 'UK', type: 'magazine', url: 'https://www.economist.com' },
  { name: 'Scientific American', region: 'US', type: 'magazine', url: 'https://www.scientificamerican.com' },
  { name: 'Harvard Gazette', region: 'US', type: 'university', url: 'https://news.harvard.edu/gazette/' },
  { name: 'Financial Times', region: 'UK', type: 'newspaper', url: 'https://www.ft.com' },
  { name: 'Viva NZ', region: 'NZ', type: 'magazine', url: 'https://www.viva.co.nz' },
  { name: 'Coconuts Hong Kong', region: 'HK', type: 'news', url: 'https://coconuts.co/hongkong/' },
  { name: 'Toronto Sun', region: 'CA', type: 'newspaper', url: 'https://torontosun.com' },
  { name: 'Time Out Hong Kong', region: 'HK', type: 'magazine', url: 'https://www.timeout.com.hk' },
];

/**
 * 香港本地主題佔比建議（DSE Paper 1 約 40% 內容與香港相關）
 */
export const HK_LOCAL_TOPIC_RATIO = {
  recommended: 0.40, // 40% HK-local content
  categories: [
    'Hong Kong heritage & history (Tai Kwun, colonial history, handover)',
    'Hong Kong food culture (cha chaan teng, dai pai dong, street food)',
    'Hong Kong housing & living (public housing, subdivided flats, living space)',
    'Hong Kong arts & culture (Cantonese opera, film industry, street art)',
    'Hong Kong environment (country parks, hiking, marine conservation)',
    'Hong Kong social issues (ageing population, income inequality, youth issues)',
    'Hong Kong education (DSE pressure, school life, university admission)',
    'Hong Kong technology & innovation (smart city, fintech, startups)',
  ],
};

/**
 * 為 prompt 生成文本類型指引
 */
export function buildTextTypePrompt(selectedTypes: string[]): string {
  const types = DSE_TEXT_TYPES.filter(t => selectedTypes.includes(t.id));
  if (types.length === 0) return '';

  const typeDescriptions = types.map(t =>
    `### ${t.nameEn} (${t.nameZh})
- Description: ${t.description}
- Typical sources: ${t.typicalSources.join(', ')}
- Complexity: ${t.complexity}
- Key features: ${t.features.join('; ')}
- Word count: ${t.wordCountRange}${t.voice ? `\n- Voice: ${t.voice}` : ''}${t.paragraphMovement ? `\n- Paragraph movement: ${t.paragraphMovement}` : ''}`
  ).join('\n\n');

  return `
## DSE Text Type Requirements
You MUST write in ONE of the following text types. Match the style, structure, and conventions exactly.

${typeDescriptions}

Your passage MUST:
1. Follow the conventions of the chosen text type exactly
2. Include authentic features (e.g., headlines for articles, datelines for news, salutations for letters)
3. Match the typical word count range
4. Include a realistic source attribution like "adapted from [Publication Name]"
`;
}

/**
 * 為 prompt 生成香港主題比例指引
 */
export function buildHKLocalPrompt(): string {
  return `
## Hong Kong Local Content Requirement
Approximately 40% of DSE Paper 1 passages relate to Hong Kong. When generating passages:
- Consider HK-local angles: heritage, food culture, housing, social issues, education
- Use HK-specific references where appropriate (places, events, cultural practices)
- Balance local and global perspectives
- Include HK-relevant vocabulary and context that HK students would recognize
`;
}
