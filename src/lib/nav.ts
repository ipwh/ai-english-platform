// ============================================
// 導航配置 — AI 英語學習平台
// ============================================

import {
  LayoutDashboard, BookOpen, AlertTriangle, BookMarked,
  TrendingUp, PencilLine, ClipboardList, HelpCircle,
  User, Users, GraduationCap, FileText, Upload,
  ClipboardCheck, BarChart3, Settings, Search,
  type LucideIcon
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

// ========================================
// 學生端導航
// ========================================
export const studentNavItems: NavItem[] = [
  { label: '學習主頁', href: '/student/dashboard', icon: LayoutDashboard },
  { label: 'AI 練習', href: '/student/practice', icon: BookOpen },
  { label: '我的錯題', href: '/student/mistakes', icon: AlertTriangle },
  { label: '生字簿', href: '/student/vocabulary', icon: BookMarked },
  { label: '我的進度', href: '/student/progress', icon: TrendingUp },
  { label: '寫作支援', href: '/student/writing', icon: PencilLine },
  { label: '我的作業', href: '/student/assignments', icon: ClipboardList },
  { label: '求助建議', href: '/student/help', icon: HelpCircle },
  { label: '個人檔案', href: '/student/profile', icon: User },
];

// 學生端底部 Tab（手機）- 精選常用 5 個
export const studentTabItems: NavItem[] = [
  { label: '主頁', href: '/student/dashboard', icon: LayoutDashboard },
  { label: '練習', href: '/student/practice', icon: BookOpen },
  { label: '錯題', href: '/student/mistakes', icon: AlertTriangle },
  { label: '進度', href: '/student/progress', icon: TrendingUp },
  { label: '更多', href: '/student/profile', icon: User },
];

// ========================================
// 教師端導航
// ========================================
export const teacherNavSections: NavSection[] = [
  {
    title: '總覽',
    items: [
      { label: '教師主頁', href: '/teacher/dashboard', icon: LayoutDashboard },
      { label: '班級進度', href: '/teacher/classes', icon: Users },
      { label: '學生分析', href: '/teacher/students', icon: GraduationCap },
    ],
  },
  {
    title: '教學工具',
    items: [
      { label: '任務派發', href: '/teacher/assignments', icon: ClipboardList },
      { label: '教材中心', href: '/teacher/materials', icon: Upload },
      { label: 'AI 批改覆核', href: '/teacher/review', icon: ClipboardCheck },
    ],
  },
  {
    title: '報告與設定',
    items: [
      { label: '報告匯出', href: '/teacher/reports', icon: BarChart3 },
      { label: '系統設定', href: '/teacher/settings', icon: Settings },
      { label: '個人檔案', href: '/teacher/profile', icon: User },
    ],
  },
];

// 教師端 header 導航（快捷）
export const teacherQuickLinks: NavItem[] = [
  { label: '搜尋', href: '#', icon: Search },
];

// ========================================
// 技能中文標籤
// ========================================
export const skillLabels: Record<string, string> = {
  'grammar': '文法',
  'vocabulary': '詞彙',
  'reading': '閱讀',
  'writing': '寫作',
  'error-correction': '改錯',
  // 課程對應文法項目 (ELE KLACG 2017)
  'tenses': '時態',
  'conditionals': '條件句',
  'passive-voice': '被動語態',
  'reported-speech': '轉述句',
  'relative-clauses': '關係子句',
  'modals': '情態動詞',
  'articles': '冠詞',
  'prepositions': '介詞',
  'connectives': '連接詞',
  'gerunds-infinitives': '動名詞與不定詞',
  'subject-verb-agreement': '主謂一致',
  'comparatives-superlatives': '比較級與最高級',
  'question-forms': '疑問句',
  'negation': '否定句',
  'phrasal-verbs': '片語動詞',
  'adjectives-adverbs': '形容詞與副詞',
  'pronouns': '代名詞',
  'quantifiers': '數量詞',
  'participles': '分詞',
  'inversion': '倒裝句',
  'noun-clauses': '名詞子句',
  'participle-phrases': '分詞短語',
  // 語言技能
  'listening': '聆聽',
  'speaking': '說話',
  // 課程範疇
  'interpersonal': '人際',
  'knowledge': '知識',
  'experience': '經驗',
};

export const difficultyLabels: Record<string, string> = {
  'remedial': '補底',
  'core': '核心',
  'challenge': '挑戰',
};

export const gradeLabels: Record<string, string> = {
  'S1': '中一',
  'S2': '中二',
  'S3': '中三',
  'S4': '中四',
  'S5': '中五',
  'S6': '中六',
};

export const statusLabels: Record<string, string> = {
  'not-started': '未開始',
  'in-progress': '進行中',
  'completed': '已完成',
  'overdue': '已逾期',
  'pending': '待覆核',
  'reviewed': '已覆核',
  'returned': '已退回',
};
