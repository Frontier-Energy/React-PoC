import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocalizationProvider } from '../LocalizationContext';
import { FillForm } from './FillForm';
import { FormType, UploadStatus, type FileReference } from '../types';
import { FormValidator } from '../utils/FormValidator';

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

const {
  fetchFormSchemaMock,
  fetchTranslationsMock,
  schemaFixture,
} = vi.hoisted(() => {
  const schema = {
    formName: 'Durability Test Form',
    uploadStatus: 'local',
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
            validationRules: [
              { type: 'minLength', value: 3, message: 'Min 3 chars' },
            ],
          },
          {
            id: 'conditionalInfo',
            label: 'Conditional Info',
            type: 'text',
            required: false,
            visibleWhen: [
              { fieldId: 'boolField', operator: 'equals', value: true },
            ],
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
  };

  return {
    fetchFormSchemaMock: vi.fn(async (formType: string) => {
      if (formType === 'missing-form') {
        throw new Error('missing schema');
      }
      return schema;
    }),
    fetchTranslationsMock: vi.fn(async () => ({
      languageName: 'English',
      common: {
        yes: 'Yes',
        no: 'No',
        cancel: 'Cancel',
        close: 'Close',
        delete: 'Delete',
        download: 'Download',
        preview: 'Preview',
        unknown: 'Unknown',
        unnamed: '(Unnamed)',
        loading: 'Loading...',
        notProvided: 'Not provided',
      },
      app: { title: 'Data Intake Tool', poweredBy: 'Powered By', brand: 'QControl' },
      nav: { newInspection: 'New Inspection', myInspections: 'My Inspections', logout: 'Log out' },
      drawers: {
        connectivity: { name: 'Connectivity status', trigger: 'Open connectivity status' },
        inspectionStats: { name: 'Inspection statistics', trigger: 'Open inspection statistics' },
        customization: { name: 'Customization options', trigger: 'Open customization options' },
      },
      connectivity: {
        status: { online: 'Online', offline: 'Offline', checking: 'Checking connection...' },
        lastCheckedAt: ' (last checked {time})',
      },
      inspectionStats: {
        header: 'Inspection Stats',
        statusHeader: 'Status',
        countHeader: 'Count',
        empty: 'No inspections',
      },
      customization: {
        header: 'Customization',
        userLevelHeader: 'User Level',
        adminLevelHeader: 'Admin Level',
        tenantLabel: 'Tenant',
        themeLabel: 'Theme',
        fontLabel: 'Font',
        languageLabel: 'Language',
        adminTenantAccessNotice: 'Tenant selection requires a logged-in account with the admin role.',
        registerLink: 'Register',
        loginLink: 'Log in',
        preferencesSaved: 'Preferences are saved locally on this device.',
        themeOptions: {
          mist: { label: 'Mist', description: 'Soft light gray' },
          harbor: { label: 'Harbor', description: 'Cool blue tint' },
          sand: { label: 'Sand', description: 'Warm neutral' },
          night: { label: 'Night', description: 'Deep charcoal' },
        },
        fontOptions: {
          sourceSansPro: { label: 'Source Sans Pro', description: 'Clean sans-serif' },
          georgia: { label: 'Georgia', description: 'Classic serif' },
          tahoma: { label: 'Tahoma', description: 'Compact sans-serif' },
        },
        languageOptions: { en: 'English', es: 'Spanish' },
      },
      uploadStatus: {
        local: 'Local',
        'in-progress': 'In Progress',
        uploading: 'Uploading',
        uploaded: 'Uploaded',
        failed: 'Failed',
      },
      formTypes: {
        electrical: 'Electrical',
        'electrical-sf': 'Electrical SF',
        hvac: 'HVAC',
        'safety-checklist': 'Safety Checklist',
      },
      home: { title: 'Inspection Forms' },
      login: {
        title: 'Sign In',
        tenantLabel: 'Tenant',
        emailLabel: 'Email',
        emailPlaceholder: 'you@example.com',
        emailRequired: 'Email is required.',
        login: 'Login',
        createAccount: 'Create an account',
        lookupError: 'Unable to look up user ID. Check the email and try again.',
        lookupNoUserId: 'Login lookup did not return a user ID.',
      },
      register: {
        title: 'Register',
        tenantLabel: 'Tenant',
        backToLogin: 'Back to Login',
        emailLabel: 'Email',
        firstNameLabel: 'First Name',
        lastNameLabel: 'Last Name',
        emailPlaceholder: 'you@example.com',
        firstNamePlaceholder: 'First name',
        lastNamePlaceholder: 'Last name',
        requiredError: 'Email, first name, and last name are required.',
        createAccount: 'Create Account',
        errors: {
          invalidInput: 'Registration failed due to invalid input. Please check your details and try again.',
          serverError: 'Registration failed due to a server error. Please try again later.',
          unableToRegister: 'Unable to register. Please try again.',
        },
      },
      newInspection: {
        title: 'New Inspection',
        selectPlaceholder: 'Select a form type',
        createSession: 'Create Session',
      },
      newForm: {
        title: 'New Form',
        selectPlaceholder: 'Select a form type',
        createSession: 'Create Session',
      },
      myInspections: {
        title: 'My Inspections',
        deleteModal: {
          header: 'Delete inspection?',
          confirmPrefix: 'This will permanently delete',
          confirmSuffix: '. This action cannot be undone.',
        },
        failedUploadMessage: {
          one: 'An inspection failed to upload. Use Retry to try again.',
          other: '{count} inspections failed to upload. Use Retry to try again.',
        },
        filters: {
          filterByFormType: 'Filter by form type',
          filterByStatus: 'Filter by status',
          clearFilters: 'Clear Filters',
          allFormTypes: 'All Form Types',
          allStatuses: 'All Statuses',
        },
        emptyState: {
          noInspections: 'No inspections found.',
          createNewInspectionLink: 'Create a new inspection',
          createNewInspectionSuffix: 'to get started.',
          noMatchingFilters: 'No inspections match the selected filters.',
        },
        table: {
          name: 'Name',
          formType: 'Form Type',
          status: 'Status',
          actions: 'Actions',
          empty: 'No inspections',
          buttons: { view: 'View', open: 'Open', retry: 'Retry', delete: 'Delete' },
        },
        createNewInspection: 'Create New Inspection',
      },
      fillForm: {
        loading: 'Loading...',
        errorLoadingSchema: 'Error loading form schema',
        sessionNameRequired: 'Session name is required.',
        confirmDetailsError: 'Confirm that the details are correct before submitting.',
        successMessage: 'Inspection saved successfully and stored locally.',
        formValidationErrorsHeader: 'Form Validation Errors',
        sessionNameLabel: 'Session Name',
        sessionNamePlaceholder: 'Enter a name for this inspection session',
        sessionIdLabel: 'Session ID',
        formTypeLabel: 'Form Type',
        resetForm: 'Reset form',
        reviewStepTitle: 'Review',
        review: {
          confirmationRequiredHeader: 'Confirmation required',
          sessionDetailsHeader: 'Session details',
          finalConfirmationLabel: 'Final confirmation',
          finalConfirmationText: 'I confirm the details above are accurate and ready to submit.',
        },
        wizard: {
          stepNumberLabel: 'Step {stepNumber}',
          collapsedStepsLabel: 'Step {stepNumber} of {stepsCount}',
          skipToButtonLabel: 'Skip to {title} (Step {stepNumber})',
          navigationAriaLabel: 'Form steps',
          cancelButton: 'Cancel',
          previousButton: 'Previous',
          nextButton: 'Next',
          submitButton: 'Submit',
        },
      },
      debugInspection: {
        title: 'Debug Inspection',
        backToMyInspections: 'Back to My Inspections',
        filesHeader: 'Files in Form',
        schemaLoadError: 'Failed to load form schema.',
        noFilesFound: 'No files or signatures found.',
        table: {
          fileName: 'File Name',
          size: 'Size',
          fileType: 'File Type',
          download: 'Download',
          preview: 'Preview',
        },
        previewTitle: 'Preview',
        close: 'Close',
        errors: {
          missingInspectionId: 'Missing inspection id.',
          parseInspection: 'Failed to parse inspection data.',
          parseFormData: 'Failed to parse form data.',
        },
      },
      formRenderer: {
        signature: { saving: 'Saving...', save: 'Save Signature', clear: 'Clear' },
        placeholders: { selectOne: 'Select an option', selectMultiple: 'Select options' },
        filePreview: {
          header: 'File Preview',
          download: 'Download',
          close: 'Close',
          previewNotAvailable: 'Preview not available for this file type.',
          unableToLoad: 'Unable to load preview.',
        },
      },
    })),
    schemaFixture: schema,
  };
});

