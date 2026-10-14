import { ApiError, getJson, postJson, API_BASE } from '../lib/apiClient';

/** Asks the API for this account's plan. Best effort, called once after sign-in. */
export async function syncSubscription(userId: string): Promise<{ subscription_tier?: string; subscription_status?: string | null }> {
  return getJson(`/v1/sync-subscription?user_id=${encodeURIComponent(userId)}`, { timeoutMs: 10000 });
}

// ── Developer API keys ──────────────────────────────────────────────

export interface ApiKey {
  id: string;
  name?: string | null;
  /** Last characters of the key, enough to tell keys apart */
  key_preview: string;
  tier: 'free' | 'pro' | 'enterprise';
  /** Requests per hour */
  rate_limit: number;
  created_at: string;
  last_used_at: string | null;
  request_count: number;
}

export interface GeneratedApiKey extends ApiKey {
  /** The full key. The API returns it once, when it's made. */
  api_key: string;
}

export async function listApiKeys(token: string): Promise<ApiKey[]> {
  const data = await getJson<{ keys?: ApiKey[] } | ApiKey[]>('/v1/api-keys', { token });
  return Array.isArray(data) ? data : data.keys ?? [];
}

export async function generateApiKey(token: string): Promise<GeneratedApiKey> {
  const data = await postJson<Record<string, unknown>>('/v1/api-keys/generate', {}, { token });
  // The API answers { id, api_key, key, tier, rate_limit }. Older builds wrapped
  // the record as { key: {...} }, so both shapes are read.
  if (data.key && typeof data.key === 'object' && !Array.isArray(data.key)) return data.key as unknown as GeneratedApiKey;
  const raw = (data.api_key || data.key) as string | undefined;
  return { ...(data as unknown as GeneratedApiKey), api_key: raw ?? '' };
}

export async function revokeApiKey(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/api-keys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.message || body.error || `Revoke failed (${res.status})`, res.status, body);
  }
}
