// Student Profile
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Mail, Save, X, GraduationCap } from 'lucide-react';
import { logger } from '@/shared/logger/logger';
import { useAppStore } from '@/store/appStore';
import { useT } from '@/hooks/use-i18n';
import { formatDate } from '@/shared/utils/utils';
import { gradeLabels, getGradeLabel } from '@/shared/utils/nav';

interface UserProfile {
  id: string; email: string; nameZh?: string | null; nameEn?: string | null;
  role: string; level?: string | null; classId?: string | null;
  class?: { name?: string | null; gradeLevel?: string | null } | null;
  academicYear?: string | null; image?: string | null; joinedAt?: string | null;
}

export default function StudentProfilePage() {
  const router = useRouter();
  const { t } = useT();
  const { logout, userDisplayName, language } = useAppStore();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ nameZh: '', nameEn: '', level: '' });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    fetch('/api/auth/profile').then(r => r.json()).then(d => {
      if (d.user) {
        setProfile(d.user);
        setForm({
          nameZh: d.user.nameZh || '',
          nameEn: d.user.nameEn || '',
          level: d.user.level || d.user.class?.gradeLevel || '',
        });
      }
    }).catch((e) => { logger.error({ module: 'student-profile', error: e instanceof Error ? e.message : String(e) }, 'Failed to load student profile'); });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/auth/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (res.ok) {
        const d = await res.json();
        setProfile((p) => ({ ...(p ?? {}), ...(d.user as Partial<UserProfile>) } as UserProfile));
        setEditing(false);
        setSaveMsg(t('profile.saveSuccess'));
      } else {
        const err = await res.json().catch(() => ({ error: t('profile.saveFailed') }));
        setSaveMsg(err.error || t('profile.saveFailed'));
      }
    } catch {
      setSaveMsg(t('profile.networkError'));
    }
    setSaving(false);
  };

  const handleLogout = () => { logout(); router.push('/login'); };
  const displayName = profile?.nameZh || userDisplayName || t('common.studentFallback');

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('profile.student')}</h1>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border text-center">
        <div className="w-20 h-20 bg-teal-100 dark:bg-teal-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl font-bold text-teal-600 dark:text-teal-300">{displayName.charAt(0)}</span>
        </div>
        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1 text-left">{t('profile.chineseName')}</label>
              <input value={form.nameZh} onChange={e => setForm({ ...form, nameZh: e.target.value })} placeholder={t('profile.chineseName')} className="w-full max-w-[12rem] px-3 py-2 border rounded-lg text-center text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 text-left">{t('profile.englishName')}</label>
              <input value={form.nameEn} onChange={e => setForm({ ...form, nameEn: e.target.value })} placeholder={t('profile.englishNamePlaceholder')} className="w-full max-w-[12rem] px-3 py-2 border rounded-lg text-center text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 text-left flex items-center gap-1"><GraduationCap className="w-3 h-3" /> {t('profile.grade')}</label>
              <select
                value={form.level}
                onChange={e => setForm({ ...form, level: e.target.value })}
                className="w-full max-w-[12rem] px-3 py-2 border rounded-lg text-center text-sm bg-white dark:bg-gray-700"
              >
                <option value="">{t('profile.notSet')}</option>
                {Object.keys(gradeLabels).map(k => <option key={k} value={k}>{getGradeLabel(k, language)}</option>)}
              </select>
            </div>
            {saveMsg && <p className={`text-xs ${saveMsg === t('profile.saveSuccess') ? 'text-green-600' : 'text-red-500'}`}>{saveMsg}</p>}
            <div className="flex justify-center gap-2">
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-teal-500 text-white rounded-lg text-sm flex items-center gap-1"><Save className="w-4 h-4" /> {saving ? t('profile.saving') : t('profile.save')}</button>
              <button onClick={() => { setEditing(false); setSaveMsg(''); }} className="px-4 py-2 bg-gray-200 rounded-lg text-sm flex items-center gap-1"><X className="w-4 h-4" /> {t('profile.cancel')}</button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{displayName}</h2>
            <p className="text-sm text-gray-500 mt-1 flex items-center justify-center gap-1"><Mail className="w-4 h-4" /> {profile?.email || ''}</p>
            <p className="text-xs text-gray-400 mt-1">{t('profile.classAndLevelShort').replace('{class}', profile?.class?.name || t('generic.notAvailable')).replace('{level}', profile?.level || t('generic.notAvailable'))}</p>
            <p className="text-xs text-gray-400">{t('profile.joinedOn').replace('{date}', profile?.joinedAt ? formatDate(profile.joinedAt) : '')}</p>
            <button onClick={() => setEditing(true)} className="mt-4 px-4 py-2 bg-teal-50 dark:bg-teal-900/20 text-teal-600 rounded-lg text-sm">{t('profile.editProfile')}</button>
          </>
        )}
      </div>
      <button onClick={handleLogout} className="w-full py-3 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-xl font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-2"><LogOut className="w-4 h-4" /> {t('profile.logoutBtn')}</button>
      <button onClick={() => router.push('/role-select')} className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 rounded-xl font-medium">{t('profile.switchRoleBtn')}</button>
    </div>
  );
}