vi.mock('../apiContent', () => ({
  fetchFormSchema: (...args: unknown[]) => fetchFormSchemaMock(...args),
  fetchTranslations: (...args: unknown[]) => fetchTranslationsMock(...args),
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
        <button type="button" onClick={() => onChange('boolField', false, 'ext.boolField')}>
          Set Boolean False
        </button>
        <button type="button" onClick={() => onChange('multiSelect', ['a', 'b'], 'ext.multiSelect')}>
          Set Multi
        </button>
        <button type="button" onClick={() => onChange('multiSelect', ['a', 'z'], 'ext.multiSelect')}>
          Set Multi Unknown
        </button>
        <button type="button" onClick={() => onChange('fieldNoExternal', ['x', 'y'])}>
          Set Array Value
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
      i18nStrings,
    }: {
      steps: Array<{ title: string; content: React.ReactNode }>;
      activeStepIndex: number;
      onNavigate: (event: { detail: { requestedStepIndex: number } }) => void;
      onCancel: () => void;
      onSubmit: () => void;
      i18nStrings: {
        stepNumberLabel: (stepNumber: number) => string;
        collapsedStepsLabel: (stepNumber: number, stepsCount: number) => string;
        skipToButtonLabel: (step: { title: string }, stepNumber: number) => string;
      };
    }) => (
      <div>
        <div data-testid="wizard-active-step">{activeStepIndex}</div>
        <div data-testid="wizard-step-number-label">{i18nStrings.stepNumberLabel(activeStepIndex + 1)}</div>
        <div data-testid="wizard-collapsed-label">
          {i18nStrings.collapsedStepsLabel(activeStepIndex + 1, steps.length)}
        </div>
        <div data-testid="wizard-skip-label">
          {i18nStrings.skipToButtonLabel(steps[activeStepIndex] ?? { title: 'Unknown' }, activeStepIndex + 1)}
        </div>
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

const getStorageScopePrefix = (tenantId = 'frontierDemo', userId = 'anonymous') => `${tenantId}:${userId}`;
const getCurrentSessionStorageKey = (tenantId = 'frontierDemo', userId = 'anonymous') =>
  `${getStorageScopePrefix(tenantId, userId)}:currentSession`;
const getInspectionStorageKey = (sessionId: string, tenantId = 'frontierDemo', userId = 'anonymous') =>
  `${getStorageScopePrefix(tenantId, userId)}:inspection_${sessionId}`;
const getFormDataStorageKey = (sessionId: string, tenantId = 'frontierDemo', userId = 'anonymous') =>
  `${getStorageScopePrefix(tenantId, userId)}:formData_${sessionId}`;

const setSessionStorage = (
  sessionId: string,
  overrides?: Record<string, unknown>,
  tenantId = 'frontierDemo',
  userId = 'anonymous'
) => {
  const session = {
    id: sessionId,
    name: 'Durability Session',
    formType: FormType.HVAC,
    uploadStatus: UploadStatus.InProgress,
    tenantId,
    userId: userId === 'anonymous' ? undefined : userId,
    ...overrides,
  };
  localStorage.setItem(getCurrentSessionStorageKey(tenantId, userId), JSON.stringify(session));
  return session;
};

describe('FillForm', () => {
  beforeEach(() => {
    setSessionId('durability-session');
    navigateMock.mockReset();
    saveFilesMock.mockReset();
    deleteFilesMock.mockReset();
    fetchFormSchemaMock.mockClear();
    fetchFormSchemaMock.mockImplementation(async (formType: string) => {
      if (formType === 'missing-form') {
        throw new Error('missing schema');
      }
      return schemaFixture;
    });
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
    localStorage.removeItem(getCurrentSessionStorageKey());

    renderPage();

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/new-inspection');
    });
  });

  it('shows schema load error when form type module cannot be loaded', async () => {
    setSessionStorage('durability-session', { formType: 'missing-form' });

    renderPage();

    expect(await screen.findByText('Error loading form schema')).toBeInTheDocument();
  });

  it('keeps showing loading while the schema request is still in flight', async () => {
    let resolveSchema: ((value: typeof schemaFixture) => void) | undefined;
    fetchFormSchemaMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSchema = resolve as (value: typeof schemaFixture) => void;
        })
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
    expect(screen.queryByText('Error loading form schema')).not.toBeInTheDocument();

    resolveSchema?.(schemaFixture);

    expect(await screen.findByDisplayValue('Durability Session')).toBeInTheDocument();
  });

  it('loads fallback inspection when currentSession does not match route id', async () => {
    localStorage.setItem(
      getCurrentSessionStorageKey(),
      JSON.stringify({ id: 'other-session', name: 'Other', formType: FormType.HVAC })
    );
    localStorage.setItem(
      getInspectionStorageKey('durability-session'),
      JSON.stringify({ id: 'durability-session', name: 'From Repo', formType: FormType.HVAC })
    );

    renderPage();

    expect(await screen.findByDisplayValue('From Repo')).toBeInTheDocument();
  });

  it('ignores a stale schema response after the route switches to a different session', async () => {
    const sessionARouteId = 'durability-session';
    const sessionBRouteId = 'follow-up-session';
    const schemaA = { ...schemaFixture, formName: 'Schema A' };
    const schemaB = { ...schemaFixture, formName: 'Schema B' };
    let resolveSchemaA: ((value: typeof schemaA) => void) | undefined;

    localStorage.setItem(
      getFormDataStorageKey(sessionARouteId),
      JSON.stringify({ fieldNoExternal: 'session-a value' })
    );

    fetchFormSchemaMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSchemaA = resolve as (value: typeof schemaA) => void;
          })
      )
      .mockResolvedValueOnce(schemaB);

    const view = renderPage();

    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    setSessionStorage(sessionBRouteId, { name: 'Session B' });
    localStorage.setItem(
      getInspectionStorageKey(sessionBRouteId),
      JSON.stringify({
        id: sessionBRouteId,
        name: 'Session B',
        formType: FormType.HVAC,
        uploadStatus: UploadStatus.InProgress,
        tenantId: 'frontierDemo',
      })
    );
    localStorage.setItem(
      getFormDataStorageKey(sessionBRouteId),
      JSON.stringify({ fieldNoExternal: 'session-b value' })
    );
    setSessionId(sessionBRouteId);
    view.rerender(
      <LocalizationProvider>
        <FillForm />
      </LocalizationProvider>
    );

    expect(await screen.findByText('Schema B')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Session B')).toBeInTheDocument();
      expect(screen.getByTestId('form-data-json')).toHaveTextContent('session-b value');
    });

    resolveSchemaA?.(schemaA);

    await waitFor(() => {
      expect(screen.getByText('Schema B')).toBeInTheDocument();
      expect(screen.queryByText('Schema A')).not.toBeInTheDocument();
      expect(screen.getByDisplayValue('Session B')).toBeInTheDocument();
      expect(screen.getByTestId('form-data-json')).toHaveTextContent('session-b value');
      expect(screen.getByTestId('form-data-json')).not.toHaveTextContent('session-a value');
    });
  });

  it('persists field updates even when externalID is missing', async () => {
    renderPage();

    await screen.findByRole('button', { name: 'Set Value' });
    fireEvent.click(screen.getByRole('button', { name: 'Set Value' }));

    const savedRaw = localStorage.getItem(getFormDataStorageKey('durability-session'));
    expect(savedRaw).not.toBeNull();
    expect(JSON.parse(savedRaw ?? '{}')).toMatchObject({ fieldNoExternal: 'saved value' });
  });

  it('loads persisted values stored by fieldId when externalID is missing', async () => {
    localStorage.setItem(getFormDataStorageKey('durability-session'), JSON.stringify({ fieldNoExternal: 'restored value' }));

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('form-data-json')).toHaveTextContent('restored value');
    });
  });

  it('keeps form data isolated from other tenants for the same session id', async () => {
    localStorage.setItem(
      getFormDataStorageKey('durability-session', 'qhvac'),
      JSON.stringify({ fieldNoExternal: 'other tenant value' })
    );
    localStorage.setItem(
      getFormDataStorageKey('durability-session'),
      JSON.stringify({ fieldNoExternal: 'active tenant value' })
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('form-data-json')).toHaveTextContent('active tenant value');
      expect(screen.getByTestId('form-data-json')).not.toHaveTextContent('other tenant value');
    });
  });

  it('handles malformed stored form data without crashing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    localStorage.setItem(getFormDataStorageKey('durability-session'), '{bad-json');

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
      const stored = JSON.parse(localStorage.getItem(getFormDataStorageKey('durability-session')) ?? '{}');
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

  it('adds a session-name validation error and routes error-click handling to the first step', async () => {
    renderPage();

    await screen.findByPlaceholderText('Enter a name for this inspection session');
    fireEvent.change(screen.getByPlaceholderText('Enter a name for this inspection session'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Wizard' }));

    const sessionNameErrorLink = await screen.findByRole('button', {
      name: /sessionName: Session name is required/i,
    });
    expect(screen.getByTestId('wizard-active-step')).toHaveTextContent('0');
    fireEvent.click(sessionNameErrorLink);
    expect(screen.getByTestId('wizard-active-step')).toHaveTextContent('0');
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

    const current = JSON.parse(localStorage.getItem(getCurrentSessionStorageKey()) ?? '{}');
    const saved = JSON.parse(localStorage.getItem(getInspectionStorageKey('durability-session')) ?? '{}');
    expect(current.name).toBe('Updated Session Name');
    expect(current.uploadStatus).toBe(UploadStatus.Local);
    expect(saved.uploadStatus).toBe(UploadStatus.Local);
  });

  it('formats review values for free-form arrays and wires wizard i18n labels', async () => {
    renderPage();

    await screen.findByRole('button', { name: 'Set Required' });
    fireEvent.click(screen.getByRole('button', { name: 'Set Required' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set Array Value' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go Review' }));

    expect(await screen.findByText(/Field Without External ID:/)).toBeInTheDocument();
    expect(screen.getByText(/x, y/)).toBeInTheDocument();
    expect(screen.getByTestId('wizard-step-number-label')).toHaveTextContent('Step 3');
    expect(screen.getByTestId('wizard-collapsed-label')).toHaveTextContent('Step 3 of 3');
    expect(screen.getByTestId('wizard-skip-label')).toHaveTextContent('Skip to Review (Step 3)');
  });

  it('formats unknown option values and false boolean values in review', async () => {
    renderPage();

    await screen.findByRole('button', { name: 'Set Required' });
    fireEvent.click(screen.getByRole('button', { name: 'Set Required' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set Multi Unknown' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set Boolean False' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go Review' }));

    expect(await screen.findByText(/A Label, z/)).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.textContent === 'Boolean Field: No')
    ).toBeInTheDocument();
  });

  it('handles validation errors for fields not present in schema by falling back to step 0', async () => {
    const validateSpy = vi
      .spyOn(FormValidator, 'validateForm')
      .mockReturnValue([{ fieldId: 'unknownField', message: 'Unknown error' }]);

    renderPage();

    await screen.findByRole('button', { name: 'Submit Wizard' });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Wizard' }));
    fireEvent.click(await screen.findByRole('button', { name: /unknownField: Unknown error/i }));

    expect(screen.getByTestId('wizard-active-step')).toHaveTextContent('0');
    validateSpy.mockRestore();
  });

  it('executes both checkbox toggle paths in review confirmation', async () => {
    renderPage();

    await screen.findByRole('button', { name: 'Set Required' });
    fireEvent.click(screen.getByRole('button', { name: 'Set Required' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go Review' }));

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
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
      const stored = JSON.parse(localStorage.getItem(getFormDataStorageKey('durability-session')) ?? '{}');
      expect(stored['ext.fileSingle']?.id).toBe('single-id');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Upload Multiple' }));
    await waitFor(() => expect(saveFilesMock).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Reset form' }));

    await waitFor(() => {
      expect(deleteFilesMock).toHaveBeenCalledWith(['single-id', 'multi-a', 'multi-b']);
      expect(localStorage.getItem(getFormDataStorageKey('durability-session'))).toBeNull();
    });
  });

  it('navigates back to new inspection when canceling the wizard', async () => {
    renderPage();

    await screen.findByRole('button', { name: 'Cancel Wizard' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Wizard' }));

    expect(navigateMock).toHaveBeenCalledWith('/new-inspection');
  });

  it('resets form state without deleting files when no file references exist', async () => {
    renderPage();

    await screen.findByRole('button', { name: 'Set Value' });
    fireEvent.click(screen.getByRole('button', { name: 'Set Value' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset form' }));

    await waitFor(() => {
      expect(deleteFilesMock).not.toHaveBeenCalled();
      expect(localStorage.getItem(getFormDataStorageKey('durability-session'))).toBeNull();
    });
  });
});
