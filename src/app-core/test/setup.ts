import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { getFallbackLabels } from '../resources/translations/fallback';
import { appDataStore } from '../utils/appDataStore';
import { createIndexedDbMock } from './indexedDbMock';

const indexedDbMock = createIndexedDbMock();

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('indexedDB', indexedDbMock.indexedDB);
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

afterEach(async () => {
  cleanup();
  localStorage.clear();
  indexedDbMock.reset();
  if (typeof indexedDB !== 'undefined') {
    await appDataStore.clearAll();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
