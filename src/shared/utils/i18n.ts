// ============================================
// i18n — 繁體中文 / English 翻譯系統（純函數，無 React 依賴）
// 用法: import { t } from '@/shared/utils/i18n'; t('nav.dashboard')
//       import { useT } from '@/hooks/use-i18n'; // Client Component 用（響應式）
// ============================================
// 翻譯已按功能模組拆分至 i18n-*.ts 檔案，此處聚合所有翻譯
import { navTranslations } from './i18n-nav';
import { isTranslations } from './i18n-is';
import { groupsTranslations } from './i18n-groups';
import { notifTranslations } from './i18n-notifications';
import { teacherTranslations } from './i18n-teacher';
import { commonTranslations } from './i18n-common';
import { loginTranslations } from './i18n-login';
import { roleTranslations } from './i18n-role';
import { practiceTranslations } from './i18n-practice';
import { writingTranslations } from './i18n-writing';
import { vocabTranslations } from './i18n-vocab';
import { studentTranslations } from './i18n-student';
import { progressTranslations } from './i18n-progress';


import { mistakesTranslations } from './i18n-mistakes';
import { gamificationTranslations } from './i18n-gamification';
import { adminTranslations } from './i18n-admin';

const translations: Record<string, { zh: string; en: string }> = {
  // 模組化翻譯（來自 i18n-*.ts 拆分檔）
  ...navTranslations,
  ...teacherTranslations,
  ...commonTranslations,
  ...loginTranslations,
  ...roleTranslations,
  ...studentTranslations,
  ...writingTranslations,
  ...practiceTranslations,
  ...mistakesTranslations,
  ...vocabTranslations,
  ...progressTranslations,
  ...gamificationTranslations,
  ...adminTranslations,
};

export function t(key: string, lang?: string, params?: Record<string, string | number>): string {
  if (!key) return '';
  const entry = translations[key];
  if (!entry) return key;
  let text = lang === 'en' ? entry.en : entry.zh;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}
