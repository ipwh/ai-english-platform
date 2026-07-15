// ============================================
// 學生端 — 通知設定
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { Bell, BookOpen, MessageSquare, Trophy, Megaphone, Loader2, Check } from 'lucide-react';
import { useT } from '@/hooks/use-i18n';

const NOTIF_TYPES = [
  { key: 'assignment', icon: BookOpen, zh: '作業通知', en: 'Assignments', descZh: '新作業指派與截止提醒', descEn: 'New assignments and due reminders' },
  { key: 'feedback', icon: MessageSquare, zh: '批改通知', en: 'Feedback', descZh: '寫作批改完成與教師回饋', descEn: 'Writing feedback and teacher comments' },
  { key: 'achievement', icon: Trophy, zh: '成就通知', en: 'Achievements', descZh: '徽章解鎖與里程碑', descEn: 'Badge unlocks and milestones' },
  { key: 'system', icon: Megaphone, zh: '系統公告', en: 'Announcements', descZh: '平台公告與重要提醒', descEn: 'Platform announcements' },
];

const STORAGE_KEY = 'notif-settings';

export default function NotificationSettingsPage() {
  const { t, language } = useT();
  const [settings, setSettings] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setSettings(JSON.parse(raw));
      } else {
        // Default: all enabled
        setSettings({ assignment: true, feedback: true, achievement: true, system: true });
      }
    } catch {
      setSettings({ assignment: true, feedback: true, achievement: true, system: true });
    }
  }, []);

  const toggle = (key: string) => {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Bell className="w-6 h-6 text-purple-500" /> {t('notifications.title')}
        </h1>
        {saved && <span className="text-xs text-green-500 flex items-center gap-1"><Check className="w-3 h-3" />{t('notifications.saved')}</span>}
      </div>

      <p className="text-sm text-gray-500">{t('notifications.description')}</p>

      <div className="space-y-3">
        {NOTIF_TYPES.map(nt => {
          const Icon = nt.icon;
          const enabled = settings[nt.key] !== false;
          return (
            <div
              key={nt.key}
              className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border transition-colors cursor-pointer ${
                enabled ? 'border-purple-200 dark:border-purple-800' : 'border-gray-100 dark:border-gray-700 opacity-60'
              }`}
              onClick={() => toggle(nt.key)}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  enabled ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-white text-sm">
                    {language === 'en' ? nt.en : nt.zh}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {language === 'en' ? nt.descEn : nt.descZh}
                  </p>
                </div>
                <div className={`w-10 h-6 rounded-full transition-colors flex items-center ${enabled ? 'bg-purple-500' : 'bg-gray-300'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
