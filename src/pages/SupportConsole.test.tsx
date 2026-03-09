import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SupportConsole } from './SupportConsole';
import type { InspectionSession } from '../types';
import type { SyncQueueEntry } from '../domain/syncQueue';

const {
  navigateMock,
  getSearch,
  setSearch,
  setSearchParamsMock,
  getBootstrapState,
  setBootstrapState,
  resetBootstrapState,
  getAuthState,
  setAuthState,
  resetAuthState,
  getInspections,
  setInspections,
  resetInspections,
  getCurrentSession,
  setCurrentSession,
  resetCurrentSession,
  getFormData,
  setFormData,
  resetFormData,
  getSyncSnapshot,
  setSyncSnapshot,
  resetSyncSnapshot,
} = vi.hoisted(() => {
  let currentSearch = 'inspectionId=session-1';
  const defaultInspections = (): InspectionSession[] => [
    {
      id: 'session-1',
      name: 'Failed upload',
      formType: 'hvac',
      uploadStatus: 'failed',
      tenantId: 'tenant-a',
      userId: 'tech-1',
    },
    {
      id: 'session-2',
      name: 'Healthy upload',
      formType: 'electrical',
      uploadStatus: 'uploaded',
      tenantId: 'tenant-a',
      userId: 'tech-1',
    },
  ];
  const defaultCurrentSession = (): InspectionSession => defaultInspections()[0];
  const defaultBootstrapState = () => ({
    config: {
      tenantId: 'tenant-a',
      displayName: 'Tenant A',
      theme: 'mist',
      font: 'Source Sans Pro',
      showLeftFlyout: true,
      showRightFlyout: true,
      showInspectionStatsButton: true,
      enabledForms: ['hvac'] as const,
      loginRequired: true,
    },
    diagnostics: {
      status: 'ready' as const,
      source: 'network' as const,
      activeTenantId: 'tenant-a',
      lastAttemptAt: '2026-03-07T10:00:00.000Z',
      governance: {
        tenantId: 'tenant-a',
        environmentId: 'beta',
        schemaVersion: '2026-03-01',
        promotedVersion: '1.0.0',
        availableVersions: ['1.0.0'],
        promotionHistory: ['1.0.0'],
        promotedArtifact: {
          artifactId: 'tenant-a:1.0.0',
          tenantId: 'tenant-a',
          version: '1.0.0',
          schemaVersion: '2026-03-01',
          config: {
            tenantId: 'tenant-a',
            displayName: 'Tenant A',
            theme: 'mist',
            font: 'Source Sans Pro',
            showLeftFlyout: true,
            showRightFlyout: true,
            showInspectionStatsButton: true,
            enabledForms: ['hvac'] as const,
            loginRequired: true,
          },
          reviewStatus: 'approved' as const,
          reviewedBy: 'platform-seed',
          reviewedAt: '2026-03-01T00:00:00.000Z',
          createdBy: 'platform-seed',
          createdAt: '2026-03-01T00:00:00.000Z',
        },
        auditEntries: [
          {
            auditId: 'tenant-a:seeded:1',
            tenantId: 'tenant-a',
            action: 'seeded' as const,
            actorId: 'platform-seed',
            occurredAt: '2026-03-01T00:00:00.000Z',
            environmentId: 'beta',
            toVersion: '1.0.0',
            note: 'Seeded governed tenant config from platform defaults.',
          },
        ],
      },
    },
  });
  const defaultAuthState = () => ({
    userId: 'user-1',
    isAdmin: true,
    permissions: ['customization.admin', 'tenant.select'],
  });
  const defaultSyncSnapshot = () => ({
    scopeKey: 'tenant-a:user-1',
    state: 'idle' as const,
    lastUpdatedAt: 100,
    lastCycleStartedAt: 90,
    lastCycleCompletedAt: 100,
    lastSuccessfulSyncAt: 95,
    lastFailedSyncAt: 96,
    pauseReason: null,
    lastError: 'upload failed',
    queue: {
      generatedAt: 100,
      workerLease: { ownerId: 'worker-1', expiresAt: 200 },
      metrics: {
        totalCount: 1,
        readyCount: 0,
        pendingCount: 0,
        syncingCount: 0,
        failedCount: 1,
        deadLetterCount: 0,
        oldestEntryAgeMs: 1000,
        nextAttemptAt: 120,
      },
      entries: [
        {
          inspectionId: 'session-1',
          tenantId: 'tenant-a',
          userId: 'tech-1',
          status: 'failed' as const,
          fingerprint: 'fingerprint-1',
          idempotencyKey: 'idempotency-1',
          attemptCount: 2,
          nextAttemptAt: 120,
          createdAt: 50,
          updatedAt: 80,
          lastError: 'upload failed',
        },
      ] satisfies SyncQueueEntry[],
    },
    recentEvents: [],
  });

  let bootstrapState = defaultBootstrapState();
  let authState = defaultAuthState();
  let inspections = defaultInspections();
  let currentSession: InspectionSession | null = defaultCurrentSession();
  let formData: Record<string, unknown> | null = { ext_note: 'value', ext_photo: 'ref' };
  let syncSnapshot = defaultSyncSnapshot();

  return {
    navigateMock: vi.fn(),
    getSearch: () => currentSearch,
    setSearch: (value: string) => {
      currentSearch = value;
    },
    setSearchParamsMock: vi.fn((next: Record<string, string>) => {
      currentSearch = new URLSearchParams(next).toString();
    }),
    getBootstrapState: () => bootstrapState,
    setBootstrapState: (next: Partial<typeof bootstrapState>) => {
      bootstrapState = {
        ...bootstrapState,
        ...next,
        config: {
          ...bootstrapState.config,
          ...(next.config ?? {}),
        },
        diagnostics: {
          ...bootstrapState.diagnostics,
          ...(next.diagnostics ?? {}),
        },
      };
    },
    resetBootstrapState: () => {
      bootstrapState = defaultBootstrapState();
    },
    getAuthState: () => authState,
    setAuthState: (next: Partial<typeof authState>) => {
      authState = { ...authState, ...next };
    },
    resetAuthState: () => {
      authState = defaultAuthState();
    },
    getInspections: () => inspections,
    setInspections: (next: InspectionSession[]) => {
      inspections = next;
    },
    resetInspections: () => {
      inspections = defaultInspections();
    },
    getCurrentSession: () => currentSession,
    setCurrentSession: (next: InspectionSession | null) => {
      currentSession = next;
    },
    resetCurrentSession: () => {
      currentSession = defaultCurrentSession();
    },
    getFormData: () => formData,
    setFormData: (next: Record<string, unknown> | null) => {
      formData = next;
    },
    resetFormData: () => {
      formData = { ext_note: 'value', ext_photo: 'ref' };
    },
    getSyncSnapshot: () => syncSnapshot,
    setSyncSnapshot: (next: Partial<typeof syncSnapshot>) => {
      syncSnapshot = {
        ...syncSnapshot,
        ...next,
        queue: {
          ...syncSnapshot.queue,
          ...(next.queue ?? {}),
          metrics: {
            ...syncSnapshot.queue.metrics,
            ...(next.queue?.metrics ?? {}),
          },
          entries: next.queue?.entries ?? syncSnapshot.queue.entries,
        },
      };
    },
    resetSyncSnapshot: () => {
      syncSnapshot = defaultSyncSnapshot();
    },
  };
});

