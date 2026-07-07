// Student Profile
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Mail, Save, X } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { formatDate } from '@/lib/utils';

export default function StudentProfilePage() {
  const router = useRouter();
  const { logout, userDisplayName } = useAppStore();
  const [profile, setProfile] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ nameZh: '', nameEn: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/auth/profile').then(r => r.json()).then(d => {
      if (d.user) { setProfile(d.user); setForm({ nameZh: d.user.nameZh || '', nameEn: d.user.nameEn || '' }); }
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch('/api/auth/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (res.ok) { const d = await res.json(); setProfile((p: any) => ({ ...p, ...d.user })); setEditing(false); }
    setSaving(false);
  };

  const handleLogout = () => { logout(); router.push('/login'); };
  const displayName = profile?.nameZh || userDisplayName || 'Student';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Profile</h1>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border text-center">
        <div className="w-20 h-20 bg-teal-100 dark:bg-teal-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl font-bold text-teal-600 dark:text-teal-300">{displayName.charAt(0)}</span>
        </div>
        {editing ? (
          <div className="space-y-3">
            <input value={form.nameZh} onChange={e => setForm({ ...form, nameZh: e.target.value })} placeholder="Chinese Name" className="w-48 px-3 py-2 border rounded-lg text-center text-sm" />
            <input value={form.nameEn} onChange={e => setForm({ ...form, nameEn: e.target.value })} placeholder="English Name" className="w-48 px-3 py-2 border rounded-lg text-center text-sm" />
            <div className="flex justify-center gap-2">
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-teal-500 text-white rounded-lg text-sm flex items-center gap-1"><Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}</button>
              <button onClick={() => setEditing(false)} className="px-4 py-2 bg-gray-200 rounded-lg text-sm flex items-center gap-1"><X className="w-4 h-4" /> Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{displayName}</h2>
            <p className="text-sm text-gray-500 mt-1 flex items-center justify-center gap-1"><Mail className="w-4 h-4" /> {profile?.email || ''}</p>
            <p className="text-xs text-gray-400 mt-1">Class: {profile?.class?.name || 'N/A'} | Level: {profile?.level || 'N/A'}</p>
            <p className="text-xs text-gray-400">Joined: {profile?.joinedAt ? formatDate(profile.joinedAt) : ''}</p>
            <button onClick={() => setEditing(true)} className="mt-4 px-4 py-2 bg-teal-50 dark:bg-teal-900/20 text-teal-600 rounded-lg text-sm">Edit Profile</button>
          </>
        )}
      </div>
      <button onClick={handleLogout} className="w-full py-3 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-xl font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-2"><LogOut className="w-4 h-4" /> Logout</button>
      <button onClick={() => router.push('/role-select')} className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 rounded-xl font-medium">Switch Role</button>
    </div>
  );
}
