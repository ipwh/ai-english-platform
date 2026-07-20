// ============================================
// 導航配置 — AI 英語學習平台
// ============================================

import {
  LayoutDashboard, BookOpen, AlertTriangle, BookMarked,
  TrendingUp, PencilLine, ClipboardList, HelpCircle,
  User, Users, GraduationCap, Upload,
  ClipboardCheck, BarChart3, Settings, Search, Headphones,
  Mic, Calendar, BookText,
  type LucideIcon
} from 'lucide-react';
import { t } from '@/shared/utils/i18n';

export interface NavItem {
  label: string;
  i18nKey: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

export interface NavSection {
  title?: string;
  titleKey?: string;
  items: NavItem[];
}

// Helper: 根據語言獲取標籤
export function getNavLabel(item: NavItem, lang: string): string {
  return t(item.i18nKey, lang);
}

export function getSectionTitle(section: NavSection, lang: string): string | undefined {
  if (!section.titleKey) return section.title;
  return t(section.titleKey, lang);
}

// ========================================
// 學生端導航
// ========================================
export const studentNavItems: NavItem[] = [
  { label: '學習主頁', i18nKey: 'nav.dashboard', href: '/student/dashboard', icon: LayoutDashboard },
  { label: '每日挑戰', i18nKey: 'nav.dailyChallenge', href: '/student/daily-challenge', icon: Calendar },
  { label: 'AI 練習', i18nKey: 'nav.practice', href: '/student/practice', icon: BookOpen },
  { label: '📖 DSE 閱讀模擬', i18nKey: 'nav.reading', href: '/student/reading', icon: BookText },
  { label: '會話練習', i18nKey: 'nav.speaking', href: '/student/speaking', icon: Mic },
  { label: '寫作支援', i18nKey: 'nav.writing', href: '/student/writing', icon: PencilLine },
  { label: 'Integrated Skills', i18nKey: 'nav.integratedSkills', href: '/student/integrated-skills', icon: Headphones },
  { label: '生字簿', i18nKey: 'nav.vocabulary', href: '/student/vocabulary', icon: BookMarked },
  { label: '我的錯題', i18nKey: 'nav.mistakes', href: '/student/mistakes', icon: AlertTriangle },
  { label: '我的進度', i18nKey: 'nav.progress', href: '/student/progress', icon: TrendingUp },
  { label: '我的作業', i18nKey: 'nav.assignments', href: '/student/assignments', icon: ClipboardList },
  { label: '診斷測驗', i18nKey: 'nav.diagnostic', href: '/student/diagnostic', icon: Search },
  { label: '求助建議', i18nKey: 'nav.help', href: '/student/help', icon: HelpCircle },
  { label: '個人檔案', i18nKey: 'nav.profile', href: '/student/profile', icon: User },
];

export const studentTabItems: NavItem[] = [
  { label: '主頁', i18nKey: 'nav.home', href: '/student/dashboard', icon: LayoutDashboard },
  { label: '練習', i18nKey: 'nav.practice_short', href: '/student/practice', icon: BookOpen },
  { label: '錯題', i18nKey: 'nav.mistakes_short', href: '/student/mistakes', icon: AlertTriangle },
  { label: '進度', i18nKey: 'nav.progress_short', href: '/student/progress', icon: TrendingUp },
  { label: '更多', i18nKey: 'nav.more', href: '/student/profile', icon: User },
];

// ========================================
// 教師端導航
// ========================================
export const teacherNavSections: NavSection[] = [
  {
    title: '總覽', titleKey: 'teacher.overview',
    items: [
      { label: '教師主頁', i18nKey: 'teacher.dashboard', href: '/teacher/dashboard', icon: LayoutDashboard },
      { label: '班級進度', i18nKey: 'teacher.classes', href: '/teacher/classes', icon: Users },
      { label: '學生分析', i18nKey: 'teacher.students', href: '/teacher/students', icon: GraduationCap },
    ],
  },
  {
    title: '教學工具', titleKey: 'teacher.management',
    items: [
      { label: '任務派發', i18nKey: 'teacher.assignments', href: '/teacher/assignments', icon: ClipboardList },
      { label: '教材中心', i18nKey: 'teacher.materials', href: '/teacher/materials', icon: Upload },
      { label: 'AI 批改覆核', i18nKey: 'teacher.review', href: '/teacher/review', icon: ClipboardCheck },
    ],
  },
  {
    title: '報告與設定', titleKey: 'teacher.reports_settings',
    items: [
      { label: '報告匯出', i18nKey: 'teacher.reports', href: '/teacher/reports', icon: BarChart3 },
      { label: '系統設定', i18nKey: 'teacher.settings', href: '/teacher/settings', icon: Settings },
      { label: '個人檔案', i18nKey: 'nav.profile', href: '/teacher/profile', icon: User },
    ],
  },
];

// ========================================
// 技能標籤（支援中英雙語）
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

export const skillLabelsEn: Record<string, string> = {
  'grammar': 'Grammar',
  'vocabulary': 'Vocabulary',
  'reading': 'Reading',
  'writing': 'Writing',
  'error-correction': 'Error Correction',
  'tenses': 'Tenses',
  'conditionals': 'Conditionals',
  'passive-voice': 'Passive Voice',
  'reported-speech': 'Reported Speech',
  'relative-clauses': 'Relative Clauses',
  'modals': 'Modals',
  'articles': 'Articles',
  'prepositions': 'Prepositions',
  'connectives': 'Connectives',
  'gerunds-infinitives': 'Gerunds & Infinitives',
  'subject-verb-agreement': 'Subject-Verb Agreement',
  'comparatives-superlatives': 'Comparatives & Superlatives',
  'question-forms': 'Question Forms',
  'negation': 'Negation',
  'phrasal-verbs': 'Phrasal Verbs',
  'adjectives-adverbs': 'Adjectives & Adverbs',
  'pronouns': 'Pronouns',
  'quantifiers': 'Quantifiers',
  'participles': 'Participles',
  'inversion': 'Inversion',
  'noun-clauses': 'Noun Clauses',
  'participle-phrases': 'Participle Phrases',
  'listening': 'Listening',
  'speaking': 'Speaking',
  'interpersonal': 'Interpersonal',
  'knowledge': 'Knowledge',
  'experience': 'Experience',
};

export function getSkillLabel(key: string, lang?: string): string {
  return lang === 'en' ? (skillLabelsEn[key] || key) : (skillLabels[key] || key);
}

export const difficultyLabels: Record<string, string> = {
  'remedial': '補底',
  'core': '核心',
  'challenge': '挑戰',
};

export function getDifficultyLabel(key: string, lang?: string): string {
  const en: Record<string, string> = { 'remedial': 'Remedial', 'core': 'Core', 'challenge': 'Challenge' };
  return lang === 'en' ? (en[key] || key) : (difficultyLabels[key] || key);
}

export const gradeLabels: Record<string, string> = {
  'S1': '中一',
  'S2': '中二',
  'S3': '中三',
  'S4': '中四',
  'S5': '中五',
  'S6': '中六',
};

export function getGradeLabel(key: string, lang?: string): string {
  const en: Record<string, string> = { 'S1': 'S1', 'S2': 'S2', 'S3': 'S3', 'S4': 'S4', 'S5': 'S5', 'S6': 'S6' };
  return lang === 'en' ? (en[key] || key) : (gradeLabels[key] || key);
}

export const statusLabels: Record<string, string> = {
  'not-started': '未開始',
  'in-progress': '進行中',
  'completed': '已完成',
  'overdue': '已逾期',
  'pending': '待覆核',
  'reviewed': '已覆核',
  'returned': '已退回',
};

export function getStatusLabel(key: string, lang?: string): string {
  const en: Record<string, string> = {
    'not-started': 'Not Started', 'in-progress': 'In Progress', 'completed': 'Completed',
    'overdue': 'Overdue', 'pending': 'Pending Review', 'reviewed': 'Reviewed', 'returned': 'Returned',
  };
  return lang === 'en' ? (en[key] || key) : (statusLabels[key] || key);
}