const {
  loadAllMock,
  loadCurrentMock,
  loadFormDataMock,
  subscribeMock,
  getFormDataFieldCountMock,
  retryQueueEntryMock,
  moveQueueEntryToDeadLetterMock,
  recoverUploadMock,
  activateInspectionSessionMock,
  refreshConfigMock,
  clearCachedTenantBootstrapConfigMock,
  promoteTenantConfigArtifactMock,
  rollbackTenantConfigArtifactMock,
  setSelectedTenantIdMock,
  clearThemePreferenceMock,
  clearFontPreferenceMock,
  syncMonitorRefreshMock,
} = vi.hoisted(() => ({
  loadAllMock: vi.fn(async () => getInspections()),
  loadCurrentMock: vi.fn(async () => getCurrentSession()),
  loadFormDataMock: vi.fn(async () => getFormData()),
  subscribeMock: vi.fn(() => () => undefined),
  getFormDataFieldCountMock: vi.fn(async () => {
    const data = getFormData();
    return Object.keys(data ?? {}).length;
  }),
  retryQueueEntryMock: vi.fn(async () => undefined),
  moveQueueEntryToDeadLetterMock: vi.fn(async () => undefined),
  recoverUploadMock: vi.fn(async (inspection: InspectionSession) => inspection),
  activateInspectionSessionMock: vi.fn(async () => undefined),
  refreshConfigMock: vi.fn(async () => undefined),
  clearCachedTenantBootstrapConfigMock: vi.fn(),
  promoteTenantConfigArtifactMock: vi.fn(),
  rollbackTenantConfigArtifactMock: vi.fn(),
  setSelectedTenantIdMock: vi.fn(),
  clearThemePreferenceMock: vi.fn(),
  clearFontPreferenceMock: vi.fn(),
  syncMonitorRefreshMock: vi.fn(async () => undefined),
}));

