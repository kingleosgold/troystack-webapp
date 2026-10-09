import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, MessageSquarePlus, PanelLeft, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTrial } from '../contexts/TrialContext';
import { useSubscription } from '../hooks/useSubscription';
import { useHoldings } from '../hooks/useHoldings';
import { usePageMeta } from '../hooks/usePageMeta';
import SEO from '../lib/seo.json';
import {
  askAsVisitor,
  countScan,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  QuotaError,
  scanReceipt,
  scanStatus,
  sendMessage,
  visitorQuota,
  VisitorChatUnavailable,
  type Quota,
  type TroyConversationSummary,
  type TroyMessage,
  type VisitorTurn,
} from '../services/troy';
import { ApiError, getJson } from '../lib/apiClient';
import { parseSpreadsheet } from '../lib/parseSpreadsheet';
import { formatTimeET, todayET } from '../lib/text';
import { cx } from '../lib/cx';
import { Composer, ConsentDialog, MessageBubble, TypingIndicator } from '../ui/TroyChat';
import { hasTroyConsent } from '../lib/consent';
import { ImportSheet, type ImportRow } from '../ui/ImportSheet';
import { Button, Sheet } from '../ui/primitives';
import type { HoldingFormData } from '../types/holding';

const MARKET_CHIPS = [
  { label: 'What moved metals today?', q: 'What moved gold and silver today?' },
  { label: 'Gold/silver ratio', q: 'What is the gold to silver ratio telling us right now?' },
  { label: 'Junk silver value', q: "What is pre-1965 junk silver worth at today's spot?" },
  { label: 'COMEX vaults', q: "What's happening with COMEX silver inventories?" },
];

const STACK_CHIPS = [
  { label: "How's my stack?", q: "How's my stack performing?" },
  { label: 'Gold/silver ratio', q: 'Analyze my gold-to-silver ratio' },
  { label: 'Purchasing power', q: 'What can my stack buy in real terms? Show me purchasing power.' },
  { label: 'What moved today?', q: 'What moved gold and silver today?' },
];

const VISITOR_KEY = 'troy_visitor_chat_v1';
const FREE_HISTORY = 3;

function localId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function readVisitorChat(): TroyMessage[] {
  try {
    const raw = sessionStorage.getItem(VISITOR_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveVisitorChat(messages: TroyMessage[]) {
  try {
    sessionStorage.setItem(VISITOR_KEY, JSON.stringify(messages.slice(-30)));
  } catch {
    // private browsing, fine
  }
}

function resetLabel(iso: string, now = new Date()): string {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return 'tomorrow';
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const time = formatTimeET(iso);
  if (day(t) === todayET(now)) return `at ${time}`;
  if (day(t) === day(new Date(now.getTime() + 86400000))) return `tomorrow at ${time}`;
  return `${t.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' })} at ${time}`;
}

function groupConversations(list: TroyConversationSummary[]) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86400000;
  const groups: Array<{ label: string; items: TroyConversationSummary[] }> = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'This week', items: [] },
    { label: 'Earlier', items: [] },
  ];
  for (const c of list) {
    const t = new Date(c.updated_at || c.created_at).getTime();
    if (t >= startToday) groups[0].items.push(c);
    else if (t >= startToday - day) groups[1].items.push(c);
    else if (t >= startToday - 6 * day) groups[2].items.push(c);
    else groups[3].items.push(c);
  }
  return groups.filter((g) => g.items.length);
}

