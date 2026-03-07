import { AppLayout, SideNavigation, BreadcrumbGroup, StatusIndicator, Box, Table, Header, SpaceBetween, FormField, Select, Link } from '@cloudscape-design/components';
import { Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useConnectivity } from './ConnectivityContext';
import {
  clearFontPreference,
  clearThemePreference,
  getAppPreferenceState,
  setFontPreference,
  setLanguagePreference,
  setSelectedTenantId,
  setThemePreference,
  subscribeToAppPreferenceState,
} from './appState';
import { clearUserId, getUserId, hasPermission, isLoggedInAdmin } from './auth';
import { UploadStatus } from './types';
import type { SelectProps, SideNavigationProps } from '@cloudscape-design/components';
import { useLocalization } from './LocalizationContext';
import { formatTemplate, isLanguageCode } from './resources/translations';
import { getActiveTenant, getTenantById, TENANTS } from './config';
import { inspectionRepository } from './repositories/inspectionRepository';
import { useTenantBootstrap } from './TenantBootstrapContext';

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

export function Layout() {
  const navigate = useNavigate();
  const { status, lastCheckedAt } = useConnectivity();
  const { labels, language } = useLocalization();
  const { config, refreshConfig } = useTenantBootstrap();
  const [activeDrawerId, setActiveDrawerId] = useState<string | null>(null);
  const [themePreferenceState, setThemePreferenceState] = useState<string | null>(() => getAppPreferenceState().theme);
  const [fontPreferenceState, setFontPreferenceState] = useState<string | null>(() => getAppPreferenceState().font);
  const activeTenant = getTenantById(config.tenantId) ?? getActiveTenant();
  const activeTheme = themePreferenceState ?? config.theme;
  const activeFont = fontPreferenceState ?? config.font;
  const inspectionScopeRefreshKey = `${config.tenantId}:${getUserId() ?? 'anonymous'}`;
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
      const inspections = inspectionRepository.loadAll();

      const counts: Record<UploadStatus, number> = {
        [UploadStatus.Local]: 0,
        [UploadStatus.InProgress]: 0,
        [UploadStatus.Uploading]: 0,
        [UploadStatus.Uploaded]: 0,
        [UploadStatus.Failed]: 0,
      };

      inspections.forEach((session) => {
        const uploadStatus = session.uploadStatus || UploadStatus.Local;
        counts[uploadStatus] += 1;
      });

      setStatusCounts(counts);
    };

    const handleStatusChange = () => loadStatusCounts();
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || inspectionRepository.isInspectionStorageKey(event.key)) {
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
  }, [inspectionScopeRefreshKey]);

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
  const canSelectTenant = isLoggedInAdmin() && hasPermission('tenant.select');
  const isLoggedIn = Boolean(getUserId());

  useEffect(() => {
    document.body.classList.add('app-theme');
    const themeStyle = themeStyles[activeTheme] ?? themeStyles.mist;
    document.documentElement.style.setProperty('--app-bg-color', themeStyle.bgColor);
    document.documentElement.style.setProperty('--app-text-color', themeStyle.textColor);
    document.documentElement.style.setProperty('--app-footer-bg-color', themeStyle.footerBg);
    document.documentElement.style.setProperty('--app-footer-text-color', themeStyle.footerText);
    document.documentElement.style.setProperty('--app-footer-link-hover', themeStyle.footerHover);
    document.documentElement.style.setProperty('--app-flyout-bg-color', themeStyle.flyoutBg);
    document.documentElement.style.setProperty('--app-flyout-text-color', themeStyle.flyoutText);
    document.documentElement.style.setProperty('--app-flyout-border-color', themeStyle.flyoutBorder);
    document.documentElement.style.setProperty('--app-font-family', activeFont);
    document.documentElement.style.setProperty('--font-family-base-gmnpzl', activeFont);
    document.body.style.setProperty('--font-family-base-gmnpzl', activeFont);
    return () => {
      document.body.classList.remove('app-theme');
    };
  }, [activeFont, activeTheme]);

  useEffect(
    () =>
      subscribeToAppPreferenceState((state, changedKeys) => {
        if (changedKeys.includes('theme')) {
          setThemePreferenceState((prev) => (prev === state.theme ? prev : state.theme));
        }
        if (changedKeys.includes('font')) {
          setFontPreferenceState((prev) => (prev === state.font ? prev : state.font));
        }
      }),
    []
  );

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

  const navigationItems: SideNavigationProps.Item[] = [
    { type: 'link', text: labels.nav.newInspection, href: '#/new-inspection' },
    { type: 'link', text: labels.nav.myInspections, href: '#/my-inspections' },
  ];
  if (config.loginRequired) {
    navigationItems.push({ type: 'link', text: labels.nav.logout, href: '#/logout' });
  }

  const drawers = [
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
            {lastCheckedAt
              ? formatTemplate(labels.connectivity.lastCheckedAt, {
                time: lastCheckedAt.toLocaleTimeString(),
              })
              : ''}
          </StatusIndicator>
        </Box>
      ),
    },
    ...(config.showInspectionStatsButton
      ? [
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
      ]
      : []),
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
          <Box fontWeight="bold">{labels.customization.userLevelHeader}</Box>
          <FormField label={labels.customization.themeLabel}>
            <Select
              selectedOption={
                themeOptions.find((option) => option.value === activeTheme) ?? themeOptions[0]
              }
              onChange={(event) => {
                const nextTheme = event.detail.selectedOption.value ?? activeTheme;
                setThemePreference(nextTheme);
              }}
              options={themeOptions}
            />
          </FormField>
          <FormField label={labels.customization.fontLabel}>
            <Select
              selectedOption={
                fontOptions.find((option) => option.value === activeFont) ?? fontOptions[0]
              }
              onChange={(event) => {
                const nextFont = event.detail.selectedOption.value ?? activeFont;
                setFontPreference(nextFont);
              }}
              options={fontOptions}
            />
          </FormField>
          <FormField label={labels.customization.languageLabel}>
            <Select
              selectedOption={
                languageOptions.find((option) => option.value === language) ?? languageOptions[0]
              }
              onChange={(event) => {
                const selectedValue = event.detail.selectedOption.value;
                const nextLanguage = isLanguageCode(selectedValue) ? selectedValue : language;
                setLanguagePreference(nextLanguage);
              }}
              options={languageOptions}
            />
          </FormField>
          <Box fontWeight="bold">{labels.customization.adminLevelHeader}</Box>
          {canSelectTenant ? (
            <FormField label={labels.customization.tenantLabel}>
              <Select
                selectedOption={
                  tenantOptions.find((option) => option.value === config.tenantId) ?? tenantOptions[0]
                }
                onChange={(event) => {
                  const selectedTenantId = event.detail.selectedOption.value;
                  const nextTenant = selectedTenantId ? getTenantById(selectedTenantId) : undefined;
                  if (!nextTenant) {
                    return;
                  }
                  setSelectedTenantId(nextTenant.tenantId);
                  clearThemePreference();
                  clearFontPreference();
                  void refreshConfig(nextTenant.tenantId);
                }}
                options={tenantOptions}
              />
            </FormField>
          ) : (
            <SpaceBetween size="xs">
              <Box fontSize="body-s" color="text-body-secondary">
                {labels.customization.adminTenantAccessNotice}
              </Box>
              {!isLoggedIn ? (
                <SpaceBetween size="xxs">
                  <Link
                    href="/register"
                    onFollow={(event) => {
                      event.preventDefault();
                      navigate('/register');
                    }}
                  >
                    {labels.customization.registerLink}
                  </Link>
                  <Link
                    href="/login"
                    onFollow={(event) => {
                      event.preventDefault();
                      navigate('/login');
                    }}
                  >
                    {labels.customization.loginLink}
                  </Link>
                </SpaceBetween>
              ) : (
                <Link
                  href="#/logout"
                  onFollow={(event) => {
                    event.preventDefault();
                    clearUserId();
                    navigate('/login');
                  }}
                >
                  {labels.nav.logout}
                </Link>
              )}
            </SpaceBetween>
          )}
          <Box fontSize="body-s" color="text-body-secondary">
            {labels.customization.preferencesSaved}
          </Box>
        </SpaceBetween>
      ),
    },
  ];

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
      drawers={drawers}
      activeDrawerId={activeDrawerId}
      onDrawerChange={({ detail }) => setActiveDrawerId(detail.activeDrawerId)}
      navigationHide={!config.showLeftFlyout}
      toolsHide={!config.showRightFlyout}
      navigation={
        <SideNavigation
          items={navigationItems}
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
