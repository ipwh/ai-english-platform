// ============================================
// 教師端 — 設定頁面
// 進階 AI 設定收納於 AdvancedSettings 摺疊面板
// ============================================
'use client';

import { useState, useEffect } from 'react';
import { Save, Bell, Shield, BookOpen, Users, Sparkles, Loader2, CheckCircle, XCircle, User } from 'lucide-react';
import { logger } from '@/shared/logger/logger';
import AdvancedSettings from '@/components/shared/AdvancedSettings';
import { GRAMMAR_ITEM_LABELS } from '@/shared/types/types';
import { gradeLabels } from '@/shared/utils/nav';
import { useT } from '@/hooks/use-i18n';

const SETTINGS_KEY = 'teacher-settings';

function loadLocalSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveLocalSettings(data: Record<string, unknown>) {
  try {
    const existing = loadLocalSettings();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...existing, ...data }));
  } catch { /* ignore */ }
}

export default function TeacherSettingsPage() {
  const { t, language } = useT();
  const lang = language || 'zh';
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiStatus, setAiStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [classes, setClasses] = useState<{ id: string; name: string; gradeLevel: string }[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<string[]>(['S4', 'S5']);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  // Custom groups
  const [customGroups, setCustomGroups] = useState<{ id: string; name: string; description: string; memberCount: number }[]>([]);
  // Teacher profile info
  const [teacherProfile, setTeacherProfile] = useState<{
    subjects?: string; department?: string; formTeacherOf?: string; taughtClasses?: { name: string; isFormTeacher: boolean }[];
  } | null>(null);
  // Local settings
  const [grammarEnabled, setGrammarEnabled] = useState<Record<string, boolean>>({});
  const [passScore, setPassScore] = useState(50);
  const [masteryThreshold, setMasteryThreshold] = useState(80);
  const [notifSubmission, setNotifSubmission] = useState(true);
  const [notifLowCompletion, setNotifLowCompletion] = useState(true);
  const [notifInactive, setNotifInactive] = useState(false);
  const [notifMaintenance, setNotifMaintenance] = useState(false);
  const [adaptiveDifficulty, setAdaptiveDifficulty] = useState('on');
  const [hintLevelCap, setHintLevelCap] = useState('4');
  const [dataRetention, setDataRetention] = useState('forever');

  useEffect(() => {
    fetch('/api/ai/status')
      .then(r => r.json())
      .then(d => setAiStatus(d.configured ? 'connected' : 'disconnected'))
      .catch(() => setAiStatus('disconnected'));
    fetch('/api/classes')
      .then(r => r.json())
      .then(d => setClasses(d.classes || []))
      .catch((e) => { logger.error({ module: 'teacher-settings', error: e instanceof Error ? e.message : String(e) }, 'Failed to load classes for settings'); });
    fetch('/api/auth/settings')
      .then(r => r.json())
      .then(d => {
        if (d.settings?.classIds) setSelectedClassIds(d.settings.classIds);
        if (d.profile) setTeacherProfile(d.profile);
      })
      .catch((e) => { logger.error({ module: 'teacher-settings', error: e instanceof Error ? e.message : String(e) }, 'Failed to load auth settings'); });
    fetch('/api/groups')
      .then(r => r.json())
      .then(d => setCustomGroups(d.groups || []))
      .catch((e) => { logger.error({ module: 'teacher-settings', error: e instanceof Error ? e.message : String(e) }, 'Failed to load groups'); });

    // Load local settings
    const local = loadLocalSettings();
    if (local.selectedGrades) setSelectedGrades(local.selectedGrades);
    if (local.grammarEnabled) setGrammarEnabled(local.grammarEnabled);
    if (local.passScore) setPassScore(local.passScore);
    if (local.masteryThreshold) setMasteryThreshold(local.masteryThreshold);
    if (local.notifSubmission !== undefined) setNotifSubmission(local.notifSubmission);
    if (local.notifLowCompletion !== undefined) setNotifLowCompletion(local.notifLowCompletion);
    if (local.notifInactive !== undefined) setNotifInactive(local.notifInactive);
    if (local.notifMaintenance !== undefined) setNotifMaintenance(local.notifMaintenance);
  }, []);

  const toggleClass = (id: string) => {
    setSelectedClassIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const toggleGrammar = (key: string) => {
    setGrammarEnabled(prev => {
      const next = { ...prev, [key]: !prev[key] };
      saveLocalSettings({ grammarEnabled: next });
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save all settings to DB
      const res = await fetch('/api/auth/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classIds: selectedClassIds,
          selectedGrades,
          grammarEnabled,
          passScore,
          masteryThreshold,
          notifSubmission,
          notifLowCompletion,
          notifInactive,
          notifMaintenance,
          adaptiveDifficulty,
          hintLevelCap,
          dataRetention,
        }),
      });

      // Also persist to localStorage as fallback
      saveLocalSettings({
        selectedGrades,
        grammarEnabled,
        passScore,
        masteryThreshold,
        notifSubmission,
        notifLowCompletion,
        notifInactive,
        notifMaintenance,
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('teacher.settings.title')}</h1>

      {/* 教師個人資料 */}
      {teacherProfile && (
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-500" /> {t('teacher.settings.profile')}
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {teacherProfile.department && (
              <div>
                <span className="text-xs text-gray-400 block">{t('teacher.settings.department')}</span>
                <span className="text-gray-700 dark:text-gray-300">{teacherProfile.department}</span>
              </div>
            )}
            {teacherProfile.subjects && (
              <div>
                <span className="text-xs text-gray-400 block">{t('teacher.settings.subjects')}</span>
                <span className="text-gray-700 dark:text-gray-300">
                  {(() => { try { return JSON.parse(teacherProfile.subjects).join('、'); } catch { return teacherProfile.subjects; } })()}
                </span>
              </div>
            )}
            {teacherProfile.formTeacherOf && (
              <div>
                <span className="text-xs text-gray-400 block">{t('teacher.settings.formClass')}</span>
                <span className="text-gray-700 dark:text-gray-300 font-medium">{teacherProfile.formTeacherOf}</span>
              </div>
            )}
            {teacherProfile.taughtClasses && teacherProfile.taughtClasses.length > 0 && (
              <div className="col-span-2">
                <span className="text-xs text-gray-400 block">{t('teacher.settings.teachingClasses')}</span>
                <div className="flex gap-2 flex-wrap mt-1">
                  {teacherProfile.taughtClasses.map((tc, i) => (
                    <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${tc.isFormTeacher ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                      {tc.name}{tc.isFormTeacher ? ' (班主任)' : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 年級與班別設定 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-500" /> {t('teacher.settings.gradeClassSettings')}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t('teacher.settings.teachingGrades')}</label>
            <div className="flex gap-2 flex-wrap">
              {['S1','S2','S3','S4','S5','S6'].map(g => (
                <label key={g} className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="checkbox" checked={selectedGrades.includes(g)} onChange={() => setSelectedGrades(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])} className="rounded" /> {lang === 'en' ? g : gradeLabels[g] || g}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t('teacher.settings.teachingClasses')}</label>
            <div className="flex gap-2 flex-wrap">
              {classes.length > 0 ? classes.map(c => (
                <label key={c.id} className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="checkbox" checked={selectedClassIds.includes(c.id)} onChange={() => toggleClass(c.id)} className="rounded" /> {c.name}
                </label>
              )) : (
                <span className="text-xs text-gray-400">{t('generic.loading')}</span>
              )}
            </div>
          </div>
          {/* 自訂組別概覽 */}
          {customGroups.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">{t('teacher.settings.customGroups')}</label>
              <div className="flex gap-2 flex-wrap">
                {customGroups.map(g => (
                  <span key={g.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium">
                    <Users className="w-3 h-3" />
                    {g.name}
                    <span className="text-blue-400 dark:text-blue-500">({g.memberCount}人)</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 文法項目啟用設定 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-green-500" /> {t('teacher.settings.grammarSettings')}
        </h2>
        <p className="text-xs text-gray-500 mb-3">{t('teacher.settings.grammarHint')}</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(GRAMMAR_ITEM_LABELS).map(([key, val]) => (
            <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={grammarEnabled[key] !== false} onChange={() => toggleGrammar(key)} className="rounded" /> {lang === 'en' ? val.en : val.zh}
            </label>
          ))}
        </div>
      </section>

      {/* 評分規則設定 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-orange-500" /> {t('teacher.settings.gradingSettings')}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t('teacher.settings.passScore')}</label>
            <input type="number" value={passScore} onChange={e => setPassScore(Number(e.target.value))} className="w-24 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t('teacher.settings.masteryThreshold')}</label>
            <input type="number" value={masteryThreshold} onChange={e => setMasteryThreshold(Number(e.target.value))} className="w-24 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none" />
          </div>
        </div>
      </section>

      {/* 進階 AI 服務設定 */}
      <AdvancedSettings title={t('teacher.settings.advancedAi')}>
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <Sparkles className="w-5 h-5 text-purple-500" />
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('teacher.settings.aiStatus')}</p>
              <p className="text-xs">
                {aiStatus === 'checking' && <span className="text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> {t('teacher.settings.checking')}</span>}
                {aiStatus === 'connected' && <span className="text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {t('teacher.settings.deepseekConnected')}</span>}
                {aiStatus === 'disconnected' && <span className="text-red-500 flex items-center gap-1"><XCircle className="w-3 h-3" /> {t('teacher.settings.deepseekDisconnected')}</span>}
              </p>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t('teacher.settings.aiModel')}</label>
            <input type="text" value="DeepSeek V4 Flash (deepseek-v4-flash)" readOnly className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-sm text-gray-600 dark:text-gray-400 outline-none cursor-not-allowed" />
            <p className="text-[10px] text-gray-400 mt-1">{t('teacher.settings.aiModelNote')}</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t('teacher.settings.adaptiveDifficulty')}</label>
            <select value={adaptiveDifficulty} onChange={e => setAdaptiveDifficulty(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
              <option value="on">{t('teacher.settings.adaptiveOn')}</option>
              <option value="off">{t('teacher.settings.adaptiveOff')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t('teacher.settings.hintLevelCap')}</label>
            <select value={hintLevelCap} onChange={e => setHintLevelCap(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm outline-none">
              <option value="4">{t('teacher.settings.hint4')}</option>
              <option value="3">{t('teacher.settings.hint3')}</option>
              <option value="2">{t('teacher.settings.hint2')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t('teacher.settings.apiKeyStatus')}</label>
            <input
              type="text"
              value={aiStatus === 'connected' ? t('teacher.settings.apiKeySet') : t('teacher.settings.apiKeyNotSet')}
              readOnly
              className={`w-full px-3 py-2 border rounded-lg text-sm outline-none cursor-not-allowed ${
                aiStatus === 'connected'
                  ? 'border-green-300 bg-green-50 dark:bg-green-900/20 text-green-700'
                  : 'border-red-300 bg-red-50 dark:bg-red-900/20 text-red-600'
              }`}
            />
            <p className="text-[10px] text-gray-400 mt-1">
              {aiStatus === 'connected' ? t('teacher.settings.apiKeySetNote') : t('teacher.settings.apiKeyNotSetNote')}
            </p>
          </div>
        </div>
      </AdvancedSettings>

      {/* 通知設定 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Bell className="w-5 h-5 text-purple-500" /> {t('teacher.settings.notifications')}
        </h2>
        <div className="space-y-2">
          {[
            { label: t('teacher.settings.notifSubmission'), checked: notifSubmission, setter: setNotifSubmission },
            { label: t('teacher.settings.notifLowCompletion'), checked: notifLowCompletion, setter: setNotifLowCompletion },
            { label: t('teacher.settings.notifInactive'), checked: notifInactive, setter: setNotifInactive },
            { label: t('teacher.settings.notifMaintenance'), checked: notifMaintenance, setter: setNotifMaintenance },
          ].map(n => (
            <label key={n.label} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={n.checked} onChange={e => n.setter(e.target.checked)} className="rounded" /> {n.label}
            </label>
          ))}
        </div>
      </section>

      {/* 私隱與資料保存 */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-gray-500" /> {t('teacher.settings.privacy')}
        </h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">{t('teacher.settings.dataRetention')}</span>
            <select
              value={dataRetention}
              onChange={e => setDataRetention(e.target.value)}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-xs outline-none"
            >
              <option value="forever">{t('teacher.settings.retentionForever')}</option>
              <option value="3years">{t('teacher.settings.retention3Years')}</option>
              <option value="1year">{t('teacher.settings.retention1Year')}</option>
            </select>
          </div>
          <p className="text-xs text-gray-400">{t('teacher.settings.privacyNote')}</p>
        </div>
      </section>

      <button onClick={handleSave} disabled={saving}
        className="w-full py-3 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors">
        {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('generic.saving')}</> :
         saved ? <><CheckCircle className="w-4 h-4" /> {t('generic.saved')}</> :
         <><Save className="w-4 h-4" /> {t('teacher.settings.saveSettings')}</>}
      </button>
    </div>
  );
}
