import { useEffect, useId, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { Episode } from '../lib/podcastApi';
import { formatDate, minutesLabel } from '../lib/text';
import { cx } from '../lib/cx';

const PLAY_EVENT = 'troystack:audio-play';

function clock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const SPEEDS = [1, 1.25, 1.5, 2];

/** Plays one episode. Starting any player pauses the others on the page. */
export function EpisodePlayer({ episode, compact = false, className }: { episode: Episode; compact?: boolean; className?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  // Which player started, by instance, since the same episode can be on the
  // page twice and both copies share its audio address.
  const playerId = useId();
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(episode.durationSec || 0);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState(false);

  useEffect(() => {
    const onOtherPlay = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== playerId) audioRef.current?.pause();
    };
    window.addEventListener(PLAY_EVENT, onOtherPlay);
    return () => window.removeEventListener(PLAY_EVENT, onOtherPlay);
  }, [playerId]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: playerId }));
      try {
        setError(false);
        await a.play();
      } catch {
        setError(true);
      }
    } else {
      a.pause();
    }
  };

  const seek = (value: number) => {
    const a = audioRef.current;
    if (!a || !Number.isFinite(value)) return;
    a.currentTime = value;
    setTime(value);
  };

  const total = duration || episode.durationSec || 0;

  return (
    <div className={cx('flex items-center gap-3', className)}>
      <audio
        ref={audioRef}
        src={episode.audioUrl}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || episode.durationSec)}
        onError={() => setError(true)}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? `Pause ${episode.title}` : `Play ${episode.title}`}
        className={cx(
          'shrink-0 rounded-full bg-btn text-btn-fg hover:bg-btn-hover flex items-center justify-center shadow-sm',
          compact ? 'h-10 w-10' : 'h-12 w-12',
        )}
      >
        {playing ? <Pause size={compact ? 16 : 18} fill="currentColor" /> : <Play size={compact ? 16 : 18} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[14px] font-semibold text-fg truncate">{episode.title}</p>
            <button
              type="button"
              onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
              className="shrink-0 rounded-md border border-line px-1.5 text-[11px] font-semibold text-fg-2 hover:text-fg"
              aria-label={`Playback speed ${speed}x`}
            >
              {speed}x
            </button>
          </div>
        )}
        <input
          type="range"
          min={0}
          max={total || 0}
          step={1}
          value={Math.min(time, total || 0)}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Seek"
          className="w-full accent-[var(--gold)] h-1.5 mt-1"
          disabled={!total}
        />
        <div className="flex justify-between text-[11px] text-fg-3 tnum">
          <span>{clock(time)}</span>
          <span>{error ? "Couldn't play this episode" : total ? clock(total) : minutesLabel(episode.durationSec)}</span>
        </div>
      </div>
    </div>
  );
}

export function EpisodeMeta({ episode }: { episode: Episode }) {
  return (
    <span className="text-[12px] text-fg-3">
      {formatDate(episode.publishedAt)}
      {episode.durationSec ? ` · ${minutesLabel(episode.durationSec)}` : ''}
    </span>
  );
}
