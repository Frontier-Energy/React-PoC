import { FormType, UploadStatus } from '../../types';

export const es = {
  languageName: 'Espanol',
  common: {
    yes: 'Si',
    no: 'No',
    cancel: 'Cancelar',
    close: 'Cerrar',
    delete: 'Eliminar',
    download: 'Descargar',
    preview: 'Vista previa',
    unknown: 'Desconocido',
    unnamed: '(Sin nombre)',
    loading: 'Cargando...',
    notProvided: 'No proporcionado',
  },
  app: {
    title: 'Herramienta de inspeccion QHVAC',
    poweredBy: 'Impulsado por',
    brand: 'QControl',
  },
  nav: {
    newInspection: 'Nueva inspeccion',
    myInspections: 'Mis inspecciones',
    logout: 'Cerrar sesion',
  },
  drawers: {
    connectivity: {
      name: 'Estado de conectividad',
      trigger: 'Abrir estado de conectividad',
    },
    inspectionStats: {
      name: 'Estadisticas de inspeccion',
      trigger: 'Abrir estadisticas de inspeccion',
    },
    customization: {
      name: 'Opciones de personalizacion',
      trigger: 'Abrir opciones de personalizacion',
    },
  },
  connectivity: {
    status: {
      online: 'En linea',
      offline: 'Sin conexion',
      checking: 'Comprobando conexion...',
    },
    lastCheckedAt: (time: string) => ` (ultima comprobacion ${time})`,
  },
  inspectionStats: {
    header: 'Estadisticas de inspeccion',
    statusHeader: 'Estado',
    countHeader: 'Cantidad',
    empty: 'No hay inspecciones',
  },
  customization: {
    header: 'Personalizacion',
    themeLabel: 'Tema',
    fontLabel: 'Fuente',
    languageLabel: 'Idioma',
    preferencesSaved: 'Las preferencias se guardan localmente en este dispositivo.',
    themeOptions: {
      mist: {
        label: 'Niebla',
        description: 'Gris claro suave',
      },
      harbor: {
        label: 'Puerto',
        description: 'Tono azul frio',
      },
      sand: {
        label: 'Arena',
        description: 'Neutro calido',
      },
      night: {
        label: 'Noche',
        description: 'Carbon profundo',
      },
    },
    fontOptions: {
      sourceSansPro: {
        label: 'Source Sans Pro',
        description: 'Sans-serif limpia',
      },
      georgia: {
        label: 'Georgia',
        description: 'Serif clasica',
      },
      tahoma: {
        label: 'Tahoma',
        description: 'Sans-serif compacta',
      },
    },
    languageOptions: {
      en: 'Ingles',
      es: 'Espanol',
    },
  },
  uploadStatus: {
    [UploadStatus.Local]: 'Local',
    [UploadStatus.InProgress]: 'En progreso',
    [UploadStatus.Uploading]: 'Subiendo',
    [UploadStatus.Uploaded]: 'Subido',
    [UploadStatus.Failed]: 'Fallido',
  },
  formTypes: {
    [FormType.Electrical]: 'Electrico',
    [FormType.ElectricalSF]: 'Electrico SF',
    [FormType.HVAC]: 'HVAC',
  },
  home: {
    title: 'Formularios de inspeccion',
  },
  login: {
    title: 'Iniciar sesion',
    emailLabel: 'Correo electronico',
    emailPlaceholder: 'tu@ejemplo.com',
    emailRequired: 'El correo electronico es obligatorio.',
    login: 'Ingresar',
    createAccount: 'Crear una cuenta',
    lookupError: 'No se pudo buscar el ID de usuario. Verifica el correo e intenta de nuevo.',
    lookupNoUserId: 'La busqueda no devolvio un ID de usuario.',
  },
  register: {
    title: 'Registro',
    backToLogin: 'Volver al inicio de sesion',
    emailLabel: 'Correo electronico',
    firstNameLabel: 'Nombre',
    lastNameLabel: 'Apellido',
    emailPlaceholder: 'tu@ejemplo.com',
    firstNamePlaceholder: 'Nombre',
    lastNamePlaceholder: 'Apellido',
    requiredError: 'El correo, nombre y apellido son obligatorios.',
    createAccount: 'Crear cuenta',
    errors: {
      invalidInput: 'El registro fallo por datos invalidos. Revisa tus datos e intenta de nuevo.',
      serverError: 'El registro fallo por un error del servidor. Intenta mas tarde.',
      unableToRegister: 'No se pudo registrar. Intenta de nuevo.',
    },
  },
  newInspection: {
    title: 'Nueva inspeccion',
    selectPlaceholder: 'Selecciona un tipo de formulario',
    createSession: 'Crear sesion',
  },
  newForm: {
    title: 'Nuevo formulario',
    selectPlaceholder: 'Selecciona un tipo de formulario',
    createSession: 'Crear sesion',
  },
  myInspections: {
    title: 'Mis inspecciones',
    deleteModal: {
      header: 'Eliminar inspeccion?',
      confirmPrefix: 'Esto eliminara permanentemente',
      confirmSuffix: '. Esta accion no se puede deshacer.',
    },
    failedUploadMessage: (count: number) =>
      count === 1
        ? 'Una inspeccion no pudo subirse. Usa Reintentar para probar de nuevo.'
        : `${count} inspecciones no pudieron subirse. Usa Reintentar para probar de nuevo.`,
    filters: {
      filterByFormType: 'Filtrar por tipo de formulario',
      filterByStatus: 'Filtrar por estado',
      clearFilters: 'Limpiar filtros',
      allFormTypes: 'Todos los tipos de formulario',
      allStatuses: 'Todos los estados',
    },
    emptyState: {
      noInspections: 'No se encontraron inspecciones.',
      createNewInspectionLink: 'Crear una nueva inspeccion',
      createNewInspectionSuffix: 'para comenzar.',
      noMatchingFilters: 'No hay inspecciones que coincidan con los filtros seleccionados.',
    },
    table: {
      name: 'Nombre',
      formType: 'Tipo de formulario',
      status: 'Estado',
      actions: 'Acciones',
      empty: 'No hay inspecciones',
      buttons: {
        view: 'Ver',
        open: 'Abrir',
        retry: 'Reintentar',
        delete: 'Eliminar',
      },
    },
    createNewInspection: 'Crear nueva inspeccion',
  },
  fillForm: {
    loading: 'Cargando...',
    errorLoadingSchema: 'Error al cargar el esquema del formulario',
    sessionNameRequired: 'El nombre de la sesion es obligatorio.',
    confirmDetailsError: 'Confirma que los datos son correctos antes de enviar.',
    successMessage: 'Inspeccion guardada correctamente y almacenada localmente.',
    formValidationErrorsHeader: 'Errores de validacion del formulario',
    sessionNameLabel: 'Nombre de la sesion',
    sessionNamePlaceholder: 'Ingresa un nombre para esta sesion de inspeccion',
    sessionIdLabel: 'ID de sesion',
    formTypeLabel: 'Tipo de formulario',
    resetForm: 'Restablecer formulario',
    reviewStepTitle: 'Revision',
    review: {
      confirmationRequiredHeader: 'Confirmacion requerida',
      sessionDetailsHeader: 'Detalles de la sesion',
      finalConfirmationLabel: 'Confirmacion final',
      finalConfirmationText: 'Confirmo que los datos son correctos y estan listos para enviar.',
    },
    wizard: {
      stepNumberLabel: (stepNumber: number) => `Paso ${stepNumber}`,
      collapsedStepsLabel: (stepNumber: number, stepsCount: number) =>
        `Paso ${stepNumber} de ${stepsCount}`,
      skipToButtonLabel: (title: string, stepNumber: number) =>
        `Ir a ${title} (Paso ${stepNumber})`,
      navigationAriaLabel: 'Pasos del formulario',
      cancelButton: 'Cancelar',
      previousButton: 'Anterior',
      nextButton: 'Siguiente',
      submitButton: 'Enviar',
    },
  },
  debugInspection: {
    title: 'Depurar inspeccion',
    backToMyInspections: 'Volver a mis inspecciones',
    filesHeader: 'Archivos en el formulario',
    schemaLoadError: 'No se pudo cargar el esquema del formulario.',
    noFilesFound: 'No se encontraron archivos o firmas.',
    table: {
      fileName: 'Nombre de archivo',
      size: 'Tamano',
      fileType: 'Tipo de archivo',
      download: 'Descargar',
      preview: 'Vista previa',
    },
    previewTitle: 'Vista previa',
    close: 'Cerrar',
    errors: {
      missingInspectionId: 'Falta el ID de inspeccion.',
      parseInspection: 'No se pudo analizar la inspeccion.',
      parseFormData: 'No se pudo analizar los datos del formulario.',
    },
  },
  formRenderer: {
    signature: {
      saving: 'Guardando...',
      save: 'Guardar firma',
      clear: 'Borrar',
    },
    placeholders: {
      selectOne: 'Selecciona una opcion',
      selectMultiple: 'Selecciona opciones',
    },
    filePreview: {
      header: 'Vista previa de archivo',
      download: 'Descargar',
      close: 'Cerrar',
      previewNotAvailable: 'Vista previa no disponible para este tipo de archivo.',
      unableToLoad: 'No se pudo cargar la vista previa.',
    },
  },
} as const;
