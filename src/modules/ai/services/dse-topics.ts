// ============================================
// DSE Empirical Topic Database — 基於真實歷屆試題歸納
// 來源：2012-2024 HKDSE English Language Past Papers
// 提取自 ai-service.ts 以保持檔案模組化
// ============================================

// ============================================
// DSE_EMPIRICAL_TOPICS — Paper 1/2/3 真實題材
// ============================================

export const DSE_EMPIRICAL_TOPICS = {
  // Paper 2 寫作真實題材（2012-2024）
  writing: {
    food: ['restaurant review (Dim Sum / local cuisine)', 'food culture and dining trends', 'healthy eating and food labeling', 'school canteen menu reform', 'food waste and sustainability'],
    economy: ['digital transformation and regulation of tech giants', 'cryptocurrency and central bank digital currencies (CBDC)', 'buy-now-pay-later (BNPL) and youth debt crisis', 'experiential retail vs e-commerce', 'gig economy worker rights and protections', 'carbon pricing and green finance'],
    culture: ['Hong Kong housing estates Instagram culture', 'Chinese Opera / Xiqu Centre experience', 'cultural heritage preservation', 'festivals and traditions (Mid-Autumn, CNY, Dragon Boat)', 'pop culture and music industry', 'film and movie reviews', 'cultural appropriation vs appreciation debate'],
    social: ['independent shops vs chain stores', 'small business survival in HK', 'social media impact on youth', 'cyberbullying and online ethics', 'ageing population and elderly care', 'income inequality and poverty', 'loneliness as a public health crisis', 'four-day work week and work-life balance', 'quiet quitting and workplace boundaries'],
    technology: ['AI in education and workplace', 'social media and privacy', 'e-learning vs traditional classroom', 'technology addiction among teens', 'smart city development in HK', 'AI-generated content and intellectual property rights', 'deepfake technology and misinformation', 'quantum computing and cybersecurity threats', 'algorithmic bias and AI ethics'],
    environment: ['plastic waste and recycling', 'renewable energy adoption', 'green living and sustainability', 'wildlife conservation', 'carbon footprint and climate action', 'climate justice and loss-and-damage funds for developing nations', 'carbon border adjustment mechanism (CBAM)', 'fast fashion environmental and labour impact', 'urban development vs ecological conservation'],
    education: ['exam pressure and mental health', 'school uniform policies', 'vocational vs academic education', 'lifelong learning', 'university admission criteria'],
    career: ['job interviews and workplace communication', 'work transfer and career development', 'internship and work experience', 'entrepreneurship and startups', 'gig economy and freelancing'],
    sports: ['Olympic sports inclusion debate', 'Dragon Boat Racing as international sport', 'e-sports as legitimate competition', 'sportsmanship and doping', 'extreme sports and risk-taking'],
    arts: ['music and songwriting inspiration', 'film and television influence', 'street art and public spaces', 'literature and creative writing', 'performing arts and theatre'],
    travel: ['study tour and exchange programmes', 'eco-tourism and responsible travel', 'working holiday experiences', 'cultural immersion travel', 'HK as travel destination'],
    health: ['mental health awareness among youth', 'sleep deprivation and academic performance', 'exercise and physical wellbeing', 'traditional vs modern medicine', 'pandemic preparedness'],
    petEconomy: ['rise of pet ownership among young adults', 'pet-friendly workplaces and public spaces', 'loneliness driving the pet economy boom'],
    hkLocal: ['HK identity and cultural uniqueness', 'Cantonese language preservation', 'urban development vs heritage', 'public housing and living space', 'HK food culture (dai pai dong, cha chaan teng)', 'Northern Metropolis development and wetland conservation', 'e-HKD and Hong Kong fintech innovation'],
    global: ['global citizenship and youth responsibility', 'UN Sustainable Development Goals in daily life', 'international cooperation on climate change', 'migration and cultural identity', 'technology bridging global inequality', 'ethical consumerism and fair trade', 'pandemic lessons and global health security', 'labour shortage and foreign talent policies', 'WHO loneliness epidemic declaration'],
  },
  
  // Paper 1 & Paper 3 閱讀/聆聽常見主題
  reading: {
    science: ['marine biology and ocean conservation', 'astronomy and space exploration', 'neuroscience and brain plasticity', 'genetics and bioethics', 'robotics and automation', 'climate science and meteorology'],
    history: ['Olympic Games history and evolution', 'ancient civilizations and archaeology', 'industrial revolution impact', 'HK colonial history and handover', 'World War stories and memoirs'],
    nature: ['endangered species protection', 'urban wildlife and biodiversity', 'natural disasters and resilience', 'national parks and conservation', 'ocean pollution and microplastics'],
    society: ['volunteerism and community service', 'philanthropy and charity work', 'urbanization and city planning', 'migration and diaspora', 'gender equality movements'],
    psychology: ['procrastination science', 'color psychology in marketing', 'decision-making biases', 'child development theories', 'social conformity experiments'],
    technology: ['AI transformation of industries', '3D printing revolution', 'autonomous vehicles future', 'blockchain beyond cryptocurrency', 'biotechnology breakthroughs'],
    health: ['music therapy benefits', 'sleep science and learning', 'nutrition myths debunked', 'exercise and brain function', 'mindfulness and meditation'],
    hkLocal: ['HK wetland and Mai Po reserve', 'HK hiking trails and country parks', 'HK film industry golden age', 'HK public transport efficiency', 'HK street food culture'],
    global: ['UN sustainable development goals', 'globalization pros and cons', 'international trade and fair trade', 'refugee crises and humanitarian aid', 'pandemic global response', 'central bank digital currencies around the world', 'carbon border taxes and climate trade wars', 'AI copyright lawsuits and creative industries', 'loneliness epidemic and social prescribing', 'four-day work week global experiments'],
    economy: ['cryptocurrency regulation across countries', 'fast fashion supply chain ethics', 'buy-now-pay-later and Gen Z debt', 'experiential retail transforming shopping malls'],
    techEthics: ['deepfake scams and voice cloning fraud', 'quantum computing and encryption security', 'algorithmic bias in hiring and lending', 'SMS phishing and cybersecurity awareness'],
  },
  
  // Paper 3 聆聽場景
  listening: {
    school: ['club fair and society recruitment', 'debate competition preparation', 'school talent show planning', 'student council election campaign', 'graduation ceremony planning', 'parent-teacher conference', 'school open day organization', 'peer mentoring programme'],
    community: ['charity fundraising walkathon', 'beach cleanup volunteer day', 'elderly home visit programme', 'community garden project', 'neighbourhood festival', 'blood donation drive', 'food bank collection'],
    workplace: ['summer internship application', 'part-time job orientation', 'business meeting and presentation', 'customer complaint handling', 'team building activity planning', 'conference call with overseas office', 'product launch preparation'],
    services: ['doctor appointment booking', 'hotel reservation changes', 'flight booking and itinerary', 'restaurant group booking', 'bank account opening', 'library membership registration', 'gym membership inquiry'],
    hkLife: ['MTR route planning', 'Octopus card top-up issue', 'typhoon day arrangements', 'wet market shopping', 'temple visit and fortune telling', 'junk trip boat booking', 'dim sum ordering etiquette'],
    social: ['environmental campaign launch', 'social media detox challenge', 'mental health awareness week', 'cultural diversity celebration', 'anti-bullying workshop', 'digital literacy seminar', 'entrepreneurship bootcamp', 'fintech startup pitch competition', 'green finance and sustainable investing workshop'],
    economy: ['opening a digital wallet account', 'discussing cryptocurrency investment risks', 'complaining about a buy-now-pay-later charge', 'negotiating a freelance contract'],
    global: ['Model UN climate finance debate', 'international video call with sister school', 'discussing study abroad scholarship applications', 'debating fast fashion boycotts'],
  },
} as const;

