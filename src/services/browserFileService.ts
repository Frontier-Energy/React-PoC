import { platform } from '../platform';

export interface BrowserFileService {
  downloadBlob: (blob: Blob, fileName: string) => void;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
}

export const createBrowserFileService = (): BrowserFileService => ({
  downloadBlob: (blob, fileName) => platform.fileAccess.downloadBlob(blob, fileName),
  createObjectUrl: (blob) => platform.fileAccess.createObjectUrl(blob),
  revokeObjectUrl: (url) => platform.fileAccess.revokeObjectUrl(url),
});

export const browserFileService = createBrowserFileService();
