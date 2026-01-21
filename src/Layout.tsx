import { AppLayout, SideNavigation, BreadcrumbGroup, StatusIndicator, Box, Table, Header, SpaceBetween } from '@cloudscape-design/components';
import { Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useConnectivity } from './ConnectivityContext';
import { clearUserId } from './auth';
import { InspectionSession, UploadStatus } from './types';

export function Layout() {
  const navigate = useNavigate();
  const { status, lastCheckedAt } = useConnectivity();
  const [activeDrawerId, setActiveDrawerId] = useState<string | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<UploadStatus, number>>(() => ({
    [UploadStatus.Local]: 0,
    [UploadStatus.InProgress]: 0,
    [UploadStatus.Uploading]: 0,
    [UploadStatus.Uploaded]: 0,
    [UploadStatus.Failed]: 0,
  }));

  const statusType = status === 'online' ? 'success' : status === 'offline' ? 'error' : 'in-progress';
  const statusLabel = status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Checking connection...';
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

  const statusLabels: Record<UploadStatus, string> = {
    [UploadStatus.Local]: 'Local',
    [UploadStatus.InProgress]: 'In Progress',
    [UploadStatus.Uploading]: 'Uploading',
    [UploadStatus.Uploaded]: 'Uploaded',
    [UploadStatus.Failed]: 'Failed',
  };

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
      contentHeader={<div style={{ fontSize: '24px', fontWeight: 'bold', padding: '16px' }}>QHVAC Inspection Tool</div>}
      content={
        <div className="app-content">
          <Outlet />
          <footer className="app-footer">
            Powered By{' '}
            <a href="https://frontierenergy.com" target="_blank" rel="noreferrer">
              QControl
            </a>
          </footer>
        </div>
      }
      drawers={[
        {
          id: 'connectivity',
          ariaLabels: {
            drawerName: 'Connectivity status',
            triggerButton: 'Open connectivity status',
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
                {lastCheckedAt ? ` (last checked ${lastCheckedAt.toLocaleTimeString()})` : ''}
              </StatusIndicator>
            </Box>
          ),
        },
        {
          id: 'inspection-stats',
          ariaLabels: {
            drawerName: 'Inspection statistics',
            triggerButton: 'Open inspection statistics',
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
              <Header variant="h3">Inspection Stats</Header>
              <Table
                variant="embedded"
                trackBy="status"
                columnDefinitions={[
                  {
                    id: 'status',
                    header: 'Status',
                    cell: (item) => item.label,
                  },
                  {
                    id: 'count',
                    header: 'Count',
                    cell: (item) => item.count,
                  },
                ]}
                items={statsItems}
                empty={
                  <Box textAlign="center" color="inherit">
                    <b>No inspections</b>
                  </Box>
                }
              />
            </SpaceBetween>
          ),
        },
      ]}
      activeDrawerId={activeDrawerId}
      onDrawerChange={({ detail }) => setActiveDrawerId(detail.activeDrawerId)}
      navigation={
        <SideNavigation
          items={[
            { type: 'link', text: 'Home', href: '#/' },
            { type: 'link', text: 'New Inspection', href: '#/new-inspection' },
            { type: 'link', text: 'My Inspections', href: '#/my-inspections' },
            { type: 'link', text: 'Log out', href: '#/logout' },
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
