import { describe, expect, it, vi } from 'vitest';
import { fetchFormSchema, fetchTranslations } from './apiContent';
import { getFallbackLabels } from './resources/translations/fallback';

describe('apiContent', () => {
  it('loads a valid form schema payload', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        formName: 'HVAC',
        sections: [],
        uploadStatus: 'local',
      }),
    } as Response);

    await expect(fetchFormSchema('hvac')).resolves.toEqual({
      formName: 'HVAC',
      sections: [],
      uploadStatus: 'local',
    });
  });

  it('rejects when the form schema response is not ok', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(fetchFormSchema('hvac')).rejects.toThrow('Form schema request failed with status 503');
  });

  it('rejects when the form schema payload is missing required fields', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ formName: 'Broken schema' }),
    } as Response);

    await expect(fetchFormSchema('hvac')).rejects.toThrow('Form schema response is missing required fields');
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

  it('rejects when the translations response is not ok', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401 } as Response);

    await expect(fetchTranslations('en')).rejects.toThrow('Translations request failed with status 401');
  });

  it('rejects when the translations payload is invalid', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ languageName: 'English' }),
    } as Response);

    await expect(fetchTranslations('en')).rejects.toThrow('Translations response is missing required fields');
  });
});
