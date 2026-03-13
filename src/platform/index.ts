import { webPlatform } from './webPlatform';

export { webPlatform } from './webPlatform';
export type {
  Platform,
  PlatformAuthSessionPersistence,
  PlatformBroadcastChannel,
  PlatformConnectivity,
  PlatformFileAccess,
  PlatformKeyValueStorage,
  PlatformRouting,
  PlatformRuntime,
  PlatformStorage,
  PlatformTelemetry,
  PlatformUpdates,
} from './types';

export const platform = webPlatform;