interface ConversationListProps {
  conversations: TroyConversationSummary[];
  activeId: string | null;
  isGold: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

function ConversationList({ conversations, activeId, isGold, onSelect, onNew, onDelete }: ConversationListProps) {
  const { openTrial } = useTrial();
  const sorted = useMemo(
    () => [...conversations].sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()),
    [conversations],
  );
  // Free accounts see their three newest chats, the same as the app.
  const shown = isGold ? sorted : sorted.slice(0, FREE_HISTORY);
  const hidden = sorted.length - shown.length;
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button variant="secondary" className="w-full" onClick={onNew}>
          <MessageSquarePlus size={16} aria-hidden="true" /> New chat
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {shown.length === 0 && <p className="px-3 py-2 text-[13px] text-fg-3">Your chats with Troy show up here, on the web and in the app.</p>}
        {groupConversations(shown).map((g) => (
          <div key={g.label} className="mb-2">
            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">{g.label}</div>
            <ul className="space-y-0.5">
              {g.items.map((c) => (
                <li key={c.id} className={cx('group flex items-center rounded-lg', c.id === activeId ? 'bg-gold-soft' : 'hover:bg-surface-2')}>
                  <button type="button" onClick={() => onSelect(c.id)} className={cx('flex-1 min-w-0 truncate px-3 py-2 text-left text-[13px]', c.id === activeId ? 'text-gold font-semibold' : 'text-fg-2')}>
                    {c.title || 'New chat'}
                  </button>
                  {isGold && (
                    <button type="button" onClick={() => onDelete(c.id)} className="mr-1 p-1.5 rounded-md text-fg-3 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-down" aria-label={`Delete ${c.title || 'chat'}`}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {hidden > 0 && (
          <div className="mx-2 mt-2 rounded-xl border border-line bg-surface-2 p-3">
            <p className="text-[12px] text-fg-2">
              You have {sorted.length} chats with Troy. Gold keeps every one of them, on the web and in the app.
            </p>
            <button type="button" onClick={() => openTrial({ reason: 'Gold keeps every conversation with Troy.', campaign: 'webapp-troy-history' })} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-gold">
              <Lock size={12} aria-hidden="true" /> See Gold
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LimitCard({ quota, signedIn }: { quota: Quota; signedIn: boolean }) {
  const { openTrial } = useTrial();
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 animate-fade-up">
      <p className="text-[15px] font-semibold text-fg">That's today's {quota.questionsLimit} free questions.</p>
      <p className="mt-1 text-[14px] text-fg-2">
        They come back {resetLabel(quota.resetsAt)}.{' '}
        {signedIn ? 'Gold gives you 30 a day, and the first week is free in the app.' : 'A free account gets you three more a day, with your stack in context.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {!signedIn && (
          <Link to="/auth?next=/troy" className="inline-flex h-10 items-center rounded-xl bg-btn px-4 text-sm font-semibold text-btn-fg hover:bg-btn-hover">
            Create a free account
          </Link>
        )}
        <Button variant={signedIn ? 'primary' : 'secondary'} onClick={() => openTrial({ reason: `You've used today's ${quota.questionsLimit} free questions.`, campaign: 'webapp-troy-limit' })}>
          Try Gold free for a week
        </Button>
      </div>
    </div>
  );
}

function SignInCard() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="text-[15px] font-semibold text-fg">Sign in to ask Troy</p>
      <p className="mt-1 text-[14px] text-fg-2">It's free. Use the same account as the iPhone app and your chats with Troy follow you between the two.</p>
      <Link to="/auth?next=/troy" className="mt-4 inline-flex h-10 items-center rounded-xl bg-btn px-4 text-sm font-semibold text-btn-fg hover:bg-btn-hover">
        Sign in or sign up
      </Link>
    </div>
  );
}

export default function Troy() {
  usePageMeta({ ...SEO['/troy'], canonical: '/troy' });
  const { user, loading: authLoading, isConfigured } = useAuth();
  const { isGold } = useSubscription();
  const { holdings, addMany } = useHoldings();
  const { openTrial } = useTrial();
  const navigate = useNavigate();
  const params = useParams<{ conversationId?: string }>();
  const [search, setSearch] = useSearchParams();
  const qc = useQueryClient();
  const conversationId = params.conversationId ?? null;

  const [messages, setMessages] = useState<TroyMessage[]>(() => (user ? [] : readVisitorChat()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaHit, setQuotaHit] = useState<Quota | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  // A saved chat still loading. Nothing is sent until it's on screen, so the
  // load can't land over a question asked in the meantime.
  const [loadingChat, setLoadingChat] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [importRows, setImportRows] = useState<{ rows: ImportRow[]; source: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // The conversation whose messages are on screen, so a chat started here
  // isn't reloaded over its own question, and any other chat always is.
  const shownFor = useRef<string | null>(null);
  const autoAsked = useRef(false);

  const signedIn = Boolean(user);

  // Visitors: is the no-account endpoint live, and how many questions are left?
  // A status read that failed isn't a no. The question can still go, and the
  // visitor route says so if it's off.
  const visitorStatus = useQuery({
    queryKey: ['troy-visitor-status'],
    queryFn: ({ signal }) => visitorQuota(signal),
    enabled: !authLoading && !signedIn,
    staleTime: 60_000,
    retry: 2,
  });
  const visitorAvailable = visitorStatus.data != null || visitorStatus.isError;

  const conversations = useQuery({
    queryKey: ['troy-conversations', user?.id],
    queryFn: () => listConversations(user!.id),
    enabled: Boolean(user),
    staleTime: 30_000,
  });

  // Load a saved conversation. Another chat's messages come off the screen
  // first, so nothing is asked under the wrong one while it loads.
  useEffect(() => {
    if (!user || !conversationId) return;
    if (shownFor.current === conversationId) return;
    let cancelled = false;
    setError(null);
    setMessages([]);
    setLoadingChat(true);
    getConversation(conversationId, user.id)
      .then((conv) => {
        if (cancelled) return;
        shownFor.current = conversationId;
        setMessages(conv.messages ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("That conversation didn't load.");
      })
      .finally(() => {
        if (!cancelled) setLoadingChat(false);
      });
    return () => {
      cancelled = true;
      setLoadingChat(false);
    };
  }, [user, conversationId]);

  // Switching accounts or starting a new chat clears the screen.
  useEffect(() => {
    if (!conversationId && user) {
      shownFor.current = null;
      setMessages([]);
    }
  }, [conversationId, user]);

  // Signing out here takes the account's chat off the screen. It's never kept
  // or sent as the visitor's chat.
  const wasSignedIn = useRef(signedIn);
  const skipVisitorSave = useRef(false);
  useEffect(() => {
    if (wasSignedIn.current && !signedIn) {
      skipVisitorSave.current = true;
      shownFor.current = null;
      setMessages(readVisitorChat());
    }
    wasSignedIn.current = signedIn;
  }, [signedIn]);

  useEffect(() => {
    if (signedIn) return;
    if (skipVisitorSave.current) {
      skipVisitorSave.current = false;
      return;
    }
    saveVisitorChat(messages);
  }, [messages, signedIn]);

  // The chat on screen. An answer that arrives after someone moved to another
  // chat isn't added there. It's saved in the account either way.
  const openChat = useRef<string | null>(conversationId);
  useEffect(() => {
    openChat.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, quotaHit]);

  const sendSignedIn = useCallback(
    async (text: string) => {
      if (!user) return;
      let id = conversationId;
      let madeForThis = false;
      if (!id) {
        const conv = await createConversation(user.id);
        id = conv.id;
        madeForThis = true;
        shownFor.current = id;
        qc.setQueryData<TroyConversationSummary[]>(['troy-conversations', user.id], (prev) => [conv, ...(prev ?? [])]);
        openChat.current = id;
        navigate(`/troy/c/${id}`, { replace: true });
      }
      const controller = new AbortController();
      abortRef.current = controller;
      let res: Awaited<ReturnType<typeof sendMessage>>;
      try {
        res = await sendMessage(id, user.id, text, controller.signal);
      } catch (e) {
        // At the daily limit the question is refused before it's saved, so a
        // chat made for it is empty. It goes, so empty chats don't push real
        // ones out of the three a free account sees.
        if (madeForThis && e instanceof QuotaError) {
          const emptyId = id;
          const owner = user.id;
          deleteConversation(emptyId, owner).catch(() => undefined);
          qc.setQueryData<TroyConversationSummary[]>(['troy-conversations', owner], (prev) => (prev ?? []).filter((c) => c.id !== emptyId));
          if (openChat.current === emptyId) {
            openChat.current = null;
            navigate('/troy', { replace: true });
          }
        }
        throw e;
      }
      if (openChat.current === id) setMessages((prev) => [...prev, { ...res.message, preview: res.preview ?? null }]);
      qc.invalidateQueries({ queryKey: ['troy-conversations', user.id] });
    },
    [user, conversationId, navigate, qc],
  );

  const sendVisitor = useCallback(
    async (text: string, history: TroyMessage[]) => {
      const turns: VisitorTurn[] = history.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: m.content }));
      const controller = new AbortController();
      abortRef.current = controller;
      const res = await askAsVisitor(text, turns, controller.signal);
      setMessages((prev) => [...prev, { id: localId('troy'), role: 'assistant', content: res.reply, created_at: new Date().toISOString() }]);
      qc.setQueryData(['troy-visitor-status'], { questionsUsed: res.questionsUsed, questionsLimit: res.questionsLimit, resetsAt: res.resetsAt });
    },
    [qc],
  );

  const send = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || busy || loadingChat) return;
      if (!hasTroyConsent()) {
        setPending(t);
        setConsentOpen(true);
        return;
      }
      setError(null);
      setQuotaHit(null);
      const userMsg: TroyMessage = { id: localId('me'), role: 'user', content: t, created_at: new Date().toISOString() };
      const history = messages;
      setMessages((prev) => [...prev, userMsg]);
      setBusy(true);
      try {
        if (signedIn) await sendSignedIn(t);
        else await sendVisitor(t, history);
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
        if (e instanceof QuotaError) {
          setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
          setQuotaHit(e.quota);
        } else if (e instanceof VisitorChatUnavailable) {
          setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
          qc.setQueryData(['troy-visitor-status'], null);
        } else if (e instanceof ApiError && e.status === 404 && /profile/i.test(e.message)) {
          setError('Your account is still being set up. Give it a minute and try again.');
        } else {
          setError("Troy couldn't answer that just now. Try again in a moment.");
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, loadingChat, messages, signedIn, sendSignedIn, sendVisitor, qc],
  );

  // A question handed over from another page, /troy?q=...
  useEffect(() => {
    const q = search.get('q');
    if (!q || autoAsked.current || authLoading || loadingChat) return;
    if (!signedIn && visitorStatus.isLoading) return;
    if (!signedIn && !visitorAvailable && isConfigured) return;
    autoAsked.current = true;
    search.delete('q');
    setSearch(search, { replace: true });
    void send(q);
  }, [search, setSearch, authLoading, loadingChat, signedIn, visitorStatus.isLoading, visitorAvailable, isConfigured, send]);

  const todaysBrief = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    try {
      const res = await getJson<{ brief?: { brief_text: string; date: string; is_current?: boolean } | null }>(`/v1/daily-brief?userId=${encodeURIComponent(user.id)}`);
      const b = res.brief;
      const text = !b
        ? "Your first brief lands tomorrow morning. Troy writes one each day from your stack and the overnight news."
        : b.is_current === false
          ? `Today's brief isn't out yet. Here's the last one, from ${b.date}.\n\n${b.brief_text}`
          : b.brief_text;
      setMessages((prev) => [...prev, { id: localId('brief'), role: 'assistant', content: text, created_at: new Date().toISOString() }]);
    } catch {
      setError("Today's brief didn't load.");
    } finally {
      setBusy(false);
    }
  }, [user]);

  const onPhoto = useCallback(
    async (file: File) => {
      if (!user) return;
      setError(null);
      try {
        if (!isGold) {
          const s = await scanStatus(user.id);
          if (s.scansUsed >= s.scansLimit) {
            openTrial({ reason: `Free accounts get ${s.scansLimit} receipt scans every 30 days, and you've used them.`, campaign: 'webapp-trial' });
            return;
          }
        }
        setBusy(true);
        const base64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        const result = await scanReceipt(base64, file.type || 'image/jpeg');
        if (!isGold) countScan(user.id).catch(() => undefined);
        if (!result.items?.length) {
          setError("Troy couldn't find any metal on that receipt.");
          return;
        }
        setImportRows({
          source: result.dealer ? `${result.dealer} receipt` : 'your receipt',
          rows: result.items.map((it) => ({
            description: it.description,
            metal: it.metal,
            weight: it.ozt,
            quantity: it.quantity,
            purchasePrice: it.unitPrice ?? (it.extPrice && it.quantity ? it.extPrice / it.quantity : undefined),
            purchaseDate: result.purchaseDate,
            dealer: result.dealer,
          })),
        });
      } catch {
        setError("That receipt didn't scan. Try a clearer photo.");
      } finally {
        setBusy(false);
      }
    },
    [user, isGold, openTrial],
  );

  const onSpreadsheet = useCallback(async (file: File) => {
    try {
      setImportRows({ rows: await parseSpreadsheet(file), source: file.name });
    } catch {
      setError("That file couldn't be read.");
    }
  }, []);

  const isEmpty = messages.length === 0 && !busy && !loadingChat;
  const chips = holdings.length > 0 && signedIn ? STACK_CHIPS : MARKET_CHIPS;
  const visitorBlocked = !authLoading && !signedIn && !visitorStatus.isLoading && !visitorAvailable;
  const left = visitorStatus.data ? Math.max(0, visitorStatus.data.questionsLimit - visitorStatus.data.questionsUsed) : null;

  const list = signedIn ? (
    <ConversationList
      conversations={conversations.data ?? []}
      activeId={conversationId}
      isGold={isGold}
      onSelect={(id) => {
        setListOpen(false);
        setQuotaHit(null);
        navigate(`/troy/c/${id}`);
      }}
      onNew={() => {
        setListOpen(false);
        setQuotaHit(null);
        setMessages([]);
        navigate('/troy');
      }}
      onDelete={async (id) => {
        if (!user) return;
        try {
          await deleteConversation(id, user.id);
        } catch {
          // The chat is still saved, so it stays on the list and on screen.
          setError("That chat couldn't be deleted. Check your connection and try again.");
          return;
        }
        qc.setQueryData<TroyConversationSummary[]>(['troy-conversations', user.id], (prev) => (prev ?? []).filter((c) => c.id !== id));
        if (id === conversationId) navigate('/troy');
      }}
    />
  ) : null;

  return (
    <div className="flex h-[calc(100dvh-6.75rem)] lg:h-[calc(100dvh-3.5rem)] min-h-0">
      {signedIn && <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-line bg-bg-elev">{list}</aside>}

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {signedIn && (
              <button type="button" onClick={() => setListOpen(true)} className="md:hidden h-9 w-9 flex items-center justify-center rounded-lg text-fg-2 hover:bg-surface-2" aria-label="Your chats">
                <PanelLeft size={18} />
              </button>
            )}
            <img src="/troy-96.png" alt="" className="h-8 w-8 rounded-full" width={32} height={32} />
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-fg">Troy</div>
              <div className="text-[12px] text-fg-3 truncate">Stack analyst, AI</div>
            </div>
          </div>
          <div className="text-[12px] text-fg-3 text-right">
            {!signedIn && left != null && (
              <span>
                {left} of {visitorStatus.data?.questionsLimit} free questions left today
                <span className="hidden sm:inline">
                  {' · '}
                  <Link to="/auth?next=/troy" className="font-semibold text-gold hover:text-gold-2">
                    Sign in
                  </Link>
                </span>
              </span>
            )}
            {signedIn && !isGold && (
              <button type="button" onClick={() => openTrial({ reason: 'Gold gives you 30 questions a day with Troy.', campaign: 'webapp-troy-limit' })} className="font-semibold text-gold hover:text-gold-2">
                Free plan, 3 a day
              </button>
            )}
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
            {isEmpty && !quotaHit && (
              <div className="flex flex-col items-center text-center pt-6 sm:pt-12">
                <img src="/troy-96.png" alt="" className="h-20 w-20 rounded-full shadow-card" width={80} height={80} />
                <h1 className="mt-4 text-[24px] sm:text-[28px] font-semibold tracking-tight text-fg">Ask Troy anything</h1>
                <p className="mt-1.5 max-w-md text-[15px] text-fg-2">
                  {signedIn
                    ? holdings.length
                      ? 'He knows your stack, and what moved the market today.'
                      : 'Ask about the market, a coin, or the news. Add your stack and he\'ll factor it in.'
                    : 'He reads the gold and silver news all day. Ask what moved, what a coin is worth, or where the ratio sits.'}
                </p>
                {visitorBlocked ? (
                  <div className="mt-6 w-full max-w-md text-left">
                    <SignInCard />
                  </div>
                ) : (
                  <div className="mt-6 grid w-full max-w-lg gap-2 sm:grid-cols-2">
                    {isGold && (
                      <button type="button" onClick={() => void todaysBrief()} className="rounded-xl border border-line bg-surface px-4 py-3 text-left text-[14px] text-fg hover:border-gold">
                        Today's brief
                      </button>
                    )}
                    {chips.map((c) => (
                      <button key={c.label} type="button" onClick={() => void send(c.q)} className="rounded-xl border border-line bg-surface px-4 py-3 text-left text-[14px] text-fg hover:border-gold">
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {loadingChat && (
              <p className="pt-10 text-center text-[14px] text-fg-3" role="status">
                Loading this chat
              </p>
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} userId={user?.id} canListen={isGold && m.role === 'assistant'} />
            ))}
            {busy && <TypingIndicator />}
            {quotaHit && <LimitCard quota={quotaHit} signedIn={signedIn} />}
            {error && (
              <div className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-[14px] text-fg-2" role="alert">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-line bg-bg px-4 pt-3 pb-4">
          <div className="mx-auto max-w-3xl">
            <Composer
              onSend={(t) => void send(t)}
              onStop={() => abortRef.current?.abort()}
              busy={busy}
              disabled={visitorBlocked || Boolean(quotaHit) || loadingChat}
              placeholder={visitorBlocked ? 'Sign in to ask Troy' : loadingChat ? 'Loading this chat' : 'Ask Troy anything'}
              maxLength={signedIn ? 2000 : 500}
              onPhoto={signedIn ? (f) => void onPhoto(f) : undefined}
              onSpreadsheet={signedIn ? (f) => void onSpreadsheet(f) : undefined}
            />
            <p className="mt-2 text-center text-[11px] text-fg-3">Troy is an AI. His answers are analysis, not financial advice.</p>
          </div>
        </div>
      </section>

      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="Your chats">
        <div className="h-[60vh] -mx-5">{list}</div>
      </Sheet>
      <ConsentDialog
        open={consentOpen}
        onClose={() => {
          setConsentOpen(false);
          setPending(null);
        }}
        onAccept={() => {
          setConsentOpen(false);
          const p = pending;
          setPending(null);
          if (p) setTimeout(() => void send(p), 0);
        }}
      />
      {importRows && (
        <ImportSheet
          rows={importRows.rows}
          source={importRows.source}
          onClose={() => setImportRows(null)}
          onConfirm={async (rows, batchId) => {
            const forms: HoldingFormData[] = rows
              .filter((r) => r.metal && r.weight)
              .map((r) => ({
                metal: r.metal!,
                type: r.description || 'Imported item',
                weight: r.weight!,
                weightUnit: 'oz',
                quantity: r.quantity && r.quantity > 0 ? r.quantity : 1,
                purchasePrice: r.purchasePrice ?? 0,
                purchaseDate: r.purchaseDate || '',
                dealer: r.dealer,
                taxes: r.taxes,
                shipping: r.shipping,
                note: r.note,
              }));
            const n = await addMany(forms, batchId);
            setMessages((prev) => [
              ...prev,
              { id: localId('ack'), role: 'assistant', content: `Added ${n} ${n === 1 ? 'item' : 'items'} to your stack from ${importRows.source}.`, created_at: new Date().toISOString() },
            ]);
          }}
        />
      )}
    </div>
  );
}
