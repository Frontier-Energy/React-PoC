import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LocalizationProvider } from './LocalizationContext';
import { TenantBootstrapProvider, useTenantBootstrap } from './TenantBootstrapContext';
import { cacheTenantBootstrapConfig, getDefaultTenantBootstrapConfigForTenant } from './tenantBootstrap';
import { getFallbackLabels } from './resources/translations/fallback';
import { TENANT_PREFERENCE_STORAGE_KEY } from './appPreferences';

vi.mock('@cloudscape-design/components', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    Box: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Header: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Link: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
  };
});

function DiagnosticsProbe() {
  const { config, diagnostics } = useTenantBootstrap();
  return (
    <div>
      <div data-testid="tenant-id">{config.tenantId}</div>
      <div data-testid="bootstrap-status">{diagnostics.status}</div>
      <div data-testid="bootstrap-source">{diagnostics.source}</div>
      <div data-testid="bootstrap-error">{diagnostics.errorMessage ?? ''}</div>
    </div>
  );
}

const renderSubject = () =>
  render(
    <LocalizationProvider>
      <TenantBootstrapProvider>
        <div>app shell</div>
        <DiagnosticsProbe />
      </TenantBootstrapProvider>
    </LocalizationProvider>
  );

describe('TenantBootstrapProvider', () => {
  const buildTranslationResponse = (language: 'en' | 'es') =>
    new Response(JSON.stringify(getFallbackLabels(language)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders children immediately while bootstrap is still pending', () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/tenant-config')) {
        return new Promise<Response>(() => {});
      }
      if (url.includes('/translations/es')) {
        return Promise.resolve(buildTranslationResponse('es'));
      }
      if (url.includes('/translations/en')) {
        return Promise.resolve(buildTranslationResponse('en'));
      }
      throw new Error(`Unexpected fetch call in TenantBootstrapProvider test: ${url}`);
    });

    renderSubject();

    expect(screen.getByText('app shell')).toBeInTheDocument();
    expect(screen.getByTestId('bootstrap-status')).toHaveTextContent('loading');
  });

  it('shows the support link when bootstrap fails without cached config', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/tenant-config')) {
        return Promise.reject(new Error('network down'));
      }
      if (url.includes('/translations/es')) {
        return Promise.resolve(buildTranslationResponse('es'));
      }
      if (url.includes('/translations/en')) {
        return Promise.resolve(buildTranslationResponse('en'));
      }
      throw new Error(`Unexpected fetch call in TenantBootstrapProvider test: ${url}`);
    });

    renderSubject();

    await waitFor(() => {
      expect(screen.getByTestId('bootstrap-status')).toHaveTextContent('degraded');
      expect(screen.getByTestId('bootstrap-source')).toHaveTextContent('defaults');
    });

    expect(
      screen.getByRole('link', { name: 'QControl filure, please contact support' })
    ).toHaveAttribute('href', 'https://frontierenergy.com');
    expect(screen.getByTestId('bootstrap-error')).toHaveTextContent('network down');
  });

  it('uses stale cache and suppresses the support link when bootstrap refresh fails', async () => {
    localStorage.setItem(TENANT_PREFERENCE_STORAGE_KEY, 'qhvac');
    const cachedConfig = {
      ...getDefaultTenantBootstrapConfigForTenant('qhvac'),
      displayName: 'Cached QHVAC',
    };
    cacheTenantBootstrapConfig(cachedConfig, '2026-03-07T10:00:00.000Z');
    vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/tenant-config')) {
        return Promise.reject(new Error('network down'));
      }
      if (url.includes('/translations/es')) {
        return Promise.resolve(buildTranslationResponse('es'));
      }
      if (url.includes('/translations/en')) {
        return Promise.resolve(buildTranslationResponse('en'));
      }
      throw new Error(`Unexpected fetch call in TenantBootstrapProvider test: ${url}`);
    });

    renderSubject();

    await waitFor(() => {
      expect(screen.getByTestId('tenant-id')).toHaveTextContent('qhvac');
      expect(screen.getByTestId('bootstrap-status')).toHaveTextContent('degraded');
      expect(screen.getByTestId('bootstrap-source')).toHaveTextContent('cache');
    });

    expect(screen.queryByRole('link', { name: 'QControl filure, please contact support' })).not.toBeInTheDocument();
    expect(screen.getByText('Using cached tenant configuration')).toBeInTheDocument();
  });
});
