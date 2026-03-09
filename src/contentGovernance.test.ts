import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCachedContentArtifacts,
  CONTENT_ARTIFACT_CACHE_STORAGE_KEY,
  getBundledTranslations,
  resolveGovernedFormSchema,
  resolveGovernedTranslations,
} from './contentGovernance';
import { FormType, UploadStatus } from './types';

vi.mock('./config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config')>();
  return {
    ...actual,
    getActiveTenant: () => ({ tenantId: 'tenant-default' }),
  };
});

describe('contentGovernance', () => {
  const schemaFixture = {
    formName: 'Governed HVAC',
    uploadStatus: UploadStatus.Local,
    sections: [],
  };

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('loads governed form schemas from the network and falls back to cached artifacts', async () => {
    const network = await resolveGovernedFormSchema(
      FormType.HVAC,
      async () => ({
        schemaVersion: '2026-03-09',
        artifactVersion: '1.0.1',
        compatibility: {
          minRuntimeVersion: 1,
          maxRuntimeVersion: 1,
        },
        schema: schemaFixture,
      }),
      'tenant-a'
    );

    expect(network.source).toBe('network');
    expect(network.payload.formName).toBe(schemaFixture.formName);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cached = await resolveGovernedFormSchema(
      FormType.HVAC,
      async () => {
        throw new Error('network down');
      },
      'tenant-a'
    );

    expect(cached.source).toBe('cache');
    expect(cached.payload.formName).toBe(schemaFixture.formName);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('fails when compatibility is invalid and no cached schema exists', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      resolveGovernedFormSchema(
        FormType.Electrical,
        async () => ({
          compatibility: {
            minRuntimeVersion: 2,
          },
          schema: {
            formName: '',
            sections: 'invalid',
          },
        }),
        'tenant-b'
      )
    ).rejects.toThrow('No valid form schema is available for "electrical" from the network or cache.');

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('accepts rich governed schemas with choice, file, and visibility metadata', async () => {
    const richSchema = await resolveGovernedFormSchema(
      FormType.SafetyChecklist,
      async () => ({
        schema: {
          formName: 'Governed Safety',
          uploadStatus: UploadStatus.Failed,
          sections: [
            {
              title: 'Checklist',
              fields: [
                {
                  id: 'choice',
                  label: 'Choice',
                  type: 'radio',
                  required: true,
                  options: [{ label: 'Yes', value: 'yes' }],
                  validationRules: [{ type: 'custom', message: 'ok', value: 'rule' }],
                },
                {
                  id: 'file',
                  label: 'Photo',
                  type: 'file',
                  required: false,
                  accept: 'image/*',
                  multiple: true,
                  capture: 'environment',
                },
                {
                  id: 'details',
                  label: 'Details',
                  type: 'text',
                  required: false,
                  placeholder: '',
                  description: '',
                  visibleWhen: [{ fieldId: 'choice', value: 'yes', operator: 'equals' }],
                },
              ],
            },
          ],
        },
      }),
      'tenant-rich'
    );

    expect(richSchema.source).toBe('network');
    expect(richSchema.payload.uploadStatus).toBe(UploadStatus.Failed);
    expect(richSchema.payload.sections[0]?.fields[1]?.accept).toBe('image/*');
    expect(richSchema.payload.sections[0]?.fields[2]?.visibleWhen?.[0]?.fieldId).toBe('choice');
  });

  it('fails when schema validation rejects unsupported field combinations and no cache exists', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      resolveGovernedFormSchema(
        FormType.HVAC,
        async () => ({
          schema: {
            formName: 'Broken schema',
            sections: [
              {
                title: 'Broken',
                fields: [
                  {
                    id: 'bad',
                    label: 'Bad',
                    type: 'text',
                    required: false,
                    options: [{ label: 'Nope', value: 'nope' }],
                  },
                ],
              },
            ],
          },
        }),
        'tenant-invalid'
      )
    ).rejects.toThrow('No valid form schema is available for "hvac" from the network or cache.');

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('fails when choice fields omit options or file-only settings are misused without cache', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      resolveGovernedFormSchema(
        FormType.HVAC,
        async () => ({
          schema: {
            formName: 'Broken choice',
            sections: [
              {
                title: 'Broken',
                fields: [
                  {
                    id: 'choice',
                    label: 'Choice',
                    type: 'select',
                    required: false,
                  },
                ],
              },
            ],
          },
        }),
        'tenant-invalid-choice'
      )
    ).rejects.toThrow('No valid form schema is available for "hvac" from the network or cache.');

    await expect(
      resolveGovernedFormSchema(
        FormType.HVAC,
        async () => ({
          schema: {
            formName: 'Broken file settings',
            sections: [
              {
                title: 'Broken',
                fields: [
                  {
                    id: 'text',
                    label: 'Text',
                    type: 'text',
                    required: false,
                    accept: 'image/*',
                    multiple: true,
                  },
                ],
              },
            ],
          },
        }),
        'tenant-invalid-file'
      )
    ).rejects.toThrow('No valid form schema is available for "hvac" from the network or cache.');

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('loads governed translations, validates overrides, and falls back through cache and bundled labels', async () => {
    const bundled = getBundledTranslations('en');
    const network = await resolveGovernedTranslations(
      'en',
      async () => ({
        schemaVersion: '2026-03-09',
        artifactVersion: '2.0.0',
        compatibility: {
          minRuntimeVersion: 1,
          maxRuntimeVersion: 1,
        },
        labels: {
          support: {
            title: 'Governed Support',
          },
        },
      }),
      'tenant-c'
    );

    expect(network.source).toBe('network');
    expect(network.payload.support.title).toBe('Governed Support');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cached = await resolveGovernedTranslations(
      'en',
      async () => ({
        labels: {
          support: {
            unsupportedKey: 'bad',
          },
        },
      }),
      'tenant-c'
    );

    expect(cached.source).toBe('cache');
    expect(cached.payload.support.title).toBe('Governed Support');

    clearCachedContentArtifacts('tenant-c');
    const fallback = await resolveGovernedTranslations(
      'en',
      async () => ({
        compatibility: {
          maxRuntimeVersion: 0,
        },
        labels: {
          support: {
            title: 1,
          },
        },
      }),
      'tenant-c'
    );

    expect(fallback.source).toBe('bundled');
    expect(fallback.payload.support.title).toBe(bundled.support.title);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('clears cached content for one tenant without deleting other tenant artifacts', async () => {
    await resolveGovernedFormSchema(FormType.HVAC, async () => ({ schema: schemaFixture }), 'tenant-one');
    await resolveGovernedFormSchema(FormType.HVAC, async () => ({ schema: schemaFixture }), 'tenant-two');

    clearCachedContentArtifacts('tenant-one');

    const cache = JSON.parse(localStorage.getItem(CONTENT_ARTIFACT_CACHE_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    expect(Object.keys(cache).some((key) => key.startsWith('tenant-one::'))).toBe(false);
    expect(Object.keys(cache).some((key) => key.startsWith('tenant-two::'))).toBe(true);
  });

  it('handles invalid cache payloads and invalid translation shapes safely', async () => {
    localStorage.setItem(CONTENT_ARTIFACT_CACHE_STORAGE_KEY, '{invalid');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bundled = await resolveGovernedTranslations(
      'en',
      async () => ({
        labels: 'invalid',
      }),
      'tenant-default'
    );

    expect(bundled.source).toBe('bundled');
    expect(bundled.payload.languageName).toBe(getBundledTranslations('en').languageName);

    clearCachedContentArtifacts();
    expect(localStorage.getItem(CONTENT_ARTIFACT_CACHE_STORAGE_KEY)).toBe('{}');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('fails when visibility rules are invalid and still falls back for invalid translations', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      resolveGovernedFormSchema(
        FormType.HVAC,
        async () => ({
          schema: {
            formName: 'Broken visibility',
            sections: [
              {
                title: 'Broken',
                fields: [
                  {
                    id: 'field-a',
                    label: 'Field A',
                    type: 'text',
                    required: false,
                    visibleWhen: [{ fieldId: 'missing-field', value: ['x'], operator: 'contains' }],
                  },
                ],
              },
            ],
          },
        }),
        'tenant-invalid-visibility'
      )
    ).rejects.toThrow('No valid form schema is available for "hvac" from the network or cache.');

    const invalidTranslations = await resolveGovernedTranslations(
      'en',
      async () => ({
        labels: {
          support: [],
        },
      }),
      'tenant-invalid-translations'
    );
    expect(invalidTranslations.source).toBe('bundled');
    expect(warnSpy).toHaveBeenCalled();
  });
});
