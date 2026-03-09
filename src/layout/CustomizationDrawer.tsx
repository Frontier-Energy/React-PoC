import { Box, FormField, Header, Link, Select, SpaceBetween } from '@cloudscape-design/components';
import type { SelectProps } from '@cloudscape-design/components';
import { useNavigate } from 'react-router-dom';
import {
  clearFontPreference,
  clearThemePreference,
  setFontPreference,
  setLanguagePreference,
  setSelectedTenantId,
  setThemePreference,
} from '../appState';
import { clearUserId } from '../auth';
import { getTenantById } from '../config';
import { isLanguageCode, type Labels, type LanguageCode } from '../resources/translations';

interface CustomizationDrawerProps {
  labels: Labels;
  language: LanguageCode;
  activeTheme: string;
  activeFont: string;
  configTenantId: string;
  canSelectTenant: boolean;
  isLoggedIn: boolean;
  themeOptions: SelectProps.Option[];
  fontOptions: SelectProps.Option[];
  languageOptions: SelectProps.Option[];
  tenantOptions: SelectProps.Option[];
  refreshConfig: (tenantId?: string) => Promise<void>;
  showSupportConsoleLink: boolean;
  onOpenSupportConsole: () => void;
  diagnostics: {
    status: string;
    source: string;
    activeTenantId: string;
    lastAttemptAt?: string;
    lastSuccessAt?: string;
    errorMessage?: string;
  };
  bootstrapStatusLabel: string;
  bootstrapSourceLabel: string;
}

export function CustomizationDrawer({
  labels,
  language,
  activeTheme,
  activeFont,
  configTenantId,
  canSelectTenant,
  isLoggedIn,
  themeOptions,
  fontOptions,
  languageOptions,
  tenantOptions,
  refreshConfig,
  showSupportConsoleLink,
  onOpenSupportConsole,
  diagnostics,
  bootstrapStatusLabel,
  bootstrapSourceLabel,
}: CustomizationDrawerProps) {
  const navigate = useNavigate();

  return (
    <SpaceBetween size="s">
      <Header variant="h3">{labels.customization.header}</Header>
      <Box fontWeight="bold">{labels.customization.userLevelHeader}</Box>
      <FormField label={labels.customization.themeLabel}>
        <Select
          selectedOption={themeOptions.find((option) => option.value === activeTheme) ?? themeOptions[0]}
          onChange={(event) => {
            const nextTheme = event.detail.selectedOption.value ?? activeTheme;
            setThemePreference(nextTheme);
          }}
          options={themeOptions}
        />
      </FormField>
      <FormField label={labels.customization.fontLabel}>
        <Select
          selectedOption={fontOptions.find((option) => option.value === activeFont) ?? fontOptions[0]}
          onChange={(event) => {
            const nextFont = event.detail.selectedOption.value ?? activeFont;
            setFontPreference(nextFont);
          }}
          options={fontOptions}
        />
      </FormField>
      <FormField label={labels.customization.languageLabel}>
        <Select
          selectedOption={languageOptions.find((option) => option.value === language) ?? languageOptions[0]}
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
            selectedOption={tenantOptions.find((option) => option.value === configTenantId) ?? tenantOptions[0]}
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
      {showSupportConsoleLink ? (
        <Link
          href="/support"
          onFollow={(event) => {
            event.preventDefault();
            onOpenSupportConsole();
          }}
        >
          {labels.customization.openSupportConsole}
        </Link>
      ) : null}
      {canSelectTenant ? (
        <SpaceBetween size="xs">
          <Header variant="h3">{labels.bootstrap.diagnosticsHeader}</Header>
          <Box>
            <strong>{labels.bootstrap.statusLabel}:</strong> {bootstrapStatusLabel}
          </Box>
          <Box>
            <strong>{labels.bootstrap.sourceLabel}:</strong> {bootstrapSourceLabel}
          </Box>
          <Box>
            <strong>{labels.bootstrap.tenantLabel}:</strong> {diagnostics.activeTenantId}
          </Box>
          <Box>
            <strong>{labels.bootstrap.lastAttemptLabel}:</strong>{' '}
            {diagnostics.lastAttemptAt ? new Date(diagnostics.lastAttemptAt).toLocaleString() : labels.common.notProvided}
          </Box>
          <Box>
            <strong>{labels.bootstrap.lastSuccessLabel}:</strong>{' '}
            {diagnostics.lastSuccessAt ? new Date(diagnostics.lastSuccessAt).toLocaleString() : labels.common.notProvided}
          </Box>
          <Box>
            <strong>{labels.bootstrap.errorLabel}:</strong> {diagnostics.errorMessage ?? labels.common.notProvided}
          </Box>
        </SpaceBetween>
      ) : null}
    </SpaceBetween>
  );
}
