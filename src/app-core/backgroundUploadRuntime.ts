export {
  createBackgroundUploadRuntime,
  type BackgroundUploadConnectivityStatus,
  type BackgroundUploadRuntime,
} from './backgroundUpload/runtimeCoordinator';

import { createBackgroundUploadRuntime } from './backgroundUpload/runtimeCoordinator';

export const backgroundUploadRuntime = createBackgroundUploadRuntime();
