/**
 * Calls to the TroyStack API (api.troystack.ai). The browser calls it
 * directly, the way the iPhone app does; the API allows troystack.ai and the
 * web app's Vercel previews.
 */

export const API_BASE: string = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'https://api.troystack.ai';

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(message: string, status: number, body: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Supabase access token, for routes that act on the signed-in account. */
  token?: string;
}

async function request<T>(path: string, init: RequestInit, { signal, timeoutMs = 20000, token }: RequestOptions = {}): Promise<T> {
  if (token) init = { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` } };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(path.startsWith('http') ? path : `${API_BASE}${path}`, { ...init, signal: controller.signal });
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const body = isJson ? await res.json().catch(() => ({})) : await res.text();
    if (!res.ok) {
      const obj = (typeof body === 'object' && body ? body : {}) as Record<string, unknown>;
      const message = typeof obj.error === 'string' ? obj.error : `${res.status} ${res.statusText}`;
      throw new ApiError(message, res.status, obj);
    }
    return body as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if ((err as Error)?.name === 'AbortError') {
      if (signal?.aborted) throw err;
      throw new ApiError('The request timed out', 0);
    }
    throw new ApiError((err as Error)?.message || 'Network error', 0);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export function getJson<T>(path: string, opts?: RequestOptions): Promise<T> {
  return request<T>(path, { method: 'GET' }, opts);
}

export function getText(path: string, opts?: RequestOptions): Promise<string> {
  return request<string>(path, { method: 'GET' }, opts);
}

export function postJson<T>(path: string, body: unknown, opts?: RequestOptions): Promise<T> {
  return request<T>(
    path,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    opts,
  );
}
