import { Box, Header, Link } from '@cloudscape-design/components';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { setLanguagePreference } from './appState';
import { useLocalization } from './LocalizationContext';
import { offlineObservability } from './offlineObservability';
import { getTenantConfigGovernanceSnapshot, type TenantConfigGovernanceSnapshot } from './tenantConfigGovernance';
import {
  readCachedTenantBootstrapConfig,
  fetchTenantBootstrapConfig,
  getDefaultTenantBootstrapConfig,
  getDefaultTenantBootstrapConfigForTenant,
  persistSelectedTenant,
  type TenantBootstrapConfig,
} from './tenantBootstrap';

export type BootstrapSource = 'network' | 'cache' | 'defaults';
export type BootstrapStatus = 'loading' | 'ready' | 'degraded';

export interface TenantBootstrapDiagnostics {
  status: BootstrapStatus;
  source: BootstrapSource;
  activeTenantId: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  errorMessage?: string;
  governance: TenantConfigGovernanceSnapshot;
}

interface TenantBootstrapContextValue {
  loading: boolean;
  config: TenantBootstrapConfig;
  diagnostics: TenantBootstrapDiagnostics;
  refreshConfig: (tenantId?: string) => Promise<void>;
}

const TenantBootstrapContext = createContext<TenantBootstrapContextValue | undefined>(undefined);

export function TenantBootstrapProvider({ children }: { children: ReactNode }) {
  const { labels } = useLocalization();
  const [config, setConfig] = useState<TenantBootstrapConfig>(() => getDefaultTenantBootstrapConfig());
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<TenantBootstrapDiagnostics>(() => ({
    status: 'loading',
    source: 'defaults',
    activeTenantId: getDefaultTenantBootstrapConfig().tenantId,
    governance: getTenantConfigGovernanceSnapshot(getDefaultTenantBootstrapConfig().tenantId),
  }));
  const requestIdRef = useRef(0);

  const refreshConfig = useCallback(
    async (tenantId?: string) => {
      const requestId = ++requestIdRef.current;
      const fallbackConfig = getDefaultTenantBootstrapConfigForTenant(tenantId);
      const cachedConfig = readCachedTenantBootstrapConfig(tenantId);
      const fallbackSource = cachedConfig ? 'cache' : 'defaults';
      const immediateConfig = cachedConfig?.config ?? fallbackConfig;
      const immediateGovernance = cachedConfig?.governance ?? getTenantConfigGovernanceSnapshot(immediateConfig.tenantId);
      const attemptAt = new Date().toISOString();

      setLoading(true);
      setConfig(immediateConfig);
      persistSelectedTenant(immediateConfig.tenantId);
      if (immediateConfig.language) {
        setLanguagePreference(immediateConfig.language);
      }
      setDiagnostics((current) => ({
        ...current,
        status: 'loading',
        source: fallbackSource,
        activeTenantId: immediateConfig.tenantId,
        lastAttemptAt: attemptAt,
        lastSuccessAt: current.lastSuccessAt ?? cachedConfig?.savedAt,
        errorMessage: undefined,
        governance: immediateGovernance,
      }));
      void offlineObservability.recordBootstrapState(immediateConfig.tenantId, 'loading', fallbackSource, {
        at: Date.parse(attemptAt),
      });
      void offlineObservability.refreshStoragePressure(immediateConfig.tenantId);
      try {
        const resolved = await fetchTenantBootstrapConfig(tenantId);
        if (requestId !== requestIdRef.current) {
          return;
        }
        const resolvedConfig = resolved.config;
        setConfig(resolvedConfig);
        persistSelectedTenant(resolvedConfig.tenantId);
        const successAt = new Date().toISOString();
        setDiagnostics({
          status: 'ready',
          source: 'network',
          activeTenantId: resolvedConfig.tenantId,
          lastAttemptAt: successAt,
          lastSuccessAt: successAt,
          errorMessage: undefined,
          governance: resolved.governance,
        });
        void offlineObservability.recordBootstrapState(resolvedConfig.tenantId, 'ready', 'network', {
          at: Date.parse(successAt),
        });
        void offlineObservability.refreshStoragePressure(resolvedConfig.tenantId, Date.parse(successAt));
        if (resolvedConfig.language) {
          setLanguagePreference(resolvedConfig.language);
        }
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        const nextConfig = cachedConfig?.config ?? fallbackConfig;
        setConfig(nextConfig);
        persistSelectedTenant(nextConfig.tenantId);
        setDiagnostics((current) => ({
          status: 'degraded',
          source: fallbackSource,
          activeTenantId: nextConfig.tenantId,
          lastAttemptAt: attemptAt,
          lastSuccessAt: cachedConfig?.savedAt ?? current.lastSuccessAt,
          errorMessage: error instanceof Error ? error.message : 'Bootstrap failed',
          governance: cachedConfig?.governance ?? getTenantConfigGovernanceSnapshot(nextConfig.tenantId),
        }));
        void offlineObservability.recordBootstrapState(nextConfig.tenantId, 'degraded', fallbackSource, {
          at: Date.parse(attemptAt),
          errorMessage: error instanceof Error ? error.message : 'Bootstrap failed',
        });
        void offlineObservability.refreshStoragePressure(nextConfig.tenantId, Date.parse(attemptAt));
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const load = async () => {
      await refreshConfig();
    };
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [refreshConfig]);

  const value = useMemo(
    () => ({
      loading,
      config,
      diagnostics,
      refreshConfig,
    }),
    [loading, config, diagnostics, refreshConfig]
  );

  return (
    <TenantBootstrapContext.Provider value={value}>
      {diagnostics.status === 'degraded' ? (
        <div className="bootstrap-banner" role="alert">
          <Header variant="h3">
            {diagnostics.source === 'cache' ? labels.bootstrap.staleCacheTitle : labels.bootstrap.defaultsTitle}
          </Header>
          <Box variant="p">
            {diagnostics.source === 'cache' ? labels.bootstrap.staleCacheBody : labels.bootstrap.defaultsBody}
          </Box>
          {diagnostics.source === 'defaults' ? (
            <Link href="https://frontierenergy.com" external externalIconAriaLabel={labels.app.brand}>
              {labels.bootstrap.supportLink}
            </Link>
          ) : null}
        </div>
      ) : null}
      {children}
    </TenantBootstrapContext.Provider>
  );
}

export function useTenantBootstrap() {
  const context = useContext(TenantBootstrapContext);
  if (!context) {
    throw new Error('useTenantBootstrap must be used within a TenantBootstrapProvider');
  }
  return context;
}
