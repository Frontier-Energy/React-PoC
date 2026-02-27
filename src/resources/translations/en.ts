import { FormType, UploadStatus } from '../../types';

export const en = {
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
  app: {
    title: 'Data Intake Tool',
    poweredBy: 'Powered By',
    brand: 'QControl',
  },
  nav: {
    newInspection: 'New Inspection',
    myInspections: 'My Inspections',
    logout: 'Log out',
  },
  drawers: {
    connectivity: {
      name: 'Connectivity status',
      trigger: 'Open connectivity status',
    },
    inspectionStats: {
      name: 'Inspection statistics',
      trigger: 'Open inspection statistics',
    },
    customization: {
      name: 'Customization options',
      trigger: 'Open customization options',
    },
  },
  connectivity: {
    status: {
      online: 'Online',
      offline: 'Offline',
      checking: 'Checking connection...',
    },
    lastCheckedAt: (time: string) => ` (last checked ${time})`,
  },
  inspectionStats: {
    header: 'Inspection Stats',
    statusHeader: 'Status',
    countHeader: 'Count',
    empty: 'No inspections',
  },
  customization: {
    header: 'Customization',
    tenantLabel: 'Tenant',
    themeLabel: 'Theme',
    fontLabel: 'Font',
    languageLabel: 'Language',
    preferencesSaved: 'Preferences are saved locally on this device.',
    themeOptions: {
      mist: {
        label: 'Mist',
        description: 'Soft light gray',
      },
      harbor: {
        label: 'Harbor',
        description: 'Cool blue tint',
      },
      sand: {
        label: 'Sand',
        description: 'Warm neutral',
      },
      night: {
        label: 'Night',
        description: 'Deep charcoal',
      },
    },
    fontOptions: {
      sourceSansPro: {
        label: 'Source Sans Pro',
        description: 'Clean sans-serif',
      },
      georgia: {
        label: 'Georgia',
        description: 'Classic serif',
      },
      tahoma: {
        label: 'Tahoma',
        description: 'Compact sans-serif',
      },
    },
    languageOptions: {
      en: 'English',
      es: 'Spanish',
    },
  },
  uploadStatus: {
    [UploadStatus.Local]: 'Local',
    [UploadStatus.InProgress]: 'In Progress',
    [UploadStatus.Uploading]: 'Uploading',
    [UploadStatus.Uploaded]: 'Uploaded',
    [UploadStatus.Failed]: 'Failed',
  },
  formTypes: {
    [FormType.Electrical]: 'Electrical',
    [FormType.ElectricalSF]: 'Electrical SF',
    [FormType.HVAC]: 'HVAC',
    [FormType.SafetyChecklist]: 'Safety Checklist',
  },
  home: {
    title: 'Inspection Forms',
  },
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
    failedUploadMessage: (count: number) =>
      count === 1
        ? 'An inspection failed to upload. Use Retry to try again.'
        : `${count} inspections failed to upload. Use Retry to try again.`,
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
      buttons: {
        view: 'View',
        open: 'Open',
        retry: 'Retry',
        delete: 'Delete',
      },
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
      stepNumberLabel: (stepNumber: number) => `Step ${stepNumber}`,
      collapsedStepsLabel: (stepNumber: number, stepsCount: number) =>
        `Step ${stepNumber} of ${stepsCount}`,
      skipToButtonLabel: (title: string, stepNumber: number) =>
        `Skip to ${title} (Step ${stepNumber})`,
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
    signature: {
      saving: 'Saving...',
      save: 'Save Signature',
      clear: 'Clear',
    },
    placeholders: {
      selectOne: 'Select an option',
      selectMultiple: 'Select options',
    },
    filePreview: {
      header: 'File Preview',
      download: 'Download',
      close: 'Close',
      previewNotAvailable: 'Preview not available for this file type.',
      unableToLoad: 'Unable to load preview.',
    },
  },
} as const;
