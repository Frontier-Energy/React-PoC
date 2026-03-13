import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SelectProps, TableProps } from '@cloudscape-design/components';
import { useLocation, useNavigate } from 'react-router-dom';
import { getUserId, hasPermission, isLoggedInAdmin } from '../auth';
import { filterInspections, getInspectionsByUploadStatus } from '../domain/inspectionList';
import { useLocalization } from '../LocalizationContext';
import { platform } from '../platform';
import { inspectionRepository } from '../repositories/inspectionRepository';
import { useTenantBootstrap } from '../TenantBootstrapContext';
import { FormType, type InspectionSession, UploadStatus } from '../types';
import { inspectionApplicationService } from './inspectionApplicationService';
import { subscribeToInspectionStatusChanged } from './inspectionEvents';

export const useMyInspectionsController = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { labels } = useLocalization();
  const { config } = useTenantBootstrap();
  const inspectionScopeRefreshKey = `${config.tenantId}:${getUserId() ?? 'anonymous'}`;
  const [inspections, setInspections] = useState<InspectionSession[]>([]);
  const [formTypeFilter, setFormTypeFilter] = useState<SelectProps.Option | null>(null);
  const [statusFilter, setStatusFilter] = useState<SelectProps.Option | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [sortingColumn, setSortingColumn] = useState<TableProps.SortingColumn<InspectionSession>>({
    sortingField: 'name',
  });
  const [sortingDescending, setSortingDescending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InspectionSession | null>(null);

  const loadInspections = useCallback(() => {
    void inspectionRepository.loadAll().then(setInspections);
  }, []);

  useEffect(() => {
    loadInspections();
  }, [inspectionScopeRefreshKey, loadInspections]);

  useEffect(() => {
    const handleStatusChange = () => {
      loadInspections();
    };

    const unsubscribeStatusChanged = subscribeToInspectionStatusChanged(handleStatusChange);
    const unsubscribeRepository = inspectionRepository.subscribe(handleStatusChange);
    return () => {
      unsubscribeStatusChanged();
      unsubscribeRepository();
    };
  }, [loadInspections]);

  useEffect(() => {
    if (!location.state?.successMessage) {
      return;
    }

    setSuccessMessage(location.state.successMessage);
    const timer = platform.runtime.setTimeout(() => setSuccessMessage(null), 5000);
    return () => platform.runtime.clearTimeout(timer);
  }, [location.state]);

  const filteredInspections = useMemo(
    () =>
      filterInspections(inspections, {
        formType: formTypeFilter?.value ?? null,
        status: statusFilter?.value ?? null,
      }),
    [formTypeFilter?.value, inspections, statusFilter?.value]
  );

  const failedInspections = useMemo(() => getInspectionsByUploadStatus(inspections, UploadStatus.Failed), [inspections]);
  const conflictedInspections = useMemo(() => getInspectionsByUploadStatus(inspections, UploadStatus.Conflict), [inspections]);

  const handleOpenInspection = useCallback(
    (inspection: InspectionSession) => {
      void inspectionApplicationService.activateInspectionSession(inspection).then(() => {
        navigate(`/fill-form/${inspection.id}`);
      });
    },
    [navigate]
  );

  const handleViewInspection = useCallback(
    (inspection: InspectionSession) => {
      if (isLoggedInAdmin() && hasPermission('customization.admin')) {
        navigate(`/support?inspectionId=${encodeURIComponent(inspection.id)}`);
        return;
      }

      navigate(`/debug-inspection/${inspection.id}`, {
        state: {
          inspectionScope: {
            tenantId: inspection.tenantId,
            userId: inspection.userId,
          },
        },
      });
    },
    [navigate]
  );

  const handleConfirmDeleteInspection = useCallback(() => {
    if (!deleteTarget) {
      return;
    }

    void (async () => {
      await inspectionApplicationService.deleteInspection(deleteTarget);
      setDeleteTarget(null);
      loadInspections();
    })();
  }, [deleteTarget, loadInspections]);

  const handleRetryInspection = useCallback(
    (inspection: InspectionSession) => {
      void (async () => {
        await inspectionApplicationService.retryInspectionUpload(inspection);
        loadInspections();
      })();
    },
    [loadInspections]
  );

  const formTypeOptions: SelectProps.Option[] = useMemo(
    () => [
      { label: labels.myInspections.filters.allFormTypes, value: '' },
      ...Object.values(FormType).map((type) => ({
        label: labels.formTypes[type],
        value: type,
      })),
    ],
    [labels.formTypes, labels.myInspections.filters.allFormTypes]
  );

  const statusOptions: SelectProps.Option[] = useMemo(
    () => [
      { label: labels.myInspections.filters.allStatuses, value: '' },
      { label: labels.uploadStatus[UploadStatus.Local], value: UploadStatus.Local },
      { label: labels.uploadStatus[UploadStatus.InProgress], value: UploadStatus.InProgress },
      { label: labels.uploadStatus[UploadStatus.Uploading], value: UploadStatus.Uploading },
      { label: labels.uploadStatus[UploadStatus.Uploaded], value: UploadStatus.Uploaded },
      { label: labels.uploadStatus[UploadStatus.Failed], value: UploadStatus.Failed },
      { label: labels.uploadStatus[UploadStatus.Conflict], value: UploadStatus.Conflict },
    ],
    [labels.myInspections.filters.allStatuses, labels.uploadStatus]
  );

  return {
    labels,
    inspections,
    filteredInspections,
    failedInspections,
    conflictedInspections,
    formTypeFilter,
    statusFilter,
    successMessage,
    sortingColumn,
    sortingDescending,
    deleteTarget,
    formTypeOptions,
    statusOptions,
    setFormTypeFilter,
    setStatusFilter,
    setSuccessMessage,
    setDeleteTarget,
    setSortingColumn,
    setSortingDescending,
    handleOpenInspection,
    handleViewInspection,
    handleConfirmDeleteInspection,
    handleRetryInspection,
    handleCancelDeleteInspection: () => setDeleteTarget(null),
    handleOpenNewInspection: () => navigate('/new-inspection'),
    clearFilters: () => {
      setFormTypeFilter(null);
      setStatusFilter(null);
    },
  };
};
