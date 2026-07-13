// ============================================
// AudioPlayer — 文字轉語音元件（支援多人對話）
//
// 雙模式：
//   1. Google Cloud TTS（useCloudTTS=true）→ 高品質神經語音 + 自然 intonation
//   2. 瀏覽器 Web Speech API（預設）→ 離線可用
//
// 自動解析對話角色標籤（Woman:/Man: 等），用不同語音朗讀
// v2.0: 全域快取、預載入、進度提示、強化標籤剝離
// ============================================
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Volume2, Pause, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

interface AudioPlayerProps {
  text: string;
  label?: string;
  autoPlay?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onPlayEnd?: () => void;
  /** 啟用 Google Cloud TTS（server-side 神經語音，intonation 自然） */
  useCloudTTS?: boolean;
  /** 預載入 callback — 父元件可呼叫此函式提前生成音訊 */
  onPrefetchReady?: (prefetch: () => void) => void;
}

interface DialogueLine {
  speaker: string | null;
  text: string;
}

// ============================================
// 全域 Cloud TTS 快取（跨 AudioPlayer 實例共用）
// ============================================
interface CacheEntry {
  url: string;
  addedAt: number;
}
const TTS_CACHE = new Map<string, CacheEntry>();
const CACHE_MAX_AGE_MS = 30 * 60 * 1000; // 30 分鐘 TTL
const CACHE_MAX_SIZE = 30; // 最多 30 個項目

function getCacheKey(text: string, speakingRate: number): string {
  // 用文字內容 + 語速作為快取鍵
  return `${speakingRate.toFixed(2)}::${text}`;
}

function cleanExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of TTS_CACHE) {
    if (now - entry.addedAt > CACHE_MAX_AGE_MS) {
      URL.revokeObjectURL(entry.url);
      TTS_CACHE.delete(key);
    }
  }
}

function evictOldestIfNeeded(): void {
  if (TTS_CACHE.size <= CACHE_MAX_SIZE) return;
  let oldestKey = '';
  let oldestTime = Infinity;
  for (const [key, entry] of TTS_CACHE) {
    if (entry.addedAt < oldestTime) {
      oldestTime = entry.addedAt;
      oldestKey = key;
    }
  }
  if (oldestKey) {
    const entry = TTS_CACHE.get(oldestKey);
    if (entry) URL.revokeObjectURL(entry.url);
    TTS_CACHE.delete(oldestKey);
  }
}

/**
 * 預載入 TTS 音訊到全域快取（可在 AudioPlayer 外部呼叫）
 * 用於提前載入下一題的錄音，減少等待時間
 */
export async function prefetchTTSAudio(text: string, speakingRate = 0.9): Promise<void> {
  if (!text) return;

  const cacheKey = getCacheKey(text, speakingRate);
  if (TTS_CACHE.has(cacheKey)) return; // 已快取

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        multiSpeaker: true,
        voiceTier: 'default',
        speakingRate,
      }),
    });

    if (!res.ok) {
      console.warn('[TTS Prefetch] Failed:', res.status);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    cleanExpiredCache();
    evictOldestIfNeeded();
    TTS_CACHE.set(cacheKey, { url, addedAt: Date.now() });
  } catch {
    // silent fail for prefetch
  }
}

/** Available playback speeds */
const SPEEDS = [0.75, 1.0, 1.25, 1.5] as const;
const SPEED_LABELS: Record<number, string> = { 0.75: '0.75×', 1: '1×', 1.25: '1.25×', 1.5: '1.5×' };
const DEFAULT_SPEED = 0.9;
const SPEED_STORAGE_KEY = 'audio-player-speed';

const SPEAKER_LINE_RE = /^(Woman|Man|Boy|Girl|Speaker\s*[AB12]?)\s*[:：\-–—]\s*(.+)$/i;

/** 將一行內多個角色對話拆成多行 */
function splitMultiSpeakerLine(text: string): string {
  return text.replace(/([^\n])(Woman|Man|Boy|Girl|Speaker\s*[AB12]?)\s*[:：\-–—]/gi, '$1\n$2:');
}

