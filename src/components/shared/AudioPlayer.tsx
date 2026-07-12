// ============================================
// AudioPlayer — 文字轉語音元件（支援多人對話）
//
// 雙模式：
//   1. Google Cloud TTS（useCloudTTS=true）→ 高品質神經語音 + 自然 intonation
//   2. 瀏覽器 Web Speech API（預設）→ 離線可用
//
// 自動解析對話角色標籤（Woman:/Man: 等），用不同語音朗讀
// ============================================
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Volume2, Pause, Loader2 } from 'lucide-react';

interface AudioPlayerProps {
  text: string;
  label?: string;
  autoPlay?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onPlayEnd?: () => void;
  /** 啟用 Google Cloud TTS（server-side 神經語音，intonation 自然） */
  useCloudTTS?: boolean;
}

interface DialogueLine {
  speaker: string | null;
  text: string;
}

/** Available playback speeds */
const SPEEDS = [0.75, 1.0, 1.25, 1.5] as const;
const SPEED_LABELS: Record<number, string> = { 0.75: '0.75×', 1: '1×', 1.25: '1.25×', 1.5: '1.5×' };
const DEFAULT_SPEED = 0.9;
const SPEED_STORAGE_KEY = 'audio-player-speed';

const SPEAKER_LINE_RE = /^(Woman|Man|Boy|Girl|Speaker\s*[AB12]?)\s*[:：\-–—]\s*(.+)$/i;

/** 將一行內多個角色對話拆成多行 */
function splitMultiSpeakerLine(text: string): string {
  // 在每個角色標籤前插入換行（若該行已有內容）
  return text.replace(/([^\n])(Woman|Man|Boy|Girl|Speaker\s*[AB12]?)\s*[:：\-–—]/gi, '$1\n$2:');
}

/** 備用清理：移除所有角色標籤（避免 TTS 直接朗讀 "Librarian:" "Man:" "Woman:" 等文字） */
function stripSpeakerLabels(text: string): string {
  return text
    .replace(/^[A-Za-z]+(?:\s+[A-Za-z]+)?\s*[:：\-–—]\s*/gm, '')
    .trim();
}

function parseDialogue(text: string): DialogueLine[] {
  // 第一步：將一行多角色拆成多行
  const normalized = splitMultiSpeakerLine(text);
  // 第二步：清理角色標籤作為保險
  const cleaned = stripSpeakerLabels(normalized);
  const lines = cleaned.split(/\n/).map(l => l.trim()).filter(Boolean);
  const dialogue: DialogueLine[] = [];

  // 從原始（已正規化）文字中提取角色資訊
  const rawLines = normalized.split(/\n/).map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < Math.max(rawLines.length, lines.length); i++) {
    const rawLine = rawLines[i] || '';
    const cleanLine = lines[i] || rawLine;
    const match = rawLine.match(SPEAKER_LINE_RE);
    if (match) {
      const speaker = match[1].toLowerCase().replace(/\s+/g, '');
      const spokenText = match[2].trim() || cleanLine;
      dialogue.push({ speaker, text: spokenText });
    } else {
      dialogue.push({ speaker: null, text: cleanLine });
    }
  }

  if (dialogue.length === 0) {
    dialogue.push({ speaker: null, text: cleaned });
  }

  return dialogue;
}

function pickVoice(
  voices: SpeechSynthesisVoice[],
  lang: 'en' | 'zh',
  gender: 'female' | 'male' | 'any' = 'any',
): SpeechSynthesisVoice | null {
  const langPrefix = lang === 'zh' ? 'zh' : 'en';
  const candidates = voices.filter(v => v.lang.startsWith(langPrefix));
  if (candidates.length === 0) return null;

  // 已知語音名稱特徵庫（跨平台）
  const FEMALE_PATTERNS = /female|samantha|karen|zira|victoria|hazel|susan|eva|catherine|linda|amy|emma|sarah|fiona|google.*female/i;
  const MALE_PATTERNS = /male|daniel|tom|david|alex|mark|george|james|paul|michael|peter|robert|google.*male/i;

  if (gender === 'female') {
    const found = candidates.find(v => FEMALE_PATTERNS.test(v.name));
    if (found) return found;
    // 啟發式：取候選列表的最後一個（多數系統將女聲排在後方）
    // 同時排除已知的男聲名稱
    const nonMale = candidates.filter(v => !MALE_PATTERNS.test(v.name));
    if (nonMale.length > 0) return nonMale[nonMale.length - 1];
    return candidates[candidates.length - 1] || candidates[0];
  }
  if (gender === 'male') {
    const found = candidates.find(v => MALE_PATTERNS.test(v.name));
    if (found) return found;
    // 啟發式：取候選列表的第一個（多數系統將男聲排在前方）
    const nonFemale = candidates.filter(v => !FEMALE_PATTERNS.test(v.name));
    if (nonFemale.length > 0) return nonFemale[0];
    return candidates[0];
  }
  return candidates[0];
}