const labels = {
  common: {
    yes: 'Yes',
    no: 'No',
    notProvided: 'Not provided',
    unnamed: 'Unnamed',
  },
  bootstrap: {
    status: {
      loading: 'Loading',
      ready: 'Ready',
      degraded: 'Degraded',
    },
    source: {
      network: 'Network',
      cache: 'Cache',
      defaults: 'Defaults',
    },
    lastAttemptLabel: 'Last bootstrap attempt',
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
  myInspections: {
    table: {
      status: 'Status',
    },
  },
  debugInspection: {
    syncStateLabel: 'Subsystem state',
    syncWorkerLeaseLabel: 'Worker lease',
    syncLastErrorLabel: 'Last error',
    syncMetrics: {
      total: 'Total entries',
      failed: 'Retry pending',
      deadLetter: 'Dead-letter',
    },
    syncStatusLabels: {
      idle: 'Idle',
      running: 'Running',
      paused: 'Paused',
      blocked: 'Blocked',
    },
    syncInspection: {
      retryNow: 'Retry now',
      moveToDeadLetter: 'Send to dead-letter',
      requeueDeadLetter: 'Requeue dead-letter',
    },
  },
  support: {
    title: 'Support Console',
    intro: 'Operator workflow',
    tenantSection: {
      title: 'Tenant configuration',
      description: 'Switch tenant',
      tenantLabel: 'Tenant',
      applyTenant: 'Apply tenant',
      refreshConfig: 'Refresh config',
      clearCache: 'Clear cached config',
      promoteConfig: 'Promote config',
      rollbackConfig: 'Rollback config',
      activeConfigHeader: 'Active bootstrap config',
      bootstrapStatus: 'Bootstrap status',
      bootstrapSource: 'Bootstrap source',
      enabledForms: 'Enabled forms',
      loginRequired: 'Login required',
      leftFlyout: 'Left flyout',
      rightFlyout: 'Right flyout',
      statsButton: 'Stats drawer enabled',
      schemaVersion: 'Schema version',
      artifactVersion: 'Artifact version',
      environment: 'Environment',
      reviewStatus: 'Review status',
      reviewedBy: 'Reviewed by',
      reviewedAt: 'Reviewed at',
      auditHeader: 'Audit history',
      noAuditEntries: 'No audit entries are available for this tenant config.',
      auditAction: 'Action:',
      auditActor: 'Actor:',
      auditEnvironment: 'Environment:',
      auditVersion: 'Version change:',
      auditOccurredAt: 'Occurred at:',
      auditNote: 'Note:',
    },
    queueSection: {
      title: 'Queue operations',
      description: 'Queue workflow',
      refresh: 'Refresh queue',
      empty: 'No queue entries',
      status: 'Queue status',
      attempts: 'Attempts',
      nextAttempt: 'Next attempt',
      lastError: 'Last error',
      actions: 'Actions',
      inspect: 'Inspect',
    },
    recoverySection: {
      title: 'Stuck upload recovery',
      description: 'Recover uploads',
      empty: 'No stuck uploads found.',
      issue: 'Issue',
      recover: 'Recover upload',
      resume: 'Resume form',
      investigate: 'Investigate',
    },
    sessionSection: {
      title: 'Session troubleshooting',
      description: 'Troubleshoot sessions',
      currentSession: 'Current session',
      queueStatus: 'Queue status',
      formDataFields: 'Form data fields',
      tenant: 'Tenant',
      user: 'User',
      openDebug: 'Open deep diagnostics',
      openForm: 'Open form session',
      noSelection: 'No selection',
    },
    alerts: {
      tenantUpdated: 'Support scope updated to the selected tenant.',
      cacheCleared: 'Cached tenant bootstrap config cleared.',
      configPromoted: 'Tenant config was promoted as a new governed artifact version.',
      configRolledBack: 'Tenant config promotion was rolled back to the previous version.',
      queueRetried: 'Queue entry moved back to pending.',
      movedToDeadLetter: 'Queue entry moved to dead-letter.',
      uploadRecovered: 'Inspection upload was requeued for recovery.',
      actionFailed: 'The requested support action could not be completed.',
    },
  },
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useSearchParams: () => [new URLSearchParams(getSearch()), setSearchParamsMock],
  };
});

