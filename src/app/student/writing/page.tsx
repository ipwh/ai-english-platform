// Writing Support — AI prompts, word count, outline, assistance
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Lightbulb, CheckCircle, PencilLine, Sparkles, Loader2, Hash, FileDown } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import OcrUpload from '@/components/shared/OcrUpload';

const gradeLevels = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
const textTypes: Record<string, { zh: string; en: string }> = {
  essay: { zh: 'Essay 文章', en: 'Essay' }, letter: { zh: 'Letter 書信', en: 'Letter' },
  report: { zh: 'Report 報告', en: 'Report' }, article: { zh: 'Article 專欄', en: 'Article' },
  story: { zh: 'Story 故事', en: 'Story' }, argumentative: { zh: 'Argumentative 議論文', en: 'Argumentative' },
  review: { zh: 'Review 評論', en: 'Review' }, email: { zh: 'Email 電郵', en: 'Email' },
};
const wordLimits = [100, 150, 200, 300, 400, 500, 800];

const t = (lang: string, zh: string, en: string) => lang === 'zh' ? zh : en;

export default function WritingPage() {
  const { language } = useAppStore();
  const lang = language || 'zh';

  const [gradeLevel, setGradeLevel] = useState('S4');
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
      alert(err instanceof Error ? err.message : '匯出失敗');
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
        setGeneratedPrompt(t(lang, '⚠️ AI 未能生成題目，請重試。', '⚠️ Could not generate prompt. Please try again.'));
      }
    } catch {
      setGeneratedPrompt(t(lang, '⚠️ 題目生成失敗，請檢查網絡。', '⚠️ Prompt generation failed.'));
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
          setGeneratedOutline(t(lang, '⚠️ AI 未能生成大綱，請重試。', '⚠️ Could not generate outline. Please try again.'));
        }
      } catch {
        setGeneratedOutline(t(lang, '⚠️ 大綱生成失敗，請檢查網絡。', '⚠️ Outline generation failed.'));
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
        body: JSON.stringify({ title: generatedPrompt || 'Writing', prompt: generatedPrompt, studentDraft: draft.slice(0, 2000) }),
      });
      const json = await res.json();
      if (json.analysis) {
        if (showSuggestions) {
          setSuggestions([
            ...(json.analysis.weaknesses || []).slice(0, 2).map((w: string) => t(lang, '改善建議：' + w, 'Tip: ' + w)),
            ...(json.analysis.strengths || []).slice(0, 1).map((s: string) => t(lang, '做得好：' + s, 'Good: ' + s)),
          ]);
        }
        if (showVocabHelp) {
          setVocabHelp((json.analysis.vocabularySuggestions || []).slice(0, 5).map(
            (v: { original: string; suggestion: string; reason: string }) => ({ word: v.suggestion, meaning: v.reason })
          ));
        }
      }
    } catch { /* ignore */ }
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
        body: JSON.stringify({ title: generatedPrompt || 'Writing', prompt: generatedPrompt, studentDraft: draft }),
      });
      const json = await res.json();
      if (res.ok && json.analysis) setAiResult(json.analysis);
      else setAiError(json.error || t(lang, 'AI 分析暫時無法使用', 'AI analysis unavailable'));
    } catch { setAiError(t(lang, '連線失敗', 'Connection failed')); }
    finally { setAiLoading(false); }
  };

  const realTopic = useCustomTopic && customTopic ? customTopic : generatedPrompt;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t(lang, '✍️ 寫作支援', '✍️ Writing Support')}</h1>

      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-500" /> {t(lang, 'AI 題目生成', 'AI Prompt Generator')}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t(lang, '年級', 'Grade')}</label>
            <select value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white">{gradeLevels.map(g => <option key={g}>{g}</option>)}</select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t(lang, '文體', 'Text Type')}</label>
            <select value={textType} onChange={e => setTextType(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white">
              {Object.entries(textTypes).map(([k, v]) => <option key={k} value={k}>{lang === 'zh' ? v.zh : v.en}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t(lang, '字數上限', 'Word Limit')}</label>
            <select value={wordLimit} onChange={e => setWordLimit(Number(e.target.value))} className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white">
              {wordLimits.map(w => <option key={w} value={w}>{w} {t(lang, '字', 'words')}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{t(lang, '主題提示（可選）', 'Topic Hint (optional)')}</label>
            <input value={topicHint} onChange={e => setTopicHint(e.target.value)} placeholder={t(lang, '例如：環境保護', 'e.g. environment')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2 cursor-pointer">
          <input type="checkbox" checked={useCustomTopic} onChange={e => setUseCustomTopic(e.target.checked)} className="rounded" />
          {t(lang, '使用自訂題目（不使用 AI 生成）', 'Use custom topic (skip AI generation)')}
        </label>
        {useCustomTopic && (
          <input value={customTopic} onChange={e => setCustomTopic(e.target.value)} placeholder={t(lang, '輸入你的自訂作文題目...', 'Enter your custom writing topic...')} className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white mb-3" />
        )}
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-3 cursor-pointer">
          <input type="checkbox" checked={wantOutline} onChange={e => setWantOutline(e.target.checked)} className="rounded" />
          {t(lang, '生成 AI 作文大綱（結構建議）', 'Generate AI writing outline')}
        </label>
        <button onClick={handleGenerate} disabled={genLoading || (useCustomTopic && !customTopic)}
          className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 disabled:opacity-50 flex items-center gap-2">
          {genLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {genLoading ? t(lang, '生成中...', 'Generating...') : (useCustomTopic ? t(lang, '確認題目', 'Confirm Topic') : t(lang, '生成題目', 'Generate Prompt'))}
        </button>
        {realTopic && (
          <div className="mt-3 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
            <p className="text-sm font-medium text-purple-800 dark:text-purple-200">{t(lang, '作文題目：', 'Your Prompt:')}</p>
            <p className="text-lg text-gray-900 dark:text-white mt-1">{realTopic}</p>
            <p className="text-xs text-gray-500 mt-2">{t(lang, '字數', 'Words')}：{wordLimit} | {t(lang, '文體', 'Type')}：{lang === 'zh' ? textTypes[textType].zh : textTypes[textType].en} | {t(lang, '年級', 'Level')}：{gradeLevel}</p>
          </div>
        )}
        {generatedOutline && (
          <div className="mt-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">{t(lang, 'AI 作文大綱：', 'AI Writing Outline:')}</p>
            <pre className="text-sm text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-line">{generatedOutline}</pre>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <PencilLine className="w-5 h-5 text-teal-500" /> {t(lang, '你的寫作', 'Your Writing')}
          </h2>
          <div className="flex items-center gap-4 text-sm">
            <span className={`flex items-center gap-1 font-bold ${wordCount > wordLimit ? 'text-red-500' : wordCount >= wordLimit * 0.8 ? 'text-amber-500' : 'text-gray-500'}`}>
              <Hash className="w-4 h-4" />{wordCount} / {wordLimit} {t(lang, '字', 'words')}
            </span>
            <span className="text-gray-400">{charCount} {t(lang, '字元', 'chars')}</span>
          </div>
        </div>
        <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mb-3">
          <div className={`h-full rounded-full transition-all ${wordCount > wordLimit ? 'bg-red-500' : wordCount >= wordLimit * 0.8 ? 'bg-amber-500' : 'bg-teal-500'}`} style={{ width: `${wordProgress}%` }} />
        </div>
        <textarea value={draft} onChange={e => setDraft(e.target.value)}
          placeholder={realTopic ? t(lang, `請根據題目「${realTopic}」在此寫作...`, `Write about "${realTopic}" here...`) : t(lang, '請先生成或輸入題目，然後在此寫作...', 'Generate or enter a topic first, then write here...')}
          rows={8} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white text-sm outline-none focus:ring-2 focus:ring-teal-500 resize-y min-h-[200px]" />
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          <button onClick={handleSubmit} disabled={aiLoading || !draft.trim()}
            className="px-4 py-2 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 disabled:opacity-50 flex items-center gap-2">
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {aiLoading ? t(lang, 'AI 批改中...', 'Analyzing...') : t(lang, '提交 AI 批改', 'Submit for AI Analysis')}
          </button>
          <OcrUpload
            onTextExtracted={(text) => setDraft(prev => prev ? prev + '\n' + text : text)}
            disabled={aiLoading}
          />
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
            <input type="checkbox" checked={showSuggestions} onChange={e => setShowSuggestions(e.target.checked)} className="rounded" />
            <Lightbulb className="w-4 h-4 text-amber-500" /> {t(lang, '寫作提示', 'Writing Tips')}
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
            <input type="checkbox" checked={showVocabHelp} onChange={e => setShowVocabHelp(e.target.checked)} className="rounded" />
            <CheckCircle className="w-4 h-4 text-green-500" /> {t(lang, '詞彙建議', 'Vocab Help')}
          </label>
          {assistLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>
      </div>

      {(showSuggestions || showVocabHelp) && (suggestions.length > 0 || vocabHelp.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {showSuggestions && suggestions.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-5 border border-amber-200 dark:border-amber-800">
              <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-3 flex items-center gap-2"><Lightbulb className="w-5 h-5" /> {t(lang, '寫作提示', 'Writing Tips')}</h3>
              <ul className="space-y-2">{suggestions.map((s, i) => <li key={i} className="text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2"><span className="text-amber-400 mt-0.5">•</span> {s}</li>)}</ul>
            </div>
          )}
          {showVocabHelp && vocabHelp.length > 0 && (
            <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-5 border border-green-200 dark:border-green-800">
              <h3 className="font-semibold text-green-800 dark:text-green-200 mb-3 flex items-center gap-2"><CheckCircle className="w-5 h-5" /> {t(lang, '詞彙建議', 'Vocabulary Suggestions')}</h3>
              <div className="space-y-2">{vocabHelp.map((v, i) => <div key={i} className="text-sm"><span className="font-medium text-green-700 dark:text-green-300">{v.word}</span><span className="text-green-600 dark:text-green-400 ml-2">— {v.meaning}</span></div>)}</div>
            </div>
          )}
        </div>
      )}

      {aiError && <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl text-sm text-red-600">⚠️ {aiError}</div>}
      {aiResult && (
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-2xl p-6 border border-purple-200 dark:border-purple-800 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" /><h3 className="font-semibold text-purple-800 dark:text-purple-200">{t(lang, 'AI 寫作分析', 'AI Writing Analysis')}</h3>
            <span className="ml-auto text-2xl font-bold text-purple-700">{aiResult.overallScore}/100</span>
            <button
              onClick={() => handleExport('pdf')}
              disabled={exporting}
              className="ml-3 px-2.5 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 rounded-md font-medium flex items-center gap-1 disabled:opacity-50"
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
          <p className="text-sm text-gray-700 dark:text-gray-300">{aiResult.generalComment}</p>
          {aiResult.strengths?.length > 0 && (
            <div><p className="text-xs font-medium text-green-600 mb-1">{t(lang, '優點：', 'Strengths:')}</p><ul className="list-disc list-inside text-sm text-gray-600 space-y-0.5">{aiResult.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></div>
          )}
          {aiResult.grammarErrors?.length > 0 && (
            <div><p className="text-xs font-medium text-red-600 mb-1">{t(lang, '文法錯誤：', 'Grammar Errors:')}</p>
              {aiResult.grammarErrors.map((e: { original: string; correction: string; explanation: string }, i: number) => (
                <div key={i} className="text-sm text-red-700 ml-2"><span className="line-through">{e.original}</span> → <span className="font-medium">{e.correction}</span><span className="text-gray-500 ml-2">({e.explanation})</span></div>))}
            </div>
          )}
          {aiResult.chinglishWarnings?.length > 0 && (
            <div><p className="text-xs font-medium text-amber-600 mb-1">{t(lang, '中式英文：', 'Chinglish:')}</p>
              {aiResult.chinglishWarnings.map((c: { original: string; suggestion: string }, i: number) => (
                <div key={i} className="text-sm text-amber-700 ml-2"><span className="line-through">{c.original}</span> → <span className="font-medium">{c.suggestion}</span></div>))}
            </div>
          )}
          {aiResult.structureFeedback && <div><p className="text-xs font-medium text-blue-600 mb-1">{t(lang, '結構評語：', 'Structure:')}</p><p className="text-sm text-gray-600">{aiResult.structureFeedback}</p></div>}
          {aiResult.vocabularySuggestions?.length > 0 && (
            <div><p className="text-xs font-medium text-green-600 mb-1">{t(lang, '詞彙建議：', 'Vocabulary:')}</p>
              {aiResult.vocabularySuggestions.map((v: { original: string; suggestion: string; reason: string }, i: number) => (
                <div key={i} className="text-sm text-green-700 ml-2"><span className="line-through">{v.original}</span> → <span className="font-medium">{v.suggestion}</span><span className="text-gray-500 ml-2">({v.reason})</span></div>))}
            </div>
          )}
          {aiResult.revisedVersion && (
            <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded-lg"><p className="text-xs font-medium text-purple-600 mb-1">{t(lang, '修改版：', 'Revised:')}</p><p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{aiResult.revisedVersion}</p></div>
          )}
        </div>
      )}
    </div>
  );
}
