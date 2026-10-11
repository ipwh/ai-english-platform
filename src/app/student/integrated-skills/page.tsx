// ============================================
// 學生端 — Integrated Skills (DSE Paper 3 Part B) v4
// 重構：步驟鎖定 · 自動儲存 · 雙維度批改 · 行動裝置友好
// ============================================
'use client';

import { useEffect } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { useIntegratedSkillsStore } from '@/store/integratedSkillsStore';
import { useT } from '@/hooks/use-i18n';
import IntegratedSkillsTaskView from '@/modules/assessment/components/IntegratedSkillsTaskView';
import { getGradeLabel, getDifficultyLabel } from '@/shared/utils/nav';

const TASK_TYPES = [
  { value: 'summary', zh: '摘要寫作', en: 'Summary' },
  { value: 'email-reply', zh: '電郵回覆', en: 'Email Reply' },
  { value: 'short-article', zh: '短文寫作', en: 'Short Article' },
  { value: 'report', zh: '報告寫作', en: 'Report' },
  { value: 'speech', zh: '演講辭', en: 'Speech' },
  { value: 'proposal', zh: '建議書', en: 'Proposal' },
  { value: 'notice', zh: '通告', en: 'Notice' },
  { value: 'press-release', zh: '新聞稿', en: 'Press Release' },
  { value: 'letter-to-editor', zh: '讀者投稿', en: 'Letter to Editor' },
] as const;

const DIFFICULTIES = [
  { value: 'remedial', zh: '補底', en: 'Remedial' },
  { value: 'core', zh: '核心', en: 'Core' },
  { value: 'challenge', zh: '挑戰', en: 'Challenge' },
] as const;

const GRADES = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] as const;

const DRAFT_KEY = 'integrated-skills-draft-v4';

export default function IntegratedSkillsPage() {
  const { t, language } = useT();
  const s = useIntegratedSkillsStore();

  useEffect(() => {
    let hasLocalDraft = false;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.savedAt && Date.now() - draft.savedAt < 24 * 60 * 60 * 1000) {
          hasLocalDraft = true;
          s.setConfig(draft.gradeLevel || 'S4', draft.difficulty || 'core', draft.taskType || 'summary');
          if (draft.studentNotes) s.setStudentNotes(draft.studentNotes);
          if (draft.studentWriting) s.setStudentWriting(draft.studentWriting);
        }
      }
    } catch { /* ignore */ }

    // 本地草稿失效/不存在時，從伺服器還原（跨裝置同步）；伺服器無草稿則從 profile 載入年級
    if (!hasLocalDraft) {
      s.loadDraft().then((restored) => {
        if (restored) return;
        fetch('/api/auth/profile')
          .then(r => r.json())
          .then(data => {
            const studentLevel = data?.user?.level || data?.user?.class?.gradeLevel;
            if (studentLevel && ['S1','S2','S3','S4','S5','S6'].includes(studentLevel)) {
              s.setConfig(studentLevel, s.difficulty, s.taskType);
            }
          })
          .catch(() => { /* silent */ });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only restore of the saved draft: the zustand store object is rebuilt on every edit, so depending on it would re-apply the draft and clobber the student's in-progress notes/writing.
  }, []);

  const handleGenerate = async () => {
    s.setLoading(true); s.setError('');
    try {
      const res = await fetch('/api/ai/generate-integrated-skills', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradeLevel: s.gradeLevel, difficulty: s.difficulty, taskType: s.taskType }),
      });
      const json = await res.json();
      if (res.ok && json.task) {
        s.setTask(json.task);
        s.setStage('listening');
        s.setStudentNotes(''); s.setStudentWriting(''); s.setAnalysis(null);
        // Clear old draft so new task starts with blank fields
        localStorage.removeItem(DRAFT_KEY);
        s.clearDraft();
      } else {
        s.setError(json.error || t('is.generateFailed'));
      }
    } catch {
      s.setError(t('is.networkFailed'));
    } finally {
      s.setLoading(false);
    }
  };

  if (s.stage === 'config') {
    return (
      <div className="max-w-xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Integrated Skills</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('is.description')}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('is.grade')}</label>
            <div className="flex gap-2 flex-wrap">
              {GRADES.map(g => (
                <button key={g} onClick={() => s.setConfig(g, s.difficulty, s.taskType)}
                  className={`px-3.5 py-2 text-sm rounded-lg font-medium transition-all ${
                    s.gradeLevel === g ? 'bg-teal-500 text-white shadow shadow-teal-200 dark:shadow-teal-900/30'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>{getGradeLabel(g, language)}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('is.difficulty')}</label>
            <div className="flex gap-2 flex-wrap">
              {DIFFICULTIES.map(d => (
                <button key={d.value} onClick={() => s.setConfig(s.gradeLevel, d.value, s.taskType)}
                  className={`px-3.5 py-2 text-sm rounded-lg font-medium transition-all ${
                    s.difficulty === d.value ? 'bg-teal-500 text-white shadow shadow-teal-200 dark:shadow-teal-900/30'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>{getDifficultyLabel(d.value, language)}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('is.taskType')}</label>
            <div className="space-y-2">
              {TASK_TYPES.map(tt => (
                <button key={tt.value} onClick={() => s.setConfig(s.gradeLevel, s.difficulty, tt.value)}
                  className={`w-full text-left px-4 py-3 text-sm rounded-xl font-medium transition-all ${
                    s.taskType === tt.value ? 'bg-teal-500 text-white shadow shadow-teal-200 dark:shadow-teal-900/30'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                  {language === 'en' ? tt.en : tt.zh}<span className="text-xs opacity-70 ml-2">({language === 'en' ? tt.zh : tt.en})</span></button>
              ))}
            </div>
          </div>
          {s.error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">{s.error}</div>
          )}
          <button onClick={handleGenerate} disabled={s.loading}
            className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 disabled:from-gray-300 disabled:to-gray-300 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-md shadow-teal-200 dark:shadow-teal-900/20 disabled:shadow-none">
            {s.loading ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('is.generating')}</> : <><Sparkles className="w-5 h-5" /> {t('is.generate')}</>}
          </button>
        </div>
      </div>
    );
  }

  if (!s.task) return null;

  return (
    <IntegratedSkillsTaskView
      task={s.task}
      onBack={() => {
        if (s.stage === 'listening' || s.stage === 'writing') {
          if (confirm(language === 'en' ? 'Discard current progress and go back?' : '確定要放棄當前進度並返回嗎？')) {
            // 真正放棄：清除本地及伺服器草稿（否則下次進入又會還原「已放棄」的內容）
            localStorage.removeItem(DRAFT_KEY);
            s.clearDraft();
            s.reset();
          }
        }
      }}
    />
  );
}
