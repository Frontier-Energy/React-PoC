import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { fetchFormSchema } from '../apiContent';
import {
  buildDebugInspectionFileItems,
  formatDebugDuration,
  formatDebugFileSize,
  isPreviewableDebugFile,
  resolveInspectionScope,
} from '../domain/debugInspection';
import type { SyncQueueEntry } from '../domain/syncQueue';
import { useLocalization } from '../LocalizationContext';
import { inspectionRepository } from '../repositories/inspectionRepository';
import { browserFileService } from '../services/browserFileService';
import { syncMonitor, useSyncMonitor } from '../syncMonitor';
import { syncQueue } from '../syncQueue';
import type { FileReference, FormDataValue, FormSchema } from '../types';
import { getFileReferences } from '../utils/formDataUtils';
import { getFile } from '../utils/fileStorage';

export const useDebugInspectionController = () => {
  const { sessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { labels } = useLocalization();
  const syncSnapshot = useSyncMonitor();
  const inspectionScope = useMemo(() => resolveInspectionScope(location.state), [location.state]);
  const [formSchema, setFormSchema] = useState<FormSchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [queueEntry, setQueueEntry] = useState<SyncQueueEntry | null>(null);
  const [inspectionData, setInspectionData] = useState<{
    error?: string;
    inspection?: Awaited<ReturnType<typeof inspectionRepository.loadById>> | null;
    formData?: Awaited<ReturnType<typeof inspectionRepository.loadFormData>> | null;
  }>({});

  const loadQueueEntry = useCallback(async () => {
    if (!sessionId) {
      setQueueEntry(null);
      return;
    }

    const scope = inspectionScope?.tenantId
      ? inspectionScope
      : inspectionData.inspection
        ? { tenantId: inspectionData.inspection.tenantId, userId: inspectionData.inspection.userId }
        : undefined;

    setQueueEntry(await syncQueue.load(sessionId, scope));
  }, [inspectionData.inspection, inspectionScope, sessionId]);

  useEffect(() => {
    let cancelled = false;

    const loadInspectionData = async () => {
      if (!sessionId) {
        if (!cancelled) {
          setInspectionData({ error: labels.debugInspection.errors.missingInspectionId });
        }
        return;
      }

      const inspection = await inspectionRepository.loadById(sessionId, inspectionScope);
      if (!inspection) {
        if (!cancelled) {
          setInspectionData({ inspection: null, formData: null });
        }
        return;
      }

      const formData = await inspectionRepository.loadFormData(sessionId, inspection);
      if (!cancelled) {
        setInspectionData({ inspection, formData });
      }
    };

    void loadInspectionData();

    return () => {
      cancelled = true;
    };
  }, [inspectionScope, labels.debugInspection.errors.missingInspectionId, sessionId]);

  useEffect(() => {
    void loadQueueEntry();
    const unsubscribe = syncQueue.subscribe(() => {
      void loadQueueEntry();
    });

    return unsubscribe;
  }, [loadQueueEntry]);

  useEffect(() => {
    const loadSchema = async () => {
      if (!inspectionData.inspection) {
        return;
      }

      try {
        const schema = await fetchFormSchema(inspectionData.inspection.formType);
        setFormSchema(schema as FormSchema);
        setSchemaError(null);
      } catch {
        setSchemaError(labels.debugInspection.schemaLoadError);
      }
    };

    void loadSchema();
  }, [inspectionData.inspection, labels.debugInspection.schemaLoadError]);

  useEffect(
    () => () => {
      if (previewUrl) {
        browserFileService.revokeObjectUrl(previewUrl);
      }
    },
    [previewUrl]
  );

  const fileItems = useMemo(
    () =>
      buildDebugInspectionFileItems(
        formSchema,
        inspectionData.formData,
        (value) => getFileReferences(value as FormDataValue | undefined)
      ),
    [formSchema, inspectionData.formData]
  );

  const handleDownload = useCallback(async (file: FileReference) => {
    const storedFile = await getFile(file.id);
    if (!storedFile) {
      return;
    }

    browserFileService.downloadBlob(storedFile.blob, file.name);
  }, []);

  const handlePreview = useCallback(
    async (file: FileReference) => {
      if (!isPreviewableDebugFile(file)) {
        return;
      }

      const storedFile = await getFile(file.id);
      if (!storedFile) {
        return;
      }

      if (previewUrl) {
        browserFileService.revokeObjectUrl(previewUrl);
      }

      const nextPreviewUrl = browserFileService.createObjectUrl(storedFile.blob);
      setPreviewUrl(nextPreviewUrl);
      setPreviewName(file.name);
      setPreviewOpen(true);
    },
    [previewUrl]
  );

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
    setPreviewName(null);
    if (previewUrl) {
      browserFileService.revokeObjectUrl(previewUrl);
      setPreviewUrl(null);
    }
  }, [previewUrl]);

  const handleRefreshSyncDiagnostics = useCallback(() => {
    void syncMonitor.refresh();
    void loadQueueEntry();
  }, [loadQueueEntry]);

  const handleRetryQueueEntry = useCallback(() => {
    if (!queueEntry) {
      return;
    }

    void (async () => {
      await syncQueue.retry(queueEntry);
      await syncMonitor.refresh();
      await loadQueueEntry();
    })();
  }, [loadQueueEntry, queueEntry]);

  const handleMoveToDeadLetter = useCallback(() => {
    if (!queueEntry) {
      return;
    }

    void (async () => {
      await syncQueue.moveToDeadLetter(queueEntry, 'Moved to dead-letter by operator');
      await syncMonitor.refresh();
      await loadQueueEntry();
    })();
  }, [loadQueueEntry, queueEntry]);

  return {
    labels,
    navigate,
    syncSnapshot,
    formSchema,
    schemaError,
    previewOpen,
    previewName,
    previewUrl,
    queueEntry,
    inspectionData,
    fileItems,
    formatFileSize: formatDebugFileSize,
    formatDuration: (value: number | null | undefined) => formatDebugDuration(value, labels.common.notProvided),
    formatTimestamp: (value: number | null | undefined) => (!value ? labels.common.notProvided : new Date(value).toLocaleString()),
    isPreviewableImage: isPreviewableDebugFile,
    closePreview,
    handleDownload,
    handlePreview,
    handleRefreshSyncDiagnostics,
    handleRetryQueueEntry,
    handleMoveToDeadLetter,
  };
};
