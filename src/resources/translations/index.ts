import type { FormType, UploadStatus } from '../../types';

export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];

export interface CommonLabels {
  yes: string;
  no: string;
  cancel: string;
  close: string;
  delete: string;
  download: string;
  preview: string;
  unknown: string;
  unnamed: string;
  loading: string;
  notProvided: string;
}

export interface AppLabels {
  title: string;
  poweredBy: string;
  brand: string;
}

export interface BootstrapLabels {
  loading: string;
  staleCacheTitle: string;
  staleCacheBody: string;
  defaultsTitle: string;
  defaultsBody: string;
  supportLink: string;
  diagnosticsHeader: string;
  diagnosticsUnavailable: string;
  statusLabel: string;
  sourceLabel: string;
  tenantLabel: string;
  lastSuccessLabel: string;
  lastAttemptLabel: string;
  errorLabel: string;
  source: {
    network: string;
    cache: string;
    defaults: string;
  };
  status: {
    loading: string;
    ready: string;
    degraded: string;
  };
}

export interface NavLabels {
  newInspection: string;
  myInspections: string;
  support: string;
  logout: string;
}

export interface DrawerLabels {
  name: string;
  trigger: string;
}

export interface DrawersLabels {
  connectivity: DrawerLabels;
  inspectionStats: DrawerLabels;
  customization: DrawerLabels;
}

export interface ConnectivityLabels {
  status: {
    online: string;
    offline: string;
    checking: string;
  };
  lastCheckedAt: string;
}

export interface InspectionStatsLabels {
  header: string;
  statusHeader: string;
  countHeader: string;
  empty: string;
}

export interface ThemeOptionLabels {
  label: string;
  description: string;
}

export interface FontOptionLabels {
  label: string;
  description: string;
}

export interface CustomizationLabels {
  header: string;
  userLevelHeader: string;
  adminLevelHeader: string;
  tenantLabel: string;
  themeLabel: string;
  fontLabel: string;
  languageLabel: string;
  adminTenantAccessNotice: string;
  openSupportConsole: string;
  registerLink: string;
  loginLink: string;
  preferencesSaved: string;
  themeOptions: {
    mist: ThemeOptionLabels;
    harbor: ThemeOptionLabels;
    sand: ThemeOptionLabels;
    night: ThemeOptionLabels;
  };
  fontOptions: {
    sourceSansPro: FontOptionLabels;
    georgia: FontOptionLabels;
    tahoma: FontOptionLabels;
  };
  languageOptions: Record<LanguageCode, string>;
}

export type UploadStatusLabels = Record<UploadStatus, string>;
export type FormTypeLabels = Record<FormType, string>;

export interface HomeLabels {
  title: string;
}

export interface LoginLabels {
  title: string;
  tenantLabel: string;
  emailLabel: string;
  emailPlaceholder: string;
  emailRequired: string;
  login: string;
  createAccount: string;
  lookupError: string;
  lookupNoUserId: string;
}

export interface RegisterLabels {
  title: string;
  tenantLabel: string;
  backToLogin: string;
  emailLabel: string;
  firstNameLabel: string;
  lastNameLabel: string;
  emailPlaceholder: string;
  firstNamePlaceholder: string;
  lastNamePlaceholder: string;
  requiredError: string;
  createAccount: string;
  errors: {
    invalidInput: string;
    serverError: string;
    unableToRegister: string;
  };
}

export interface NewInspectionLabels {
  title: string;
  selectPlaceholder: string;
  createSession: string;
}

export interface NewFormLabels {
  title: string;
  selectPlaceholder: string;
  createSession: string;
}

export interface MyInspectionsLabels {
  title: string;
  deleteModal: {
    header: string;
    confirmPrefix: string;
    confirmSuffix: string;
  };
  failedUploadMessage: {
    one: string;
    other: string;
  };
  filters: {
    filterByFormType: string;
    filterByStatus: string;
    clearFilters: string;
    allFormTypes: string;
    allStatuses: string;
  };
  emptyState: {
    noInspections: string;
    createNewInspectionLink: string;
    createNewInspectionSuffix: string;
    noMatchingFilters: string;
  };
  table: {
    name: string;
    formType: string;
    status: string;
    actions: string;
    empty: string;
    buttons: {
      view: string;
      open: string;
      retry: string;
      delete: string;
    };
  };
  createNewInspection: string;
}

export interface FillFormLabels {
  loading: string;
  errorLoadingSchema: string;
  sessionNameRequired: string;
  confirmDetailsError: string;
  successMessage: string;
  formValidationErrorsHeader: string;
  sessionNameLabel: string;
  sessionNamePlaceholder: string;
  sessionIdLabel: string;
  formTypeLabel: string;
  resetForm: string;
  reviewStepTitle: string;
  review: {
    confirmationRequiredHeader: string;
    sessionDetailsHeader: string;
    finalConfirmationLabel: string;
    finalConfirmationText: string;
  };
  wizard: {
    stepNumberLabel: string;
    collapsedStepsLabel: string;
    skipToButtonLabel: string;
    navigationAriaLabel: string;
    cancelButton: string;
    previousButton: string;
    nextButton: string;
    submitButton: string;
  };
}

