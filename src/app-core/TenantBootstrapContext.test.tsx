import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LocalizationProvider } from './LocalizationContext';
import { TenantBootstrapProvider, useTenantBootstrap } from './TenantBootstrapContext';
import * as appState from './appState';
import { cacheTenantBootstrapConfig, getDefaultTenantBootstrapConfigForTenant } from './tenantBootstrap';
import * as tenantBootstrap from './tenantBootstrap';
import { getTenantConfigGovernanceSnapshot, type TenantConfigGovernanceSnapshot } from './tenantConfigGovernance';
import { getFallbackLabels } from './resources/translations/fallback';
import { TENANT_PREFERENCE_STORAGE_KEY } from './appPreferences';
import { FormType } from './types';

vi.mock('@cloudscape-design/components', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    Box: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Header: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Link: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
  };
});

function DiagnosticsProbe() {
  const { config, diagnostics, loading, refreshConfig } = useTenantBootstrap();
  return (
    <div>
      <div data-testid="tenant-id">{config.tenantId}</div>
      <div data-testid="bootstrap-status">{diagnostics.status}</div>
      <div data-testid="bootstrap-source">{diagnostics.source}</div>
      <div data-testid="bootstrap-error">{diagnostics.errorMessage ?? ''}</div>
      <div data-testid="bootstrap-loading">{String(loading)}</div>
      <button type="button" onClick={() => void refreshConfig('qhvac')}>
        Refresh QHVAC
      </button>
      <button type="button" onClick={() => void refreshConfig('lire')}>
        Refresh LIRE
      </button>
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

const buildGovernanceSnapshot = (tenantId: string, environmentId?: string): TenantConfigGovernanceSnapshot =>
  getTenantConfigGovernanceSnapshot(tenantId, environmentId);

const buildFetchResult = (
  config: tenantBootstrap.TenantBootstrapConfig,
  environmentId?: string
): Awaited<ReturnType<typeof tenantBootstrap.fetchTenantBootstrapConfig>> => ({
  config,
  governance: buildGovernanceSnapshot(config.tenantId, environmentId),
});

describe('TenantBootstrapProvider', () => {
  const buildTranslationResponse = (language: 'en' | 'es') =>
    new Response(JSON.stringify(getFallbackLabels(language)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  const mockTranslationsOnly = () => {
    vi.spyOn(global, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/translations/es')) {
        return Promise.resolve(buildTranslationResponse('es'));
      }
      if (url.includes('/translations/en')) {
        return Promise.resolve(buildTranslationResponse('en'));
      }
      throw new Error(`Unexpected fetch call in TenantBootstrapProvider test: ${url}`);
    });
  };

  const createDeferred = <T,>() => {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

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

  it('applies successful network bootstrap results and updates language preference', async () => {
    mockTranslationsOnly();
    const setLanguagePreferenceSpy = vi.spyOn(appState, 'setLanguagePreference').mockImplementation(() => {});
    vi.spyOn(tenantBootstrap, 'fetchTenantBootstrapConfig').mockResolvedValue({
      config: {
        tenantId: 'qhvac',
        displayName: 'QHVAC',
        theme: 'harbor',
        font: 'Tahoma, "Trebuchet MS", Arial, sans-serif',
        showLeftFlyout: true,
        showRightFlyout: false,
        showInspectionStatsButton: true,
        enabledForms: [FormType.HVAC],
        loginRequired: true,
        language: 'es',
      },
      governance: buildGovernanceSnapshot('qhvac'),
    });

    renderSubject();

    await waitFor(() => {
      expect(screen.getByTestId('tenant-id')).toHaveTextContent('qhvac');
      expect(screen.getByTestId('bootstrap-status')).toHaveTextContent('ready');
      expect(screen.getByTestId('bootstrap-source')).toHaveTextContent('network');
      expect(screen.getByTestId('bootstrap-loading')).toHaveTextContent('false');
    });

    expect(setLanguagePreferenceSpy).toHaveBeenCalledWith('es');
  });

  it('ignores stale refresh responses when a newer refresh has already started', async () => {
    mockTranslationsOnly();
    const initial = createDeferred<Awaited<ReturnType<typeof tenantBootstrap.fetchTenantBootstrapConfig>>>();
    const qhvac = createDeferred<Awaited<ReturnType<typeof tenantBootstrap.fetchTenantBootstrapConfig>>>();
    const lire = createDeferred<Awaited<ReturnType<typeof tenantBootstrap.fetchTenantBootstrapConfig>>>();
    vi.spyOn(tenantBootstrap, 'fetchTenantBootstrapConfig').mockImplementation((tenantId?: string) => {
      if (!tenantId) {
        return initial.promise;
      }
      if (tenantId === 'qhvac') {
        return qhvac.promise;
      }
      if (tenantId === 'lire') {
        return lire.promise;
      }
      throw new Error(`Unexpected tenant id: ${tenantId}`);
    });

    renderSubject();

    initial.resolve(buildFetchResult({
      ...getDefaultTenantBootstrapConfigForTenant(),
      tenantId: 'frontierDemo',
      displayName: 'Frontier Demo',
    }));

    await waitFor(() => {
      expect(screen.getByTestId('bootstrap-status')).toHaveTextContent('ready');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh QHVAC' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh LIRE' }));

    qhvac.resolve(buildFetchResult({
      ...getDefaultTenantBootstrapConfigForTenant('qhvac'),
      tenantId: 'qhvac',
      displayName: 'QHVAC',
    }));

    await waitFor(() => {
      expect(screen.getByTestId('tenant-id')).toHaveTextContent('lire');
      expect(screen.getByTestId('bootstrap-status')).toHaveTextContent('loading');
    });

    lire.resolve(buildFetchResult({
      ...getDefaultTenantBootstrapConfigForTenant('lire'),
      tenantId: 'lire',
      displayName: 'LIRE',
    }));

    await waitFor(() => {
      expect(screen.getByTestId('tenant-id')).toHaveTextContent('lire');
      expect(screen.getByTestId('bootstrap-status')).toHaveTextContent('ready');
      expect(screen.getByTestId('bootstrap-source')).toHaveTextContent('network');
    });
  });

  it('falls back to a generic bootstrap error for non-Error rejections', async () => {
    mockTranslationsOnly();
    vi.spyOn(tenantBootstrap, 'fetchTenantBootstrapConfig').mockRejectedValue('bad payload');

    renderSubject();

    await waitFor(() => {
      expect(screen.getByTestId('bootstrap-status')).toHaveTextContent('degraded');
      expect(screen.getByTestId('bootstrap-error')).toHaveTextContent('Bootstrap failed');
    });
  });

  it('cancels the pending bootstrap request on unmount', async () => {
    mockTranslationsOnly();
    const pending = createDeferred<Awaited<ReturnType<typeof tenantBootstrap.fetchTenantBootstrapConfig>>>();
    vi.spyOn(tenantBootstrap, 'fetchTenantBootstrapConfig').mockReturnValue(pending.promise);

    const { unmount } = renderSubject();
    expect(screen.getByTestId('bootstrap-loading')).toHaveTextContent('true');

    unmount();
    pending.resolve(buildFetchResult({
      ...getDefaultTenantBootstrapConfigForTenant('qhvac'),
      tenantId: 'qhvac',
      displayName: 'QHVAC',
    }));

    await waitFor(() => {
      expect(tenantBootstrap.fetchTenantBootstrapConfig).toHaveBeenCalled();
    });
  });
});

describe('useTenantBootstrap', () => {
  it('throws when used outside the provider', () => {
    const ConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const InvalidConsumer = () => {
      useTenantBootstrap();
      return null;
    };

    expect(() => render(<InvalidConsumer />)).toThrow('useTenantBootstrap must be used within a TenantBootstrapProvider');
    ConsoleError.mockRestore();
  });
});
