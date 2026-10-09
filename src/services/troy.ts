import { ApiError, getJson, postJson, API_BASE } from '../lib/apiClient';

/**
 * Troy chat. Signed-in calls use the same endpoints and the same Supabase
 * user id as the iPhone app, so conversations are shared between the two.
 * Visitors who haven't signed in use /v1/troy/ask, which keeps nothing.
 */

export interface TroyMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  preview?: TroyPreview | null;
}

export interface TroyConversationSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface TroyConversation extends TroyConversationSummary {
  messages: TroyMessage[];
}

export type TroyPreviewType =
  | 'portfolio'
  | 'cost_basis'
  | 'chart'
  | 'purchasing_power'
  | 'dealer_link'
  | 'daily_brief'
  | 'signal_article';

export interface TroyPreview {
  type: TroyPreviewType;
  chartType?: 'ratio' | 'spot_price';
  data: Record<string, unknown> | null;
}

export interface SendMessageResponse {
  message: TroyMessage;
  title?: string;
  preview?: TroyPreview | null;
}

export interface Quota {
  questionsUsed: number;
  questionsLimit: number;
  resetsAt: string;
}

/** Thrown when Troy's daily question limit is reached. */
export class QuotaError extends Error {
  quota: Quota;
  constructor(quota: Quota) {
    super('Daily question limit reached');
    this.name = 'QuotaError';
    this.quota = quota;
  }
}

function quotaFrom(err: ApiError): Quota {
  return {
    questionsUsed: Number(err.body.questionsUsed) || 0,
    questionsLimit: Number(err.body.questionsLimit) || 3,
    resetsAt: String(err.body.resetsAt || new Date(Date.now() + 86400000).toISOString()),
  };
}

export async function createConversation(userId: string): Promise<TroyConversationSummary> {
  return postJson('/v1/troy/conversations', { userId });
}

export async function listConversations(userId: string): Promise<TroyConversationSummary[]> {
  const res = await getJson<{ conversations?: TroyConversationSummary[] } | TroyConversationSummary[]>(
    `/v1/troy/conversations?userId=${encodeURIComponent(userId)}`,
  );
  return Array.isArray(res) ? res : res.conversations ?? [];
}

export async function getConversation(conversationId: string, userId: string): Promise<TroyConversation> {
  return getJson(`/v1/troy/conversations/${encodeURIComponent(conversationId)}?userId=${encodeURIComponent(userId)}`);
}

export async function deleteConversation(conversationId: string, userId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/v1/troy/conversations/${encodeURIComponent(conversationId)}?userId=${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new ApiError(`Delete failed (${res.status})`, res.status);
}

export async function sendMessage(
  conversationId: string,
  userId: string,
  message: string,
  signal?: AbortSignal,
): Promise<SendMessageResponse> {
  try {
    return await postJson<SendMessageResponse>(
      `/v1/troy/conversations/${encodeURIComponent(conversationId)}/messages`,
      { userId, message },
      { signal, timeoutMs: 90000 },
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 403 && err.body.questionsLimit != null) {
      throw new QuotaError(quotaFrom(err));
    }
    throw err;
  }
}

// ── Visitors ──────────────────────────────────────────────────────

export interface VisitorTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AskResponse extends Quota {
  reply: string;
}

/** Thrown when the visitor endpoint isn't live on the API yet. */
export class VisitorChatUnavailable extends Error {
  constructor() {
    super('Visitor chat is unavailable');
    this.name = 'VisitorChatUnavailable';
  }
}

export async function askAsVisitor(message: string, history: VisitorTurn[], signal?: AbortSignal): Promise<AskResponse> {
  try {
    return await postJson<AskResponse>('/v1/troy/ask', { message, history: history.slice(-6) }, { signal, timeoutMs: 90000 });
  } catch (err) {
    if (err instanceof ApiError) {
      // The visitor limit says how many questions were used. A 429 without
      // that is the API's general rate limit, which passes in a minute.
      if (err.status === 429 && err.body.questionsLimit != null) throw new QuotaError(quotaFrom(err));
      if (err.status === 404 || err.status === 405) throw new VisitorChatUnavailable();
    }
    throw err;
  }
}

export async function visitorQuota(signal?: AbortSignal): Promise<Quota | null> {
  try {
    return await getJson<Quota>('/v1/troy/ask/status', { signal, timeoutMs: 8000 });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) return null;
    throw err;
  }
}

// ── Voice and receipts ────────────────────────────────────────────

/** Troy reads a reply aloud. Gold only on the API side. */
export async function speak(text: string, userId: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(`${API_BASE}/v1/troy/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text.slice(0, 4000), userId }),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.message || body.error || `Listen failed (${res.status})`, res.status, body);
  }
  return res.blob();
}

export interface ScanReceiptItem {
  description: string;
  quantity: number;
  unitPrice?: number;
  extPrice?: number;
  metal?: 'gold' | 'silver' | 'platinum' | 'palladium';
  ozt?: number;
}

export interface ScanReceiptResult {
  dealer?: string;
  purchaseDate?: string;
  purchaseTime?: string;
  items: ScanReceiptItem[];
}

export async function scanReceipt(base64Image: string, mimeType = 'image/jpeg'): Promise<ScanReceiptResult> {
  const raw = await postJson<{ success?: boolean; data?: ScanReceiptResult } | ScanReceiptResult>(
    '/v1/scan-receipt',
    { image: base64Image, mimeType },
    { timeoutMs: 60000 },
  );
  if ('data' in raw && raw.data) return raw.data;
  return raw as ScanReceiptResult;
}

export interface ScanStatus {
  scansUsed: number;
  scansLimit: number;
  resetsAt: string;
}

/** Free accounts get five receipt scans every 30 days, the same as the app. */
export async function scanStatus(userId: string): Promise<ScanStatus> {
  return getJson<ScanStatus>(`/v1/scan-status?userId=${encodeURIComponent(userId)}`);
}

export async function countScan(userId: string): Promise<void> {
  await postJson('/v1/increment-scan', { userId });
}
