import { AppLayout, SideNavigation, BreadcrumbGroup, StatusIndicator, Box, Table, Header, SpaceBetween, FormField, Select, Link } from '@cloudscape-design/components';
import { Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useConnectivity } from './ConnectivityContext';
import { clearUserId } from './auth';
import { InspectionSession, UploadStatus } from './types';
import type { SelectProps } from '@cloudscape-design/components';
import { useLocalization } from './LocalizationContext';
import { isLanguageCode, type LanguageCode } from './resources/translations';
import { CUSTOMIZATION_STORAGE_KEY, getActiveTenant, getTenantById, TENANTS } from './config';

export function Layout() {
  const navigate = useNavigate();
  const { status, lastCheckedAt } = useConnectivity();
  const { labels, language, setLanguage } = useLocalization();
  const resolvedTenant = getActiveTenant();
  const [activeDrawerId, setActiveDrawerId] = useState<string | null>(null);
  type Customization = {
    tenantId: string;
    theme: string;
    font: string;
    language: LanguageCode;
  };
  const [customization, setCustomization] = useState<Customization>(() => {
    const defaults: Customization = {
      tenantId: resolvedTenant.tenantId,
      theme: resolvedTenant.uiDefaults.theme,
      font: resolvedTenant.uiDefaults.font,
      language,
    };
    const stored = localStorage.getItem(CUSTOMIZATION_STORAGE_KEY);
    if (!stored) {
      return defaults;
    }
    try {
      const parsed = JSON.parse(stored) as Partial<Customization>;
      const merged = { ...defaults, ...parsed };
      const validTenant = merged.tenantId ? getTenantById(merged.tenantId) : undefined;
      return {
        ...merged,
        tenantId: validTenant?.tenantId ?? defaults.tenantId,
        language: isLanguageCode(merged.language) ? merged.language : defaults.language,
      };
    } catch (error) {
      console.error('Failed to parse customization settings:', error);
      return defaults;
    }
  });
  const activeTenant = getTenantById(customization.tenantId) ?? resolvedTenant;
  const [statusCounts, setStatusCounts] = useState<Record<UploadStatus, number>>(() => ({
    [UploadStatus.Local]: 0,
    [UploadStatus.InProgress]: 0,
    [UploadStatus.Uploading]: 0,
    [UploadStatus.Uploaded]: 0,
    [UploadStatus.Failed]: 0,
  }));

  const statusType = status === 'online' ? 'success' : status === 'offline' ? 'error' : 'in-progress';
  const statusLabel =
    status === 'online'
      ? labels.connectivity.status.online
      : status === 'offline'
        ? labels.connectivity.status.offline
        : labels.connectivity.status.checking;
  const iconFill = status === 'online' ? '#1d8102' : status === 'offline' ? '#d13212' : '#879596';

  useEffect(() => {
    const loadStatusCounts = () => {
      const sessionMap: Record<string, InspectionSession> = {};
      const keys = Object.keys(localStorage);

      keys.forEach((key) => {
        if (key.startsWith('inspection_')) {
          const sessionStr = localStorage.getItem(key);
          if (sessionStr) {
            try {
              const session: InspectionSession = JSON.parse(sessionStr);
              sessionMap[session.id] = session;
            } catch (error) {
              console.error(`Failed to parse session ${key}:`, error);
            }
          }
        }
      });

      const counts: Record<UploadStatus, number> = {
        [UploadStatus.Local]: 0,
        [UploadStatus.InProgress]: 0,
        [UploadStatus.Uploading]: 0,
        [UploadStatus.Uploaded]: 0,
        [UploadStatus.Failed]: 0,
      };

      Object.values(sessionMap).forEach((session) => {
        const uploadStatus = session.uploadStatus || UploadStatus.Local;
        counts[uploadStatus] += 1;
      });

      setStatusCounts(counts);
    };

    const handleStatusChange = () => loadStatusCounts();
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('inspection_')) {
        loadStatusCounts();
      }
    };

    loadStatusCounts();
    window.addEventListener('inspection-status-changed', handleStatusChange as EventListener);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('inspection-status-changed', handleStatusChange as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const statusLabels: Record<UploadStatus, string> = labels.uploadStatus;

  const themeOptions: SelectProps.Option[] = [
    {
      label: labels.customization.themeOptions.mist.label,
      value: 'mist',
      description: labels.customization.themeOptions.mist.description,
    },
    {
      label: labels.customization.themeOptions.harbor.label,
      value: 'harbor',
      description: labels.customization.themeOptions.harbor.description,
    },
    {
      label: labels.customization.themeOptions.sand.label,
      value: 'sand',
      description: labels.customization.themeOptions.sand.description,
    },
    {
      label: labels.customization.themeOptions.night.label,
      value: 'night',
      description: labels.customization.themeOptions.night.description,
    },
  ];

  const themeStyles: Record<
    string,
    {
      bgColor: string;
      textColor: string;
      footerBg: string;
      footerText: string;
      footerHover: string;
      flyoutBg: string;
      flyoutText: string;
      flyoutBorder: string;
    }
  > = {
    mist: {
      bgColor: '#f7f8fa',
      textColor: '#1a1a1a',
      footerBg: '#1a1a1a',
      footerText: '#f5f5f5',
      footerHover: '#ffffff',
      flyoutBg: '#ffffff',
      flyoutText: '#1a1a1a',
      flyoutBorder: '#d5dbe3',
    },
    harbor: {
      bgColor: '#eef3f9',
      textColor: '#1b1f2a',
      footerBg: '#1b2b3a',
      footerText: '#f0f4f8',
      footerHover: '#ffffff',
      flyoutBg: '#ffffff',
      flyoutText: '#1b1f2a',
      flyoutBorder: '#ccd5df',
    },
    sand: {
      bgColor: '#f7f2ea',
      textColor: '#2b2118',
      footerBg: '#3b2f24',
      footerText: '#f6efe6',
      footerHover: '#ffffff',
      flyoutBg: '#ffffff',
      flyoutText: '#2b2118',
      flyoutBorder: '#dccfbe',
    },
    night: {
      bgColor: '#12161c',
      textColor: '#e6e9ef',
      footerBg: '#0b0f14',
      footerText: '#cfd6df',
      footerHover: '#ffffff',
      flyoutBg: '#151b22',
      flyoutText: '#e6e9ef',
      flyoutBorder: '#2a3442',
    },
  };

  const fontOptions: SelectProps.Option[] = [
    {
      label: labels.customization.fontOptions.sourceSansPro.label,
      value: '"Source Sans Pro", "Helvetica Neue", Arial, sans-serif',
      description: labels.customization.fontOptions.sourceSansPro.description,
    },
    {
      label: labels.customization.fontOptions.georgia.label,
      value: 'Georgia, "Times New Roman", serif',
      description: labels.customization.fontOptions.georgia.description,
    },
    {
      label: labels.customization.fontOptions.tahoma.label,
      value: 'Tahoma, "Trebuchet MS", Arial, sans-serif',
      description: labels.customization.fontOptions.tahoma.description,
    },
  ];

  const languageOptions: SelectProps.Option[] = [
    { label: labels.customization.languageOptions.en, value: 'en' },
    { label: labels.customization.languageOptions.es, value: 'es' },
  ];
  const tenantOptions: SelectProps.Option[] = TENANTS.map((tenant) => ({
    label: tenant.displayName,
    value: tenant.tenantId,
  }));

  useEffect(() => {
    document.body.classList.add('app-theme');
    const themeStyle = themeStyles[customization.theme] ?? themeStyles.mist;
    document.documentElement.style.setProperty('--app-bg-color', themeStyle.bgColor);
    document.documentElement.style.setProperty('--app-text-color', themeStyle.textColor);
    document.documentElement.style.setProperty('--app-footer-bg-color', themeStyle.footerBg);
    document.documentElement.style.setProperty('--app-footer-text-color', themeStyle.footerText);
    document.documentElement.style.setProperty('--app-footer-link-hover', themeStyle.footerHover);
    document.documentElement.style.setProperty('--app-flyout-bg-color', themeStyle.flyoutBg);
    document.documentElement.style.setProperty('--app-flyout-text-color', themeStyle.flyoutText);
    document.documentElement.style.setProperty('--app-flyout-border-color', themeStyle.flyoutBorder);
    document.documentElement.style.setProperty('--app-font-family', customization.font);
    document.documentElement.style.setProperty('--font-family-base-gmnpzl', customization.font);
    document.body.style.setProperty('--font-family-base-gmnpzl', customization.font);
    localStorage.setItem(CUSTOMIZATION_STORAGE_KEY, JSON.stringify(customization));
    return () => {
      document.body.classList.remove('app-theme');
    };
  }, [customization]);

  useEffect(() => {
    setCustomization((prev) => (prev.language === language ? prev : { ...prev, language }));
  }, [language]);

  const statusOrder: UploadStatus[] = [
    UploadStatus.Local,
    UploadStatus.InProgress,
    UploadStatus.Uploading,
    UploadStatus.Uploaded,
    UploadStatus.Failed,
  ];

  const statsItems = statusOrder.map((statusValue) => ({
    status: statusValue,
    label: statusLabels[statusValue],
    count: statusCounts[statusValue],
  }));

  return (
    <AppLayout
      breadcrumbs={
        <BreadcrumbGroup items={[]} onFollow={() => {}} />
      }
      contentHeader={
        <div className="app-layout-header">
          <span>{labels.app.title}</span>
          <span className="app-layout-tenant-label">{activeTenant.displayName}</span>
        </div>
      }
      content={
        <div className="app-content">
          <Outlet />
          <footer className="app-footer">
            {labels.app.poweredBy}{' '}
            <Link href="https://frontierenergy.com" external externalIconAriaLabel={labels.app.brand}>
              {labels.app.brand}
            </Link>
          </footer>
        </div>
      }
      drawers={[
        {
          id: 'connectivity',
          ariaLabels: {
            drawerName: labels.drawers.connectivity.name,
            triggerButton: labels.drawers.connectivity.trigger,
          },
          trigger: {
            iconSvg: (
              <span style={{ color: iconFill, display: 'inline-flex' }}>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
                  <circle cx="9" cy="9" r="6" fill="currentColor" />
                </svg>
              </span>
            ),
          },
          content: (
            <Box>
              <StatusIndicator type={statusType}>
                {statusLabel}
                {lastCheckedAt ? labels.connectivity.lastCheckedAt(lastCheckedAt.toLocaleTimeString()) : ''}
              </StatusIndicator>
            </Box>
          ),
        },
        {
          id: 'inspection-stats',
          ariaLabels: {
            drawerName: labels.drawers.inspectionStats.name,
            triggerButton: labels.drawers.inspectionStats.trigger,
          },
          trigger: {
            iconSvg: (
              <span style={{ display: 'inline-flex' }}>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
                  <rect x="2" y="9" width="3" height="7" fill="currentColor" />
                  <rect x="7.5" y="5" width="3" height="11" fill="currentColor" />
                  <rect x="13" y="2" width="3" height="14" fill="currentColor" />
                </svg>
              </span>
            ),
          },
          content: (
            <SpaceBetween size="s">
              <Header variant="h3">{labels.inspectionStats.header}</Header>
              <Table
                variant="embedded"
                trackBy="status"
                columnDefinitions={[
                  {
                    id: 'status',
                    header: labels.inspectionStats.statusHeader,
                    cell: (item) => item.label,
                  },
                  {
                    id: 'count',
                    header: labels.inspectionStats.countHeader,
                    cell: (item) => item.count,
                  },
                ]}
                items={statsItems}
                empty={
                  <Box textAlign="center" color="inherit">
                    <b>{labels.inspectionStats.empty}</b>
                  </Box>
                }
              />
            </SpaceBetween>
          ),
        },
        {
          id: 'customization',
          ariaLabels: {
            drawerName: labels.drawers.customization.name,
            triggerButton: labels.drawers.customization.trigger,
          },
          trigger: {
            iconSvg: (
              <span style={{ display: 'inline-flex' }}>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
                  <circle cx="6" cy="5" r="2" fill="currentColor" />
                  <circle cx="12" cy="13" r="2" fill="currentColor" />
                  <rect x="8" y="4" width="6" height="2" fill="currentColor" />
                  <rect x="4" y="12" width="6" height="2" fill="currentColor" />
                </svg>
              </span>
            ),
          },
          content: (
            <SpaceBetween size="s">
              <Header variant="h3">{labels.customization.header}</Header>
              <FormField label={labels.customization.tenantLabel}>
                <Select
                  selectedOption={
                    tenantOptions.find((option) => option.value === customization.tenantId) ?? tenantOptions[0]
                  }
                  onChange={(event) =>
                    setCustomization((prev) => {
                      const selectedTenantId = event.detail.selectedOption.value;
                      const nextTenant = selectedTenantId ? getTenantById(selectedTenantId) : undefined;
                      if (!nextTenant) {
                        return prev;
                      }
                      return {
                        ...prev,
                        tenantId: nextTenant.tenantId,
                        theme: nextTenant.uiDefaults.theme,
                        font: nextTenant.uiDefaults.font,
                      };
                    })
                  }
                  options={tenantOptions}
                />
              </FormField>
              <FormField label={labels.customization.themeLabel}>
                <Select
                  selectedOption={
                    themeOptions.find((option) => option.value === customization.theme) ?? themeOptions[0]
                  }
                  onChange={(event) =>
                    setCustomization((prev) => ({
                      ...prev,
                      theme: event.detail.selectedOption.value ?? prev.theme,
                    }))
                  }
                  options={themeOptions}
                />
              </FormField>
              <FormField label={labels.customization.fontLabel}>
                <Select
                  selectedOption={
                    fontOptions.find((option) => option.value === customization.font) ?? fontOptions[0]
                  }
                  onChange={(event) =>
                    setCustomization((prev) => ({
                      ...prev,
                      font: event.detail.selectedOption.value ?? prev.font,
                    }))
                  }
                  options={fontOptions}
                />
              </FormField>
              <FormField label={labels.customization.languageLabel}>
                <Select
                  selectedOption={
                    languageOptions.find((option) => option.value === customization.language) ?? languageOptions[0]
                  }
                  onChange={(event) => {
                    const selectedValue = event.detail.selectedOption.value;
                    const nextLanguage = isLanguageCode(selectedValue) ? selectedValue : customization.language;
                    setLanguage(nextLanguage);
                    setCustomization((prev) => ({
                      ...prev,
                      language: nextLanguage,
                    }));
                  }}
                  options={languageOptions}
                />
              </FormField>
              <Box fontSize="body-s" color="text-body-secondary">
                {labels.customization.preferencesSaved}
              </Box>
            </SpaceBetween>
          ),
        },
      ]}
      activeDrawerId={activeDrawerId}
      onDrawerChange={({ detail }) => setActiveDrawerId(detail.activeDrawerId)}
      navigation={
        <SideNavigation
          items={[
            { type: 'link', text: labels.nav.newInspection, href: '#/new-inspection' },
            { type: 'link', text: labels.nav.myInspections, href: '#/my-inspections' },
            { type: 'link', text: labels.nav.logout, href: '#/logout' },
          ]}
          onFollow={(event) => {
            event.preventDefault();
            if (event.detail.href === '#/logout') {
              clearUserId();
              navigate('/login');
              return;
            }
            navigate(event.detail.href.replace('#', ''));
          }}
        />
      }
    />
  );
}
