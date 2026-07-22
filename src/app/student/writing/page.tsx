// Writing Support — AI prompts, word count, outline, assistance
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Lightbulb, CheckCircle, PencilLine, Sparkles, Loader2, Hash, FileDown, RefreshCw, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useT } from '@/hooks/use-i18n';
import { useToast } from '@/components/shared/Toast';
import OcrUpload from '@/components/shared/OcrUpload';
import { InlineWordBadge } from '@/modules/vocabulary/components/InlineAddVocabButton';
import VocabEnabledText from '@/modules/vocabulary/components/VocabEnabledText';
import { getGradeLabel, getDifficultyLabel } from '@/shared/utils/nav';
import type { DifficultyLevel } from '@/shared/types/types';

const gradeLevels = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
const textTypes: Record<string, { zh: string; en: string }> = {
  essay: { zh: 'Essay 文章', en: 'Essay' }, letter: { zh: 'Letter 書信', en: 'Letter' },
  report: { zh: 'Report 報告', en: 'Report' }, article: { zh: 'Article 專欄', en: 'Article' },
  story: { zh: 'Story 故事', en: 'Story' }, argumentative: { zh: 'Argumentative 議論文', en: 'Argumentative' },
  review: { zh: 'Review 評論', en: 'Review' }, email: { zh: 'Email 電郵', en: 'Email' },
};
const wordLimits = [100, 150, 200, 300, 400, 500, 800];



