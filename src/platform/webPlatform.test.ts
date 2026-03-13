import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createBrowserRouterMock = vi.fn((routes) => ({ routes }));
const startPerformanceTelemetryMock = vi.fn();
const registerSWMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    createBrowserRouter: createBrowserRouterMock,
  };
});

vi.mock('../performanceTelemetry', () => ({
  startPerformanceTelemetry: startPerformanceTelemetryMock,
}));

vi.mock('virtual:pwa-register', () => ({
  registerSW: registerSWMock,
}));

describe('webPlatform', () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const originalIndexedDb = globalThis.indexedDB;
  const originalBroadcastChannel = globalThis.BroadcastChannel;
  const originalFetch = globalThis.fetch;
  const originalRandomUUID = globalThis.crypto.randomUUID;
  const originalOnline = navigator.onLine;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectUrl });
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: originalIndexedDb });
    Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: originalBroadcastChannel });
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
    Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: originalRandomUUID });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnline });
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('creates routers and forwards telemetry startup', async () => {
    const { webPlatform } = await import('./webPlatform');
    const routes = [{ path: '/' }];
    const router = webPlatform.routing.createRouter(routes as never);

    webPlatform.telemetry.start(router as never);

    expect(webPlatform.id).toBe('web');
    expect(webPlatform.routing.mode).toBe('browser');
    expect(createBrowserRouterMock).toHaveBeenCalledWith(routes);
    expect(startPerformanceTelemetryMock).toHaveBeenCalledWith(router);
  });

  it('exposes browser storage integrations when available', async () => {
    const BroadcastChannelMock = vi.fn(function MockChannel(this: { name: string }, name: string) {
      this.name = name;
    });
    Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: BroadcastChannelMock });

    const { webPlatform } = await import('./webPlatform');
    const channel = webPlatform.storage.createBroadcastChannel('app-events') as { name: string };

    expect(webPlatform.storage.getLocalStorage()).toBe(window.localStorage);
    expect(webPlatform.storage.getIndexedDb()).toBe(globalThis.indexedDB);
    expect(BroadcastChannelMock).toHaveBeenCalledWith('app-events');
    expect(channel.name).toBe('app-events');
    expect(webPlatform.authSession.getStorage()).toBe(window.localStorage);
  });

  it('returns null for optional storage integrations when unavailable', async () => {
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
    Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: undefined });

    const { webPlatform } = await import('./webPlatform');

    expect(webPlatform.storage.getIndexedDb()).toBeNull();
    expect(webPlatform.storage.createBroadcastChannel('missing')).toBeNull();
  });

  it('handles file access operations and fallback id generation', async () => {
    const createObjectUrlMock = vi.fn(() => 'blob:test');
    const revokeObjectUrlMock = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrlMock });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrlMock });

    const clickMock = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({
      click: clickMock,
      set href(value: string) {
        Reflect.set(this, '_href', value);
      },
      set download(value: string) {
        Reflect.set(this, '_download', value);
      },
    } as unknown as HTMLAnchorElement);

    Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: undefined });
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const { webPlatform } = await import('./webPlatform');
    const blob = new Blob(['file']);

    expect(webPlatform.fileAccess.createObjectUrl(blob)).toBe('blob:test');
    webPlatform.fileAccess.revokeObjectUrl('blob:test');
    webPlatform.fileAccess.downloadBlob(blob, 'report.txt');
    expect(webPlatform.fileAccess.generateId()).toBe('1234-8');

    expect(createObjectUrlMock).toHaveBeenCalledWith(blob);
    expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:test');
    expect(clickMock).toHaveBeenCalledTimes(1);

    createElementSpy.mockRestore();
  });

  it('throws or no-ops when platform file APIs are unavailable', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: undefined });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: undefined });

    const { webPlatform } = await import('./webPlatform');

    expect(() => webPlatform.fileAccess.createObjectUrl(new Blob(['x']))).toThrow(
      'Object URLs are not available on this platform.'
    );
    expect(() => webPlatform.fileAccess.revokeObjectUrl('blob:test')).not.toThrow();

    vi.stubGlobal('document', undefined);
    expect(() => webPlatform.fileAccess.downloadBlob(new Blob(['x']), 'missing.txt')).toThrow(
      'Blob downloads are not available on this platform.'
    );
  });

  it('uses fetch, connectivity status, runtime listeners, and timers', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

    const addWindowListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeWindowListenerSpy = vi.spyOn(window, 'removeEventListener');
    const addDocumentListenerSpy = vi.spyOn(document, 'addEventListener');
    const removeDocumentListenerSpy = vi.spyOn(document, 'removeEventListener');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

    const { webPlatform } = await import('./webPlatform');
    const handler = vi.fn();
    const event = new Event('custom');
    const timer = webPlatform.runtime.setTimeout(handler, 10);

    await webPlatform.connectivity.fetch('/health');
    webPlatform.runtime.dispatchWindowEvent(event);
    webPlatform.runtime.addWindowEventListener('resize', handler);
    webPlatform.runtime.removeWindowEventListener('resize', handler);
    webPlatform.runtime.addDocumentEventListener('visibilitychange', handler);
    webPlatform.runtime.removeDocumentEventListener('visibilitychange', handler);
    webPlatform.runtime.clearTimeout(timer);

    expect(webPlatform.connectivity.getOnlineStatus()).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith('/health', undefined);
    expect(dispatchSpy).toHaveBeenCalledWith(event);
    expect(addWindowListenerSpy).toHaveBeenCalledWith('resize', handler);
    expect(removeWindowListenerSpy).toHaveBeenCalledWith('resize', handler);
    expect(addDocumentListenerSpy).toHaveBeenCalledWith('visibilitychange', handler);
    expect(removeDocumentListenerSpy).toHaveBeenCalledWith('visibilitychange', handler);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
  });

  it('handles missing fetch, navigator status, and window runtime safely', async () => {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: undefined });

    const { webPlatform } = await import('./webPlatform');

    expect(() => webPlatform.connectivity.fetch('/health')).toThrow('Fetch is not available on this platform.');
    expect(webPlatform.connectivity.getOnlineStatus()).toBeNull();

    vi.stubGlobal('window', undefined);

    expect(() => webPlatform.runtime.dispatchWindowEvent(new Event('missing'))).not.toThrow();
    expect(() => webPlatform.runtime.addWindowEventListener('resize', vi.fn())).not.toThrow();
    expect(() => webPlatform.runtime.removeWindowEventListener('resize', vi.fn())).not.toThrow();
    expect(() => webPlatform.runtime.setTimeout(() => undefined, 1)).toThrow(
      'Timers are not available on this platform.'
    );
    expect(() => webPlatform.runtime.clearTimeout(1)).not.toThrow();
  });

  it('registers updates through the PWA bridge', async () => {
    const { webPlatform } = await import('./webPlatform');

    webPlatform.updates.register();
    await vi.dynamicImportSettled();

    expect(registerSWMock).toHaveBeenCalledWith({ immediate: true });
  });
});
