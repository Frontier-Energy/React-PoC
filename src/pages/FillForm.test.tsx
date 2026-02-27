import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocalizationProvider } from '../LocalizationContext';
import { FillForm } from './FillForm';
import { FormType, UploadStatus } from '../types';

const { navigateMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ sessionId: 'durability-session' }),
  };
});

vi.mock('../resources/hvac.json', () => ({
  default: {
    formName: 'Durability Test Form',
    uploadStatus: UploadStatus.Local,
    sections: [
      {
        title: 'General',
        fields: [
          {
            id: 'fieldNoExternal',
            label: 'Field Without External ID',
            type: 'text',
            required: false,
          },
        ],
      },
    ],
  },
}));

vi.mock('../components/FormRenderer', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    FormRenderer: ({
      data,
      onChange,
    }: {
      data: Record<string, string>;
      onChange: (fieldId: string, value: string, externalID?: string) => void;
    }) => (
      <div>
        <div data-testid="field-value">{data.fieldNoExternal || ''}</div>
        <button type="button" onClick={() => onChange('fieldNoExternal', 'saved value')}>
          Set Value
        </button>
      </div>
    ),
  };
});

vi.mock('@cloudscape-design/components', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    Header: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
    Container: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SpaceBetween: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Alert: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Box: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Link: ({
      children,
      onFollow,
    }: {
      children: React.ReactNode;
      onFollow: () => void;
    }) => (
      <button type="button" onClick={onFollow}>
        {children}
      </button>
    ),
    Input: ({
      value,
      onChange,
      id,
    }: {
      value: string;
      onChange: (event: { detail: { value: string } }) => void;
      id?: string;
    }) => (
      <input
        id={id}
        value={value}
        onChange={(event) => onChange({ detail: { value: event.target.value } })}
      />
    ),
    FormField: ({
      label,
      children,
    }: {
      label: string;
      children: React.ReactNode;
    }) => (
      <label>
        <span>{label}</span>
        {children}
      </label>
    ),
    Wizard: ({
      steps,
      activeStepIndex,
    }: {
      steps: Array<{ title: string; content: React.ReactNode }>;
      activeStepIndex: number;
    }) => <div>{steps[activeStepIndex]?.content}</div>,
    Checkbox: ({
      children,
      checked,
      onChange,
    }: {
      children: React.ReactNode;
      checked: boolean;
      onChange: (event: { detail: { checked: boolean } }) => void;
    }) => (
      <label>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange({ detail: { checked: event.target.checked } })}
        />
        {children}
      </label>
    ),
  };
});

describe('FillForm durability', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    localStorage.setItem(
      'currentSession',
      JSON.stringify({
        id: 'durability-session',
        name: 'Durability Session',
        formType: FormType.HVAC,
        uploadStatus: UploadStatus.Local,
      })
    );
  });

  it('persists field updates even when externalID is missing', async () => {
    render(
      <LocalizationProvider>
        <FillForm />
      </LocalizationProvider>
    );

    await screen.findByRole('button', { name: 'Set Value' });
    fireEvent.click(screen.getByRole('button', { name: 'Set Value' }));

    const savedRaw = localStorage.getItem('formData_durability-session');
    expect(savedRaw).not.toBeNull();
    expect(JSON.parse(savedRaw ?? '{}')).toMatchObject({
      fieldNoExternal: 'saved value',
    });
  });

  it('loads persisted values stored by fieldId when externalID is missing', async () => {
    localStorage.setItem(
      'formData_durability-session',
      JSON.stringify({
        fieldNoExternal: 'restored value',
      })
    );

    render(
      <LocalizationProvider>
        <FillForm />
      </LocalizationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('field-value')).toHaveTextContent('restored value');
    });
  });
});
