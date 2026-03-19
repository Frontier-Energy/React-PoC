import { platform } from '@platform';
import { getAccessToken } from './auth';

const createHeadersWithBearerToken = (headers: HeadersInit | undefined, accessToken: string | null) => {
  const resolvedHeaders = new Headers(headers);
  if (accessToken) {
    resolvedHeaders.set('Authorization', `Bearer ${accessToken}`);
  }
  return resolvedHeaders;
};

export const apiFetch = (input: RequestInfo | URL, init?: RequestInit) =>
  platform.connectivity.fetch(input, {
    ...init,
    headers: createHeadersWithBearerToken(init?.headers, getAccessToken()),
  });
