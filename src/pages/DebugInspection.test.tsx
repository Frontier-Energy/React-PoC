import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LocalizationProvider } from '../LocalizationContext';
import { DebugInspection } from './DebugInspection';
import type { InspectionSession } from '../types';

const { navigateMock, getSessionId, setSessionId, getLocationState, setLocationState } = vi.hoisted(() => {
  let currentSessionId: string | undefined = 'scoped-session';
  let currentLocationState: unknown = {
    inspectionScope: {
      tenantId: 'tenant-a',
      userId: 'impersonated-user',
    },
  };
  return {
    navigateMock: vi.fn(),
    getSessionId: () => currentSessionId,
    setSessionId: (value: string | undefined) => {
      currentSessionId = value;
    },
    getLocationState: () => currentLocationState,
    setLocationState: (value: unknown) => {
      currentLocationState = value;
    },
  };
});

const {
  loadByIdMock,
  loadFormDataMock,
  scopedInspection,
} = vi.hoisted(() => {
  const inspection: InspectionSession = {
    id: 'scoped-session',
    name: 'Scoped Session',
    formType: 'hvac',
    uploadStatus: 'in-progress',
    tenantId: 'tenant-a',
    userId: 'impersonated-user',
  };

  return {
    loadByIdMock: vi.fn(() => inspection),
    loadFormDataMock: vi.fn(() => ({ 'ext.fileSingle': { id: 'file-1', name: 'proof.jpg', type: 'image/jpeg', size: 128 } })),
    scopedInspection: inspection,
  };
});

const {
  fetchFormSchemaMock,
  getFileMock,
  getFileReferencesMock,
  createObjectUrlMock,
  revokeObjectUrlMock,
  anchorClickMock,
} = vi.hoisted(() => ({
  fetchFormSchemaMock: vi.fn(async () => ({
    formName: 'Schema',
    sections: [
      {
        title: 'Evidence',
        fields: [
          { id: 'fileSingle', label: 'Single File', type: 'file', externalID: 'ext.fileSingle' },
          { id: 'signature', label: 'Signature', type: 'signature' },
        ],
      },
    ],
  })),
  getFileMock: vi.fn(async () => null),
  getFileReferencesMock: vi.fn(() => []),
  createObjectUrlMock: vi.fn(() => 'blob:preview-url'),
  revokeObjectUrlMock: vi.fn(),
  anchorClickMock: vi.fn(),
}));

const { syncMonitorSnapshot, syncMonitorRefreshMock, syncQueueLoadMock, syncQueueRetryMock, syncQueueDeadLetterMock } = vi.hoisted(() => ({
  syncMonitorSnapshot: {
    scopeKey: 'tenant-a:impersonated-user',
    state: 'idle',
    lastUpdatedAt: 123,
    lastCycleStartedAt: 120,
    lastCycleCompletedAt: 123,
    lastSuccessfulSyncAt: 122,
    lastFailedSyncAt: null,
    pauseReason: null,
    lastError: null,
    queue: {
      generatedAt: 123,
      workerLease: null,
      entries: [],
      metrics: {
        totalCount: 1,
        readyCount: 1,
        pendingCount: 1,
        syncingCount: 0,
        failedCount: 0,
        deadLetterCount: 0,
        oldestEntryAgeMs: 500,
        nextAttemptAt: 123,
      },
    },
    recentEvents: [],
  },
  syncMonitorRefreshMock: vi.fn(async () => {}),
  syncQueueLoadMock: vi.fn(async () => null),
  syncQueueRetryMock: vi.fn(async () => {}),
  syncQueueDeadLetterMock: vi.fn(async () => {}),
}));

