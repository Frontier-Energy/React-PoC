import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocalizationProvider } from '../LocalizationContext';
import { FillForm } from './FillForm';
import { FormType, UploadStatus, type FileReference } from '../types';

const {
  navigateMock,
  saveFilesMock,
  deleteFilesMock,
  getSessionId,
  setSessionId,
} = vi.hoisted(() => {
  let currentSessionId: string | undefined = 'durability-session';
  return {
    navigateMock: vi.fn(),
    saveFilesMock: vi.fn(),
    deleteFilesMock: vi.fn(),
    getSessionId: () => currentSessionId,
    setSessionId: (value: string | undefined) => {
      currentSessionId = value;
    },
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ sessionId: getSessionId() }),
  };
});

vi.mock('../utils/fileStorage', () => ({
  saveFiles: (...args: unknown[]) => saveFilesMock(...args),
  deleteFiles: (...args: unknown[]) => deleteFilesMock(...args),
}));

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
          {
            id: 'selectField',
            label: 'Select Field',
            type: 'select',
            required: false,
            externalID: 'ext.selectField',
            options: [
              { label: 'Good', value: 'good' },
              { label: 'Bad', value: 'bad' },
            ],
          },
          {
            id: 'boolField',
            label: 'Boolean Field',
            type: 'checkbox',
            required: false,
            externalID: 'ext.boolField',
          },
          {
            id: 'fileSingle',
            label: 'Single File',
            type: 'file',
            required: false,
            externalID: 'ext.fileSingle',
            multiple: false,
          },
          {
            id: 'fileMultiple',
            label: 'Multiple Files',
            type: 'file',
            required: false,
            externalID: 'ext.fileMultiple',
            multiple: true,
          },
        ],
      },
      {
        title: 'Details',
        fields: [
          {
            id: 'requiredField',
            label: 'Required Field',
            type: 'text',
            required: true,
            externalID: 'ext.requiredField',
          },
          {
            id: 'multiSelect',
            label: 'Multi Select',
            type: 'multiselect',
            required: false,
            externalID: 'ext.multiSelect',
            options: [
              { label: 'A Label', value: 'a' },
              { label: 'B Label', value: 'b' },
            ],
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
      onFileChange,
    }: {
      data: Record<string, unknown>;
      onChange: (fieldId: string, value: unknown, externalID?: string) => void;
      onFileChange: (fieldId: string, files: File[], externalID?: string) => Promise<void>;
    }) => (
      <div>
        <div data-testid="form-data-json">{JSON.stringify(data)}</div>
        <button type="button" onClick={() => onChange('fieldNoExternal', 'saved value')}>
          Set Value
        </button>
        <button type="button" onClick={() => onChange('requiredField', 'filled', 'ext.requiredField')}>
          Set Required
        </button>
        <button type="button" onClick={() => onChange('selectField', 'good', 'ext.selectField')}>
          Set Select
        </button>
        <button type="button" onClick={() => onChange('boolField', true, 'ext.boolField')}>
          Set Boolean
        </button>
        <button type="button" onClick={() => onChange('multiSelect', ['a', 'b'], 'ext.multiSelect')}>
          Set Multi
        </button>
        <button
          type="button"
          onClick={() => void onFileChange('fileSingle', [new File(['s'], 'single.txt')], 'ext.fileSingle')}
        >
          Upload Single
        </button>
        <button
          type="button"
          onClick={() => void onFileChange('fileMultiple', [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')], 'ext.fileMultiple')}
        >
          Upload Multiple
        </button>
        <button type="button" onClick={() => void onFileChange('fileSingle', [], 'ext.fileSingle')}>
          Clear Single
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
    Link: ({ children, onFollow }: { children: React.ReactNode; onFollow: () => void }) => (
      <button type="button" onClick={onFollow}>
        {children}
      </button>
    ),
    Input: ({
      value,
      onChange,
      id,
      placeholder,
    }: {
      value: string;
      onChange: (event: { detail: { value: string } }) => void;
      id?: string;
      placeholder?: string;
    }) => (
      <input
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange({ detail: { value: event.target.value } })}
      />
    ),
    FormField: ({ label, children }: { label: string; children: React.ReactNode }) => (
      <label>
        <span>{label}</span>
        {children}
      </label>
    ),
    Wizard: ({
      steps,
      activeStepIndex,
      onNavigate,
      onCancel,
      onSubmit,
    }: {
      steps: Array<{ title: string; content: React.ReactNode }>;
      activeStepIndex: number;
      onNavigate: (event: { detail: { requestedStepIndex: number } }) => void;
      onCancel: () => void;
      onSubmit: () => void;
    }) => (
      <div>
        <div data-testid="wizard-active-step">{activeStepIndex}</div>
        <div>{steps[activeStepIndex]?.content}</div>
        <button
          type="button"
          onClick={() =>
            onNavigate({
              detail: { requestedStepIndex: Math.min(activeStepIndex + 1, steps.length - 1) },
            })
          }
        >
          Next Step
        </button>
        <button
          type="button"
          onClick={() => onNavigate({ detail: { requestedStepIndex: steps.length - 1 } })}
        >
          Go Review
        </button>
        <button type="button" onClick={onCancel}>
          Cancel Wizard
        </button>
        <button type="button" onClick={onSubmit}>
          Submit Wizard
        </button>
      </div>
    ),
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

const renderPage = () =>
  render(
    <LocalizationProvider>
      <FillForm />
    </LocalizationProvider>
  );

const setSessionStorage = (sessionId: string, overrides?: Record<string, unknown>) => {
  const session = {
    id: sessionId,
    name: 'Durability Session',
    formType: FormType.HVAC,
    uploadStatus: UploadStatus.InProgress,
    ...overrides,
  };
  localStorage.setItem('currentSession', JSON.stringify(session));
  return session;
};

describe('FillForm', () => {
  beforeEach(() => {
    setSessionId('durability-session');
    navigateMock.mockReset();
    saveFilesMock.mockReset();
    deleteFilesMock.mockReset();
    saveFilesMock.mockResolvedValue([{ id: 'file-1', name: 'single.txt', type: 'text/plain', size: 1, lastModified: 1 }]);
    deleteFilesMock.mockResolvedValue(undefined);
    setSessionStorage('durability-session');
  });

  it('navigates to new inspection when sessionId is missing', async () => {
    setSessionId(undefined);

    renderPage();

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/new-inspection');
    });
  });

  it('navigates when no matching session is found', async () => {
    localStorage.removeItem('currentSession');

    renderPage();

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/new-inspection');
    });
  });

  it('loads fallback inspection when currentSession does not match route id', async () => {
    localStorage.setItem(
      'currentSession',
      JSON.stringify({ id: 'other-session', name: 'Other', formType: FormType.HVAC })
    );
    localStorage.setItem(
      'inspection_durability-session',
      JSON.stringify({ id: 'durability-session', name: 'From Repo', formType: FormType.HVAC })
    );

    renderPage();

    expect(await screen.findByDisplayValue('From Repo')).toBeInTheDocument();
  });

  it('persists field updates even when externalID is missing', async () => {
    renderPage();

    await screen.findByRole('button', { name: 'Set Value' });
    fireEvent.click(screen.getByRole('button', { name: 'Set Value' }));

    const savedRaw = localStorage.getItem('formData_durability-session');
    expect(savedRaw).not.toBeNull();
    expect(JSON.parse(savedRaw ?? '{}')).toMatchObject({ fieldNoExternal: 'saved value' });
  });

  it('loads persisted values stored by fieldId when externalID is missing', async () => {
    localStorage.setItem('formData_durability-session', JSON.stringify({ fieldNoExternal: 'restored value' }));

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('form-data-json')).toHaveTextContent('restored value');
    });
  });

  it('handles malformed stored form data without crashing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    localStorage.setItem('formData_durability-session', '{bad-json');

    renderPage();

    await screen.findByText('Durability Test Form');
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to parse form data for session durability-session:',
      expect.any(SyntaxError)
    );
  });

  it('replaces existing file references when uploading again and supports clearing files', async () => {
    saveFilesMock
      .mockResolvedValueOnce([
        { id: 'file-1', name: 'single.txt', type: 'text/plain', size: 1, lastModified: 1 } as FileReference,
      ])
      .mockResolvedValueOnce([
        { id: 'file-2', name: 'single-v2.txt', type: 'text/plain', size: 1, lastModified: 1 } as FileReference,
      ]);

    renderPage();

    await screen.findByRole('button', { name: 'Upload Single' });
    fireEvent.click(screen.getByRole('button', { name: 'Upload Single' }));
    await waitFor(() => expect(saveFilesMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Upload Single' }));
    await waitFor(() => expect(saveFilesMock).toHaveBeenCalledTimes(2));
    expect(deleteFilesMock).toHaveBeenCalledWith(['file-1']);

    fireEvent.click(screen.getByRole('button', { name: 'Clear Single' }));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('formData_durability-session') ?? '{}');
      expect(stored.ext?.fileSingle).toBeUndefined();
      expect(deleteFilesMock).toHaveBeenCalledWith(['file-2']);
    });
  });

  it('shows validation errors on submit and jumps to the step containing the first error', async () => {
    const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

    renderPage();

    await screen.findByRole('button', { name: 'Submit Wizard' });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Wizard' }));

    expect(await screen.findByRole('button', { name: /requiredField: This field is required/i })).toBeInTheDocument();
    expect(screen.getByTestId('wizard-active-step')).toHaveTextContent('1');
    expect(scrollSpy).toHaveBeenCalled();
  });

  it('scrolls to the errored field when clicking an error link', async () => {
    const scrollIntoView = vi.fn();
    const focus = vi.fn();
    const getByIdSpy = vi.spyOn(document, 'getElementById').mockReturnValue({
      scrollIntoView,
      focus,
    } as unknown as HTMLElement);

    renderPage();
    await screen.findByRole('button', { name: 'Submit Wizard' });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Wizard' }));
    fireEvent.click(await screen.findByRole('button', { name: /requiredField: This field is required/i }));

    await waitFor(() => {
      expect(getByIdSpy).toHaveBeenCalledWith('field-requiredField');
      expect(scrollIntoView).toHaveBeenCalled();
      expect(focus).toHaveBeenCalled();
    });
  });

  it('requires review confirmation before submit succeeds', async () => {
    renderPage();

    await screen.findByRole('button', { name: 'Set Required' });
    fireEvent.click(screen.getByRole('button', { name: 'Set Required' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Wizard' }));

    expect(await screen.findByText('Confirm that the details are correct before submitting.')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalledWith('/my-inspections', expect.anything());
  });

  it('submits successfully after confirmation and persists updated session state', async () => {
    renderPage();

    await screen.findByRole('button', { name: 'Set Required' });
    fireEvent.click(screen.getByRole('button', { name: 'Set Required' }));
    fireEvent.change(screen.getByPlaceholderText('Enter a name for this inspection session'), {
      target: { value: 'Updated Session Name' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set Boolean' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set Multi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go Review' }));

    expect(await screen.findByText(/Select Field:/)).toBeInTheDocument();
    expect(screen.getByText(/Good/)).toBeInTheDocument();
    expect(screen.getByText(/Yes/)).toBeInTheDocument();
    expect(screen.getByText(/A Label, B Label/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Wizard' }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/my-inspections', {
        state: { successMessage: 'Inspection saved successfully and stored locally.' },
      });
    });

    const current = JSON.parse(localStorage.getItem('currentSession') ?? '{}');
    const saved = JSON.parse(localStorage.getItem('inspection_durability-session') ?? '{}');
    expect(current.name).toBe('Updated Session Name');
    expect(current.uploadStatus).toBe(UploadStatus.Local);
    expect(saved.uploadStatus).toBe(UploadStatus.Local);
  });

  it('resets form and deletes saved files', async () => {
    saveFilesMock
      .mockResolvedValueOnce([
        { id: 'single-id', name: 'single.txt', type: 'text/plain', size: 1, lastModified: 1 } as FileReference,
      ])
      .mockResolvedValueOnce([
        { id: 'multi-a', name: 'a.txt', type: 'text/plain', size: 1, lastModified: 1 } as FileReference,
        { id: 'multi-b', name: 'b.txt', type: 'text/plain', size: 1, lastModified: 1 } as FileReference,
      ]);

    renderPage();

    await screen.findByRole('button', { name: 'Upload Single' });
    fireEvent.click(screen.getByRole('button', { name: 'Upload Single' }));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('formData_durability-session') ?? '{}');
      expect(stored['ext.fileSingle']?.id).toBe('single-id');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Upload Multiple' }));
    await waitFor(() => expect(saveFilesMock).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Reset form' }));

    await waitFor(() => {
      expect(deleteFilesMock).toHaveBeenCalledWith(['single-id', 'multi-a', 'multi-b']);
      expect(localStorage.getItem('formData_durability-session')).toBeNull();
    });
  });

  it('navigates back to new inspection when canceling the wizard', async () => {
    renderPage();

    await screen.findByRole('button', { name: 'Cancel Wizard' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Wizard' }));

    expect(navigateMock).toHaveBeenCalledWith('/new-inspection');
  });
});
