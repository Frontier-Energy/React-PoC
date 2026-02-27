import { FormType, UploadStatus } from '../../types';
import { en } from './en';
import { es } from './es';
import { defaultLanguage, getTranslations, isLanguageCode } from './index';

describe('translations', () => {
  it('recognizes valid language codes', () => {
    expect(defaultLanguage).toBe('en');
    expect(isLanguageCode('en')).toBe(true);
    expect(isLanguageCode('es')).toBe(true);
    expect(isLanguageCode('fr')).toBe(false);
    expect(isLanguageCode(42)).toBe(false);
  });

  it('returns translation sets and dynamic strings in English', () => {
    expect(getTranslations('en').home.title).toBe('Inspection Forms');
    expect(en.connectivity.lastCheckedAt('10:00')).toContain('10:00');
    expect(en.myInspections.failedUploadMessage(1)).toContain('An inspection failed');
    expect(en.myInspections.failedUploadMessage(2)).toContain('2 inspections failed');
    expect(en.fillForm.wizard.stepNumberLabel(2)).toBe('Step 2');
    expect(en.fillForm.wizard.collapsedStepsLabel(2, 7)).toBe('Step 2 of 7');
    expect(en.fillForm.wizard.skipToButtonLabel('Review', 5)).toBe('Skip to Review (Step 5)');
    expect(en.formTypes[FormType.HVAC]).toBe('HVAC');
    expect(en.uploadStatus[UploadStatus.Uploading]).toBe('Uploading');
  });

  it('returns translation sets and dynamic strings in Spanish', () => {
    expect(getTranslations('es').home.title).toBe('Formularios de inspeccion');
    expect(es.connectivity.lastCheckedAt('10:00')).toContain('10:00');
    expect(es.myInspections.failedUploadMessage(1)).toContain('Una inspeccion no pudo subirse');
    expect(es.myInspections.failedUploadMessage(3)).toContain('3 inspecciones no pudieron subirse');
    expect(es.fillForm.wizard.stepNumberLabel(2)).toBe('Paso 2');
    expect(es.fillForm.wizard.collapsedStepsLabel(2, 7)).toBe('Paso 2 de 7');
    expect(es.fillForm.wizard.skipToButtonLabel('Revision', 5)).toBe('Ir a Revision (Paso 5)');
    expect(es.formTypes[FormType.SafetyChecklist]).toBe('Lista de seguridad');
    expect(es.uploadStatus[UploadStatus.Failed]).toBe('Fallido');
  });

  it('falls back to English translations for unknown language values at runtime', () => {
    const labels = getTranslations('unknown' as unknown as 'en');
    expect(labels.home.title).toBe(en.home.title);
  });
});