/** 若無法區分男女聲，用 pitch 模擬差異 */
function getSpeakerPitch(speaker: string | null): number {
  if (!speaker) return 1.0;
  switch (speaker) {
    case 'man': case 'boy': return 0.85;   // 男聲：略低
    case 'woman': case 'girl': return 1.15; // 女聲：略高
    default: return 1.0;
  }
}

export default function AudioPlayer({
  text,
  label = '播放',
  autoPlay = false,
  size = 'md',
  className = '',
  onPlayEnd,
  useCloudTTS = false,
}: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  // Cloud TTS 狀態
  const [cloudAudioUrl, setCloudAudioUrl] = useState<string | null>(null);
  const [cloudFetching, setCloudFetching] = useState(false);
  const cloudAudioRef = useRef<HTMLAudioElement | null>(null);
  const cloudAbortRef = useRef<AbortController | null>(null);
  // 緩存：用 ref 避免 stale closure
  const cachedTextRef = useRef<string>('');
  const cachedUrlRef = useRef<string | null>(null);
  const [speed, setSpeed] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_SPEED;
    const saved = localStorage.getItem(SPEED_STORAGE_KEY);
    if (saved) {
      const parsed = parseFloat(saved);
      if (SPEEDS.includes(parsed as typeof SPEEDS[number])) return parsed;
    }
    return DEFAULT_SPEED;
  });
  const cancelled = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SPEED_STORAGE_KEY, String(speed));
    }
  }, [speed]);

  // 清理 blob URL（避免記憶體洩漏）
  useEffect(() => {
    return () => {
      if (cachedUrlRef.current) {
        URL.revokeObjectURL(cachedUrlRef.current);
        cachedUrlRef.current = null;
      }
    };
  }, []);

  if (typeof window === 'undefined') {
    return <span className="text-xs text-gray-400">TTS</span>;
  }

  const synth = window.speechSynthesis;

  const handleStop = useCallback(() => {
    cancelled.current = true;
    if (synth) synth.cancel();
    // 停止 Cloud TTS audio
    if (cloudAudioRef.current) {
      cloudAudioRef.current.pause();
      cloudAudioRef.current.currentTime = 0;
    }
    // 取消進行中的 fetch
    if (cloudAbortRef.current) {
      cloudAbortRef.current.abort();
      cloudAbortRef.current = null;
    }
    setPlaying(false);
    setLoading(false);
    setCloudFetching(false);
  }, [synth]);

  // ============================================
  // Google Cloud TTS 播放
  // ============================================
  const playCloudTTS = useCallback(async () => {
    if (!text) return;

    // 已有緩存的 audio → 直接播放
    if (cachedUrlRef.current && cachedTextRef.current === text) {
      if (cloudAudioRef.current) {
        cloudAudioRef.current.currentTime = 0;
        await cloudAudioRef.current.play();
        setPlaying(true);
      }
      return;
    }

    // 釋放舊的 blob URL
    if (cachedUrlRef.current) {
      URL.revokeObjectURL(cachedUrlRef.current);
      cachedUrlRef.current = null;
    }

    setCloudFetching(true);
    setLoading(true);

    const controller = new AbortController();
    cloudAbortRef.current = controller;

    // 多人對話模式需要多段合成，給 60 秒 timeout
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      // 聆聽內容用較慢語速 (0.9)，模擬 DSE 考試語速
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          multiSpeaker: true,
          voiceTier: 'default',
          speakingRate: 0.9,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 503) {
          console.warn('[TTS] Cloud TTS unavailable, falling back to Web Speech API');
        } else {
          console.error('[TTS] Cloud TTS error:', res.status);
        }
        setCloudFetching(false);
        setLoading(false);
        handlePlayWebSpeech();
        return;
      }

      const blob = await res.blob();
      clearTimeout(timeoutId);
      const url = URL.createObjectURL(blob);
      setCloudAudioUrl(url);
      cachedUrlRef.current = url;
      cachedTextRef.current = text;

      const audio = new Audio(url);
      cloudAudioRef.current = audio;

      audio.onplay = () => {
        setLoading(false);
        setCloudFetching(false);
        setPlaying(true);
      };
      audio.onended = () => {
        setPlaying(false);
        onPlayEnd?.();
      };
      audio.onerror = () => {
        console.error('[TTS] Audio playback error');
        setPlaying(false);
        setCloudFetching(false);
        setLoading(false);
        handlePlayWebSpeech();
      };

      await audio.play();
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === 'AbortError') {
        // 用戶取消或 timeout，正常
      } else {
        console.error('[TTS] Cloud TTS fetch failed:', err);
      }
      setCloudFetching(false);
      setLoading(false);
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        handlePlayWebSpeech();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, onPlayEnd]);

  // ============================================
  // Web Speech API 播放（原有邏輯）
  // ============================================

  const handlePlayWebSpeech = useCallback(() => {
    if (!text) return;

    if (playing) {
      handleStop();
      return;
    }

    if (!synth) {
      setLoading(false);
      return;
    }

    setLoading(true);
    cancelled.current = false;
    synth.cancel();

    const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const lang: 'en' | 'zh' = cjkCount / Math.max(text.length, 1) > 0.3 ? 'zh' : 'en';

    const dialogue = parseDialogue(text);

    const trySpeak = () => {
      const voices = synth.getVoices();
      if (voices.length === 0) {
        setTimeout(trySpeak, 100);
        return;
      }

      const femaleVoice = pickVoice(voices, lang, 'female') || pickVoice(voices, lang, 'any');
      const maleVoice = pickVoice(voices, lang, 'male') || pickVoice(voices, lang, 'any');
      const defaultVoice = pickVoice(voices, lang, 'any');

      // 若男女聲相同（只有一個語音），用 pitch 差異補償
      const sameVoice = femaleVoice && maleVoice && femaleVoice.name === maleVoice.name;

      const map = new Map<string, SpeechSynthesisVoice | null>();
      map.set('woman', femaleVoice);
      map.set('girl', femaleVoice);
      map.set('man', maleVoice);
      map.set('boy', maleVoice);

      let idx = 0;

      const speakNext = () => {
        if (cancelled.current) {
          setPlaying(false);
          setLoading(false);
          return;
        }

        while (idx < dialogue.length && !dialogue[idx].text.trim()) idx++;

        if (idx >= dialogue.length) {
          setPlaying(false);
          setLoading(false);
          onPlayEnd?.();
          return;
        }

        const line = dialogue[idx];
        const utterance = new SpeechSynthesisUtterance(line.text);
        utterance.lang = lang === 'zh' ? 'zh-HK' : 'en-US';
        utterance.rate = speed;
        // 有角色標籤時：若男女聲相同則用 pitch 區分，否則用預設 pitch
        utterance.pitch = (line.speaker && sameVoice)
          ? getSpeakerPitch(line.speaker)
          : (line.speaker ? getSpeakerPitch(line.speaker) : 1.0);

        if (line.speaker) {
          const voice = map.get(line.speaker);
          if (voice) utterance.voice = voice;
        } else if (defaultVoice) {
          utterance.voice = defaultVoice;
        }

        utterance.onstart = () => { setLoading(false); setPlaying(true); };
        utterance.onend = () => { idx++; setTimeout(speakNext, line.speaker ? 120 : 60); };
        utterance.onerror = (e) => {
          if (e.error === 'canceled' || e.error === 'interrupted') { setPlaying(false); setLoading(false); return; }
          idx++;
          setTimeout(speakNext, 100);
        };

        synth.speak(utterance);
      };

      speakNext();
    };

    trySpeak();
  }, [text, playing, synth, handleStop, onPlayEnd, speed]);

  const isBusy = loading || cloudFetching;

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs gap-1',
    md: 'px-3 py-1.5 text-sm gap-1.5',
    lg: 'px-4 py-2.5 text-base gap-2',
  };

  const iconSize = { sm: 'w-3 h-3', md: 'w-4 h-4', lg: 'w-5 h-5' };

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      <button
        onClick={useCloudTTS ? (playing ? handleStop : playCloudTTS) : handlePlayWebSpeech}
        disabled={isBusy}
        className={`inline-flex items-center rounded-lg font-medium transition-colors disabled:opacity-50 ${
          playing
            ? 'bg-teal-100 text-teal-700 hover:bg-teal-200 dark:bg-teal-900/30 dark:text-teal-300'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
        } ${sizeClasses[size]}`}
        title={playing ? '停止' : label}
      >
        {isBusy ? (
          <Loader2 className={`${iconSize[size]} animate-spin`} />
        ) : playing ? (
          <Pause className={iconSize[size]} />
        ) : (
          <Volume2 className={iconSize[size]} />
        )}
        {playing ? '停止' : label}
      </button>

      {/* Speed selector — only for Web Speech API (cloud TTS uses fixed server-side rate) */}
      {!playing && !useCloudTTS && (
        <div className="flex items-center gap-0.5">
          {SPEEDS.map(s => (
            <button
              key={s}
              onClick={(e) => { e.stopPropagation(); setSpeed(s); }}
              className={`px-1.5 py-0.5 text-xs rounded-md font-medium transition-colors ${
                speed === s
                  ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-300'
              }`}
              title={SPEED_LABELS[s]}
            >
              {SPEED_LABELS[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