vi.mock('../LocalizationContext', () => ({
  useLocalization: () => ({ labels }),
}));

vi.mock('../TenantBootstrapContext', () => ({
  useTenantBootstrap: () => ({
    ...getBootstrapState(),
    refreshConfig: refreshConfigMock,
  }),
}));

vi.mock('../auth', () => ({
  getUserId: () => getAuthState().userId,
  hasPermission: (permission: string) => getAuthState().permissions.includes(permission),
  isLoggedInAdmin: () => getAuthState().isAdmin,
}));

vi.mock('../repositories/inspectionRepository', () => ({
  inspectionRepository: {
    loadAll: (...args: unknown[]) => loadAllMock(...args),
    loadCurrent: (...args: unknown[]) => loadCurrentMock(...args),
    subscribe: (...args: unknown[]) => subscribeMock(...args),
  },
}));

vi.mock('../syncMonitor', () => ({
  useSyncMonitor: () => getSyncSnapshot(),
  syncMonitor: {
    refresh: (...args: unknown[]) => syncMonitorRefreshMock(...args),
  },
}));

vi.mock('../application/inspectionApplicationService', () => ({
  inspectionApplicationService: {
    getRecoveryCandidates: (inspections: InspectionSession[], queueEntries: SyncQueueEntry[]) =>
      inspections.filter((inspection) => {
        const entry = queueEntries.find((candidate) => candidate.inspectionId === inspection.id);
        const uploadStatus = inspection.uploadStatus ?? 'local';
        return (
          uploadStatus === 'failed' ||
          uploadStatus === 'conflict' ||
          uploadStatus === 'uploading' ||
          entry?.status === 'failed' ||
          entry?.status === 'conflict' ||
          entry?.status === 'dead-letter' ||
          entry?.status === 'syncing'
        );
      }),
    getFormDataFieldCount: (...args: unknown[]) => getFormDataFieldCountMock(...args),
    retryQueueEntry: (...args: unknown[]) => retryQueueEntryMock(...args),
    moveQueueEntryToDeadLetter: (...args: unknown[]) => moveQueueEntryToDeadLetterMock(...args),
    recoverUpload: (...args: unknown[]) => recoverUploadMock(...args),
    activateInspectionSession: (...args: unknown[]) => activateInspectionSessionMock(...args),
  },
}));

