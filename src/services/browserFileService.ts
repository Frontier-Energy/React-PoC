export interface BrowserFileService {
  downloadBlob: (blob: Blob, fileName: string) => void;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
}

export const createBrowserFileService = (): BrowserFileService => ({
  downloadBlob: (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  },
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
});

export const browserFileService = createBrowserFileService();
