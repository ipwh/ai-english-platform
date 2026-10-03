// ============================================
// 學生端 — IELTS 口說準備中心（Preparation Centre）
// ============================================
// 產品決定（2026-10-03 II）：本平台不評分口說、不模擬真人考官對答、不評估發音。
// 本頁只教「如何準備」：考試結構、題庫、四宮格筆記法、串題方法、自錄自聽、
// AI 準備教練（產生計劃／語言功能／陷阱／練習問題——絕不含分數）。
//
// 注意：只可匯入 modules/ielts 的純 domain/speaking 檔案（barrel 會拉入伺服器碼）。
// ============================================
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useT } from '@/hooks/use-i18n';
import {
  IELTS_SPEAKING_PARTS,
  IELTS_SPEAKING_CRITERIA_DEFINITIONS,
} from '@/modules/ielts/speaking/criteria';
import {
  IELTS_SPEAKING_TOPIC_CATEGORIES,
  getSpeakingTopicsByCategory,
  type IeltsSpeakingTopicCategory,
} from '@/modules/ielts/speaking/topic-bank';
import {
  IELTS_SPEAKING_PREP_SECTIONS,
  IELTS_SPEAKING_NOTE_GRID,
  IELTS_SPEAKING_STORY_MERGING,
  IELTS_SPEAKING_PRACTICE_LOOP,
  IELTS_SPEAKING_PITFALLS,
} from '@/modules/ielts/speaking/strategies';
import { Loader2, Info, Mic, Layers, ShieldAlert, Sparkles } from 'lucide-react';

type PartType = 'speaking_part1' | 'speaking_part2' | 'speaking_part3';

interface PrepResult {
  kind: 'PREPARATION_ONLY';
  notice: 'NO_SPEAKING_SCORE_OFFERED';
  plan: { focus: string; steps: string[] };
  outline: Array<{ facet: string; ideas: string[] }>;
  usefulLanguage: Array<{ item: string; example: string; usage: string }>;
  pitfalls: string[];
  followUpQuestions: string[];
  mergeSuggestions: Array<{ theme: string; suggestion: string }>;
  limitations: string[];
  promptVersion: string;
}

const PART_KEYS: Record<PartType, string> = {
  speaking_part1: 'ielts.speaking.part1',
  speaking_part2: 'ielts.speaking.part2',
  speaking_part3: 'ielts.speaking.part3',
};

const CATEGORY_KEYS: Record<IeltsSpeakingTopicCategory, string> = {
  part1_themes: 'ielts.speaking.category.part1',
  people: 'ielts.speaking.category.people',
  places: 'ielts.speaking.category.places',
  objects_things: 'ielts.speaking.category.objects',
  events_experiences: 'ielts.speaking.category.events',
  part3_functions: 'ielts.speaking.category.part3',
};

