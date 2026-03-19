import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './apiClient';
import { clearAccessToken, setAccessToken } from './auth';

describe('apiClient', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('adds the bearer token header when one is available', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    setAccessToken('token-123');

    await apiFetch('https://example.test/resource', {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/resource',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(requestInit?.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-123');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('leaves headers unchanged when no bearer token is available', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    clearAccessToken();

    await apiFetch('https://example.test/resource');

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(requestInit?.headers);
    expect(headers.has('Authorization')).toBe(false);
  });
});