const { debugLabels } = vi.hoisted(() => ({
  debugLabels: {
    common: {
      unknown: 'Unknown',
      download: 'Download',
      preview: 'Preview',
      notProvided: 'Not provided',
    },
    debugInspection: {
      title: 'Debug Inspection',
      backToMyInspections: 'Back to My Inspections',
      filesHeader: 'Files in Form',
      syncHeader: 'Sync Diagnostics',
      syncMetricsHeader: 'Queue Metrics',
      syncEventsHeader: 'Recent Events',
      syncInspectionHeader: 'Inspection Queue Entry',
      syncRefresh: 'Refresh sync diagnostics',
      syncEmptyEvents: 'No sync events recorded yet.',
      syncNotQueued: 'This inspection is not currently queued.',
      syncStateLabel: 'Subsystem state',
      syncWorkerLeaseLabel: 'Worker lease',
      syncScopeLabel: 'Scope',
      syncLastSuccessLabel: 'Last successful sync',
      syncLastFailureLabel: 'Last failed sync',
      syncLastErrorLabel: 'Last error',
      syncStatusLabels: {
        idle: 'Idle',
        running: 'Running',
        paused: 'Paused',
        blocked: 'Blocked',
      },
      syncMetrics: {
        total: 'Total entries',
        ready: 'Ready now',
        pending: 'Pending',
        syncing: 'Syncing',
        failed: 'Retry pending',
        conflict: 'Conflicts',
        deadLetter: 'Dead-letter',
        oldestAge: 'Oldest age',
        nextAttempt: 'Next attempt',
      },
      syncInspection: {
        status: 'Queue status',
        attempts: 'Attempt count',
        nextAttempt: 'Next attempt',
        lastAttempt: 'Last attempt',
        lastError: 'Last error',
        deadLetterReason: 'Dead-letter reason',
        idempotencyKey: 'Idempotency key',
        retryNow: 'Retry now',
        moveToDeadLetter: 'Send to dead-letter',
        requeueDeadLetter: 'Requeue dead-letter',
      },
      schemaLoadError: 'Failed to load form schema.',
      versionHeader: 'Version Stamp',
      versionClientRevision: 'Client revision',
      versionBaseServerRevision: 'Base server revision',
      versionServerRevision: 'Last known server revision',
      versionUpdatedAt: 'Version updated at',
      versionMergePolicy: 'Merge policy',
      conflictHeader: 'Conflict Details',
      conflictDetectedAt: 'Conflict detected at',
      conflictReason: 'Conflict reason',
      conflictServerRevision: 'Server revision',
      conflictServerUpdatedAt: 'Server updated at',
      conflictFields: 'Conflicting fields',
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
      },
    },
  },
}));

vi.mock('../LocalizationContext', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    LocalizationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useLocalization: () => ({ labels: debugLabels }),
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ sessionId: getSessionId() }),
    useLocation: () => ({
      state: getLocationState(),
    }),
  };
});

vi.mock('../repositories/inspectionRepository', () => ({
  inspectionRepository: {
    loadById: (...args: unknown[]) => loadByIdMock(...args),
    loadFormData: (...args: unknown[]) => loadFormDataMock(...args),
  },
}));