vi.mock('../appState', () => ({
  setSelectedTenantId: (...args: unknown[]) => setSelectedTenantIdMock(...args),
  clearThemePreference: (...args: unknown[]) => clearThemePreferenceMock(...args),
  clearFontPreference: (...args: unknown[]) => clearFontPreferenceMock(...args),
}));

vi.mock('../tenantBootstrap', () => ({
  clearCachedTenantBootstrapConfig: (...args: unknown[]) => clearCachedTenantBootstrapConfigMock(...args),
}));

vi.mock('../tenantConfigGovernance', () => ({
  promoteTenantConfigArtifact: (...args: unknown[]) => promoteTenantConfigArtifactMock(...args),
  rollbackTenantConfigArtifact: (...args: unknown[]) => rollbackTenantConfigArtifactMock(...args),
}));

vi.mock('@cloudscape-design/components', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    Alert: ({
      children,
      onDismiss,
    }: {
      children: React.ReactNode;
      onDismiss?: () => void;
    }) => (
      <div>
        {children}
        {onDismiss ? (
          <button type="button" onClick={onDismiss}>
            Dismiss
          </button>
        ) : null}
      </div>
    ),
    Box: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Button: ({
      children,
      onClick,
      disabled,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      disabled?: boolean;
    }) => (
      <button type="button" onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
    Container: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    FormField: ({ label, children }: { label: string; children: React.ReactNode }) => (
      <label>
        <span>{label}</span>
        {children}
      </label>
    ),
    Header: ({
      children,
      actions,
    }: {
      children: React.ReactNode;
      actions?: React.ReactNode;
    }) => (
      <div>
        {actions}
        <h1>{children}</h1>
      </div>
    ),
    Select: ({
      selectedOption,
      options,
      onChange,
    }: {
      selectedOption: { value?: string } | null;
      options: Array<{ label?: string; value?: string }>;
      onChange: (event: { detail: { selectedOption: { label?: string; value?: string } } }) => void;
    }) => (
      <select
        value={selectedOption?.value ?? ''}
        onChange={(event) => {
          const selected = options.find((option) => option.value === event.target.value) ?? { value: event.target.value };
          onChange({ detail: { selectedOption: selected } });
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
    SpaceBetween: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

const renderSubject = () => render(<SupportConsole />);

describe('SupportConsole', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    setSearch('inspectionId=session-1');
    setSearchParamsMock.mockClear();
    resetBootstrapState();
    resetAuthState();
    resetInspections();
    resetCurrentSession();
    resetFormData();
    resetSyncSnapshot();
    loadAllMock.mockClear();
    loadCurrentMock.mockClear();
    loadFormDataMock.mockClear();
    subscribeMock.mockClear();
    getFormDataFieldCountMock.mockClear();
    retryQueueEntryMock.mockClear();
    moveQueueEntryToDeadLetterMock.mockClear();
    recoverUploadMock.mockClear();
    activateInspectionSessionMock.mockClear();
    refreshConfigMock.mockClear();
    clearCachedTenantBootstrapConfigMock.mockClear();
    promoteTenantConfigArtifactMock.mockClear();
    rollbackTenantConfigArtifactMock.mockClear();
    setSelectedTenantIdMock.mockClear();
    clearThemePreferenceMock.mockClear();
    clearFontPreferenceMock.mockClear();
    syncMonitorRefreshMock.mockClear();
  });

  it('renders operator sections and selected inspection diagnostics', async () => {
    renderSubject();

    expect(await screen.findByText('Support Console')).toBeInTheDocument();
    expect(screen.getByText('Queue operations')).toBeInTheDocument();
    expect(screen.getByText('Stuck upload recovery')).toBeInTheDocument();
    expect(screen.getByText('Session troubleshooting')).toBeInTheDocument();
    expect(screen.getAllByText('Failed upload').length).toBeGreaterThan(0);
    expect(screen.getByText('Current session')).toBeInTheDocument();
    expect(screen.getByText('Form data fields')).toBeInTheDocument();
  });

  it('applies tenant changes through the admin workflow', async () => {
    renderSubject();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'qhvac' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply tenant' }));

    await waitFor(() => {
      expect(setSelectedTenantIdMock).toHaveBeenCalledWith('qhvac');
      expect(clearThemePreferenceMock).toHaveBeenCalled();
      expect(clearFontPreferenceMock).toHaveBeenCalled();
      expect(refreshConfigMock).toHaveBeenCalledWith('qhvac');
    });
  });

  it('refreshes config and clears cached config from the tenant section', async () => {
    renderSubject();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh config' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear cached config' }));

    await waitFor(() => {
      expect(refreshConfigMock).toHaveBeenCalledWith('tenant-a');
      expect(clearCachedTenantBootstrapConfigMock).toHaveBeenCalledWith('tenant-a');
    });

    expect(await screen.findByText('Cached tenant bootstrap config cleared.')).toBeInTheDocument();
  });

  it('promotes and rolls back governed tenant config from the tenant section', async () => {
    setBootstrapState({
      diagnostics: {
        governance: {
          ...getBootstrapState().diagnostics.governance,
          promotionHistory: ['1.0.0', '1.0.1'],
          promotedVersion: '1.0.1',
          availableVersions: ['1.0.0', '1.0.1'],
        },
      },
    });

    renderSubject();

    fireEvent.click(screen.getByRole('button', { name: 'Promote config' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rollback config' }));

    await waitFor(() => {
      expect(promoteTenantConfigArtifactMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-a',
          environmentId: 'beta',
          actorId: 'user-1',
        })
      );
      expect(rollbackTenantConfigArtifactMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-a',
          environmentId: 'beta',
          actorId: 'user-1',
        })
      );
    });

    expect(await screen.findByText('Tenant config promotion was rolled back to the previous version.')).toBeInTheDocument();
  });

  it('retries queue entries, moves them to dead-letter, and supports dead-letter requeue', async () => {
    renderSubject();

    fireEvent.click(await screen.findByRole('button', { name: 'Retry now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send to dead-letter' }));

    await waitFor(() => {
      expect(retryQueueEntryMock).toHaveBeenCalledWith(expect.objectContaining({ inspectionId: 'session-1' }));
      expect(moveQueueEntryToDeadLetterMock).toHaveBeenCalledWith(
        expect.objectContaining({ inspectionId: 'session-1' }),
        'Moved to dead-letter from support console'
      );
    });

    setSyncSnapshot({
      queue: {
        entries: [
          {
            inspectionId: 'session-1',
            tenantId: 'tenant-a',
            userId: 'tech-1',
            status: 'dead-letter',
            fingerprint: 'fingerprint-1',
            idempotencyKey: 'idempotency-1',
            attemptCount: 3,
            nextAttemptAt: 120,
            createdAt: 50,
            updatedAt: 80,
            lastError: 'dead-lettered',
          },
        ],
      },
    });

    renderSubject();
    fireEvent.click(await screen.findByRole('button', { name: 'Requeue dead-letter' }));

    await waitFor(() => {
      expect(retryQueueEntryMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'dead-letter' }));
    });
  });

  it('recovers stuck uploads by resetting the inspection and retrying the queue entry', async () => {
    renderSubject();

    fireEvent.click(await screen.findByRole('button', { name: 'Recover upload' }));

    await waitFor(() => {
      expect(recoverUploadMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'session-1',
          uploadStatus: 'failed',
        }),
        expect.objectContaining({ inspectionId: 'session-1' })
      );
    });
  });

  it('requeues a stuck upload when no queue entry exists and skips saving non-current sessions', async () => {
    setSyncSnapshot({
      queue: {
        entries: [],
        metrics: {
          totalCount: 0,
          failedCount: 0,
        },
      },
    });
    setCurrentSession(null);
    setFormData({ ext_note: 'value' });

    renderSubject();

    fireEvent.click(await screen.findByRole('button', { name: 'Recover upload' }));

    await waitFor(() => {
      expect(recoverUploadMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'session-1', uploadStatus: 'failed' }),
        undefined
      );
    });
  });

  it('supports inspect, investigate, deep-diagnostics, and open-form navigation flows', async () => {
    renderSubject();

    fireEvent.click(await screen.findByRole('button', { name: 'Inspect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Investigate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open deep diagnostics' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Resume form' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Open form session' }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/debug-inspection/session-1', {
        state: {
          inspectionScope: {
            tenantId: 'tenant-a',
            userId: 'tech-1',
          },
        },
      });
      expect(navigateMock).toHaveBeenCalledWith('/fill-form/session-1');
      expect(activateInspectionSessionMock).toHaveBeenCalled();
    });
  });

  it('shows empty states and hides tenant controls when support permissions are unavailable', async () => {
    setAuthState({
      isAdmin: false,
      permissions: [],
    });
    setInspections([]);
    setCurrentSession(null);
    setSearch('');
    setSyncSnapshot({
      lastError: null,
      queue: {
        generatedAt: 100,
        workerLease: null,
        metrics: {
          totalCount: 0,
          readyCount: 0,
          pendingCount: 0,
          syncingCount: 0,
          failedCount: 0,
          deadLetterCount: 0,
          oldestEntryAgeMs: null,
          nextAttemptAt: null,
        },
        entries: [],
      },
    });

    renderSubject();

    expect(await screen.findByText('The requested support action could not be completed.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('No queue entries')).toBeInTheDocument();
    expect(screen.getByText('No stuck uploads found.')).toBeInTheDocument();
    expect(screen.getByText('No selection')).toBeInTheDocument();
    await waitFor(() => {
      expect(setSearchParamsMock).toHaveBeenCalledWith({}, { replace: true });
    });
  });

  it('shows not-provided values and handles action failures', async () => {
    setBootstrapState({
      diagnostics: {
        status: 'degraded',
        source: 'cache',
        lastAttemptAt: undefined,
      },
      config: {
        enabledForms: [],
        loginRequired: false,
        showLeftFlyout: false,
        showRightFlyout: false,
        showInspectionStatsButton: false,
      },
    });
    setInspections([
      {
        id: 'session-1',
        name: '',
        formType: 'hvac',
        uploadStatus: 'uploading',
        tenantId: 'tenant-a',
      },
    ]);
    setCurrentSession(null);
    setFormData(null);
    setSyncSnapshot({
      lastError: null,
      queue: {
        workerLease: null,
        entries: [
          {
            inspectionId: 'session-1',
            tenantId: 'tenant-a',
            status: 'syncing',
            fingerprint: 'fingerprint-1',
            idempotencyKey: 'idempotency-1',
            attemptCount: 1,
            nextAttemptAt: 0,
            createdAt: 0,
            updatedAt: 0,
          },
        ],
      },
    });
    refreshConfigMock.mockRejectedValueOnce(new Error('refresh failed'));
    retryQueueEntryMock.mockRejectedValueOnce(new Error('retry failed'));

    renderSubject();

    expect(await screen.findAllByText('Not provided')).not.toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh config' }));

    expect(await screen.findByText('The requested support action could not be completed. refresh failed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));

    expect(await screen.findByText('The requested support action could not be completed. retry failed')).toBeInTheDocument();
  });

  it('keeps tenant application as a no-op when the selected tenant is unchanged', async () => {
    setBootstrapState({
      config: {
        tenantId: 'frontierDemo',
      },
      diagnostics: {
        activeTenantId: 'frontierDemo',
      },
    });

    renderSubject();

    fireEvent.click(screen.getByRole('button', { name: 'Apply tenant' }));

    await waitFor(() => {
      expect(setSelectedTenantIdMock).not.toHaveBeenCalled();
      expect(refreshConfigMock).not.toHaveBeenCalled();
    });
  });
});
