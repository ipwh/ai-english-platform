// ============================================
// AudioPlayer — 文字轉語音元件（支援多人對話）
// 使用瀏覽器 Web Speech API，無需外部錄音檔
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

/** 對話行模式：Woman: / Man: / Boy: / Girl: （不使用 A/B，學生無法從聲音分辨字母） */
const SPEAKER_LINE_RE = /^(Woman|Man|Boy|Girl)\s*[:：]\s*(.+)$/i;

/** 將文字解析成對話段落 */
function parseDialogue(text: string): DialogueLine[] {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const dialogue: DialogueLine[] = [];

  for (const line of lines) {
    const match = line.match(SPEAKER_LINE_RE);
    if (match) {
      dialogue.push({ speaker: match[1].toLowerCase(), text: match[2] });
    } else {
      dialogue.push({ speaker: null, text: line });
    }
  }

  if (dialogue.length === 0) {
    dialogue.push({ speaker: null, text });
  }

  return dialogue;
}

/** 從可用語音中選一個（依語言與性別偏好） */
function pickVoice(
  voices: SpeechSynthesisVoice[],
  lang: 'en' | 'zh',
  gender: 'female' | 'male' | 'any' = 'any',
): SpeechSynthesisVoice | null {
  const candidates = voices.filter(v => v.lang.startsWith(lang === 'zh' ? 'zh' : 'en'));
  if (candidates.length === 0) return null;

  if (gender === 'female') {
    return candidates.find(v => /female|samantha|karen|zira|victoria/i.test(v.name))
      || candidates[candidates.length - 1]
      || candidates[0];
  }
  if (gender === 'male') {
    return candidates.find(v => /male|daniel|tom|david|alex/i.test(v.name))
      || candidates[0]
      || null;
  }
  return candidates[0];
}

export default function AudioPlayer({
  text,
  label = '播放',
  autoPlay = false,
  size = 'md',
  className = '',
  onPlayEnd,
}: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [speed, setSpeed] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_SPEED;
    const saved = localStorage.getItem(SPEED_STORAGE_KEY);
    if (saved) {
      const parsed = parseFloat(saved);
      if (SPEEDS.includes(parsed as typeof SPEEDS[number])) return parsed;
    }
    return DEFAULT_SPEED;
  });
  const [useLuvVoice, setUseLuvVoice] = useState(true); // 優先使用 LuvVoice
  const cancelled = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Persist speed preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SPEED_STORAGE_KEY, String(speed));
    }
  }, [speed]);

  if (typeof window === 'undefined') {
    return <span className="text-xs text-gray-400">TTS 不可用</span>;
  }

  const synth = window.speechSynthesis;

  const handleStop = useCallback(() => {
    cancelled.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (synth) synth.cancel();
    setPlaying(false);
    setLoading(false);
  }, [synth]);

  const handlePlay = useCallback(() => {
    if (!text) return;

    if (playing) {
      handleStop();
      return;
    }

    setLoading(true);
    cancelled.current = false;
    if (synth) synth.cancel();

    const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const lang: 'en' | 'zh' = cjkCount / Math.max(text.length, 1) > 0.3 ? 'zh' : 'en';

    // ── 方案 A: LuvVoice API（高品質 TTS）──
    const tryLuvVoice = async () => {
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, lang, speed }),
        });

        if (!res.ok) {
          const data = await res.json();
          // 501 = 未設定 API key，直接降級
          if (res.status === 501 || data.fallback) {
            console.log('[AudioPlayer] LuvVoice unavailable, falling back to browser TTS');
            setUseLuvVoice(false);
            return false;
          }
          throw new Error(data.error || 'TTS failed');
        }

        const data = await res.json();
        if (!data.audioUrl) throw new Error('No audio URL returned');

        // 使用 <audio> 播放 MP3
        const audio = new Audio(data.audioUrl);
        audioRef.current = audio;
        audio.playbackRate = speed;

        audio.onplay = () => {
          setLoading(false);
          setPlaying(true);
        };

        audio.onended = () => {
          setPlaying(false);
          setLoading(false);
          audioRef.current = null;
          onPlayEnd?.();
        };

        audio.onerror = () => {
          console.warn('[AudioPlayer] LuvVoice audio playback failed, falling back');
          setUseLuvVoice(false);
          audioRef.current = null;
          return false;
        };

        audio.play().catch(() => {
          setUseLuvVoice(false);
          audioRef.current = null;
          return false;
        });

        return true;
      } catch (err) {
        console.warn('[AudioPlayer] LuvVoice error:', err);
        setUseLuvVoice(false);
        return false;
      }
    };

    // ── 方案 B: 瀏覽器 Web Speech API（備援）──
    const useBrowserTTS = () => {
      if (!synth) {
        setLoading(false);
        return;
      }

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

        const map = new Map<string, SpeechSynthesisVoice | null>();
        map.set('woman', femaleVoice);
        map.set('girl', femaleVoice);
        map.set('man', maleVoice);
        map.set('boy', maleVoice);
        map.set('a', femaleVoice);
        map.set('b', maleVoice);

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
          utterance.pitch = 1;

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
    };

    // 優先嘗試 LuvVoice，失敗則降級至瀏覽器 TTS
    if (useLuvVoice) {
      tryLuvVoice().then(success => {
        if (!success) useBrowserTTS();
      });
    } else {
      useBrowserTTS();
    }
  }, [text, playing, synth, handleStop, onPlayEnd, speed, useLuvVoice]);

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs gap-1',
    md: 'px-3 py-1.5 text-sm gap-1.5',
    lg: 'px-4 py-2.5 text-base gap-2',
  };

  const iconSize = { sm: 'w-3 h-3', md: 'w-4 h-4', lg: 'w-5 h-5' };

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      <button
        onClick={handlePlay}
        disabled={loading}
        className={`inline-flex items-center rounded-lg font-medium transition-colors disabled:opacity-50 ${
          playing
            ? 'bg-teal-100 text-teal-700 hover:bg-teal-200 dark:bg-teal-900/30 dark:text-teal-300'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
        } ${sizeClasses[size]}`}
        title={playing ? '停止播放' : `播放：${label}`}
      >
        {loading ? (
          <Loader2 className={`${iconSize[size]} animate-spin`} />
        ) : playing ? (
          <Pause className={iconSize[size]} />
        ) : (
          <Volume2 className={iconSize[size]} />
        )}
        {playing ? '停止' : label}
      </button>

      {/* Speed selector */}
      {!playing && (
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
              title={`語速 ${SPEED_LABELS[s]}`}
            >
              {SPEED_LABELS[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