vi.mock('../apiContent', () => ({
  fetchFormSchema: (...args: unknown[]) => fetchFormSchemaMock(...args),
  fetchTranslations: vi.fn(async () => ({
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
}));

vi.mock('../utils/fileStorage', () => ({
  getFile: (...args: unknown[]) => getFileMock(...args),
}));

vi.mock('../utils/formDataUtils', () => ({
  getFileReferences: (...args: unknown[]) => getFileReferencesMock(...args),
}));

vi.mock('../syncMonitor', () => ({
  useSyncMonitor: () => syncMonitorSnapshot,
  syncMonitor: {
    refresh: (...args: unknown[]) => syncMonitorRefreshMock(...args),
  },
}));

vi.mock('../syncQueue', () => ({
  syncQueue: {
    load: (...args: unknown[]) => syncQueueLoadMock(...args),
    retry: (...args: unknown[]) => syncQueueRetryMock(...args),
    moveToDeadLetter: (...args: unknown[]) => syncQueueDeadLetterMock(...args),
    subscribe: () => () => {},
  },
}));

vi.mock('@cloudscape-design/components', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    Box: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
    Container: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Header: ({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) => (
      <div>
        {actions}
        <h1>{children}</h1>
      </div>
    ),
    Modal: ({
      children,
      footer,
      onDismiss,
    }: {
      children: React.ReactNode;
      footer?: React.ReactNode;
      onDismiss?: () => void;
    }) => (
      <div>
        <button type="button" onClick={onDismiss}>
          Dismiss Modal
        </button>
        {children}
        {footer}
      </div>
    ),
    SpaceBetween: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

const renderPage = () =>
  render(
    <LocalizationProvider>
      <DebugInspection />
    </LocalizationProvider>
  );

describe('DebugInspection', () => {
  beforeEach(() => {
    const originalCreateElement = document.createElement.bind(document);
    setSessionId('scoped-session');
    setLocationState({
      inspectionScope: {
        tenantId: scopedInspection.tenantId,
        userId: scopedInspection.userId,
      },
    });
    navigateMock.mockReset();
    loadByIdMock.mockReset();
    loadByIdMock.mockImplementation(() => scopedInspection);
    loadFormDataMock.mockReset();
    loadFormDataMock.mockImplementation(() => ({
      'ext.fileSingle': { id: 'file-1', name: 'proof.jpg', type: 'image/jpeg', size: 128 },
    }));
    fetchFormSchemaMock.mockReset();
    fetchFormSchemaMock.mockImplementation(async () => ({
      formName: 'Schema',
      sections: [
        {
          title: 'Evidence',
          fields: [
            { id: 'fileSingle', label: 'Single File', type: 'file', externalID: 'ext.fileSingle' },
            { id: 'signature', label: 'Signature', type: 'signature' },
          ],
        },
      ],
    }));
    getFileMock.mockReset();
    getFileMock.mockResolvedValue(null);
    getFileReferencesMock.mockReset();
    getFileReferencesMock.mockImplementation((value?: unknown) => {
      if (!value || typeof value !== 'object') {
        return [];
      }

      return [value];
    });
    createObjectUrlMock.mockClear();
    revokeObjectUrlMock.mockClear();
    anchorClickMock.mockClear();
    syncMonitorRefreshMock.mockClear();
    syncQueueLoadMock.mockReset();
    syncQueueLoadMock.mockResolvedValue(null);
    syncQueueRetryMock.mockReset();
    syncQueueRetryMock.mockResolvedValue(undefined);
    syncQueueDeadLetterMock.mockReset();
    syncQueueDeadLetterMock.mockResolvedValue(undefined);
    syncMonitorSnapshot.queue.metrics.oldestEntryAgeMs = 500;
    syncMonitorSnapshot.queue.workerLease = null;
    syncMonitorSnapshot.recentEvents = [];
    vi.stubGlobal(
      'URL',
      Object.assign(globalThis.URL, {
        createObjectURL: createObjectUrlMock,
        revokeObjectURL: revokeObjectUrlMock,
      })
    );
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return {
          click: anchorClickMock,
          href: '',
          download: '',
        } as unknown as HTMLAnchorElement;
      }

      return originalCreateElement(tagName);
    });
  });

  it('loads form data using the resolved inspection scope', async () => {
    renderPage();

    await waitFor(() => {
      expect(syncQueueLoadMock).toHaveBeenCalledWith('scoped-session', {
        tenantId: 'tenant-a',
        userId: 'impersonated-user',
      });
      expect(loadByIdMock).toHaveBeenCalledWith('scoped-session', {
        tenantId: 'tenant-a',
        userId: 'impersonated-user',
      });
      expect(loadFormDataMock).toHaveBeenCalledWith('scoped-session', scopedInspection);
    });
  });

  it('falls back to an undefined inspection scope when route state is missing or invalid', async () => {
    setLocationState('invalid');

    renderPage();

    await waitFor(() => {
      expect(loadByIdMock).toHaveBeenCalledWith('scoped-session', undefined);
    });
  });

  it('shows a missing inspection id error when the route param is absent', async () => {
    setSessionId(undefined);

    renderPage();

    expect(await screen.findByText(/Missing inspection id\./)).toBeInTheDocument();
    expect(loadByIdMock).not.toHaveBeenCalled();
  });

  it('renders the no-files state when the inspection exists but has no files', async () => {
    getFileReferencesMock.mockReturnValue([]);

    renderPage();

    expect(await screen.findByText('No files or signatures found.')).toBeInTheDocument();
  });

  it('renders the empty state when the inspection cannot be found', async () => {
    loadByIdMock.mockResolvedValueOnce(null);

    renderPage();

    expect(await screen.findByText('No files or signatures found.')).toBeInTheDocument();
    expect(fetchFormSchemaMock).not.toHaveBeenCalled();
    expect(loadFormDataMock).not.toHaveBeenCalled();
  });

  it('shows the schema load error when the schema request fails', async () => {
    fetchFormSchemaMock.mockRejectedValue(new Error('schema failed'));

    renderPage();

    expect(await screen.findByText('Failed to load form schema.')).toBeInTheDocument();
  });

  it('renders file metadata and downloads stored files', async () => {
    getFileMock.mockResolvedValueOnce({
      blob: new Blob(['abc'], { type: 'image/jpeg' }),
      name: 'proof.jpg',
    });

    renderPage();

    expect(await screen.findByText('proof.jpg')).toBeInTheDocument();
    expect(screen.getByText('128 B')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => {
      expect(anchorClickMock).toHaveBeenCalled();
      expect(createObjectUrlMock).toHaveBeenCalled();
      expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:preview-url');
    });
  });

  it('does not create a download when the stored file is missing', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Download' }));

    await waitFor(() => {
      expect(getFileMock).toHaveBeenCalledWith('file-1');
    });
    expect(anchorClickMock).not.toHaveBeenCalled();
    expect(createObjectUrlMock).not.toHaveBeenCalled();
  });

  it('opens and closes an image preview for previewable files', async () => {
    getFileMock.mockResolvedValueOnce({
      blob: new Blob(['abc'], { type: 'image/jpeg' }),
      name: 'proof.jpg',
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Preview' }));

    expect(await screen.findByAltText('proof.jpg')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:preview-url');
    });
  });

  it('replaces an existing preview url when previewing another image and formats larger file sizes', async () => {
    loadFormDataMock.mockImplementation(() => ({
      'ext.fileSingle': [
        { id: 'file-1', name: 'first.jpg', type: 'image/jpeg', size: 1_572_864 },
        { id: 'file-2', name: '', type: 'image/png', size: 1_073_741_824 },
        { id: 'file-3', name: 'mystery.bin', type: '', size: 128 },
      ],
    }));
    getFileReferencesMock.mockImplementation((value?: unknown) => (Array.isArray(value) ? value : value ? [value] : []));
    createObjectUrlMock
      .mockReturnValueOnce('blob:first-preview')
      .mockReturnValueOnce('blob:second-preview');
    getFileMock
      .mockResolvedValueOnce({
        blob: new Blob(['first'], { type: 'image/jpeg' }),
        name: 'first.jpg',
      })
      .mockResolvedValueOnce({
        blob: new Blob(['second'], { type: 'image/jpeg' }),
        name: '',
      });

    renderPage();

    expect(await screen.findByText('1.5 MB')).toBeInTheDocument();
    expect(screen.getByText('1.0 GB')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();

    const previewButtons = await screen.findAllByRole('button', { name: 'Preview' });
    fireEvent.click(previewButtons[0]);
    expect(await screen.findByAltText('first.jpg')).toBeInTheDocument();

    fireEvent.click(previewButtons[1]);

    await waitFor(() => {
      expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:first-preview');
    });
    expect(await screen.findByAltText('Preview')).toBeInTheDocument();
  });

  it('returns early when previewable files no longer exist in storage', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Preview' }));

    await waitFor(() => {
      expect(getFileMock).toHaveBeenCalledWith('file-1');
    });
    expect(createObjectUrlMock).not.toHaveBeenCalled();
    expect(screen.queryByAltText('proof.jpg')).not.toBeInTheDocument();
  });

  it('does not preview non-image files and shows a placeholder instead', async () => {
    loadFormDataMock.mockImplementation(() => ({ signature: { id: 'file-2', name: 'signed.pdf', type: 'application/pdf', size: 2048 } }));
    getFileReferencesMock.mockImplementation((value?: unknown) => (value ? [value] : []));

    renderPage();

    expect(await screen.findByText('signed.pdf')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
  });

  it('can dismiss the preview modal when no preview has been opened', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss Modal' }));

    expect(revokeObjectUrlMock).not.toHaveBeenCalled();
  });

  it('navigates back to the inspection list when the header action is clicked', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Back to My Inspections' }));

    expect(navigateMock).toHaveBeenCalledWith('/my-inspections');
  });

  it('renders sync diagnostics and refreshes them on demand', async () => {
    renderPage();

    expect(await screen.findByText('Sync Diagnostics')).toBeInTheDocument();
    expect(screen.getByText(/Subsystem state: Idle/)).toBeInTheDocument();
    expect(screen.getByText(/Total entries: 1/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh sync diagnostics' }));

    await waitFor(() => {
      expect(syncMonitorRefreshMock).toHaveBeenCalled();
    });
  });

  it('renders the queue entry details and supports retry and dead-letter actions', async () => {
    syncQueueLoadMock.mockResolvedValue({
      inspectionId: 'scoped-session',
      tenantId: 'tenant-a',
      userId: 'impersonated-user',
      status: 'failed',
      fingerprint: 'fingerprint-1',
      idempotencyKey: 'idempotency-1',
      clientRevision: 3,
      baseServerRevision: 'srv-2',
      mergePolicy: 'manual-on-version-mismatch',
      attemptCount: 2,
      nextAttemptAt: 200,
      createdAt: 100,
      updatedAt: 150,
      lastAttemptAt: 180,
      lastError: 'upload failed',
    });

    renderPage();

    expect(await screen.findByText(/Queue status: failed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send to dead-letter' }));

    await waitFor(() => {
      expect(syncQueueRetryMock).toHaveBeenCalled();
      expect(syncQueueDeadLetterMock).toHaveBeenCalledWith(
        expect.objectContaining({ inspectionId: 'scoped-session' }),
        'Moved to dead-letter by operator'
      );
    });
  });

  it('renders conflict details and suppresses the dead-letter button for conflict entries', async () => {
    loadByIdMock.mockResolvedValueOnce({
      ...scopedInspection,
      conflict: {
        detectedAt: 200,
        reason: 'Revision mismatch',
        serverRevision: 'srv-9',
        serverUpdatedAt: 220,
        conflictingFields: ['temperature'],
      },
      version: {
        clientRevision: 4,
        baseServerRevision: 'srv-8',
        serverRevision: 'srv-9',
        updatedAt: 210,
        mergePolicy: 'manual-on-version-mismatch',
      },
    });
    syncQueueLoadMock.mockResolvedValue({
      inspectionId: 'scoped-session',
      tenantId: 'tenant-a',
      userId: 'impersonated-user',
      status: 'conflict',
      fingerprint: 'fingerprint-1',
      idempotencyKey: 'idempotency-1',
      clientRevision: 4,
      baseServerRevision: 'srv-8',
      mergePolicy: 'manual-on-version-mismatch',
      attemptCount: 1,
      nextAttemptAt: Number.MAX_SAFE_INTEGER,
      createdAt: 100,
      updatedAt: 220,
      lastError: 'Revision mismatch',
      conflictDetectedAt: 200,
      conflictServerRevision: 'srv-9',
      conflictServerUpdatedAt: 220,
      conflictingFields: ['temperature'],
    });

    renderPage();

    expect(await screen.findByText('Conflict Details')).toBeInTheDocument();
    expect(screen.getByText(/Conflict reason: Revision mismatch/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry now' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send to dead-letter' })).not.toBeInTheDocument();
  });

  it('renders recent sync events, minute-scale durations, and dead-letter requeue actions', async () => {
    syncMonitorSnapshot.queue.metrics.oldestEntryAgeMs = 61_000;
    syncMonitorSnapshot.queue.workerLease = { ownerId: 'worker-1', expiresAt: 400 };
    syncMonitorSnapshot.recentEvents = [
      {
        id: 'event-1',
        at: 300,
        level: 'error',
        type: 'inspection-dead-lettered',
        message: 'Moved to dead-letter.',
      },
    ];
    syncQueueLoadMock.mockResolvedValue({
      inspectionId: 'scoped-session',
      tenantId: 'tenant-a',
      userId: 'impersonated-user',
      status: 'dead-letter',
      fingerprint: 'fingerprint-1',
      idempotencyKey: 'idempotency-1',
      clientRevision: 3,
      baseServerRevision: null,
      mergePolicy: 'manual-on-version-mismatch',
      attemptCount: 3,
      nextAttemptAt: 200,
      createdAt: 100,
      updatedAt: 150,
      deadLetterReason: 'operator moved',
    });

    renderPage();

    expect(await screen.findByText(/Oldest age: 1.0 min/)).toBeInTheDocument();
    expect(screen.getByText(/\[error\] Moved to dead-letter\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Requeue dead-letter' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send to dead-letter' })).not.toBeInTheDocument();
  });
});
