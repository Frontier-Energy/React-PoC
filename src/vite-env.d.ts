/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_PERFORMANCE_TELEMETRY_URL?: string;
  readonly VITE_PERFORMANCE_TELEMETRY_SAMPLE_RATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
