import { AppLayout, SideNavigation, BreadcrumbGroup, StatusIndicator, Box } from '@cloudscape-design/components';
import { Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useConnectivity } from './ConnectivityContext';
import { clearUserId } from './auth';

export function Layout() {
  const navigate = useNavigate();
  const { status, lastCheckedAt } = useConnectivity();
  const [activeDrawerId, setActiveDrawerId] = useState<string | null>(null);

  const statusType = status === 'online' ? 'success' : status === 'offline' ? 'error' : 'in-progress';
  const statusLabel = status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Checking connection...';
  const iconFill = status === 'online' ? '#1d8102' : status === 'offline' ? '#d13212' : '#879596';

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