export default function WritingPage() {
  const { t, language } = useT();
  const { showToast } = useToast();
  const store = useAppStore();
  const lang = language || 'zh';
  

  const [gradeLevel, setGradeLevel] = useState('S4');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('core');

  // 載入學生年級
  useEffect(() => {
    fetch('/api/auth/profile')
      .then(r => r.json())
      .then(d => {
        const level = d?.user?.level || d?.user?.class?.gradeLevel;
        if (level && ['S1','S2','S3','S4','S5','S6'].includes(level)) setGradeLevel(level);
      })
      .catch((e) => { console.error("[page] fetch failed", e) });
  }, []);
  const [textType, setTextType] = useState('essay');
  const [wordLimit, setWordLimit] = useState(200);
  const [topicHint, setTopicHint] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [useCustomTopic, setUseCustomTopic] = useState(false);
  const [wantOutline, setWantOutline] = useState(true);
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [generatedOutline, setGeneratedOutline] = useState('');
  const [genLoading, setGenLoading] = useState(false);

  const [draft, setDraft] = useState('');
  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const charCount = draft.length;
  const wordProgress = Math.min(100, Math.round((wordCount / wordLimit) * 100));

  const [showSuggestions, setShowSuggestions] = useState(true);
  const [showVocabHelp, setShowVocabHelp] = useState(true);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [vocabHelp, setVocabHelp] = useState<{ word: string; meaning: string }[]>([]);
  const [assistLoading, setAssistLoading] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiError, setAiError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');

  // === 互動改寫狀態 ===
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewrittenText, setRewrittenText] = useState('');
  const [rewriteSummary, setRewriteSummary] = useState<string[]>([]);
  const [showRewrite, setShowRewrite] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  // === 分層反饋狀態 ===
  const [feedbackLevel, setFeedbackLevel] = useState<'simple' | 'detailed'>('simple');

  // Computed values
  const realTopic = useCustomTopic && customTopic ? customTopic : generatedPrompt;

  // Auto-save draft every 10 seconds
  useEffect(() => {
    if (!draft.trim()) return;
    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await fetch('/api/writing', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: 'current', draft }),
        });
        setSaveStatus('saved');
      } catch { setSaveStatus('unsaved'); }
    }, 10000);
    return () => clearTimeout(timer);
  }, [draft]);

  const handleExport = async (format: 'pdf' | 'docx') => {
    if (!aiResult) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/export/writing-analysis?format=${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis: { ...aiResult, topic: realTopic, studentDraft: draft },
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '匯出失敗');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `writing-analysis-${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : t('writing.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const handleGenerate = async () => {
    setGenLoading(true);
    setGeneratedPrompt('');
    setGeneratedOutline('');
    const topic = useCustomTopic && customTopic ? customTopic : topicHint;
    const typeName = textTypes[textType]?.en || textType;

    // Step 1: Generate writing prompt via dedicated endpoint
    let newPrompt = '';
    try {
      const promptRes = await fetch('/api/ai/generate-writing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'prompt',
          textType: typeName,
          gradeLevel,
          difficulty,
          wordLimit,
          topicHint: topic || undefined,
          lang,
        }),
      });
      const pj = await promptRes.json();
      if (pj.prompt) {
        newPrompt = pj.prompt;
        setGeneratedPrompt(newPrompt);
      } else {
        setGeneratedPrompt(t('writing.promptGenFailed'));
      }
    } catch {
      setGeneratedPrompt(t('writing.promptGenError'));
    }

    // Step 2: Generate outline via dedicated endpoint (uses the actual generated prompt)
    if (wantOutline) {
      try {
        const resolvedPrompt = newPrompt || topic || 'general topic';
        const outlineRes = await fetch('/api/ai/generate-writing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'outline',
            textType: typeName,
            gradeLevel,
            difficulty,
            wordLimit,
            writingPrompt: resolvedPrompt,
            topicHint: topic || undefined,
            lang,
          }),
        });
        const oj = await outlineRes.json();
        if (oj.outline && oj.outline.length > 20) {
          setGeneratedOutline(oj.outline);
        } else {
          setGeneratedOutline(t('writing.outlineGenFailed'));
        }
      } catch {
        setGeneratedOutline(t('writing.outlineGenError'));
      }
    }

    setGenLoading(false);
  };

  const fetchAssistance = useCallback(async () => {
    if (!draft.trim() || (!showSuggestions && !showVocabHelp)) return;
    setAssistLoading(true);
    try {
      const res = await fetch('/api/ai/analyze-writing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: generatedPrompt || 'Writing', prompt: generatedPrompt, studentDraft: draft.slice(0, 2000), gradeLevel, difficulty }),
      });
      const json = await res.json();
      if (json.analysis) {
        if (showSuggestions) {
          setSuggestions([
            ...(json.analysis.weaknesses || []).slice(0, 2).map((w: string) => t('writing.improveTip') + w),
            ...(json.analysis.strengths || []).slice(0, 1).map((s: string) => t('writing.goodJob') + s),
          ]);
        }
        if (showVocabHelp) {
          setVocabHelp((json.analysis.vocabularySuggestions || []).slice(0, 5).map(
            (v: { original: string; suggestion: string; reason: string }) => ({ word: v.suggestion, meaning: v.reason })
          ));
        }
      }
    } catch (e) { console.error('Failed to fetch writing assistance:', e); }
    finally { setAssistLoading(false); }
  }, [draft, generatedPrompt, showSuggestions, showVocabHelp, lang]);

  useEffect(() => {
    if (draft.length < 20) { setSuggestions([]); setVocabHelp([]); return; }
    const timer = setTimeout(fetchAssistance, 1500);
    return () => clearTimeout(timer);
  }, [draft, fetchAssistance]);

  const handleSubmit = async () => {
    if (!draft.trim()) return;
    setAiLoading(true); setAiError(''); setAiResult(null);
    try {
      const res = await fetch('/api/ai/analyze-writing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: generatedPrompt || 'Writing', prompt: generatedPrompt, studentDraft: draft, gradeLevel, difficulty }),
      });
      const json = await res.json();
      if (res.ok && json.analysis) {
        setAiResult(json.analysis);
        // 儲存練習記錄到學生分析
        if (store.userId) {
          fetch('/api/practice', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              studentId: store.userId, skill: 'writing', skillZh: 'DSE 寫作',
              difficulty, totalQuestions: 1, correctCount: 1, source: 'dse-writing',
            }),
          }).catch(() => {});
        }
        // 持久化 AI 分析結果到 DB
        try {
          await fetch('/api/writing', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              aiSuggestions: json.analysis,
              status: 'submitted',
            }),
          });
        } catch { /* 持久化非致命 */ }
      }
      else setAiError(json.error || t('writing.aiUnavailable'));
    } catch { setAiError(t('writing.connectionFailed')); }
    finally { setAiLoading(false); }

    // 🎮 提交寫作 XP
    if (store.userId) {
      fetch('/api/gamification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: store.userId, event: { type: 'submitWriting' } }),
      }).catch((e) => { console.error("[page] fetch failed", e) });
    }
  };

  // === AI 互動改寫 ===
  const handleRewrite = async () => {
    if (!draft.trim()) return;
    setRewriteLoading(true);
    setRewrittenText('');
    setRewriteSummary([]);
    try {
      const feedbackText = aiResult
        ? `Grammar errors: ${(aiResult.grammarErrors || []).map((e: Record<string, unknown>) => `${e.original} → ${e.correction}`).join('; ')}. Chinglish: ${(aiResult.chinglishWarnings || []).map((c: Record<string, unknown>) => c.original).join('; ')}`
        : '';
      const res = await fetch('/api/ai/rewrite-writing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalDraft: draft,
          aiFeedback: feedbackText,
          gradeLevel,
          difficulty,
        }),
      });
      const json = await res.json();
      if (res.ok && json.rewrite) {
        setRewrittenText(json.rewrite.revisedText);
        setRewriteSummary(json.rewrite.changesSummary || []);
        setShowRewrite(true);
        setShowDiff(true);
      } else {
        showToast('error', json.error || t('writing.rewriteFailed'));
      }
    } catch {
      showToast('error', t('writing.rewriteError'));
    } finally {
      setRewriteLoading(false);
    }
  };

  // 簡單 diff 比較：標記差異
  const renderDiff = () => {
    if (!showDiff || !rewrittenText) return null;
    // Simple side-by-side comparison
    return (
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-4 border border-red-200 dark:border-red-800">
          <p className="text-xs font-medium text-red-600 mb-2 flex items-center gap-1">
            <EyeOff className="w-3 h-3" /> {t('writing.original')}
          </p>
          <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans">{draft}</pre>
        </div>
        <div className="bg-green-50 dark:bg-green-900/10 rounded-xl p-4 border border-green-200 dark:border-green-800">
          <p className="text-xs font-medium text-green-600 mb-2 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> {t('writing.aiRevised')}
          </p>
          <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans">{rewrittenText}</pre>
          {rewriteSummary.length > 0 && (
            <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-700">
              <p className="text-xs font-medium text-green-600 mb-1">{t('writing.keyChanges')}</p>
              <ul className="list-disc list-inside text-xs text-gray-600 space-y-0.5">
                {rewriteSummary.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('writing.title')}</h1>

      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-500" /> {t('writing.promptGen')}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t('writing.grade')}</label>
            <select value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white">
              {gradeLevels.map(g => <option key={g} value={g}>{getGradeLabel(g, lang)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{lang === 'en' ? 'Difficulty' : '難度'}</label>
            <select value={difficulty} onChange={e => setDifficulty(e.target.value as DifficultyLevel)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white">
              <option value="remedial">{getDifficultyLabel('remedial', lang)}</option>
              <option value="core">{getDifficultyLabel('core', lang)}</option>
              <option value="challenge">{getDifficultyLabel('challenge', lang)}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t('writing.textType')}</label>
            <select value={textType} onChange={e => setTextType(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white">
              {Object.entries(textTypes).map(([k, v]) => <option key={k} value={k}>{lang === 'zh' ? v.zh : v.en}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t('writing.wordLimit')}</label>
            <input
              type="number"
              value={wordLimit}
              onChange={e => {
                const raw = e.target.value;
                if (raw === '') { setWordLimit(0); return; }
                const v = parseInt(raw, 10);
                if (!isNaN(v)) setWordLimit(v);
              }}
              onBlur={e => {
                const v = Number(e.target.value);
                if (isNaN(v) || v < 50) setWordLimit(50);
                else if (v > 2000) setWordLimit(2000);
              }}
              min={50} max={2000} step={10}
              placeholder={t('writing.customWordLimit')}
              className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white"
            />
            <div className="flex gap-1 mt-1 flex-wrap">
              {wordLimits.map(w => (
                <button key={w} onClick={() => setWordLimit(w)}
                  className={`px-2 py-0.5 text-xs rounded-md font-medium transition-colors ${
                    wordLimit === w
                      ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-300'
                  }`}
                >{w}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t('writing.topicHint')}</label>
            <input value={topicHint} onChange={e => setTopicHint(e.target.value)} placeholder={t('writing.topicHintPlaceholder')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2 cursor-pointer">
          <input type="checkbox" checked={useCustomTopic} onChange={e => setUseCustomTopic(e.target.checked)} className="rounded" />
          {t('writing.customTopic')}
        </label>
        {useCustomTopic && (
          <input value={customTopic} onChange={e => setCustomTopic(e.target.value)} placeholder={t('writing.customTopicPlaceholder')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white mb-3" />
        )}
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-3 cursor-pointer">
          <input type="checkbox" checked={wantOutline} onChange={e => setWantOutline(e.target.checked)} className="rounded" />
          {t('writing.genOutline')}
        </label>
        <button onClick={handleGenerate} disabled={genLoading || (useCustomTopic && !customTopic)}
          className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 disabled:opacity-50 flex items-center gap-2">
          {genLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {genLoading ? t('writing.generating') : (useCustomTopic ? t('writing.confirmTopic') : t('writing.genPrompt'))}
        </button>
        {realTopic && (
          <div className="mt-3 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
            <p className="text-sm font-medium text-purple-800 dark:text-purple-200">{t('writing.yourPrompt')}</p>
            <p className="text-lg text-gray-900 dark:text-white mt-1">{realTopic}</p>
            <p className="text-xs text-gray-500 mt-2">{t('writing.wordCount')}：{wordLimit} | {t('writing.type')}：{lang === 'zh' ? textTypes[textType].zh : textTypes[textType].en} | {t('writing.level')}：{gradeLevel}</p>
          </div>
        )}
        {generatedOutline && (
          <div className="mt-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">{t('writing.aiOutline')}</p>
            <pre className="text-sm text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-line">{generatedOutline}</pre>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <PencilLine className="w-5 h-5 text-teal-500" /> {t('writing.yourWriting')}
          </h2>
          <div className="flex items-center gap-4 text-sm">
            <span className={`flex items-center gap-1 font-bold ${wordCount > wordLimit ? 'text-red-500' : wordCount >= wordLimit * 0.8 ? 'text-amber-500' : 'text-gray-500'}`}>
              <Hash className="w-4 h-4" />{wordCount} / {wordLimit} {t('writing.wordsUnit')}
            </span>
            <span className="text-gray-400">{charCount} {t('writing.chars')}</span>
          </div>
        </div>
        <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mb-3">
          <div className={`h-full rounded-full transition-all ${wordCount > wordLimit ? 'bg-red-500' : wordCount >= wordLimit * 0.8 ? 'bg-amber-500' : 'bg-teal-500'}`} style={{ width: `${wordProgress}%` }} />
        </div>
        {/* Auto-save status indicator */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`inline-block w-2.5 h-2.5 rounded-full transition-colors duration-300 ${
            saveStatus === 'saved' ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]' :
            saveStatus === 'saving' ? 'bg-amber-400 animate-pulse' :
            'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]'
          }`} />
          <span className={`text-xs font-medium transition-colors duration-300 ${
            saveStatus === 'saved' ? 'text-green-600 dark:text-green-400' :
            saveStatus === 'saving' ? 'text-amber-600 dark:text-amber-400' :
            'text-red-600 dark:text-red-400'
          }`}
            title={saveStatus === 'saved' ? t('writing.autoSaveHint') : saveStatus === 'saving' ? '' : t('writing.unsavedHint')}
          >
            {saveStatus === 'saved' ? `● ${t('writing.saved')}` :
             saveStatus === 'saving' ? `◌ ${t('writing.saving')}...` :
             `○ ${t('writing.unsaved')}`}
          </span>
        </div>
        <textarea value={draft} onChange={e => setDraft(e.target.value)}
          placeholder={realTopic ? t('writing.enterTopicPlaceholder', { topic: realTopic }) : t('writing.writePlaceholder')}
          rows={8} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white text-sm outline-none focus:ring-2 focus:ring-teal-500 resize-y min-h-[200px] sm:min-h-[300px]" />
        <div className="flex items-center gap-3 sm:gap-4 mt-3 flex-wrap">
          <button onClick={handleSubmit} disabled={aiLoading || !draft.trim()}
            className="px-4 py-2.5 sm:py-2 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 disabled:opacity-50 flex items-center gap-2 min-h-[44px]">
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {aiLoading ? t('writing.analyzing') : t('writing.aiAnalyze')}
          </button>
          <OcrUpload
            onTextExtracted={(text) => setDraft(prev => prev ? prev + '\n' + text : text)}
            disabled={aiLoading}
          />
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
            <input type="checkbox" checked={showSuggestions} onChange={e => setShowSuggestions(e.target.checked)} className="rounded" />
            <Lightbulb className="w-4 h-4 text-amber-500" /> {t('writing.writingTips')}
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
            <input type="checkbox" checked={showVocabHelp} onChange={e => setShowVocabHelp(e.target.checked)} className="rounded" />
            <CheckCircle className="w-4 h-4 text-green-500" /> {t('writing.vocabHelp')}
          </label>
          {assistLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>
      </div>

      {(showSuggestions || showVocabHelp) && (suggestions.length > 0 || vocabHelp.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {showSuggestions && suggestions.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-5 border border-amber-200 dark:border-amber-800">
              <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-3 flex items-center gap-2"><Lightbulb className="w-5 h-5" /> {t('writing.writingTips')}</h3>
              <ul className="space-y-2">{suggestions.map((s, i) => <li key={i} className="text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2"><span className="text-amber-400 mt-0.5">•</span> {s}</li>)}</ul>
            </div>
          )}
          {showVocabHelp && vocabHelp.length > 0 && (
            <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-5 border border-green-200 dark:border-green-800">
              <h3 className="font-semibold text-green-800 dark:text-green-200 mb-3 flex items-center gap-2"><CheckCircle className="w-5 h-5" /> {t('writing.vocabSuggestions')}</h3>
              <div className="space-y-2">{vocabHelp.map((v, i) => <div key={i} className="text-sm"><span className="font-medium text-green-700 dark:text-green-300">{v.word}</span><span className="text-green-600 dark:text-green-400 ml-2">— {v.meaning}</span></div>)}</div>
            </div>
          )}
        </div>
      )}

      {aiError && <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl text-sm text-red-600">⚠️ {aiError}</div>}
      {aiResult && (
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-2xl p-6 border border-purple-200 dark:border-purple-800 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="w-5 h-5 text-purple-600" /><h3 className="font-semibold text-purple-800 dark:text-purple-200">{t('writing.aiAnalysisResult')}</h3>
            <span className="ml-auto text-2xl font-bold text-purple-700">{aiResult.overallScore}/100</span>
            {/* DSE Level Badge */}
            {aiResult.dseLevel && (
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                ['5**','5*','5'].includes(aiResult.dseLevel) ? 'bg-purple-200 text-purple-800 dark:bg-purple-800 dark:text-purple-200' :
                aiResult.dseLevel === '4' ? 'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-200' :
                aiResult.dseLevel === '3' ? 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200' :
                ['2','1'].includes(aiResult.dseLevel) ? 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200' :
                'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200'
              }`}>
                DSE Level {aiResult.dseLevel}
              </span>
            )}
            {/* 分層反饋切換 */}
            <button
              onClick={() => setFeedbackLevel(feedbackLevel === 'simple' ? 'detailed' : 'simple')}
              className="px-2.5 py-1 text-xs bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-200 rounded-md font-medium flex items-center gap-1"
            >
              {feedbackLevel === 'simple'
                ? <><ChevronDown className="w-3 h-3" /> {t('writing.detailed')}</>
                : <><ChevronUp className="w-3 h-3" /> {t('writing.simple')}</>
              }
            </button>
            <button
              onClick={() => handleExport('pdf')}
              disabled={exporting}
              className="px-2.5 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 rounded-md font-medium flex items-center gap-1 disabled:opacity-50"
            >
              <FileDown className="w-3 h-3" /> PDF
            </button>
            <button
              onClick={() => handleExport('docx')}
              disabled={exporting}
              className="px-2.5 py-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 rounded-md font-medium flex items-center gap-1 disabled:opacity-50"
            >
              <FileDown className="w-3 h-3" /> DOCX
            </button>
          </div>

          {/* Simple Feedback Layer */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4">
            <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">
              {aiResult.generalComment}
            </p>
          </div>

          {/* CLO Score Breakdown */}
          {(aiResult.contentScore != null || aiResult.languageScore != null || aiResult.organizationScore != null) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-3 text-center border border-red-200 dark:border-red-800">
                <p className="text-xs font-medium text-red-600 dark:text-red-400">Content 內容</p>
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">{aiResult.contentScore?.toFixed(1) ?? '—'}<span className="text-sm font-normal">/7</span></p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-3 text-center border border-amber-200 dark:border-amber-800">
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Language 語言</p>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{aiResult.languageScore?.toFixed(1) ?? '—'}<span className="text-sm font-normal">/7</span></p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/10 rounded-xl p-3 text-center border border-green-200 dark:border-green-800">
                <p className="text-xs font-medium text-green-600 dark:text-green-400">Organization 組織</p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">{aiResult.organizationScore?.toFixed(1) ?? '—'}<span className="text-sm font-normal">/7</span></p>
              </div>
            </div>
          )}

          {/* CLO Total Score */}
          {aiResult.cloTotalScore != null && (
            <div className="flex items-center justify-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg py-2 px-4">
              <span className="text-sm text-gray-600 dark:text-gray-400">CLO 總分：</span>
              <span className="text-lg font-bold text-purple-700 dark:text-purple-300">{aiResult.cloTotalScore.toFixed(1)}<span className="text-sm font-normal text-gray-500">/21</span></span>
              {aiResult.dseLevel && (
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                  ['5**','5*','5'].includes(aiResult.dseLevel) ? 'bg-purple-100 text-purple-700 dark:bg-purple-800 dark:text-purple-200' :
                  aiResult.dseLevel === '4' ? 'bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200' :
                  aiResult.dseLevel === '3' ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200' :
                  ['2','1'].includes(aiResult.dseLevel) ? 'bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-200' :
                  'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-200'
                }`}>
                  對應 {aiResult.dseLevel}
                </span>
              )}
            </div>
          )}

          {feedbackLevel === 'simple' && aiResult.structureFeedback && (
            <p className="text-xs text-gray-500 dark:text-gray-400 italic">💡 {aiResult.structureFeedback}</p>
          )}

          {/* Detailed Feedback Layer */}
          {feedbackLevel === 'detailed' && (
            <>
              {aiResult.strengths?.length > 0 && (
                <div><p className="text-xs font-medium text-green-600 mb-1">{t('writing.strengths')}</p><ul className="list-disc list-inside text-sm text-gray-600 space-y-0.5">{aiResult.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></div>
              )}
              {aiResult.grammarErrors?.length > 0 && (
                <div><p className="text-xs font-medium text-red-600 mb-1">{t('writing.grammarErrors')}</p>
                  {aiResult.grammarErrors.map((e: { original: string; correction: string; explanation: string }, i: number) => (
                    <div key={i} className="text-sm text-red-700 ml-2"><span className="line-through">{e.original}</span> → <span className="font-medium">{e.correction}</span><span className="text-gray-500 ml-2">({e.explanation})</span></div>))}
                </div>
              )}
              {aiResult.chinglishWarnings?.length > 0 && (
                <div><p className="text-xs font-medium text-amber-600 mb-1">{t('writing.chinglish')}</p>
                  {aiResult.chinglishWarnings.map((c: { original: string; suggestion: string }, i: number) => (
                    <div key={i} className="text-sm text-amber-700 ml-2"><span className="line-through">{c.original}</span> → <span className="font-medium">{c.suggestion}</span></div>))}
                </div>
              )}
              {aiResult.structureFeedback && <div><p className="text-xs font-medium text-blue-600 mb-1">{t('writing.structure')}</p><p className="text-sm text-gray-600">{aiResult.structureFeedback}</p></div>}
              {aiResult.vocabularySuggestions?.length > 0 && (
                <div><p className="text-xs font-medium text-green-600 mb-1">{t('writing.vocabulary')}</p>
                  {aiResult.vocabularySuggestions.map((v: { original: string; suggestion: string; reason: string }, i: number) => (
                    <div key={i} className="text-sm text-green-700 ml-2 flex items-center gap-1 flex-wrap">
                      <span className="line-through">{v.original}</span>
                      <span>→</span>
                      {store.userId ? (
                        <InlineWordBadge
                          word={v.suggestion}
                          studentId={store.userId}
                          gradeLevel={gradeLevel}
                          isSuggestion
                        />
                      ) : (
                        <span className="font-medium">{v.suggestion}</span>
                      )}
                      <span className="text-gray-500 ml-2">({v.reason})</span>
                    </div>))}
                </div>
              )}
              {aiResult.revisedVersion && (
                <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                  <p className="text-xs font-medium text-purple-600 mb-1">{t('writing.revised')}</p>
                  {store.userId ? (
                    <VocabEnabledText studentId={store.userId} gradeLevel={gradeLevel}>
                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{aiResult.revisedVersion}</p>
                    </VocabEnabledText>
                  ) : (
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{aiResult.revisedVersion}</p>
                  )}
                </div>
              )}
            </>
          )}

          {/* 🆕 互動改寫按鈕 */}
          <div className="flex items-center gap-3 pt-2 border-t border-purple-200 dark:border-purple-700">
            <button
              onClick={handleRewrite}
              disabled={rewriteLoading || !draft.trim()}
              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm font-medium hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 flex items-center gap-2 shadow-sm"
            >
              {rewriteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {rewriteLoading ? t('writing.rewriting') : t('writing.rewriteBtn')}
            </button>
            {rewrittenText && (
              <button
                onClick={() => setShowDiff(!showDiff)}
                className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg flex items-center gap-1"
              >
                <Eye className="w-3 h-3" />
                {showDiff ? t('writing.hideDiff') : t('writing.showDiff')}
              </button>
            )}
            {rewrittenText && (
              <button
                onClick={() => { setDraft(rewrittenText); setShowDiff(false); }}
                className="px-3 py-1.5 text-xs bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg flex items-center gap-1"
              >
                <CheckCircle className="w-3 h-3" />
                {t('writing.applyRewrite')}
              </button>
            )}
          </div>

          {/* Diff Comparison View */}
          {renderDiff()}
        </div>
      )}
    </div>
  );
}