/** 剝離所有角色標籤（確保 TTS 不會直接朗讀 "Librarian:" "Man:" 等），並清除殘餘標點 */
function stripSpeakerLabels(text: string): string {
  return text
    .replace(/^[A-Za-z]+(?:\s+[A-Za-z]+)?\s*[:：\-–—]\s*/gm, '')
    // 清除 TTS 容易朗讀出來的殘餘特殊字元
    .replace(/[""'']/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** 為 TTS 準備文字：先正規化多角色行，再剝離標籤，保留乾淨對話 */
function prepareTextForTTS(text: string): string {
  const normalized = splitMultiSpeakerLine(text);
  return stripSpeakerLabels(normalized);
}

function parseDialogue(text: string): DialogueLine[] {
  const normalized = splitMultiSpeakerLine(text);
  const cleaned = stripSpeakerLabels(normalized);
  const lines = cleaned.split(/\n/).map(l => l.trim()).filter(Boolean);
  const dialogue: DialogueLine[] = [];

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
  onPrefetchReady,
}: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  // Cloud TTS 狀態
  const [cloudFetching, setCloudFetching] = useState(false);
  const [cloudError, setCloudError] = useState('');
  const cloudAudioRef = useRef<HTMLAudioElement | null>(null);
  const cloudAbortRef = useRef<AbortController | null>(null);
  // 快取：用 ref 記錄當前已快取的 text → url
  const cachedUrlRef = useRef<string | null>(null);
  const cachedKeyRef = useRef<string>('');
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

  // 清理全域快取中過期項目
  useEffect(() => {
    cleanExpiredCache();
    const interval = setInterval(cleanExpiredCache, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // 清理自身 audio 資源（避免記憶體洩漏 + 殘餘語音）
  useEffect(() => {
    return () => {
      // 停止並清理 Cloud TTS audio
      if (cloudAudioRef.current) {
        cloudAudioRef.current.pause();
        cloudAudioRef.current.currentTime = 0;
        cloudAudioRef.current.src = '';
        cloudAudioRef.current.load();
        cloudAudioRef.current = null;
      }
      // 中斷進行中的 fetch
      if (cloudAbortRef.current) {
        cloudAbortRef.current.abort();
        cloudAbortRef.current = null;
      }
      // 清理 Web Speech
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      cancelled.current = true;
      cachedUrlRef.current = null;
    };
  }, []);

  // 監聽全域停止事件
  useEffect(() => {
    const handleGlobalStop = () => {
      cancelled.current = true;
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
      if (cloudAudioRef.current) {
        cloudAudioRef.current.pause();
        cloudAudioRef.current.currentTime = 0;
      }
      if (cloudAbortRef.current) {
        cloudAbortRef.current.abort();
        cloudAbortRef.current = null;
      }
      setPlaying(false);
      setLoading(false);
      setCloudFetching(false);
    };
    window.addEventListener('stop-all-audio', handleGlobalStop);
    return () => window.removeEventListener('stop-all-audio', handleGlobalStop);
  }, []);

  if (typeof window === 'undefined') {
    return <span className="text-xs text-gray-400">TTS</span>;
  }

  const synth = window.speechSynthesis;

  const handleStop = useCallback(() => {
    cancelled.current = true;
    if (synth) synth.cancel();
    if (cloudAudioRef.current) {
      cloudAudioRef.current.pause();
      cloudAudioRef.current.currentTime = 0;
    }
    if (cloudAbortRef.current) {
      cloudAbortRef.current.abort();
      cloudAbortRef.current = null;
    }
    setPlaying(false);
    setLoading(false);
    setCloudFetching(false);
  }, [synth]);

  // ============================================
  // 預載入音訊（供父元件在 hover / page load 時呼叫）
  // ============================================
  const prefetchAudio = useCallback(async () => {
    if (!text || !useCloudTTS) return;

    const cacheKey = getCacheKey(text, speed);
    // 已在快取中 → 跳過
    if (TTS_CACHE.has(cacheKey)) {
      cachedKeyRef.current = cacheKey;
      cachedUrlRef.current = TTS_CACHE.get(cacheKey)!.url;
      return;
    }

    // 已在載入中 → 跳過
    if (cloudAbortRef.current) return;

    const controller = new AbortController();
    cloudAbortRef.current = controller;

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text, // 傳原始文字（含角色標籤），由 tts-service.ts 解析
          multiSpeaker: true,
          voiceTier: 'default',
          speakingRate: speed,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        console.warn('[TTS Prefetch] Failed:', res.status);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // 存入全域快取
      cleanExpiredCache();
      evictOldestIfNeeded();
      TTS_CACHE.set(cacheKey, { url, addedAt: Date.now() });

      cachedKeyRef.current = cacheKey;
      cachedUrlRef.current = url;
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.warn('[TTS Prefetch] Error:', err);
    } finally {
      if (cloudAbortRef.current === controller) {
        cloudAbortRef.current = null;
      }
    }
  }, [text, speed, useCloudTTS]);

  // 向父元件暴露 prefetch 方法
  useEffect(() => {
    if (onPrefetchReady) {
      onPrefetchReady(prefetchAudio);
    }
  }, [onPrefetchReady, prefetchAudio]);

  // ============================================
  // Google Cloud TTS 播放（v2.0: 全域快取 + 進度 + 重試）
  // ============================================
  const playCloudTTS = useCallback(async () => {
    if (!text) return;
    setCloudError('');

    const cacheKey = getCacheKey(text, speed);

    // 檢查全域快取
    const cached = TTS_CACHE.get(cacheKey);
    if (cached) {
      cachedKeyRef.current = cacheKey;
      cachedUrlRef.current = cached.url;
      if (cloudAudioRef.current) {
        cloudAudioRef.current.currentTime = 0;
        await cloudAudioRef.current.play();
        setPlaying(true);
      }
      return;
    }

    setCloudFetching(true);
    setLoading(true);

    const controller = new AbortController();
    cloudAbortRef.current = controller;

    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text, // 原始文字，server 端會解析角色標籤
          multiSpeaker: true,
          voiceTier: 'default',
          speakingRate: speed,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        const errMsg = res.status === 503
          ? 'TTS 服務未設定'
          : res.status === 504
            ? 'TTS 合成超時，請縮短文本後重試'
            : `TTS 服務錯誤 (${res.status})`;
        console.error('[TTS] Cloud TTS error:', res.status, errorText);
        setCloudError(errMsg);
        setCloudFetching(false);
        setLoading(false);
        handlePlayWebSpeech();
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // 存入全域快取
      cleanExpiredCache();
      evictOldestIfNeeded();
      TTS_CACHE.set(cacheKey, { url, addedAt: Date.now() });
      cachedKeyRef.current = cacheKey;
      cachedUrlRef.current = url;

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
        // 用戶取消或 timeout
        setCloudError('TTS 請求逾時，請重試');
      } else {
        console.error('[TTS] Cloud TTS fetch failed:', err);
        setCloudError('網絡連線失敗');
      }
      setCloudFetching(false);
      setLoading(false);
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        handlePlayWebSpeech();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speed, onPlayEnd]);

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

  // 有錯誤且未在播放中 → 顯示重試按鈕
  if (cloudError && !playing && !isBusy) {
    return (
      <div className={`inline-flex items-center gap-1 ${className}`}>
        <button
          onClick={playCloudTTS}
          className={`inline-flex items-center rounded-lg font-medium transition-colors bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 ${sizeClasses[size]}`}
          title={`${cloudError} — 點擊重試`}
        >
          <AlertCircle className={iconSize[size]} />
          重試
        </button>
        {!playing && (
          <div className="flex items-center gap-0.5">
            {SPEEDS.map(s => (
              <button
                key={s}
                onClick={(e) => { e.stopPropagation(); cachedUrlRef.current = null; cachedKeyRef.current = ''; setCloudError(''); setSpeed(s); }}
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

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}
      onMouseEnter={() => { if (useCloudTTS && !isBusy) prefetchAudio(); }}
    >
      <button
        onClick={useCloudTTS ? (playing ? handleStop : playCloudTTS) : handlePlayWebSpeech}
        disabled={isBusy}
        className={`inline-flex items-center rounded-lg font-medium transition-colors disabled:opacity-50 ${
          playing
            ? 'bg-teal-100 text-teal-700 hover:bg-teal-200 dark:bg-teal-900/30 dark:text-teal-300'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
        } ${sizeClasses[size]}`}
        title={playing ? '停止' : (cloudFetching ? '生成音訊中...' : label)}
      >
        {isBusy ? (
          <Loader2 className={`${iconSize[size]} animate-spin`} />
        ) : playing ? (
          <Pause className={iconSize[size]} />
        ) : (
          <Volume2 className={iconSize[size]} />
        )}
        {isBusy ? (cloudFetching ? '生成中...' : '載入中') : playing ? '停止' : label}
      </button>

      {/* Speed selector */}
      {!playing && (
        <div className="flex items-center gap-0.5">
          {SPEEDS.map(s => (
            <button
              key={s}
              onClick={(e) => { e.stopPropagation(); cachedUrlRef.current = null; cachedKeyRef.current = ''; setCloudError(''); setSpeed(s); }}
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
