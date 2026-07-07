// ============================================
// i18n — 繁體中文 / English 翻譯系統（純函數，無 React 依賴）
// 用法: import { t } from '@/lib/i18n'; t('nav.dashboard')
//       import { useT } from '@/hooks/use-i18n'; // Client Component 用（響應式）
// ============================================

const translations: Record<string, { zh: string; en: string }> = {
  // Navigation
  'nav.dashboard': { zh: '學習主頁', en: 'Dashboard' },
  'nav.practice': { zh: 'AI 練習', en: 'AI Practice' },
  'nav.mistakes': { zh: '我的錯題', en: 'My Mistakes' },
  'nav.vocabulary': { zh: '生字簿', en: 'Vocabulary' },
  'nav.progress': { zh: '我的進度', en: 'My Progress' },
  'nav.writing': { zh: '寫作支援', en: 'Writing Support' },
  'nav.assignments': { zh: '我的作業', en: 'Assignments' },
  'nav.diagnostic': { zh: '診斷測驗', en: 'Diagnostic Test' },
  'nav.help': { zh: '求助建議', en: 'Help' },
  'nav.profile': { zh: '個人檔案', en: 'Profile' },
  'nav.more': { zh: '更多', en: 'More' },
  'nav.home': { zh: '主頁', en: 'Home' },

  // Teacher Navigation
  'teacher.overview': { zh: '總覽', en: 'Overview' },
  'teacher.dashboard': { zh: '教師主頁', en: 'Dashboard' },
  'teacher.assignments': { zh: '任務派發', en: 'Assignments' },
  'teacher.classes': { zh: '班級進度', en: 'Class Progress' },
  'teacher.students': { zh: '學生名單', en: 'Student List' },
  'teacher.review': { zh: '批改覆核', en: 'Review' },
  'teacher.materials': { zh: '教材中心', en: 'Materials' },
  'teacher.import': { zh: '匯入資料', en: 'Import' },
  'teacher.reports': { zh: '成績報告', en: 'Reports' },
  'teacher.settings': { zh: '系統設定', en: 'Settings' },
  'teacher.management': { zh: '教學管理', en: 'Management' },

  // Common
  'common.welcome': { zh: '歡迎回來', en: 'Welcome back' },
  'common.practice': { zh: '開始練習', en: 'Start Practice' },
  'common.logout': { zh: '登出', en: 'Logout' },
  'common.switchRole': { zh: '切換身份', en: 'Switch Role' },
  'common.save': { zh: '儲存', en: 'Save' },
  'common.cancel': { zh: '取消', en: 'Cancel' },
  'common.edit': { zh: '編輯', en: 'Edit' },
  'common.loading': { zh: '載入中...', en: 'Loading...' },
  'common.error': { zh: '錯誤', en: 'Error' },
  'common.success': { zh: '成功', en: 'Success' },
  'common.viewAll': { zh: '查看全部', en: 'View All' },
  'common.search': { zh: '搜尋', en: 'Search' },
  'common.submit': { zh: '提交', en: 'Submit' },
  'common.back': { zh: '返回', en: 'Back' },

  // Login
  'login.title': { zh: 'AI 英語學習平台', en: 'AI English Platform' },
  'login.subtitle': { zh: '香港中學英語適應性學習', en: 'HK Secondary English Adaptive Learning' },
  'login.email': { zh: '電郵地址', en: 'Email' },
  'login.password': { zh: '密碼', en: 'Password' },
  'login.signIn': { zh: '登入', en: 'Sign In' },
  'login.signingIn': { zh: '登入中...', en: 'Signing in...' },
  'login.googleSignIn': { zh: '使用 Google 帳號登入', en: 'Sign in with Google' },
  'login.demoAccounts': { zh: '示範帳號（點擊自動填入）：', en: 'Demo Accounts (click to fill):' },
  'login.demoStudent': { zh: '🧑‍🎓 學生', en: '🧑‍🎓 Student' },
  'login.demoTeacher': { zh: '👩‍🏫 教師', en: '👩‍🏫 Teacher' },
  'login.emailPlaceholder': { zh: 'your-email@school.hk', en: 'your-email@school.hk' },
  'login.passwordPlaceholder': { zh: '請輸入密碼', en: 'Enter password' },
  'login.loginFailed': { zh: '登入失敗，請重試。', en: 'Login failed, please try again.' },
  'login.networkError': { zh: '網絡錯誤，請檢查連線後重試。', en: 'Network error, please check connection and retry.' },

  // Role Select
  'role.title': { zh: '選擇身份', en: 'Select Role' },
  'role.subtitle': { zh: '請選擇你要使用的身份進入平台', en: 'Choose your role to enter the platform' },
  'role.student': { zh: '🧑‍🎓 學生', en: '🧑‍🎓 Student' },
  'role.teacher': { zh: '👩‍🏫 教師', en: '👩‍🏫 Teacher' },
  'role.studentDesc': { zh: '進行練習、查看進度、溫習錯題', en: 'Practice, track progress, review mistakes' },
  'role.teacherDesc': { zh: '管理班級、派發任務、覆核批改', en: 'Manage classes, assign tasks, review work' },
  'role.saveFailed': { zh: '儲存身份失敗，請重試。', en: 'Failed to save role, please try again.' },
  'role.sessionExpired': { zh: '登入已過期，請重新登入。', en: 'Session expired. Please sign in again.' },

  // Student Pages
  'student.startPractice': { zh: '開始今天的練習吧！', en: 'Start practicing today!' },
  'student.aiInsight': { zh: 'AI 學習洞察', en: 'AI Learning Insights' },
  'student.aiAnalysis': { zh: 'AI 分析', en: 'AI Analysis' },
  'student.analyzing': { zh: '分析中...', en: 'Analyzing...' },
  'student.pendingAssignments': { zh: '待完成作業', en: 'Pending Assignments' },
  'student.noMistakes': { zh: '暫無錯題記錄', en: 'No mistakes recorded' },
  'student.noVocab': { zh: '暫無詞彙記錄', en: 'No vocabulary recorded' },
  'student.correctAnswer': { zh: '正確答案', en: 'Correct Answer' },
  'student.wrongAnswer': { zh: '回答錯誤', en: 'Incorrect' },
  'student.correct': { zh: '回答正確！', en: 'Correct!' },
  'student.accuracy': { zh: '正確率', en: 'Accuracy' },
  'student.sessions': { zh: '練習次數', en: 'Sessions' },
  'student.vocabCount': { zh: '詞彙數', en: 'Vocabulary' },

  // Teacher Pages
  'teacher.newAssignment': { zh: '建立新任務', en: 'New Assignment' },
  'teacher.uploadMaterial': { zh: '上傳教材', en: 'Upload Material' },
  'teacher.classCount': { zh: '學生人數', en: 'Students' },
  'teacher.avgAccuracy': { zh: '平均正確率', en: 'Avg Accuracy' },
  'teacher.completionRate': { zh: '平均完成率', en: 'Completion Rate' },
  'teacher.aiStatus': { zh: 'AI 服務狀態', en: 'AI Service Status' },
  'teacher.connected': { zh: '已連線', en: 'Connected' },
  'teacher.disconnected': { zh: '未連線', en: 'Disconnected' },

  // Student Dashboard
  'student.dashboard.title': { zh: 'Start practicing today!', en: 'Start practicing today!' },
  'student.dashboard.practice': { zh: '練習', en: 'Practice' },
  'student.dashboard.aiInsight': { zh: 'AI 學習洞察', en: 'AI Learning Insights' },
  'student.dashboard.aiAnalysis': { zh: 'AI 分析', en: 'AI Analysis' },

  // Writing Page
  'writing.title': { zh: '✍️ 寫作支援', en: '✍️ Writing Support' },
  'writing.promptGen': { zh: 'AI 題目生成', en: 'AI Prompt Generator' },
  'writing.grade': { zh: '年級', en: 'Grade' },
  'writing.textType': { zh: '文體', en: 'Text Type' },
  'writing.wordLimit': { zh: '字數上限', en: 'Word Limit' },
  'writing.topicHint': { zh: '主題提示（可選）', en: 'Topic Hint (optional)' },
  'writing.customTopic': { zh: '使用自訂題目（不使用 AI 生成）', en: 'Use custom topic (skip AI generation)' },
  'writing.customTopicPlaceholder': { zh: '輸入你的自訂作文題目...', en: 'Enter your custom writing topic...' },
  'writing.genOutline': { zh: '生成 AI 作文大綱（結構建議）', en: 'Generate AI writing outline' },
  'writing.confirmTopic': { zh: '確認題目', en: 'Confirm Topic' },
  'writing.genPrompt': { zh: '生成題目', en: 'Generate Prompt' },
  'writing.generating': { zh: '生成中...', en: 'Generating...' },
  'writing.yourPrompt': { zh: '作文題目：', en: 'Your Prompt:' },
  'writing.words': { zh: '字', en: 'words' },
  'writing.type': { zh: '文體', en: 'Type' },
  'writing.level': { zh: '年級', en: 'Level' },
  'writing.aiOutline': { zh: 'AI 作文大綱：', en: 'AI Writing Outline:' },
  'writing.yourWriting': { zh: '你的寫作', en: 'Your Writing' },
  'writing.chars': { zh: '字元', en: 'chars' },
  'writing.writePlaceholder': { zh: '請先生成或輸入題目，然後在此寫作...', en: 'Generate or enter a topic first, then write here...' },
  'writing.aiAnalyze': { zh: '提交 AI 批改', en: 'Submit for AI Analysis' },
  'writing.analyzing': { zh: 'AI 批改中...', en: 'Analyzing...' },
  'writing.writingTips': { zh: '寫作提示', en: 'Writing Tips' },
  'writing.vocabHelp': { zh: '詞彙建議', en: 'Vocab Help' },
  'writing.vocabSuggestions': { zh: '詞彙建議', en: 'Vocabulary Suggestions' },
  'writing.aiAnalysisResult': { zh: 'AI 寫作分析', en: 'AI Writing Analysis' },

  // Practice Page
  'practice.title': { zh: '📝 AI 練習', en: '📝 AI Practice' },
  'practice.generate': { zh: '生成題目', en: 'Generate Questions' },
  'practice.generating': { zh: '生成中...', en: 'Generating...' },
  'practice.start': { zh: '開始練習', en: 'Start Practice' },

  // Generic
  'generic.startPractice': { zh: '開始練習', en: 'Start Practice' },
  'generic.words': { zh: '字', en: 'words' },
};

/**
 * 獲取翻譯文字
 * @param key 翻譯鍵
 * @param lang 語言代碼
 * @returns 翻譯後的文字
 */
export function t(key: string, lang?: string): string {
  const entry = translations[key];
  if (!entry) return key;
  return lang === 'en' ? entry.en : entry.zh;
}
