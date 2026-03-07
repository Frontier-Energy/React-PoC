import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { getFallbackLabels } from '../resources/translations/fallback';

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const translationMatch = url.match(/\/translations\/([^/?#]+)/);
      if (translationMatch) {
        const language = decodeURIComponent(translationMatch[1]) as 'en' | 'es';
        return new Response(JSON.stringify(getFallbackLabels(language)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch call in test: ${url}`);
    })
  );
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
