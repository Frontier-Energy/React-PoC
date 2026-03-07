import { Box, Header } from '@cloudscape-design/components';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { setLanguagePreference } from './appState';
import { useLocalization } from './LocalizationContext';
import {
  fetchTenantBootstrapConfig,
  getDefaultTenantBootstrapConfig,
  getDefaultTenantBootstrapConfigForTenant,
  persistSelectedTenant,
  type TenantBootstrapConfig,
} from './tenantBootstrap';

interface TenantBootstrapContextValue {
  loading: boolean;
  config: TenantBootstrapConfig;
  refreshConfig: (tenantId?: string) => Promise<void>;
}

const TenantBootstrapContext = createContext<TenantBootstrapContextValue | undefined>(undefined);

export function TenantBootstrapProvider({ children }: { children: ReactNode }) {
  const { labels } = useLocalization();
  const [config, setConfig] = useState<TenantBootstrapConfig>(() => getDefaultTenantBootstrapConfig());
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);

  const refreshConfig = useCallback(
    async (tenantId?: string) => {
      const requestId = ++requestIdRef.current;
      const fallbackConfig = getDefaultTenantBootstrapConfigForTenant(tenantId);
      setConfig(fallbackConfig);
      persistSelectedTenant(fallbackConfig.tenantId);
      try {
        const resolvedConfig = await fetchTenantBootstrapConfig(tenantId);
        if (requestId !== requestIdRef.current) {
          return;
        }
        setConfig(resolvedConfig);
        persistSelectedTenant(resolvedConfig.tenantId);
        if (resolvedConfig.language) {
          setLanguagePreference(resolvedConfig.language);
        }
      } catch {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setConfig(fallbackConfig);
        persistSelectedTenant(fallbackConfig.tenantId);
      }
    },
    []
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await refreshConfig();
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      active = false;
      requestIdRef.current += 1;
    };
  }, [refreshConfig]);

  const value = useMemo(
    () => ({
      loading,
      config,
      refreshConfig,
    }),
    [loading, config, refreshConfig]
  );

  if (loading) {
    return (
      <Box padding="l">
        <Header variant="h1">{labels.common.loading}</Header>
      </Box>
    );
  }

  return <TenantBootstrapContext.Provider value={value}>{children}</TenantBootstrapContext.Provider>;
}

export function useTenantBootstrap() {
  const context = useContext(TenantBootstrapContext);
  if (!context) {
    throw new Error('useTenantBootstrap must be used within a TenantBootstrapProvider');
  }
  return context;
}
