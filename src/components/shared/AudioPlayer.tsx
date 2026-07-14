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
import { Volume2, Pause, Play, Square, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

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

  // 正規化格式但保留 speaker 標籤（讓 server multiSpeaker 解析角色）
  const normalizedText = cleanListeningContent(text);
  if (!normalizedText) return;

  const cacheKey = getCacheKey(normalizedText, speakingRate);
  if (TTS_CACHE.has(cacheKey)) return; // 已快取

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: normalizedText,
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

/** 剝離所有角色標籤（確保 TTS 不朗讀 "Boy:" "Man:" 等），清除引號、多餘空白 */
function stripSpeakerLabels(text: string): string {
  return text
    // 移除行首角色標籤（含冒號/破折號後的所有變體）
    .replace(/^[A-Za-z]+(?:\s+[A-Za-z0-9]+)?\s*[:：\-–—]\s*/gm, '')
    // 移除行中角色標籤（緊接換行後的標籤，splitMultiSpeakerLine 產生）
    .replace(/\n[A-Za-z]+(?:\s+[A-Za-z0-9]+)?\s*[:：\-–—]\s*/g, '\n')
    // 移除所有引號（單雙、彎直）
    .replace(/[""'']/g, '')
    // 移除殘餘孤立冒號/破折號
    .replace(/^\s*[:：\-–—]\s*/gm, '')
    // 壓縮多餘空白
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 為 TTS 準備文字：先正規化多角色行，再剝離標籤，保留乾淨對話 */
function prepareTextForTTS(text: string): string {
  const normalized = splitMultiSpeakerLine(text);
  return stripSpeakerLabels(normalized);
}

function parseDialogue(text: string): DialogueLine[] {
  const normalized = splitMultiSpeakerLine(text);
  const lines = normalized.split(/\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [{ speaker: null, text: text.trim() }];

  return lines.map(line => {
    const match = line.match(SPEAKER_LINE_RE);
    if (match) {
      return {
        speaker: match[1].toLowerCase().replace(/\s+/g, ''),
        text: match[2].trim(),
      };
    }
    return { speaker: null, text: line };
  });
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

/**
 * 清理 AI 生成的 listeningContent 格式（只做格式修正，不改 speaker 身分）
 * - 正規化標籤格式：MAN: → Man:、Woman : → Woman:、"Man": → Man:
 * - 保留原始 speaker：Man 永遠是 Man，Woman 永遠是 Woman
 * - 不移除正確 speaker 標籤（Web Speech 角色分離需要）
 */
export function cleanListeningContent(text: string): string {
  if (!text) return '';
  return text
    // Step 1: 正規化角色標籤格式（保留 speaker 身分，只修正格式）
    // 移除引號/括號/全形冒號/多餘空白 → 統一為 "Speaker: text"
    .replace(/^["'\[]?\s*(Woman|Man|Boy|Girl)\s*["'\]]?\s*[:：]\s*/gim, '$1: ')
    .replace(/\n["'\[]?\s*(Woman|Man|Boy|Girl)\s*["'\]]?\s*[:：]\s*/gi, '\n$1: ')
    // Step 2: 修正全大寫角色標籤（WOMAN → Woman）
    .replace(/^(WOMAN)\s*[:：]\s*/gim, 'Woman: ')
    .replace(/^(MAN)\s*[:：]\s*/gim, 'Man: ')
    .replace(/^(BOY)\s*[:：]\s*/gim, 'Boy: ')
    .replace(/^(GIRL)\s*[:：]\s*/gim, 'Girl: ')
    // Step 3: 修正冒號前多餘空格（Woman : → Woman:）
    .replace(/^(Woman|Man|Boy|Girl)\s+[:：]\s*/gim, '$1: ')
    // Step 4: 移除獨立空標籤行（僅有標籤+冒號，無台詞內容）
    .replace(/^(Woman|Man|Boy|Girl)\s*[:：]\s*$/gim, '')
    // Step 5: 移除對話內容中的引號字元（不影響 speaker 標籤）
    .replace(/["""''']/g, '')
    // Step 6: 壓縮多餘空白
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(false);
  // Cloud TTS 狀態
  const [cloudFetching, setCloudFetching] = useState(false);
  const [cloudError, setCloudError] = useState('');
  const cloudAudioRef = useRef<HTMLAudioElement | null>(null);
  const cloudAbortRef = useRef<AbortController | null>(null);
  // 快取
  const cachedUrlRef = useRef<string | null>(null);
  const cachedKeyRef = useRef<string>('');
  // 進度條
  const [progress, setProgress] = useState(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const estimatedDurationRef = useRef(0);
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
  // Session ID: 每次新播放開始時遞增，防止 stale callback 觸發 onPlayEnd
  const sessionIdRef = useRef(0);
  // 快取 Web Speech API voices（避免 2nd+ playback 時 getVoices() 返回空陣列）
  const voicesRef = useRef<{
    female: SpeechSynthesisVoice | null;
    male: SpeechSynthesisVoice | null;
    default: SpeechSynthesisVoice | null;
    sameVoice: boolean;
  } | null>(null);

  // ============================================
  // 統一 Cleanup Helper — 停止所有播放來源
  // ============================================
  const cleanupAllPlayback = useCallback(() => {
    cancelled.current = true;
    sessionIdRef.current += 1; // invalidate all in-flight sessions

    // Web Speech
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // Cloud TTS audio element
    if (cloudAudioRef.current) {
      cloudAudioRef.current.pause();
      cloudAudioRef.current.onplay = null;
      cloudAudioRef.current.onended = null;
      cloudAudioRef.current.onerror = null;
      cloudAudioRef.current.src = '';
      cloudAudioRef.current.load();
      cloudAudioRef.current = null;
    }

    // Cloud TTS fetch
    if (cloudAbortRef.current) {
      cloudAbortRef.current.abort();
      cloudAbortRef.current = null;
    }

    // UI state
    setPlaying(false);
    setPaused(false);
    setLoading(false);
    setCloudFetching(false);
    setCloudError('');
    setProgress(0);
    if (progressTimerRef.current) { clearInterval(progressTimerRef.current); progressTimerRef.current = null; }
    cachedKeyRef.current = '';
    cachedUrlRef.current = null;
  }, []);

  // 估算播放時長（字數 / 每秒 2.5 詞 × 語速修正）
  const estimateDuration = useCallback(() => {
    const words = (text || '').split(/\s+/).filter(Boolean).length;
    return Math.max(3, Math.round(words / (2.5 * speed)));
  }, [text, speed]);

  // 開始進度追蹤
  const startProgress = useCallback(() => {
    setProgress(0);
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    const duration = estimateDuration();
    estimatedDurationRef.current = duration;
    const stepMs = 200;
    let elapsed = 0;
    progressTimerRef.current = setInterval(() => {
      elapsed += stepMs;
      const pct = Math.min(100, Math.round((elapsed / (duration * 1000)) * 100));
      setProgress(pct);
      if (pct >= 100) {
        if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      }
    }, stepMs);
  }, [estimateDuration]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SPEED_STORAGE_KEY, String(speed));
    }
  }, [speed]);

  // 快取 Web Speech API voices（Fix: Chrome getVoices() 異步載入，2nd+ playback 可能返回空陣列）
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const loadVoices = () => {
      const all = window.speechSynthesis.getVoices();
      if (all.length === 0) return; // 等待下一次 onvoiceschanged
      const female = pickVoice(all, 'en', 'female');
      const male = pickVoice(all, 'en', 'male');
      const def = pickVoice(all, 'en', 'any');
      voicesRef.current = {
        female,
        male,
        default: def,
        sameVoice: !!(female && male && female.name === male.name),
      };
      console.log('[AudioPlayer] Voices cached:', {
        female: female?.name ?? 'none',
        male: male?.name ?? 'none',
        sameVoice: female?.name === male?.name,
      });
    };
    loadVoices();
    const prevOnVoicesChanged = window.speechSynthesis.onvoiceschanged;
    window.speechSynthesis.onvoiceschanged = () => {
      if (prevOnVoicesChanged) prevOnVoicesChanged;
      loadVoices();
    };
    return () => { window.speechSynthesis.onvoiceschanged = prevOnVoicesChanged; };
  }, []);

  // 清理全域快取中過期項目
  useEffect(() => {
    cleanExpiredCache();
    const interval = setInterval(cleanExpiredCache, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // 清理自身 audio 資源（避免記憶體洩漏 + 殘餘語音）
  useEffect(() => {
    return () => {
      cleanupAllPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fix: text prop 變化（切換題目）時徹底清理前一題的 audio 資源
  useEffect(() => {
    cleanupAllPlayback();
  }, [text, cleanupAllPlayback]);

  // 監聽全域停止事件
  useEffect(() => {
    window.addEventListener('stop-all-audio', cleanupAllPlayback);
    return () => window.removeEventListener('stop-all-audio', cleanupAllPlayback);
  }, [cleanupAllPlayback]);

  // 語速變更時停止現有播放（防止疊聲）
  useEffect(() => {
    cleanupAllPlayback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed]);

  if (typeof window === 'undefined') {
    return <span className="text-xs text-gray-400">TTS</span>;
  }

  const synth = window.speechSynthesis;

  const handleStop = useCallback(() => {
    cleanupAllPlayback();
    setPaused(false);
  }, [cleanupAllPlayback]);

  // ============================================
  // 暫停播放（保留進度，可繼續）
  // ============================================
  const handlePause = useCallback(() => {
    // Cloud TTS: pause HTML audio element
    if (cloudAudioRef.current && !cloudAudioRef.current.paused) {
      cloudAudioRef.current.pause();
      setPlaying(false);
      setPaused(true);
      return;
    }
    // Web Speech API: pause synthesis
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.pause();
      setPlaying(false);
      setPaused(true);
    }
  }, []);

  // ============================================
  // 繼續播放（從暫停處恢復）
  // ============================================
  const handleResume = useCallback(() => {
    // Cloud TTS: resume HTML audio element
    if (cloudAudioRef.current && cloudAudioRef.current.paused) {
      cloudAudioRef.current.play().then(() => {
        setPlaying(true);
        setPaused(false);
      }).catch(() => {
        setPaused(false);
      });
      return;
    }
    // Web Speech API: resume synthesis
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.resume();
      setPlaying(true);
      setPaused(false);
    }
  }, []);

  // ============================================
  // 預載入音訊（供父元件在 hover / page load 時呼叫）
  // ============================================
  const prefetchAudio = useCallback(async () => {
    if (!text || !useCloudTTS) return;

    const normalizedText = cleanListeningContent(text);
    if (!normalizedText) return;
    const cacheKey = getCacheKey(normalizedText, speed);
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
          text: normalizedText,
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
  // Google Cloud TTS 播放（v3.1: 預處理文字 + 重試 + 完整 cleanup + 防止疊聲）
  // ============================================
  const playCloudTTS = useCallback(async () => {
    if (!text) return;
    setCloudError('');
    setLoading(true);

    // ⚠️ 防止疊聲：先徹底停止任何現有播放（不設為 null 避免 TS narrowing）
    const old = cloudAudioRef.current;
    if (old) {
      old.pause();
      old.onplay = null;
      old.onended = null;
      old.onerror = null;
      old.src = '';
    }
    if (cloudAbortRef.current) {
      cloudAbortRef.current.abort();
      cloudAbortRef.current = null;
    }
    // Cancel Web Speech too (in case it was playing)
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setPlaying(false);

    // 正規化文字格式（保留 speaker 標籤，讓 server 端 multiSpeaker 模式解析角色）
    const normalizedText = cleanListeningContent(text);
    if (!normalizedText) {
      setCloudError('無有效文字');
      setLoading(false);
      return;
    }

    const cacheKey = getCacheKey(normalizedText, speed);

    // 檢查全域快取
    const cached = TTS_CACHE.get(cacheKey);
    if (cached) {
      cachedKeyRef.current = cacheKey;
      cachedUrlRef.current = cached.url;
      const audio = new Audio(cached.url);
      // 先清理舊 audio 實例
      const oldCached = cloudAudioRef.current;
      if (oldCached) { oldCached.pause(); oldCached.src = ''; }
      cloudAudioRef.current = audio;
      audio.onplay = () => { setPlaying(true); setLoading(false); setCloudFetching(false); startProgress(); };
        audio.onended = () => { setPlaying(false); setProgress(100); onPlayEnd?.(); };
      audio.onerror = () => {
        console.error('[TTS] Cached audio playback error');
        TTS_CACHE.delete(cacheKey);
        setPlaying(false); setLoading(false);
        handlePlayWebSpeech();
      };
      try { await audio.play(); } catch { handlePlayWebSpeech(); }
      return;
    }

    // 嘗試 fetch + 1 次重試
    for (let attempt = 1; attempt <= 2; attempt++) {
      setCloudFetching(true);
      const controller = new AbortController();
      cloudAbortRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: normalizedText,  // 保留 speaker 標籤，server 端 parseDialogueForTTS 解析
            multiSpeaker: true,    // 啟用多人對話模式（男/女聲分段合成+拼接）
            voiceTier: 'default',
            speakingRate: speed,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const errorText = await res.text().catch(() => '');
          if (attempt === 2) {
            console.error('[TTS] Cloud TTS error (attempt', attempt, '):', res.status, errorText);
            setCloudError(res.status === 503 ? 'TTS 服務未設定' : `TTS 錯誤 (${res.status})`);
            setCloudFetching(false); setLoading(false);
            handlePlayWebSpeech();
            return;
          }
          console.warn('[TTS] Retrying after error:', res.status);
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        cleanExpiredCache();
        evictOldestIfNeeded();
        TTS_CACHE.set(cacheKey, { url, addedAt: Date.now() });
        cachedKeyRef.current = cacheKey;
        cachedUrlRef.current = url;

        const audio = new Audio(url);
        // 先清理舊 audio 實例（確保切換題目時不殘留）
        const oldFetched = cloudAudioRef.current;
        if (oldFetched) { oldFetched.pause(); oldFetched.src = ''; }
        cloudAudioRef.current = audio;

        audio.onplay = () => { setLoading(false); setCloudFetching(false); setPlaying(true); startProgress(); };
        audio.onended = () => { setPlaying(false); setProgress(100); onPlayEnd?.(); };

        // Wrap audio playback in a promise to properly catch errors and handle retry
        const audioPlayResult = await new Promise<'ok' | 'retry' | 'error'>((resolve) => {
          audio.onerror = () => {
            console.error('[TTS] Audio playback error');
            if (attempt === 1) {
              TTS_CACHE.delete(cacheKey);
              URL.revokeObjectURL(url);
              resolve('retry');
            } else {
              resolve('error');
            }
          };
          audio.play().then(() => {
            // Playback started successfully — wait for it to end or error
            // The onended/onerror handlers above will handle completion
            resolve('ok');
          }).catch(() => {
            if (attempt === 1) resolve('retry');
            else resolve('error');
          });
        });

        if (audioPlayResult === 'retry') {
          setCloudFetching(false);
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        if (audioPlayResult === 'error') {
          setPlaying(false); setCloudFetching(false); setLoading(false);
          handlePlayWebSpeech();
          return;
        }
        return; // success
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === 'AbortError') {
          setCloudError('TTS 請求逾時，請重試');
          setCloudFetching(false); setLoading(false);
          return;
        }
        if (attempt === 1) {
          console.warn('[TTS] Fetch failed, retrying:', err);
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        console.error('[TTS] Cloud TTS fetch failed:', err);
        setCloudError('網絡連線失敗');
        setCloudFetching(false); setLoading(false);
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
      // Already playing → stop instead
      cleanupAllPlayback();
      return;
    }

    if (!synth) {
      setLoading(false);
      return;
    }

    // 開始新播放 session：先完整清理，再初始化
    cleanupAllPlayback();
    const currentSessionId = ++sessionIdRef.current;
    setLoading(true);
    cancelled.current = false;

    const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const lang: 'en' | 'zh' = cjkCount / Math.max(text.length, 1) > 0.3 ? 'zh' : 'en';

    const dialogue = parseDialogue(text);
    if (process.env.NODE_ENV === 'development') {
      console.log('[AudioPlayer] WebSpeech session', currentSessionId, {
        lang,
        lines: dialogue.length,
        speakers: [...new Set(dialogue.filter(d => d.speaker).map(d => d.speaker))],
      });
    }

    const trySpeak = () => {
      // Guard: stale session or cancelled
      if (sessionIdRef.current !== currentSessionId || cancelled.current) return;

      const voices = synth.getVoices();
      if (voices.length === 0) {
        setTimeout(trySpeak, 150);
        return;
      }

      // 使用快取的 voices；若 ref 尚未填充則立即挑選
      if (!voicesRef.current) {
        const female = pickVoice(voices, lang, 'female');
        const male = pickVoice(voices, lang, 'male');
        voicesRef.current = {
          female, male,
          default: pickVoice(voices, lang, 'any'),
          sameVoice: !!(female && male && female.name === male.name),
        };
      }
      const { female: femaleVoice, male: maleVoice, default: defaultVoice, sameVoice } = voicesRef.current;

      if (process.env.NODE_ENV === 'development') {
        console.log('[AudioPlayer] Voice mapping:', {
          female: femaleVoice?.name ?? 'none',
          male: maleVoice?.name ?? 'none',
          default: defaultVoice?.name ?? 'none',
          sameVoice,
          lang,
        });
      }

      const map = new Map<string, SpeechSynthesisVoice | null>();
      map.set('woman', femaleVoice);
      map.set('girl', femaleVoice);
      map.set('man', maleVoice);
      map.set('boy', maleVoice);

      let idx = 0;

      const speakNext = () => {
        // Guard: stale session, cancelled, or component gone
        if (sessionIdRef.current !== currentSessionId || cancelled.current) {
          setPlaying(false);
          setLoading(false);
          return;
        }

        while (idx < dialogue.length && !dialogue[idx].text.trim()) idx++;

        if (idx >= dialogue.length) {
          setPlaying(false);
          setLoading(false);
          // Only fire onPlayEnd if this is still the current session
          if (sessionIdRef.current === currentSessionId) {
            onPlayEnd?.();
          }
          return;
        }

        const line = dialogue[idx];
        const utterance = new SpeechSynthesisUtterance(line.text);
        utterance.lang = lang === 'zh' ? 'zh-HK' : 'en-US';
        utterance.rate = speed;

        // Voice selection: 用 speaker-specific voice，null 時 fallback 到 defaultVoice + pitch
        if (line.speaker) {
          const voice = map.get(line.speaker);
          if (voice) {
            utterance.voice = voice;
          } else if (defaultVoice) {
            // 找不到對應 voice 時用 default + pitch 模擬性別差異
            utterance.voice = defaultVoice;
            utterance.pitch = getSpeakerPitch(line.speaker);
          }
        } else if (defaultVoice) {
          utterance.voice = defaultVoice;
        }

        // 若男女聲相同（sameVoice），用 pitch 補償
        if (sameVoice && line.speaker && !utterance.pitch) {
          utterance.pitch = getSpeakerPitch(line.speaker);
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
  }, [text, playing, synth, onPlayEnd, speed, cleanupAllPlayback]);

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
    <div className={`flex flex-col gap-1 ${className}`}
      onMouseEnter={() => { if (useCloudTTS && !isBusy && !paused) prefetchAudio(); }}
    >
      <div className="inline-flex items-center gap-1">
      {/* 播放 / 暫停 / 繼續 按鈕 */}
      <button
        onClick={
          isBusy ? undefined
          : playing ? handlePause
          : paused ? handleResume
          : useCloudTTS ? playCloudTTS
          : handlePlayWebSpeech
        }
        disabled={isBusy}
        className={`inline-flex items-center rounded-lg font-medium transition-colors disabled:opacity-50 ${
          playing || paused
            ? 'bg-teal-100 text-teal-700 hover:bg-teal-200 dark:bg-teal-900/30 dark:text-teal-300'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
        } ${sizeClasses[size]}`}
        title={
          isBusy ? (cloudFetching ? '生成音訊中...' : '載入中')
          : playing ? '暫停'
          : paused ? '繼續'
          : label
        }
      >
        {isBusy ? (
          <Loader2 className={`${iconSize[size]} animate-spin`} />
        ) : playing ? (
          <Pause className={iconSize[size]} />
        ) : paused ? (
          <Play className={iconSize[size]} />
        ) : (
          <Volume2 className={iconSize[size]} />
        )}
        {isBusy ? (cloudFetching ? '生成中...' : '載入中') : playing ? '暫停' : paused ? '繼續' : label}
      </button>

      {/* 停止按鈕（播放中或暫停中顯示） */}
      {(playing || paused) && (
        <button
          onClick={handleStop}
          className={`inline-flex items-center rounded-lg font-medium transition-colors bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 ${sizeClasses[size]}`}
          title="停止"
        >
          <Square className={iconSize[size]} />
        </button>
      )}

      {/* Speed selector */}
      {!playing && !paused && (
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
      {/* 進度條 */}
      {(playing || paused) && (
        <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full bg-teal-500 rounded-full transition-all duration-200 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
