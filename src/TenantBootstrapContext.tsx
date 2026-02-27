import { Box, Header } from '@cloudscape-design/components';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocalization } from './LocalizationContext';
import {
  fetchTenantBootstrapConfig,
  getDefaultTenantBootstrapConfig,
  persistTenantCustomization,
  type TenantBootstrapConfig,
} from './tenantBootstrap';

interface TenantBootstrapContextValue {
  loading: boolean;
  config: TenantBootstrapConfig;
}

const TenantBootstrapContext = createContext<TenantBootstrapContextValue | undefined>(undefined);

export function TenantBootstrapProvider({ children }: { children: ReactNode }) {
  const { labels, setLanguage } = useLocalization();
  const [config, setConfig] = useState<TenantBootstrapConfig>(() => getDefaultTenantBootstrapConfig());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const resolvedConfig = await fetchTenantBootstrapConfig();
        if (!active) {
          return;
        }
        setConfig(resolvedConfig);
        persistTenantCustomization(resolvedConfig);
        if (resolvedConfig.language) {
          setLanguage(resolvedConfig.language);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        const fallbackConfig = getDefaultTenantBootstrapConfig();
        setConfig(fallbackConfig);
        persistTenantCustomization(fallbackConfig);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [setLanguage]);

  const value = useMemo(
    () => ({
      loading,
      config,
    }),
    [loading, config]
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
