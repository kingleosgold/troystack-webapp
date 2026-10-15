import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJson, postJson } from './apiClient';

describe('a request whose caller already stopped', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is never sent, and rejects as an abort', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(postJson('/v1/troy/conversations/x/messages', { message: 'hi' }, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still goes out when the signal is live, with the session token', async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    await expect(getJson('/v1/troy/conversations?userId=u', { signal: controller.signal, token: 'tok' })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1];
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });
});
