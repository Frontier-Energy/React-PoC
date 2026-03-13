import { createBrowserRouter } from 'react-router-dom';
import { startPerformanceTelemetry } from '../../app-core/performanceTelemetry';
import type { Platform, PlatformBroadcastChannel, PlatformKeyValueStorage } from '../../app-core/platform/types';

const getLocalStorage = (): PlatformKeyValueStorage | null => {
  if (typeof window === 'undefined' || !('localStorage' in window)) {
    return null;
  }

  return window.localStorage ?? null;
};

const getIndexedDb = (): IDBFactory | null => {
  if (typeof globalThis === 'undefined' || !('indexedDB' in globalThis)) {
    return null;
  }

  return globalThis.indexedDB ?? null;
};

const createBroadcastChannel = (name: string): PlatformBroadcastChannel | null => {
  if (typeof globalThis === 'undefined' || typeof globalThis.BroadcastChannel === 'undefined') {
    return null;
  }

  return new globalThis.BroadcastChannel(name);
};

const createObjectUrl = (blob: Blob) => {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('Object URLs are not available on this platform.');
  }

  return URL.createObjectURL(blob);
};

const revokeObjectUrl = (url: string) => {
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') {
    return;
  }

  URL.revokeObjectURL(url);
};

const downloadBlob = (blob: Blob, fileName: string) => {
  if (typeof document === 'undefined') {
    throw new Error('Blob downloads are not available on this platform.');
  }

  const url = createObjectUrl(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  revokeObjectUrl(url);
};

const generateId = () => {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const fetchThroughPlatform = (input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Fetch is not available on this platform.');
  }

  return globalThis.fetch(input, init);
};

const getOnlineStatus = () => {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
    return null;
  }

  return navigator.onLine;
};

const sendBeaconThroughPlatform = (url: string, data?: BodyInit | null) => {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
    return false;
  }

  return navigator.sendBeacon(url, data);
};

const estimateStorage = async () => {
  if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.estimate !== 'function') {
    return null;
  }

  return navigator.storage.estimate();
};

const register = () => {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
};

const dispatchWindowEvent = (event: Event) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(event);
};

const addWindowEventListener = (
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: AddEventListenerOptions | boolean
) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (typeof options === 'undefined') {
    window.addEventListener(type, listener);
    return;
  }

  window.addEventListener(type, listener, options);
};

const removeWindowEventListener = (type: string, listener: EventListenerOrEventListenerObject) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.removeEventListener(type, listener);
};

const addDocumentEventListener = (
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: AddEventListenerOptions | boolean
) => {
  if (typeof document === 'undefined') {
    return;
  }

  if (typeof options === 'undefined') {
    document.addEventListener(type, listener);
    return;
  }

  document.addEventListener(type, listener, options);
};

const removeDocumentEventListener = (type: string, listener: EventListenerOrEventListenerObject) => {
  if (typeof document === 'undefined') {
    return;
  }

  document.removeEventListener(type, listener);
};

const getLocation = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.location;
};

const getDocumentVisibilityState = () => {
  if (typeof document === 'undefined') {
    return null;
  }

  return document.visibilityState;
};

const getElementById = (id: string) => {
  if (typeof document === 'undefined') {
    return null;
  }

  return document.getElementById(id);
};

const scrollTo = (options: ScrollToOptions) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.scrollTo(options);
};

const setTimeoutThroughPlatform = (handler: TimerHandler, timeout?: number) => {
  if (typeof window === 'undefined') {
    throw new Error('Timers are not available on this platform.');
  }

  return window.setTimeout(handler, timeout);
};

const clearTimeoutThroughPlatform = (handle: number) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.clearTimeout(handle);
};

const setIntervalThroughPlatform = (handler: TimerHandler, timeout?: number) => {
  if (typeof window === 'undefined') {
    throw new Error('Timers are not available on this platform.');
  }

  return window.setInterval(handler, timeout);
};

const clearIntervalThroughPlatform = (handle: number) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.clearInterval(handle);
};

const connectivity = {
  fetch: fetchThroughPlatform,
  getOnlineStatus,
  sendBeacon: sendBeaconThroughPlatform,
  estimateStorage,
};

const runtime = {
  dispatchWindowEvent,
  addWindowEventListener,
  removeWindowEventListener,
  addDocumentEventListener,
  removeDocumentEventListener,
  getLocation,
  getDocumentVisibilityState,
  getElementById,
  scrollTo,
  setTimeout: setTimeoutThroughPlatform,
  clearTimeout: clearTimeoutThroughPlatform,
  setInterval: setIntervalThroughPlatform,
  clearInterval: clearIntervalThroughPlatform,
};

export const webPlatform: Platform = {
  id: 'web',
  routing: {
    mode: 'browser',
    createRouter: (routes) => createBrowserRouter(routes),
  },
  storage: {
    getLocalStorage,
    getIndexedDb,
    createBroadcastChannel,
  },
  fileAccess: {
    createObjectUrl,
    revokeObjectUrl,
    downloadBlob,
    generateId,
  },
  authSession: {
    getStorage: getLocalStorage,
  },
  connectivity,
  telemetry: {
    start: (router) => startPerformanceTelemetry(router, { connectivity, runtime }),
  },
  updates: {
    register,
  },
  runtime,
};