// ============================================
// Types
// ============================================

export type TopicCategory = 'school' | 'society' | 'technology' | 'environment' | 'culture' | 'health' | 'career' | 'science' | 'hk-local' | 'daily-life' | 'sports' | 'arts' | 'travel' | 'global' | 'economy' | 'tech-ethics';

export interface TopicEntry {
  text: string;
  category: TopicCategory;
  grades: string[]; // S1-S6
}

// ============================================
// LISTENING_TOPICS_V2 — 聆聽主題庫（含年級標記）
// ============================================

export const LISTENING_TOPICS_V2: TopicEntry[] = [
  // === 校園生活 (school) ===
  { text: 'school club recruitment fair（學會招募博覽）', category: 'school', grades: ['S1','S2','S3','S4'] },
  { text: 'planning a school field trip to a museum（策劃學校博物館考察）', category: 'school', grades: ['S1','S2','S3','S4'] },
  { text: 'discussing a group project presentation（討論小組項目簡報）', category: 'school', grades: ['S3','S4','S5'] },
  { text: 'negotiating a project deadline extension with a teacher（與老師協商項目延期）', category: 'school', grades: ['S4','S5','S6'] },
  { text: 'debating school uniform policy changes（辯論校服政策修改）', category: 'school', grades: ['S4','S5','S6'] },
  { text: 'planning a school talent show（策劃學校才藝表演）', category: 'school', grades: ['S1','S2','S3'] },
  
  // === 社會議題 (society) ===
  { text: 'debating the pros and cons of social media（辯論社交媒體的利弊）', category: 'society', grades: ['S4','S5','S6'] },
  { text: 'discussing cyberbullying prevention（討論網絡欺凌預防）', category: 'society', grades: ['S3','S4','S5','S6'] },
  { text: 'planning a charity fundraising event for underprivileged children（策劃弱勢兒童慈善籌款）', category: 'society', grades: ['S3','S4','S5','S6'] },
  { text: 'discussing mental health awareness in schools（討論校園心理健康關注）', category: 'society', grades: ['S4','S5','S6'] },
  { text: 'debating whether AI should replace human jobs（辯論 AI 應否取代人類工作）', category: 'society', grades: ['S5','S6'] },
  { text: 'discussing volunteer work at an elderly home（討論老人院義工服務）', category: 'society', grades: ['S3','S4','S5','S6'] },
  
  // === 科技 (technology) ===
  { text: 'discussing the impact of smartphones on student life（討論智能手機對學生生活的影響）', category: 'technology', grades: ['S3','S4','S5'] },
  { text: 'debating whether AI should be used in classrooms（辯論課室應否使用 AI）', category: 'technology', grades: ['S4','S5','S6'] },
  { text: 'planning a STEM competition logistics meeting（策劃 STEM 比賽物流會議）', category: 'technology', grades: ['S3','S4','S5'] },
  { text: 'calling tech support about a malfunctioning laptop（致電技術支援關於故障筆電）', category: 'technology', grades: ['S3','S4','S5','S6'] },
  { text: 'discussing online learning vs traditional classroom（討論網上學習 vs 傳統課堂）', category: 'technology', grades: ['S4','S5','S6'] },
  
  // === 環境 (environment) ===
  { text: 'discussing environmental protection initiatives at school（討論學校環保倡議）', category: 'environment', grades: ['S2','S3','S4','S5'] },
  { text: 'planning a beach cleanup activity（策劃沙灘清潔活動）', category: 'environment', grades: ['S1','S2','S3','S4'] },
  { text: 'making a complaint about noise pollution to the housing estate（向屋苑投訴噪音污染）', category: 'environment', grades: ['S4','S5','S6'] },
  { text: 'debating plastic ban policies in Hong Kong（辯論香港塑膠禁令政策）', category: 'environment', grades: ['S5','S6'] },
  
  // === 文化 (culture) ===
  { text: 'planning a cultural diversity day at school（策劃學校多元文化日）', category: 'culture', grades: ['S3','S4','S5'] },
  { text: 'discussing Mid-Autumn Festival celebration ideas（討論中秋節慶祝活動）', category: 'culture', grades: ['S1','S2','S3'] },
  { text: 'planning an overseas exchange programme（策劃海外交流計劃）', category: 'culture', grades: ['S4','S5','S6'] },
  { text: 'interviewing a guest speaker about their career abroad（訪問嘉賓講者關於海外職業生涯）', category: 'culture', grades: ['S5','S6'] },
  
  // === 健康 (health) ===
  { text: "making a doctor's appointment（預約看醫生）", category: 'health', grades: ['S1','S2','S3','S4'] },
  { text: 'discussing healthy eating habits at school canteen（討論學校飯堂健康飲食習慣）', category: 'health', grades: ['S2','S3','S4'] },
  { text: 'calling to reschedule a dentist appointment（致電改期牙醫預約）', category: 'health', grades: ['S3','S4','S5'] },
  { text: 'discussing sleep deprivation among students（討論學生睡眠不足問題）', category: 'health', grades: ['S5','S6'] },
  
  // === 就業 (career) ===
  { text: 'part-time job interview at a bookstore（書店兼職面試）', category: 'career', grades: ['S4','S5','S6'] },
  { text: 'discussing internship opportunities during summer break（討論暑期實習機會）', category: 'career', grades: ['S5','S6'] },
  { text: 'career guidance session about university choices（大學選科職業輔導）', category: 'career', grades: ['S5','S6'] },
  { text: 'discussing gap year options and working holidays（討論空檔年與工作假期）', category: 'career', grades: ['S6'] },
  { text: 'applying for an international scholarship programme（申請國際獎學金計劃）', category: 'career', grades: ['S5','S6'] },
  
  // === 科學 (science) ===
  { text: 'discussing a science fair project（科學展項目討論）', category: 'science', grades: ['S2','S3','S4'] },
  { text: 'debating genetic engineering ethics（辯論基因工程倫理）', category: 'science', grades: ['S5','S6'] },
  { text: 'discussing space exploration and its benefits（討論太空探索及其益處）', category: 'science', grades: ['S4','S5'] },
  { text: 'discussing the latest discoveries about black holes（討論黑洞最新發現）', category: 'science', grades: ['S5','S6'] },
  
  // === 香港本地 (hk-local) ===
  { text: 'discussing weekend hiking trip to Sai Kung（討論週末西貢行山）', category: 'hk-local', grades: ['S2','S3','S4','S5'] },
  { text: 'planning a visit to Hong Kong Palace Museum（策劃參觀香港故宮文化博物館）', category: 'hk-local', grades: ['S1','S2','S3'] },
  { text: 'discussing Hong Kong food culture and dai pai dong（討論香港飲食文化與大排檔）', category: 'hk-local', grades: ['S3','S4','S5'] },
  { text: 'debating the future of Cantonese in Hong Kong（辯論粵語在香港的未來）', category: 'hk-local', grades: ['S5','S6'] },
  
  // === 國際/全球議題 (global) — 新增 ===
  { text: 'discussing climate change and its impact on coastal cities（討論氣候變化對沿海城市的影響）', category: 'environment', grades: ['S4','S5','S6'] },
  { text: 'planning a Model United Nations conference（策劃模擬聯合國會議）', category: 'society', grades: ['S4','S5','S6'] },
  { text: 'discussing refugee crises and humanitarian aid（討論難民危機與人道援助）', category: 'society', grades: ['S5','S6'] },
  { text: 'debating fast fashion and ethical consumerism（辯論快時尚與道德消費）', category: 'environment', grades: ['S4','S5','S6'] },
  { text: 'discussing the digital divide between developed and developing countries（討論發達與發展中國家的數位鴻溝）', category: 'technology', grades: ['S5','S6'] },
  { text: 'planning an international food festival at school（策劃學校國際美食節）', category: 'culture', grades: ['S1','S2','S3','S4'] },
  { text: 'discussing UNESCO World Heritage sites（討論聯合國教科文組織世界遺產）', category: 'culture', grades: ['S3','S4','S5'] },
  { text: 'debating whether space tourism should be regulated（辯論太空旅遊應否受監管）', category: 'science', grades: ['S5','S6'] },
  { text: 'discussing ocean plastic pollution solutions（討論海洋塑膠污染解決方案）', category: 'environment', grades: ['S3','S4','S5'] },
  { text: 'planning an international pen pal exchange programme（策劃國際筆友交流計劃）', category: 'culture', grades: ['S1','S2','S3'] },
  { text: 'discussing the impact of tourism on local communities（討論旅遊業對當地社區的影響）', category: 'travel', grades: ['S4','S5','S6'] },
  { text: 'debating renewable energy vs nuclear power（辯論可再生能源 vs 核能）', category: 'environment', grades: ['S5','S6'] },
  { text: 'discussing food waste and global hunger（討論食物浪費與全球飢餓）', category: 'society', grades: ['S4','S5','S6'] },
  { text: 'planning a cultural exchange with a sister school overseas（策劃與海外姊妹學校文化交流）', category: 'culture', grades: ['S4','S5'] },
  { text: 'discussing the ethics of artificial intelligence（討論人工智能的倫理）', category: 'technology', grades: ['S5','S6'] },
  
  // === 日常生活 (daily-life) ===
  { text: 'ordering food at a café with dietary restrictions（咖啡店點餐含飲食限制）', category: 'daily-life', grades: ['S1','S2','S3','S4'] },
  { text: 'booking a badminton court at a sports centre（預訂體育中心羽毛球場）', category: 'daily-life', grades: ['S1','S2','S3'] },
  { text: 'planning a surprise birthday party（策劃驚喜生日派對）', category: 'daily-life', grades: ['S1','S2','S3','S4'] },
  { text: 'calling customer service about a faulty product（致電客服關於瑕疵產品）', category: 'daily-life', grades: ['S4','S5','S6'] },
  { text: 'ordering custom T-shirts for a school event（為學校活動訂製 T 恤）', category: 'daily-life', grades: ['S3','S4','S5'] },
  
  // === 經濟與金融 (economy) — 新增 ===
  { text: 'discussing whether teenagers should use digital payment apps（討論青少年應否使用電子支付）', category: 'economy', grades: ['S3','S4','S5'] },
  { text: 'debating the risks of buy-now-pay-later services（辯論先買後付服務的風險）', category: 'economy', grades: ['S4','S5','S6'] },
  { text: 'discussing cryptocurrency and whether schools should teach it（討論加密貨幣與學校應否教授）', category: 'economy', grades: ['S4','S5','S6'] },
  { text: 'planning a student pop-up market for handmade crafts（策劃學生手作市集）', category: 'economy', grades: ['S2','S3','S4'] },
  
  // === 科技倫理 (tech-ethics) — 新增 ===
  { text: 'discussing a news report about a deepfake scam（討論一宗深偽詐騙新聞）', category: 'technology', grades: ['S4','S5','S6'] },
  { text: 'debating whether schools should use AI to grade essays（辯論學校應否用 AI 批改作文）', category: 'technology', grades: ['S4','S5','S6'] },
  { text: 'discussing how to spot fake news online（討論如何辨識網上假新聞）', category: 'technology', grades: ['S3','S4','S5'] },
  
  // === 社會變遷 (society) — 新增 ===
  { text: 'discussing the idea of a four-day school week（討論四天學校週的構想）', category: 'society', grades: ['S4','S5','S6'] },
  { text: 'debating whether social media makes people lonelier（辯論社交媒體是否令人更孤獨）', category: 'society', grades: ['S4','S5','S6'] },
  { text: 'discussing the rise of single-person households（討論單人住戶的興起）', category: 'society', grades: ['S5','S6'] },
];

