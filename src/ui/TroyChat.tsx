import { useEffect, useRef, useState } from 'react';
import { Camera, FileSpreadsheet, Pause, Play, Plus, Send, Square, Volume2 } from 'lucide-react';
import type { TroyMessage } from '../services/troy';
import { speak } from '../services/troy';
import { Markdown } from '../lib/markdown';
import { cx } from '../lib/cx';
import { PRIVACY_URL, TERMS_URL } from '../lib/appStore';
import { TroyCard } from './TroyCards';
import { Button, Sheet } from './primitives';
import { saveTroyConsent } from '../lib/consent';

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
}

/** Troy reads a reply aloud. The API allows it for Gold accounts. */
function ListenButton({ text, userId }: { text: string; userId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle');
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const onClick = async () => {
    setError(null);
    if (state === 'playing') {
      audioRef.current?.pause();
      setState('paused');
      return;
    }
    if (state === 'paused' && audioRef.current) {
      await audioRef.current.play();
      setState('playing');
      return;
    }
    try {
      setState('loading');
      const blob = await speak(text, userId);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audio.onended = () => setState('idle');
      audioRef.current = audio;
      await audio.play();
      setState('playing');
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't play that");
      setState('idle');
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={onClick} disabled={state === 'loading'} className="inline-flex items-center gap-1 text-[12px] font-medium text-fg-3 hover:text-gold disabled:opacity-50">
        {state === 'playing' ? <Pause size={13} aria-hidden="true" /> : state === 'paused' ? <Play size={13} aria-hidden="true" /> : <Volume2 size={13} aria-hidden="true" />}
        {state === 'loading' ? 'Loading' : state === 'playing' ? 'Pause' : state === 'paused' ? 'Resume' : 'Listen'}
      </button>
      {error && <span className="text-[12px] text-down">{error}</span>}
    </span>
  );
}

export function MessageBubble({ message, userId, canListen }: { message: TroyMessage; userId?: string; canListen?: boolean }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end animate-fade-up">
        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-br-md bg-gold-soft border border-line px-4 py-2.5 text-[15px] text-fg whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3 animate-fade-up">
      <img src="/troy-96.png" alt="" className="h-8 w-8 rounded-full shrink-0 mt-0.5" width={32} height={32} />
      <div className="min-w-0 flex-1 max-w-[46rem]">
        <div className="text-[13px] font-semibold text-gold mb-1">Troy</div>
        <div className="text-[15px] leading-relaxed text-fg-2">
          <Markdown text={message.content} />
        </div>
        {message.preview && <TroyCard preview={message.preview} />}
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-fg-3">
          <span>{timeLabel(message.created_at)}</span>
          {canListen && userId && <ListenButton text={message.content} userId={userId} />}
        </div>
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex gap-3" role="status" aria-live="polite">
      <img src="/troy-96.png" alt="" className="h-8 w-8 rounded-full shrink-0" width={32} height={32} />
      <div className="flex items-center gap-1.5 rounded-2xl bg-surface-2 border border-line px-4 py-3">
        <span className="h-1.5 w-1.5 rounded-full bg-gold animate-bounce [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-gold animate-bounce [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-gold animate-bounce" />
        <span className="ml-2 text-[13px] text-fg-3">Troy is thinking</span>
      </div>
    </div>
  );
}

interface ComposerProps {
  onSend: (text: string) => void;
  onStop?: () => void;
  busy: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  onPhoto?: (file: File) => void;
  onSpreadsheet?: (file: File) => void;
  autoFocus?: boolean;
}

export function Composer({ onSend, onStop, busy, disabled, placeholder = 'Ask Troy anything', maxLength = 2000, onPhoto, onSpreadsheet, autoFocus }: ComposerProps) {
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasAttach = Boolean(onPhoto || onSpreadsheet);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (!menu) return;
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menu]);

  const submit = () => {
    const t = text.trim();
    if (!t || busy || disabled) return;
    onSend(t);
    setText('');
    if (ref.current) ref.current.style.height = 'auto';
  };

  return (
    <div className="flex items-end gap-2 rounded-2xl border border-line-strong bg-surface px-2 py-2 shadow-card focus-within:border-gold transition-colors">
      {hasAttach && (
        <div className="relative" ref={menuRef}>
          <button type="button" disabled={busy || disabled} onClick={() => setMenu((v) => !v)} aria-label="Add a receipt or spreadsheet" className="h-9 w-9 flex items-center justify-center rounded-xl text-fg-3 hover:text-gold hover:bg-surface-2 disabled:opacity-40">
            <Plus size={19} />
          </button>
          {menu && (
            <div className="absolute bottom-full left-0 mb-2 w-60 rounded-xl border border-line bg-surface shadow-card overflow-hidden z-20">
              {onPhoto && (
                <button type="button" onClick={() => { setMenu(false); photoRef.current?.click(); }} className="w-full flex items-center gap-3 px-3.5 py-3 text-[14px] text-fg hover:bg-surface-2">
                  <Camera size={16} className="text-gold" aria-hidden="true" />
                  Scan a receipt
                </button>
              )}
              {onSpreadsheet && (
                <button type="button" onClick={() => { setMenu(false); sheetRef.current?.click(); }} className="w-full flex items-center gap-3 px-3.5 py-3 text-[14px] text-fg hover:bg-surface-2 border-t border-line">
                  <FileSpreadsheet size={16} className="text-gold" aria-hidden="true" />
                  Import a spreadsheet
                </button>
              )}
            </div>
          )}
          <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto?.(f); e.target.value = ''; }} />
          <input ref={sheetRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onSpreadsheet?.(f); e.target.value = ''; }} />
        </div>
      )}
      <textarea
        ref={ref}
        value={text}
        maxLength={maxLength}
        rows={1}
        disabled={disabled}
        placeholder={placeholder}
        aria-label="Message Troy"
        onChange={(e) => {
          setText(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        className={cx('flex-1 resize-none bg-transparent px-2 py-2 text-[15px] text-fg placeholder:text-fg-3 outline-none max-h-44', !hasAttach && 'pl-3')}
      />
      {busy && onStop ? (
        <button type="button" onClick={onStop} aria-label="Stop" className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-btn text-btn-fg hover:bg-btn-hover">
          <Square size={13} fill="currentColor" />
        </button>
      ) : (
        <button type="button" onClick={submit} disabled={!text.trim() || busy || disabled} aria-label="Send" className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl bg-btn text-btn-fg hover:bg-btn-hover disabled:opacity-40 disabled:cursor-not-allowed">
          <Send size={16} />
        </button>
      )}
    </div>
  );
}

/** The same notice the app shows before the first message to Troy. */
export function ConsentDialog({ open, onAccept, onClose }: { open: boolean; onAccept: () => void; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Before you talk to Troy" width="sm">
      <div className="space-y-3 text-[14px] text-fg-2">
        <p>Troy is an AI analyst. His answers are AI-generated opinion and analysis, not financial advice. He isn't a licensed financial advisor, so check anything important before you act on it.</p>
        <p>To answer you, your messages and, once you've signed in, your stack are sent to third-party AI providers.</p>
        <p>AI can make mistakes. Don't rely on Troy as your only source.</p>
        <p className="text-[13px]">
          <a href={PRIVACY_URL} className="font-semibold text-gold hover:text-gold-2">Privacy Policy</a>
          <span className="mx-2 text-fg-3">·</span>
          <a href={TERMS_URL} className="font-semibold text-gold hover:text-gold-2">Terms</a>
        </p>
      </div>
      <Button
        size="lg"
        className="w-full mt-5"
        onClick={() => {
          saveTroyConsent();
          onAccept();
        }}
      >
        I understand
      </Button>
    </Sheet>
  );
}
