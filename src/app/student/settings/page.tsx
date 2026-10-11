// ============================================
// 學生端 — 偏好設定（語言 / 主題 / 通知）
// 修改即時同步 localStorage + 後端，支援跨裝置一致
// ============================================
'use client';

import { useState, useEffect } from 'react';
import {
  Globe, Moon, Sun, Bell, BookOpen, Send, MessageSquare,
  Trophy, Megaphone, Check, Smartphone, Monitor,
} from 'lucide-react';
import { useT } from '@/hooks/use-i18n';
import { useAppStore } from '@/store/appStore';

const NOTIF_TYPES = [
  { key: 'assignment', icon: BookOpen, zh: '作業通知', en: 'Assignments', descZh: '新作業指派與截止提醒', descEn: 'New assignments and due reminders' },
  { key: 'submission', icon: Send, zh: '提交通知', en: 'Submissions', descZh: '練習/寫作提交完成確認', descEn: 'Practice and writing submission confirmations' },
  { key: 'feedback', icon: MessageSquare, zh: '批改通知', en: 'Feedback', descZh: '寫作批改完成與教師回饋', descEn: 'Writing feedback and teacher comments' },
  { key: 'achievement', icon: Trophy, zh: '成就通知', en: 'Achievements', descZh: '徽章解鎖與里程碑', descEn: 'Badge unlocks and milestones' },
  { key: 'system', icon: Megaphone, zh: '系統公告', en: 'Announcements', descZh: '平台公告與重要提醒', descEn: 'Platform announcements' },
];

const STORAGE_KEY = 'notif-settings';

export default function StudentSettingsPage() {
  const { language } = useT();
  const store = useAppStore();

  // ── Notification state (localStorage-synced) ──
  const [notifSettings, setNotifSettings] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Deferred to a microtask: seeding state from localStorage inside the effect body
    // would be a synchronous setState during commit (react-hooks/set-state-in-effect).
    void Promise.resolve().then(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          setNotifSettings(JSON.parse(raw));
        } else {
          setNotifSettings({ assignment: true, submission: true, feedback: true, achievement: true, system: true });
        }
      } catch {
        setNotifSettings({ assignment: true, submission: true, feedback: true, achievement: true, system: true });
      }
    });
  }, []);

  const toggleNotif = (key: string) => {
    const next = { ...notifSettings, [key]: !notifSettings[key] };
    setNotifSettings(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    store.syncPreferencesToServer();
  };

  // ── Language toggle ──
  const toggleLang = () => {
    store.toggleLanguage();
    flashSaved();
  };

  // ── Theme toggle ──
  const toggleTheme = () => {
    store.toggleDarkMode();
    flashSaved();
  };

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {language === 'en' ? 'Settings' : '偏好設定'}
        </h1>
        {saved && (
          <span className="text-xs text-green-500 flex items-center gap-1 animate-in fade-in">
            <Check className="w-3 h-3" />
            {language === 'en' ? 'Saved' : '已儲存'}
          </span>
        )}
      </div>

      {/* ── Section 1: Language ── */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-5">
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <Globe className="w-5 h-5 text-teal-500" />
            {language === 'en' ? 'Language' : '語言'}
          </h2>
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
            <div>
              <p className="font-medium text-gray-900 dark:text-white text-sm">
                {language === 'en' ? 'Interface Language' : '界面語言'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {language === 'en'
                  ? 'Toggle between English and Traditional Chinese'
                  : '切換英文及繁體中文界面'}
              </p>
            </div>
            <button
              onClick={toggleLang}
              className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {language === 'zh' ? 'English' : '中文'}
            </button>
          </div>
        </div>
      </section>

      {/* ── Section 2: Theme ── */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-5">
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            {store.isDarkMode ? (
              <Moon className="w-5 h-5 text-indigo-500" />
            ) : (
              <Sun className="w-5 h-5 text-amber-500" />
            )}
            {language === 'en' ? 'Appearance' : '外觀'}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { if (store.isDarkMode) toggleTheme(); }}
              className={`p-4 rounded-xl border-2 transition-all text-left ${
                !store.isDarkMode
                  ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
              }`}
            >
              <Sun className={`w-6 h-6 mb-2 ${!store.isDarkMode ? 'text-teal-500' : 'text-gray-400'}`} />
              <p className={`text-sm font-medium ${!store.isDarkMode ? 'text-teal-700 dark:text-teal-300' : 'text-gray-600 dark:text-gray-400'}`}>
                {language === 'en' ? 'Light' : '淺色'}
              </p>
              <Monitor className={`w-4 h-4 mt-1 ${!store.isDarkMode ? 'text-teal-400' : 'text-gray-400'}`} />
            </button>
            <button
              onClick={() => { if (!store.isDarkMode) toggleTheme(); }}
              className={`p-4 rounded-xl border-2 transition-all text-left ${
                store.isDarkMode
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
              }`}
            >
              <Moon className={`w-6 h-6 mb-2 ${store.isDarkMode ? 'text-indigo-500' : 'text-gray-400'}`} />
              <p className={`text-sm font-medium ${store.isDarkMode ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400'}`}>
                {language === 'en' ? 'Dark' : '深色'}
              </p>
              <Smartphone className={`w-4 h-4 mt-1 ${store.isDarkMode ? 'text-indigo-400' : 'text-gray-400'}`} />
            </button>
          </div>
        </div>
      </section>

      {/* ── Section 3: Notifications ── */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-5">
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
            <Bell className="w-5 h-5 text-purple-500" />
            {language === 'en' ? 'Notifications' : '通知設定'}
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            {language === 'en'
              ? 'Changes sync across all your devices'
              : '設定會自動同步到所有裝置'}
          </p>

          <div className="space-y-3">
            {NOTIF_TYPES.map(nt => {
              const Icon = nt.icon;
              const enabled = notifSettings[nt.key] !== false;
              return (
                <div
                  key={nt.key}
                  className={`p-4 rounded-xl border transition-colors cursor-pointer ${
                    enabled
                      ? 'border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10'
                      : 'border-gray-100 dark:border-gray-700 opacity-60'
                  }`}
                  onClick={() => toggleNotif(nt.key)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      enabled ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        {language === 'en' ? nt.en : nt.zh}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {language === 'en' ? nt.descEn : nt.descZh}
                      </p>
                    </div>
                    <div className={`w-11 h-6 rounded-full transition-colors flex items-center shrink-0 ${
                      enabled ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}>
                      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        enabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Cross-device sync info ── */}
      <div className="bg-teal-50 dark:bg-teal-900/10 rounded-xl p-4 border border-teal-100 dark:border-teal-800 text-center">
        <p className="text-xs text-teal-700 dark:text-teal-400 flex items-center justify-center gap-1.5">
          <Smartphone className="w-3.5 h-3.5" />
          {language === 'en'
            ? 'Settings automatically sync across desktop, tablet & phone'
            : '設定自動在桌面、平板及手機間同步'}
          <Monitor className="w-3.5 h-3.5" />
        </p>
      </div>
    </div>
  );
}