// ============================================
// READING_TOPICS_V2 — 閱讀主題庫（含年級標記）
// ============================================

export const READING_TOPICS_V2: TopicEntry[] = [
  // === 科學 (science) ===
  { text: 'the science behind cooking and food chemistry（烹飪科學與食物化學）', category: 'science', grades: ['S3','S4','S5'] },
  { text: 'space exploration and Mars colonization（太空探索與火星殖民）', category: 'science', grades: ['S4','S5','S6'] },
  { text: 'deep-sea exploration and undiscovered species（深海探索與未發現物種）', category: 'science', grades: ['S4','S5'] },
  { text: 'the science of sleep and its effect on learning（睡眠科學及其對學習的影響）', category: 'science', grades: ['S4','S5','S6'] },
  { text: 'the history and future of space telescopes（太空望遠鏡的歷史與未來）', category: 'science', grades: ['S5','S6'] },
  
  // === 科技 (technology) ===
  { text: 'how artificial intelligence is changing education（人工智能如何改變教育）', category: 'technology', grades: ['S4','S5','S6'] },
  { text: 'how 3D printing is revolutionizing medicine（3D 打印如何革新醫學）', category: 'technology', grades: ['S5','S6'] },
  { text: 'the future of electric and autonomous vehicles（電動車與自動駕駛的未來）', category: 'technology', grades: ['S4','S5','S6'] },
  { text: 'the rise of e-sports and competitive gaming（電子競技與競技遊戲的興起）', category: 'technology', grades: ['S3','S4','S5'] },
  
  // === 環境 (environment) ===
  { text: 'marine life conservation and coral reefs（海洋生物保育與珊瑚礁）', category: 'environment', grades: ['S2','S3','S4','S5'] },
  { text: 'renewable energy solutions in Hong Kong（香港可再生能源方案）', category: 'environment', grades: ['S5','S6'] },
  { text: 'the impact of fast fashion on the environment（快時尚對環境的影響）', category: 'environment', grades: ['S4','S5','S6'] },
  { text: 'endangered species and wildlife protection（瀕危物種與野生動物保護）', category: 'environment', grades: ['S3','S4','S5'] },
  { text: 'urban farming and green cities（都市農業與綠色城市）', category: 'environment', grades: ['S4','S5'] },
  { text: 'food sustainability and the future of meat alternatives（糧食可持續性與肉類替代品的未來）', category: 'environment', grades: ['S5','S6'] },
  { text: 'microplastics in the ocean and their effects on the food chain（海洋微塑膠及其對食物鏈的影響）', category: 'environment', grades: ['S5','S6'] },
  
  // === 社會 (society) ===
  { text: 'how social media affects teenage mental health（社交媒體對青少年心理健康的影響）', category: 'society', grades: ['S4','S5','S6'] },
  { text: 'the gig economy and its impact on young workers（零工經濟對年輕工作者的影響）', category: 'society', grades: ['S5','S6'] },
  { text: 'the role of public libraries in the digital age（公共圖書館在數碼時代的角色）', category: 'society', grades: ['S3','S4','S5'] },
  { text: 'volunteer tourism and its pros and cons（義工旅遊的利弊）', category: 'society', grades: ['S4','S5','S6'] },
  { text: 'the psychology behind procrastination（拖延背後的心理學）', category: 'society', grades: ['S4','S5','S6'] },
  
  // === 文化/歷史 (culture) ===
  { text: 'the history of the Olympic Games（奧運會歷史）', category: 'culture', grades: ['S2','S3','S4'] },
  { text: 'cultural festivals around the world（世界各地的文化節日）', category: 'culture', grades: ['S1','S2','S3','S4'] },
  { text: 'traditional crafts and their modern revival（傳統工藝與現代復興）', category: 'culture', grades: ['S3','S4','S5'] },
  { text: 'the history and cultural significance of tea（茶的歷史與文化意義）', category: 'culture', grades: ['S3','S4'] },
  { text: 'ancient civilizations and their engineering marvels（古代文明及其工程奇蹟）', category: 'culture', grades: ['S4','S5'] },
  { text: 'the evolution of the English language（英語的演變）', category: 'culture', grades: ['S4','S5','S6'] },
  { text: 'the philosophy of happiness across different cultures（不同文化中的幸福哲學）', category: 'culture', grades: ['S5','S6'] },
  
  // === 健康/心理 (health) ===
  { text: 'how music therapy benefits mental health（音樂治療如何有益心理健康）', category: 'health', grades: ['S3','S4','S5'] },
  { text: 'the importance of physical exercise for teenagers（青少年運動的重要性）', category: 'health', grades: ['S2','S3','S4'] },
  { text: 'understanding and managing stress in school（理解和管理校園壓力）', category: 'health', grades: ['S3','S4','S5'] },
  { text: 'the benefits and risks of extreme sports（極限運動的好處與風險）', category: 'health', grades: ['S4','S5','S6'] },
  
  // === 運動/冒險 (sports) ===
  { text: 'the rise of parkour and urban sports（跑酷與城市運動的興起）', category: 'sports', grades: ['S3','S4','S5'] },
  { text: 'how chess improves critical thinking（國際象棋如何提升批判思維）', category: 'sports', grades: ['S2','S3','S4'] },
  { text: 'the most dangerous hiking trails in the world（世界上最危險的登山徑）', category: 'sports', grades: ['S4','S5','S6'] },
  { text: 'why skateboarding became an Olympic sport（滑板為何成為奧運項目）', category: 'sports', grades: ['S3','S4','S5'] },
  
  // === 藝術/娛樂 (arts) ===
  { text: 'how street art transforms urban spaces（街頭藝術如何改變城市空間）', category: 'arts', grades: ['S3','S4','S5'] },
  { text: 'the history of animation from hand-drawn to CGI（動畫從手繪到電腦生成的歷史）', category: 'arts', grades: ['S3','S4','S5'] },
  { text: 'why people love mystery and detective stories（人們為何喜愛推理偵探故事）', category: 'arts', grades: ['S2','S3','S4'] },
  { text: 'the rise of K-pop and its global influence（K-pop 的崛起與全球影響力）', category: 'arts', grades: ['S3','S4','S5'] },
  
  // === 職業/商業 (career) ===
  { text: 'unusual and interesting jobs around the world（世界各地奇特有趣的工作）', category: 'career', grades: ['S2','S3','S4'] },
  { text: 'how teenagers can start a small business（青少年如何創業）', category: 'career', grades: ['S3','S4','S5'] },
  { text: 'the future of remote work and digital nomads（遠程工作與數位遊牧的未來）', category: 'career', grades: ['S5','S6'] },
  { text: 'why some people choose gap years before university（為何有人選擇大學前休學年）', category: 'career', grades: ['S4','S5','S6'] },
  
  // === 香港本地 (hk-local) ===
  { text: 'the history of Hong Kong street food（香港街頭小吃的歷史）', category: 'hk-local', grades: ['S2','S3','S4'] },
  { text: 'Hong Kong\'s country parks and hiking culture（香港郊野公園與行山文化）', category: 'hk-local', grades: ['S3','S4','S5'] },
  { text: 'the story behind the Star Ferry（天星小輪背後的故事）', category: 'hk-local', grades: ['S2','S3','S4'] },
  { text: 'how Hong Kong became a global financial centre（香港如何成為國際金融中心）', category: 'hk-local', grades: ['S5','S6'] },
  { text: 'the conservation of Hong Kong\'s historic buildings（香港歷史建築保育）', category: 'hk-local', grades: ['S4','S5','S6'] },
  
  // === 旅行/地理 (travel) ===
  { text: 'the most unusual hotels in the world（世界上最不尋常的酒店）', category: 'travel', grades: ['S2','S3','S4'] },
  { text: 'life in the coldest inhabited places on Earth（地球上最寒冷居住地的生活）', category: 'travel', grades: ['S3','S4','S5'] },
  { text: 'the secrets of the Amazon rainforest（亞馬遜雨林的秘密）', category: 'travel', grades: ['S3','S4','S5'] },
  { text: 'exploring underground cities and cave dwellings（探索地下城市與洞穴居所）', category: 'travel', grades: ['S4','S5','S6'] },
  
  // === 科學 (science) — additional ===
  { text: 'famous inventors and their accidental discoveries（著名發明家與意外發現）', category: 'science', grades: ['S2','S3','S4'] },
  { text: 'how animals communicate in ways we never knew（動物以我們未知的方式溝通）', category: 'science', grades: ['S3','S4','S5'] },
  { text: 'the mystery of black holes explained simply（黑洞之謎簡釋）', category: 'science', grades: ['S4','S5','S6'] },
  
  // === 社會 (society) — additional ===
  { text: 'the psychology of color in marketing（營銷中的色彩心理學）', category: 'society', grades: ['S5','S6'] },
  { text: 'why do we dream? the science and theories of dreaming（我們為何做夢？夢的科學與理論）', category: 'society', grades: ['S4','S5','S6'] },
  
  // === 環境 (environment) — additional ===
  { text: 'migration patterns of birds and climate change（鳥類遷徙模式與氣候變化）', category: 'environment', grades: ['S4','S5'] },
  
  // === 全球/國際議題 (global) — 新增 ===
  { text: 'the impact of climate change on island nations（氣候變化對島國的影響）', category: 'global', grades: ['S4','S5','S6'] },
  { text: 'how international space stations foster global cooperation（國際太空站如何促進全球合作）', category: 'global', grades: ['S4','S5','S6'] },
  { text: 'the story of Malala and the fight for girls\' education（馬拉拉與女童教育抗爭）', category: 'global', grades: ['S3','S4','S5'] },
  { text: 'the Paris Agreement and global climate action（巴黎協定與全球氣候行動）', category: 'global', grades: ['S5','S6'] },
  { text: 'how the internet connects remote villages to the world（互聯網如何將偏遠村莊連接到世界）', category: 'global', grades: ['S3','S4','S5'] },
  { text: 'the rise of global youth activism movements（全球青年運動的興起）', category: 'global', grades: ['S4','S5','S6'] },
  { text: 'fair trade chocolate and ethical farming（公平貿易朱古力與道德農業）', category: 'global', grades: ['S3','S4','S5'] },
  { text: 'how countries prepare for natural disasters differently（各國如何不同地應對自然災害）', category: 'global', grades: ['S3','S4','S5'] },
  { text: 'the history and impact of the European Union（歐盟的歷史與影響）', category: 'global', grades: ['S5','S6'] },
  { text: 'world-changing inventions from unexpected places（來自意想不到地方的改變世界發明）', category: 'global', grades: ['S2','S3','S4'] },
  { text: 'the psychology of kindness and why helping others makes us happy（善意的心理學：為何幫助他人讓我們快樂）', category: 'health', grades: ['S3','S4','S5'] },
  { text: 'how different cultures celebrate the New Year（不同文化如何慶祝新年）', category: 'culture', grades: ['S1','S2','S3'] },
  { text: 'the science behind earthquakes and tsunami warnings（地震與海嘯預警背後的科學）', category: 'science', grades: ['S4','S5','S6'] },
  { text: 'should animals be kept in zoos? the great debate（動物應被關在動物園嗎？大辯論）', category: 'society', grades: ['S3','S4','S5'] },
  { text: 'the rise of plant-based diets around the world（全球植物性飲食的興起）', category: 'health', grades: ['S3','S4','S5'] },
  { text: 'how podcasts are changing the way we learn（播客如何改變我們學習的方式）', category: 'technology', grades: ['S3','S4','S5'] },
  { text: 'the mystery of the Bermuda Triangle and other unexplained phenomena（百慕達三角之謎與其他未解現象）', category: 'science', grades: ['S3','S4','S5'] },
  { text: 'the true story of the Christmas Truce in World War I（一戰聖誕休戰的真實故事）', category: 'culture', grades: ['S4','S5','S6'] },
  { text: 'should voting be compulsory? democracy around the world（投票應否強制？世界各地的民主）', category: 'society', grades: ['S5','S6'] },
  
  // === 經濟 (economy) — 新增 ===
  { text: 'how digital payments are replacing cash around the world（電子支付如何在全球取代現金）', category: 'economy', grades: ['S3','S4','S5'] },
  { text: 'the rise and risks of cryptocurrency（加密貨幣的崛起與風險）', category: 'economy', grades: ['S4','S5','S6'] },
  { text: 'buy-now-pay-later: convenience or debt trap?（先買後付：便利還是負債陷阱？）', category: 'economy', grades: ['S4','S5','S6'] },
  { text: 'how fast fashion brands dominate the global market（快時尚品牌如何主導全球市場）', category: 'economy', grades: ['S4','S5','S6'] },
  { text: 'the gig economy: freedom or exploitation?（零工經濟：自由還是剝削？）', category: 'economy', grades: ['S5','S6'] },
  
  // === 科技倫理 (tech-ethics) — 新增 ===
  { text: 'can AI create real art? the copyright debate（AI 能創造真正的藝術嗎？版權爭論）', category: 'tech-ethics', grades: ['S4','S5','S6'] },
  { text: 'deepfake technology: harmless fun or dangerous tool?（深偽技術：無害娛樂還是危險工具？）', category: 'tech-ethics', grades: ['S4','S5','S6'] },
  { text: 'how quantum computers could break all our passwords（量子電腦如何破解所有密碼）', category: 'tech-ethics', grades: ['S5','S6'] },
  { text: 'should algorithms decide who gets a loan or a job?（演算法應否決定誰獲得貸款或工作？）', category: 'tech-ethics', grades: ['S5','S6'] },
  { text: 'how to protect yourself from online scams and phishing（如何保護自己免受網絡詐騙和釣魚攻擊）', category: 'tech-ethics', grades: ['S3','S4','S5'] },
  
  // === 社會變遷 (society) — 新增 ===
  { text: 'the four-day work week experiment: does it really work?（四天工作週實驗：真的有效嗎？）', category: 'society', grades: ['S5','S6'] },
  { text: 'why the WHO declared loneliness a global health threat（為何世衛將孤獨列為全球健康威脅）', category: 'society', grades: ['S4','S5','S6'] },
  { text: 'the rise of pet ownership among young adults（年輕人中寵物飼養的興起）', category: 'society', grades: ['S3','S4','S5'] },
  { text: 'quiet quitting: setting boundaries or being lazy?（安靜離職：設立界限還是懶惰？）', category: 'society', grades: ['S5','S6'] },
  { text: 'how Japan and South Korea are fighting the loneliness crisis（日本與南韓如何對抗孤獨危機）', category: 'society', grades: ['S5','S6'] },
  
  // === 環境 (environment) — 新增 ===
  { text: 'carbon border taxes: fair climate policy or trade war?（碳邊境稅：公平氣候政策還是貿易戰？）', category: 'environment', grades: ['S5','S6'] },
  { text: 'Indonesia is moving its capital because Jakarta is sinking（印尼因雅加達下沉而遷都）', category: 'environment', grades: ['S4','S5','S6'] },
  { text: 'green finance: can money save the planet?（綠色金融：金錢能拯救地球嗎？）', category: 'environment', grades: ['S5','S6'] },
];

