import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFormSchema, fetchTranslations } from './apiContent';
import { CONTENT_ARTIFACT_CACHE_STORAGE_KEY } from './contentGovernance';
import { getFallbackLabels } from './resources/translations/fallback';
import { FormType } from './types';

describe('apiContent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(CONTENT_ARTIFACT_CACHE_STORAGE_KEY);
  });

  it('loads a valid form schema payload', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        formName: 'HVAC',
        sections: [],
        uploadStatus: 'local',
      }),
    } as Response);

    await expect(fetchFormSchema(FormType.HVAC)).resolves.toEqual({
      formName: 'HVAC',
      sections: [],
      uploadStatus: 'local',
    });
  });

  it('fails when the request fails and no cached form schema exists', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(fetchFormSchema(FormType.HVAC)).rejects.toThrow(
      'No valid form schema is available for "hvac" from the network or cache.'
    );
  });

  it('fails when the payload is invalid and no cached form schema exists', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ formName: 'Broken schema' }),
    } as Response);

    await expect(fetchFormSchema(FormType.HVAC)).rejects.toThrow(
      'No valid form schema is available for "hvac" from the network or cache.'
    );
  });

  it('loads a valid translations payload', async () => {
    const response = new Response(JSON.stringify(getFallbackLabels('en')), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    vi.spyOn(global, 'fetch').mockResolvedValue(response);

    await expect(fetchTranslations('en')).resolves.toMatchObject({
      languageName: 'English',
      app: { title: 'Inspection Forms' },
      common: { yes: 'Yes' },
    });
  });

  it('merges fetched translations onto bundled fallback labels', async () => {
    const partialLabels = {
      ...getFallbackLabels('en'),
      bootstrap: undefined,
      app: {
        ...getFallbackLabels('en').app,
        title: 'Custom Title',
      },
    };
    const response = new Response(JSON.stringify(partialLabels), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    vi.spyOn(global, 'fetch').mockResolvedValue(response);

    await expect(fetchTranslations('en')).resolves.toMatchObject({
      app: { title: 'Custom Title' },
      bootstrap: { supportLink: 'QControl filure, please contact support' },
    });
  });

  it('falls back to bundled translations when the response is not ok', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401 } as Response);

    await expect(fetchTranslations('en')).resolves.toEqual(getFallbackLabels('en'));
  });

  it('falls back to bundled translations when the payload is invalid', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ languageName: 'English' }),
    } as Response);

    await expect(fetchTranslations('en')).resolves.toEqual(getFallbackLabels('en'));
  });

  it('reuses the last known good translations when a later rollout is invalid', async () => {
    const fetchMock = vi.spyOn(global, 'fetch');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      app: {
        title: 'Approved Title',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      app: {
        unsupportedKey: 'bad rollout',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(fetchTranslations('en')).resolves.toMatchObject({
      app: { title: 'Approved Title' },
    });
    await expect(fetchTranslations('en')).resolves.toMatchObject({
      app: { title: 'Approved Title' },
    });
  });
});