export interface DebugInspectionLabels {
  title: string;
  backToMyInspections: string;
  filesHeader: string;
  syncHeader: string;
  syncMetricsHeader: string;
  syncEventsHeader: string;
  syncInspectionHeader: string;
  syncRefresh: string;
  syncEmptyEvents: string;
  syncNotQueued: string;
  syncStateLabel: string;
  syncWorkerLeaseLabel: string;
  syncScopeLabel: string;
  syncLastSuccessLabel: string;
  syncLastFailureLabel: string;
  syncLastErrorLabel: string;
  syncStatusLabels: {
    idle: string;
    running: string;
    paused: string;
    blocked: string;
  };
  syncMetrics: {
    total: string;
    ready: string;
    pending: string;
    syncing: string;
    failed: string;
    conflict: string;
    deadLetter: string;
    oldestAge: string;
    nextAttempt: string;
  };
  syncInspection: {
    status: string;
    attempts: string;
    nextAttempt: string;
    lastAttempt: string;
    lastError: string;
    deadLetterReason: string;
    idempotencyKey: string;
    retryNow: string;
    moveToDeadLetter: string;
    requeueDeadLetter: string;
  };
  schemaLoadError: string;
  versionHeader: string;
  versionClientRevision: string;
  versionBaseServerRevision: string;
  versionServerRevision: string;
  versionUpdatedAt: string;
  versionMergePolicy: string;
  conflictHeader: string;
  conflictDetectedAt: string;
  conflictReason: string;
  conflictServerRevision: string;
  conflictServerUpdatedAt: string;
  conflictFields: string;
  noFilesFound: string;
  table: {
    fileName: string;
    size: string;
    fileType: string;
    download: string;
    preview: string;
  };
  previewTitle: string;
  close: string;
  errors: {
    missingInspectionId: string;
    parseInspection: string;
    parseFormData: string;
  };
}

export interface SupportLabels {
  title: string;
  intro: string;
  tenantSection: {
    title: string;
    description: string;
    tenantLabel: string;
    applyTenant: string;
    refreshConfig: string;
    clearCache: string;
    activeConfigHeader: string;
    bootstrapStatus: string;
    bootstrapSource: string;
    enabledForms: string;
    loginRequired: string;
    leftFlyout: string;
    rightFlyout: string;
    statsButton: string;
  };
  queueSection: {
    title: string;
    description: string;
    refresh: string;
    empty: string;
    status: string;
    attempts: string;
    nextAttempt: string;
    lastError: string;
    actions: string;
    inspect: string;
  };
  recoverySection: {
    title: string;
    description: string;
    empty: string;
    issue: string;
    recover: string;
    resume: string;
    investigate: string;
  };
  sessionSection: {
    title: string;
    description: string;
    currentSession: string;
    queueStatus: string;
    formDataFields: string;
    tenant: string;
    user: string;
    openDebug: string;
    openForm: string;
    noSelection: string;
  };
  alerts: {
    tenantUpdated: string;
    cacheCleared: string;
    queueRetried: string;
    movedToDeadLetter: string;
    uploadRecovered: string;
    actionFailed: string;
  };
}

export interface FormRendererLabels {
  signature: {
    saving: string;
    save: string;
    clear: string;
  };
  placeholders: {
    selectOne: string;
    selectMultiple: string;
  };
  filePreview: {
    header: string;
    download: string;
    close: string;
    previewNotAvailable: string;
    unableToLoad: string;
  };
}

export interface Labels {
  languageName: string;
  common: CommonLabels;
  app: AppLabels;
  bootstrap: BootstrapLabels;
  nav: NavLabels;
  drawers: DrawersLabels;
  connectivity: ConnectivityLabels;
  inspectionStats: InspectionStatsLabels;
  customization: CustomizationLabels;
  uploadStatus: UploadStatusLabels;
  formTypes: FormTypeLabels;
  home: HomeLabels;
  login: LoginLabels;
  register: RegisterLabels;
  newInspection: NewInspectionLabels;
  newForm: NewFormLabels;
  myInspections: MyInspectionsLabels;
  fillForm: FillFormLabels;
  debugInspection: DebugInspectionLabels;
  support: SupportLabels;
  formRenderer: FormRendererLabels;
}

export const defaultLanguage: LanguageCode = 'en';

export const isLanguageCode = (value: unknown): value is LanguageCode =>
  typeof value === 'string' && SUPPORTED_LANGUAGES.includes(value as LanguageCode);

export const isLabels = (value: unknown): value is Labels => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Labels>;
  return (
    typeof candidate.languageName === 'string' &&
    typeof candidate.common?.loading === 'string' &&
    typeof candidate.home?.title === 'string' &&
    typeof candidate.login?.title === 'string' &&
    typeof candidate.register?.title === 'string' &&
    typeof candidate.customization?.languageOptions?.en === 'string' &&
    typeof candidate.customization?.languageOptions?.es === 'string' &&
    typeof candidate.formTypes?.electrical === 'string' &&
    typeof candidate.uploadStatus?.local === 'string' &&
    typeof candidate.formRenderer?.filePreview?.header === 'string'
  );
};

export const formatTemplate = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (result, [key, value]) => result.split(`{${key}}`).join(String(value)),
    template
  );

export const formatPluralTemplate = (
  templates: { one: string; other: string },
  count: number
) => formatTemplate(count === 1 ? templates.one : templates.other, { count });
