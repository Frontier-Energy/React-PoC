import { defaultLanguage, formatPluralTemplate, formatTemplate, isLabels, isLanguageCode } from './index';
import { getFallbackLabels } from './fallback';

describe('translations', () => {
  it('recognizes valid language codes', () => {
    expect(defaultLanguage).toBe('en');
    expect(isLanguageCode('en')).toBe(true);
    expect(isLanguageCode('es')).toBe(true);
    expect(isLanguageCode('fr')).toBe(false);
    expect(isLanguageCode(42)).toBe(false);
  });

  it('formats tokenized translation strings', () => {
    expect(formatTemplate('Step {stepNumber} of {stepsCount}', { stepNumber: 2, stepsCount: 7 }))
      .toBe('Step 2 of 7');
    expect(formatTemplate(' (last checked {time})', { time: '10:00' }))
      .toBe(' (last checked 10:00)');
  });

  it('formats pluralized translation strings', () => {
    const template = {
      one: 'An inspection failed to upload. Use Retry to try again.',
      other: '{count} inspections failed to upload. Use Retry to try again.',
    };

    expect(formatPluralTemplate(template, 1)).toContain('An inspection failed');
    expect(formatPluralTemplate(template, 3)).toContain('3 inspections failed');
  });

  it('validates label payload shapes', () => {
    expect(isLabels(getFallbackLabels('en'))).toBe(true);
    expect(isLabels(null)).toBe(false);
    expect(isLabels({ languageName: 'English' })).toBe(false);
  });

  it('replaces repeated placeholders in templates', () => {
    expect(formatTemplate('{value} -> {value}', { value: 'done' })).toBe('done -> done');
  });

  it('falls back to english labels for unknown language codes', () => {
    expect(getFallbackLabels('fr' as never).languageName).toBe('English');
  });
});