// ============================================
// DSE Empirical Topic Helper — 從實證資料庫抽取主題建議
// ============================================

/**
 * Get real DSE exam-style topic suggestions for prompt enrichment.
 * Draws from the empirical topic database built from 2012-2024 past papers.
 */
export function getDSEEmpiricalTopics(
  skill: 'writing' | 'reading' | 'listening',
  category?: string,
  count = 3,
): string[] {
  const pool = DSE_EMPIRICAL_TOPICS[skill];
  if (!pool) return [];
  
  const allTopics: string[] = [];
  if (category && category in pool) {
    allTopics.push(...(pool[category as keyof typeof pool] as readonly string[]));
  } else {
    for (const cat of Object.values(pool)) {
      allTopics.push(...(cat as readonly string[]));
    }
  }
  
  const shuffled = [...allTopics].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ============================================
// DSE 主題驗證器 — post-generation topic match check
// ============================================

/** Extract all DSE topic keywords into a flat set for substring matching */
function buildDSEKeywordSet(skill: 'writing' | 'reading' | 'listening'): Set<string> {
  const pool = DSE_EMPIRICAL_TOPICS[skill];
  const keywords = new Set<string>();
  for (const cat of Object.values(pool)) {
    for (const topic of cat as string[]) {
      const parts = topic.toLowerCase().split(/[\/\-,()（）:：\s]+/);
      for (const p of parts) {
        const trimmed = p.trim();
        if (trimmed.length >= 3 && !['and', 'the', 'for', 'its', 'how', 'why', 'what', 'pros', 'cons'].includes(trimmed)) {
          keywords.add(trimmed);
        }
      }
    }
  }
  return keywords;
}

// Pre-built keyword sets (lazy init)
const _dseKeywordCache: Map<string, Set<string>> = new Map();
function getDSEKeywords(skill: 'writing' | 'reading' | 'listening'): Set<string> {
  if (!_dseKeywordCache.has(skill)) {
    _dseKeywordCache.set(skill, buildDSEKeywordSet(skill));
  }
  return _dseKeywordCache.get(skill)!;
}

/**
 * Validate that generated content references topics from the DSE empirical database.
 * Returns a match score (0-1) indicating how many DSE keywords were found.
 * Score >= 0.05 means at least some DSE topic alignment was detected.
 */
export function validateDSEtopicMatch(
  generatedText: string,
  skill: 'writing' | 'reading' | 'listening',
): { matched: boolean; score: number; matchedKeywords: string[] } {
  const keywords = getDSEKeywords(skill);
  const lower = generatedText.toLowerCase();
  const matched: string[] = [];

  for (const kw of keywords) {
    if (lower.includes(kw)) {
      matched.push(kw);
    }
  }

  const score = keywords.size > 0 ? matched.length / Math.min(keywords.size, 100) : 0;
  return { matched: matched.length >= 2, score, matchedKeywords: matched };
}