export default function IeltsSpeakingPrepPage() {
  const { t } = useT();

  const [category, setCategory] = useState<IeltsSpeakingTopicCategory>('people');
  const topics = useMemo(() => getSpeakingTopicsByCategory(category), [category]);
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);

  // Coach state
  const [part, setPart] = useState<PartType>('speaking_part2');
  const [topicPrompt, setTopicPrompt] = useState('');
  const [topicId, setTopicId] = useState<string | undefined>(undefined);
  const [studentNotes, setStudentNotes] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [errorKey, setErrorKey] = useState('');
  const [prep, setPrep] = useState<PrepResult | null>(null);

  // Note grid state
  const [gridCells, setGridCells] = useState(['', '', '', '']);

  // Story merging state
  const [storyText, setStoryText] = useState('');
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const mergeCandidates = useMemo(
    () =>
      ['people', 'places', 'objects_things', 'events_experiences'].flatMap((c) =>
        getSpeakingTopicsByCategory(c as IeltsSpeakingTopicCategory),
      ),
    [],
  );

  function pickTopic(id: string) {
    const topicsAll = mergeCandidates
      .concat(getSpeakingTopicsByCategory('part1_themes'))
      .concat(getSpeakingTopicsByCategory('part3_functions'));
    const topic = topicsAll.find((x) => x.id === id);
    if (!topic) return;
    setPart(topic.part as PartType);
    setTopicPrompt(topic.prompt + (topic.cueFacets ? `\nYou should say: ${topic.cueFacets.join('; ')}.` : ''));
    setTopicId(topic.id);
    setPrep(null);
    setErrorKey('');
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  async function runCoach(overrides?: { part?: PartType; prompt?: string; notes?: string; topicId?: string }) {
    const payload = {
      part: overrides?.part ?? part,
      topicPrompt: overrides?.prompt ?? topicPrompt,
      studentNotes: (overrides?.notes ?? studentNotes) || undefined,
      topicId: overrides?.topicId ?? topicId,
    };
    setPreparing(true);
    setErrorKey('');
    setPrep(null);
    try {
      const res = await fetch('/api/ielts/speaking/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { preparation?: PrepResult; error?: string };
      if (!res.ok) {
        const key = data.error ? `ielts.error.${data.error}` : 'ielts.error.generic';
        setErrorKey(t(key) !== key ? key : 'ielts.error.generic');
        return;
      }
      if (data.preparation) setPrep(data.preparation);
    } catch {
      setErrorKey('ielts.error.generic');
    } finally {
      setPreparing(false);
    }
  }

  function toggleCard(id: string) {
    setSelectedCardIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function runMergeCoach() {
    const titles = mergeCandidates.filter((c) => selectedCardIds.includes(c.id)).map((c) => c.title);
    if (titles.length === 0 || !storyText.trim()) return;
    await runCoach({
      part: 'speaking_part2',
      prompt: `Practise merging ONE personal story across these cue cards: ${titles.join(' / ')}.`,
      notes: `My story: ${storyText}`,
      topicId: undefined,
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <header>
        <Link href="/student/ielts" className="text-xs text-indigo-600 hover:underline">
          ← {t('ielts.title')}
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Mic className="h-6 w-6 text-indigo-600" />
          {t('ielts.speaking.title')}
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {t('ielts.betaBadge')}
          </span>
        </h1>
      </header>

      <div className="flex items-start gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">{t('ielts.speaking.noScoreNotice')}</p>
          <p className="mt-1">{t('ielts.speaking.variantNote')}</p>
          <p className="mt-1">{t('ielts.disclaimer')}</p>
        </div>
      </div>

      {/* 一、考試結構與準則（教學） */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t('ielts.speaking.howItWorks')}</h2>
        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
          {(Object.keys(IELTS_SPEAKING_PARTS) as PartType[]).map((p) => {
            const config = IELTS_SPEAKING_PARTS[p];
            return (
              <div key={p} className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                <p className="font-semibold text-slate-900">{t(PART_KEYS[p])}</p>
                <p className="mt-1">{config.description}</p>
                <p className="mt-1 text-slate-500">{config.durationLabel}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('ielts.speaking.criteriaTitle')}</h3>
          <ul className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            {IELTS_SPEAKING_CRITERIA_DEFINITIONS.map((c) => (
              <li key={c.key} className="rounded-lg border border-slate-100 p-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">{c.labelEn}</span>
                <ul className="mt-1 list-disc pl-4">
                  {c.focus.slice(0, 2).map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4 space-y-2">
          {IELTS_SPEAKING_PREP_SECTIONS.filter((s) => s.id !== 'overview').map((section) => (
            <details key={section.id} className="rounded-xl border border-slate-100 p-3 text-xs text-slate-700">
              <summary className="cursor-pointer font-semibold text-slate-900">{section.titleEn}</summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {section.points.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>

      {/* 二、題庫 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <Layers className="h-4 w-4" /> {t('ielts.speaking.topicBank')}
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {IELTS_SPEAKING_TOPIC_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                setCategory(c.key);
                setExpandedTopicId(null);
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                category === c.key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {t(CATEGORY_KEYS[c.key])}
            </button>
          ))}
        </div>
        <ul className="mt-3 space-y-2">
          {topics.map((topic) => (
            <li key={topic.id} className="rounded-xl border border-slate-100 p-3">
              <button
                type="button"
                onClick={() => setExpandedTopicId(expandedTopicId === topic.id ? null : topic.id)}
                className="w-full text-left text-sm font-medium text-slate-900"
              >
                {topic.title}
              </button>
              {expandedTopicId === topic.id && (
                <div className="mt-2 space-y-3 text-xs text-slate-700">
                  <p className="rounded-lg bg-slate-50 p-2 italic">{topic.prompt}</p>
                  {topic.cueFacets && (
                    <p className="font-medium text-slate-500">You should say: {topic.cueFacets.join('; ')}.</p>
                  )}
                  <div>
                    <p className="font-semibold text-slate-800">{t('ielts.speaking.prepPointers')}</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {topic.prepPointers.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{t('ielts.speaking.languageFunctions')}</p>
                    <ul className="mt-1 space-y-1">
                      {topic.languageFunctions.map((f, i) => (
                        <li key={i}>
                          <span className="font-medium">{f.function}:</span>{' '}
                          <span className="italic">“{f.examples[0]}”</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{t('ielts.speaking.pitfalls')}</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-rose-700">
                      {topic.pitfalls.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => pickTopic(topic.id)}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    {t('ielts.speaking.practiceWithThis')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* 三、Part 2 四宮格筆記 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t('ielts.speaking.noteGridTitle')}
        </h2>
        <p className="mt-1 text-xs text-slate-600">{IELTS_SPEAKING_NOTE_GRID.intro}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-700">
          {IELTS_SPEAKING_NOTE_GRID.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {IELTS_SPEAKING_NOTE_GRID.example.cells.map((cell, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-2">
              <p className="text-[11px] font-semibold text-slate-700">
                {cell.facet} <span className="ml-1 rounded bg-slate-100 px-1 text-slate-500">{cell.tense}</span>
              </p>
              <textarea
                value={gridCells[i]}
                onChange={(e) => setGridCells((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                rows={2}
                placeholder={cell.keywords}
                className="mt-1 w-full rounded-lg border border-slate-200 p-1.5 text-xs focus:border-indigo-400 focus:outline-none"
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          {t('ielts.speaking.gridHint')}
        </p>
      </section>

      {/* 四、串題工作台 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <Layers className="h-4 w-4" /> {t('ielts.speaking.mergeTitle')}
        </h2>
        <p className="mt-1 text-xs text-slate-600">{IELTS_SPEAKING_STORY_MERGING.intro}</p>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-700">
          {IELTS_SPEAKING_STORY_MERGING.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">
          {IELTS_SPEAKING_STORY_MERGING.warnings.join(' ')}
        </p>
        <p className="mt-3 text-xs font-semibold text-slate-700">{t('ielts.speaking.selectCards')}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {mergeCandidates.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => toggleCard(card.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] transition ${
                selectedCardIds.includes(card.id)
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {card.title}
            </button>
          ))}
        </div>
        <label className="mt-3 block text-xs font-semibold text-slate-700">{t('ielts.speaking.yourStory')}</label>
        <textarea
          value={storyText}
          onChange={(e) => setStoryText(e.target.value)}
          rows={3}
          placeholder={t('ielts.speaking.yourStoryPlaceholder')}
          className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-xs focus:border-indigo-400 focus:outline-none"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => void runMergeCoach()}
            disabled={preparing || selectedCardIds.length === 0 || !storyText.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t('ielts.speaking.mergeGenerate')}
          </button>
        </div>
      </section>

      {/* 五、AI 準備教練 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <Sparkles className="h-4 w-4" /> {t('ielts.speaking.coachTitle')}
        </h2>
        <p className="mt-1 text-xs text-slate-600">{t('ielts.speaking.coachIntro')}</p>

        <label className="mt-3 block text-xs font-semibold text-slate-700">{t('ielts.speaking.part')}</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {(Object.keys(PART_KEYS) as PartType[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPart(p)}
              className={`rounded-full px-3 py-1 text-[11px] transition ${
                part === p ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t(PART_KEYS[p])}
            </button>
          ))}
        </div>

        <label className="mt-3 block text-xs font-semibold text-slate-700">{t('ielts.speaking.taskCard')}</label>
        <textarea
          value={topicPrompt}
          onChange={(e) => setTopicPrompt(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-xs focus:border-indigo-400 focus:outline-none"
        />

        <label className="mt-3 block text-xs font-semibold text-slate-700">{t('ielts.speaking.yourNotes')}</label>
        <textarea
          value={studentNotes}
          onChange={(e) => setStudentNotes(e.target.value)}
          rows={3}
          placeholder={t('ielts.speaking.notesPlaceholder')}
          className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-xs focus:border-indigo-400 focus:outline-none"
        />

        <div className="mt-3 flex items-center justify-end gap-3">
          {errorKey && <p className="text-xs text-red-600">{t(errorKey)}</p>}
          <button
            type="button"
            onClick={() => void runCoach()}
            disabled={preparing || topicPrompt.trim().length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {preparing && <Loader2 className="h-4 w-4 animate-spin" />}
            {preparing ? t('ielts.writing.assessing') : t('ielts.speaking.startCoach')}
          </button>
        </div>

        {prep && (
          <div className="mt-4 space-y-3">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-800">
              <Info className="h-3.5 w-3.5" /> {t('ielts.speaking.prepOnly')} · {prep.promptVersion}
            </p>

            {(prep.plan.focus || prep.plan.steps.length > 0) && (
              <div className="rounded-xl border border-slate-100 p-3 text-xs text-slate-700">
                <p className="font-semibold text-slate-900">{t('ielts.speaking.planTitle')}</p>
                {prep.plan.focus && <p className="mt-1">{prep.plan.focus}</p>}
                <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                  {prep.plan.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>
            )}

            {prep.outline.length > 0 && (
              <div className="rounded-xl border border-slate-100 p-3 text-xs text-slate-700">
                <p className="font-semibold text-slate-900">{t('ielts.speaking.outlineTitle')}</p>
                <ul className="mt-1 space-y-1">
                  {prep.outline.map((o, i) => (
                    <li key={i}>
                      <span className="font-medium">{o.facet}:</span> {o.ideas.join(' · ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {prep.usefulLanguage.length > 0 && (
              <div className="rounded-xl border border-slate-100 p-3 text-xs text-slate-700">
                <p className="font-semibold text-slate-900">{t('ielts.speaking.languageTitle')}</p>
                <ul className="mt-1 space-y-1">
                  {prep.usefulLanguage.map((l, i) => (
                    <li key={i}>
                      <span className="font-medium">{l.item}</span>
                      {l.usage && <span className="text-slate-500"> — {l.usage}</span>}
                      {l.example && <div className="italic text-slate-600">“{l.example}”</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {prep.pitfalls.length > 0 && (
              <div className="rounded-xl border border-slate-100 p-3 text-xs text-rose-700">
                <p className="font-semibold">{t('ielts.speaking.pitfalls')}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {prep.pitfalls.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            {prep.followUpQuestions.length > 0 && (
              <div className="rounded-xl border border-slate-100 p-3 text-xs text-slate-700">
                <p className="font-semibold text-slate-900">{t('ielts.speaking.followUpsTitle')}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {prep.followUpQuestions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            {prep.mergeSuggestions.length > 0 && (
              <div className="rounded-xl border border-slate-100 p-3 text-xs text-slate-700">
                <p className="font-semibold text-slate-900">{t('ielts.speaking.mergeSuggestionsTitle')}</p>
                <ul className="mt-1 space-y-1">
                  {prep.mergeSuggestions.map((m, i) => (
                    <li key={i}>
                      <span className="font-medium">{m.theme}:</span> {m.suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500">
              <ul className="list-disc space-y-0.5 pl-4">
                {prep.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* 六、自錄自聽 + 常見陷阱 */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t('ielts.speaking.practiceLoopTitle')}
          </h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-700">
            {IELTS_SPEAKING_PRACTICE_LOOP.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {t('ielts.speaking.selfCheck')}
          </h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-600">
            {IELTS_SPEAKING_PRACTICE_LOOP.selfCheckQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-rose-500">
            {t('ielts.speaking.commonPitfalls')}
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-700">
            {IELTS_SPEAKING_PITFALLS.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      </section>

      <div className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>{t('ielts.speaking.notOffered')}</p>
      </div>
    </div>
  );
}
