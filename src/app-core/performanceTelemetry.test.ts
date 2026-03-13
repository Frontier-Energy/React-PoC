import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./config', () => ({
  getActiveEnvironment: () => ({ environmentId: 'test-env' }),
  getActiveTenant: () => ({ tenantId: 'tenant-123' }),
}));

const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState');

type ObserverEntry = {
  duration?: number;
  hadRecentInput?: boolean;
  interactionId?: number;
  startTime?: number;
  value?: number;
};

class MockPerformanceObserver {
  static instances: MockPerformanceObserver[] = [];

  callback: (list: { getEntries: () => ObserverEntry[]; getEntriesByName: (name: string) => ObserverEntry[] }) => void;
  observedOptions?: PerformanceObserverInit;

  constructor(
    callback: (list: { getEntries: () => ObserverEntry[]; getEntriesByName: (name: string) => ObserverEntry[] }) => void,
  ) {
    this.callback = callback;
    MockPerformanceObserver.instances.push(this);
  }

  observe(options: PerformanceObserverInit) {
    this.observedOptions = options;
  }

  disconnect() {
    return undefined;
  }
}

const setVisibilityState = (value: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value,
  });
};

const createTelemetryBrowser = () => ({
  connectivity: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
    sendBeacon: (url: string, data?: BodyInit | null) => window.navigator.sendBeacon?.(url, data) ?? false,
  },
  runtime: {
    addDocumentEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: AddEventListenerOptions | boolean,
    ) => document.addEventListener(type, listener, options),
    addWindowEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: AddEventListenerOptions | boolean,
    ) => window.addEventListener(type, listener, options),
    clearTimeout: (handle: number) => window.clearTimeout(handle),
    getDocumentVisibilityState: () => document.visibilityState,
    getLocation: () => window.location,
    removeDocumentEventListener: (type: string, listener: EventListenerOrEventListenerObject) =>
      document.removeEventListener(type, listener),
    removeWindowEventListener: (type: string, listener: EventListenerOrEventListenerObject) =>
      window.removeEventListener(type, listener),
    setTimeout: (handler: TimerHandler, timeout?: number) => window.setTimeout(handler, timeout),
  },
});

const createRouter = () => {
  const subscribers: Array<(state: any) => void> = [];

  return {
    router: {
      state: {
        location: { pathname: '/home' },
        navigation: { state: 'idle', location: undefined },
      },
      subscribe: (subscriber: (state: any) => void) => {
        subscribers.push(subscriber);
        return vi.fn();
      },
    },
    subscribers,
  };
};

describe('performanceTelemetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.stubGlobal('Blob', class MockBlob {});
    setVisibilityState('visible');
    MockPerformanceObserver.instances = [];
  });

  afterEach(() => {
    if (originalVisibilityState) {
      Object.defineProperty(document, 'visibilityState', originalVisibilityState);
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('clamps sample rates into a valid range', async () => {
    const { clampSampleRate } = await import('./performanceTelemetry');

    expect(clampSampleRate(undefined)).toBe(1);
    expect(clampSampleRate('abc')).toBe(1);
    expect(clampSampleRate('-1')).toBe(0);
    expect(clampSampleRate('0.25')).toBe(0.25);
    expect(clampSampleRate('5')).toBe(1);
  });

  it('classifies route transitions and web vitals', async () => {
    const { classifyMetric } = await import('./performanceTelemetry');

    expect(classifyMetric('route-transition', 800)).toBe('good');
    expect(classifyMetric('route-transition', 1500)).toBe('needs-improvement');
    expect(classifyMetric('route-transition', 3000)).toBe('poor');
    expect(classifyMetric('CLS', 0.08)).toBe('good');
    expect(classifyMetric('CLS', 0.15)).toBe('needs-improvement');
    expect(classifyMetric('CLS', 0.3)).toBe('poor');
  });

  it('keeps telemetry disabled when sampling or endpoint config does not allow reporting', async () => {
    const { createTelemetryReporter } = await import('./performanceTelemetry');
    const transport = vi.fn();
    const browser = createTelemetryBrowser();

    const missingEndpointReporter = createTelemetryReporter({ endpointUrl: null, sampleRate: 1 }, transport, () => 0, browser.runtime);
    const sampledOutReporter = createTelemetryReporter(
      { endpointUrl: 'https://example.test/perf', sampleRate: 0.25 },
      transport,
      () => 0.5,
      browser.runtime,
    );

    expect(missingEndpointReporter.isEnabled()).toBe(false);
    expect(sampledOutReporter.isEnabled()).toBe(false);

    missingEndpointReporter.reportMetric({
      metric: 'FCP',
      rating: 'good',
      type: 'web-vital',
      value: 1000,
    });
    sampledOutReporter.flush();

    expect(transport).not.toHaveBeenCalled();
  });

  it('buffers metrics, enriches them, and flushes once per batch', async () => {
    const { createTelemetryReporter } = await import('./performanceTelemetry');
    const transport = vi.fn();
    const browser = createTelemetryBrowser();
    const reporter = createTelemetryReporter(
      { endpointUrl: 'https://example.test/perf', sampleRate: 1 },
      transport,
      () => 0,
      browser.runtime,
    );

    reporter.reportMetric({
      metric: 'FCP',
      rating: 'good',
      type: 'web-vital',
      value: 1000,
    });
    reporter.reportMetric({
      metric: 'LCP',
      rating: 'needs-improvement',
      type: 'web-vital',
      value: 3200,
    });

    vi.advanceTimersByTime(5_000);

    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toHaveLength(2);
    expect(transport.mock.calls[0][0][0]).toMatchObject({
      app: 'inspection-forms',
      environmentId: 'test-env',
      href: 'http://localhost:3000/',
      metric: 'FCP',
      path: '/',
      tenantId: 'tenant-123',
      type: 'web-vital',
      value: 1000,
    });

    reporter.flush();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('reports route transition timings only after the pending navigation settles', async () => {
    const { attachRouterPerformanceTelemetry } = await import('./performanceTelemetry');
    const { router, subscribers } = createRouter();
    const reportMetric = vi.fn();
    let currentTime = 100;

    attachRouterPerformanceTelemetry(router as any, { reportMetric }, () => currentTime);

    subscribers[0]({
      location: { pathname: '/home' },
      navigation: { state: 'loading', location: { pathname: '/home' } },
    });
    subscribers[0]({
      location: { pathname: '/support' },
      navigation: { state: 'idle', location: undefined },
    });
    expect(reportMetric).not.toHaveBeenCalled();

    subscribers[0]({
      location: { pathname: '/home' },
      navigation: { state: 'loading', location: { pathname: '/support' } },
    });
    currentTime = 50;
    subscribers[0]({
      location: { pathname: '/support' },
      navigation: { state: 'idle', location: undefined },
    });

    expect(reportMetric).toHaveBeenCalledWith({
      metric: 'route-transition',
      rating: 'good',
      type: 'route-transition',
      value: 0,
    });
  });

  it('starts telemetry, reports observer metrics, posts through fetch, and cleans up listeners', async () => {
    vi.stubEnv('VITE_PERFORMANCE_TELEMETRY_URL', 'https://example.test/perf');
    vi.stubEnv('VITE_PERFORMANCE_TELEMETRY_SAMPLE_RATE', '1');
    vi.stubGlobal('PerformanceObserver', MockPerformanceObserver as any);
    vi.spyOn(performance, 'getEntriesByType').mockImplementation((entryType: string) =>
      entryType === 'navigation' ? ([{ responseStart: 900 }] as PerformanceEntryList) : ([] as PerformanceEntryList),
    );
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSpy);
    const sendBeaconSpy = vi.fn().mockReturnValue(false);
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: undefined,
    });

    const addWindowListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeWindowListenerSpy = vi.spyOn(window, 'removeEventListener');
    const addDocumentListenerSpy = vi.spyOn(document, 'addEventListener');
    const removeDocumentListenerSpy = vi.spyOn(document, 'removeEventListener');

    const { startPerformanceTelemetry } = await import('./performanceTelemetry');
    const browser = createTelemetryBrowser();
    const unsubscribeRouter = vi.fn();
    const subscribers: Array<(state: any) => void> = [];
    const stop = startPerformanceTelemetry({
      state: {
        location: { pathname: '/home' },
        navigation: { state: 'idle', location: undefined },
      },
      subscribe: (subscriber) => {
        subscribers.push(subscriber);
        return unsubscribeRouter;
      },
    }, browser);

    expect(stop).toBeTypeOf('function');
    expect(addWindowListenerSpy).toHaveBeenCalledWith('pagehide', expect.any(Function), { once: true });
    expect(addWindowListenerSpy).toHaveBeenCalledWith('pagehide', expect.any(Function), undefined);
    expect(addDocumentListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function), undefined);

    const paintObserver = MockPerformanceObserver.instances.find((observer) =>
      Array.isArray(observer.observedOptions?.entryTypes) && observer.observedOptions?.entryTypes.includes('paint'),
    );
    const lcpObserver = MockPerformanceObserver.instances.find((observer) => observer.observedOptions?.type === 'largest-contentful-paint');
    const clsObserver = MockPerformanceObserver.instances.find((observer) => observer.observedOptions?.type === 'layout-shift');
    const inpObserver = MockPerformanceObserver.instances.find((observer) => observer.observedOptions?.type === 'event');

    paintObserver?.callback({
      getEntries: () => [],
      getEntriesByName: (name) => (name === 'first-contentful-paint' ? [{ startTime: 1700 }] : []),
    });
    lcpObserver?.callback({
      getEntries: () => [{ startTime: 3100 }],
      getEntriesByName: () => [],
    });
    clsObserver?.callback({
      getEntries: () => [{ value: 0.11 }, { hadRecentInput: true, value: 0.9 }],
      getEntriesByName: () => [],
    });
    inpObserver?.callback({
      getEntries: () => [{ interactionId: 1, duration: 600 }, { interactionId: 0, duration: 900 }],
      getEntriesByName: () => [],
    });

    subscribers[0]({
      location: { pathname: '/home' },
      navigation: { state: 'loading', location: { pathname: '/support' } },
    });
    subscribers[0]({
      location: { pathname: '/support' },
      navigation: { state: 'idle', location: undefined },
    });

    setVisibilityState('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    vi.runAllTimers();

    expect(sendBeaconSpy).not.toHaveBeenCalled();
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(0);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.test/perf',
      expect.objectContaining({
        keepalive: true,
        method: 'POST',
      }),
    );

    const metrics = fetchSpy.mock.calls.flatMap(([, request]) =>
      JSON.parse(String(request?.body)).events.map((event: { metric: string }) => event.metric),
    );
    expect(metrics.sort()).toEqual([
      'CLS',
      'FCP',
      'INP',
      'LCP',
      'TTFB',
      'route-transition',
    ]);

    stop?.();

    expect(unsubscribeRouter).toHaveBeenCalledTimes(1);
    expect(removeWindowListenerSpy).toHaveBeenCalledWith('pagehide', expect.any(Function));
    expect(removeDocumentListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('uses sendBeacon transport and skips observers when PerformanceObserver is unavailable', async () => {
    vi.stubEnv('VITE_PERFORMANCE_TELEMETRY_URL', 'https://example.test/perf');
    vi.stubEnv('VITE_PERFORMANCE_TELEMETRY_SAMPLE_RATE', '1');
    vi.stubGlobal('PerformanceObserver', undefined);
    vi.spyOn(performance, 'getEntriesByType').mockImplementation(() => [] as PerformanceEntryList);
    const sendBeaconSpy = vi.fn().mockReturnValue(true);
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeaconSpy,
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { startPerformanceTelemetry } = await import('./performanceTelemetry');
    const browser = createTelemetryBrowser();
    const subscribers: Array<(state: any) => void> = [];
    const stopWithRouteMetric = startPerformanceTelemetry({
      state: {
        location: { pathname: '/home' },
        navigation: { state: 'idle', location: undefined },
      },
      subscribe: (subscriber: (state: any) => void) => {
        subscribers.push(subscriber);
        return vi.fn();
      },
    } as any, browser);

    subscribers[0]({
      location: { pathname: '/home' },
      navigation: { state: 'loading', location: { pathname: '/support' } },
    });
    subscribers[0]({
      location: { pathname: '/support' },
      navigation: { state: 'idle', location: undefined },
    });
    window.dispatchEvent(new Event('pagehide'));

    expect(sendBeaconSpy.mock.calls.length).toBeGreaterThan(0);
    expect(sendBeaconSpy.mock.calls[0][0]).toBe('https://example.test/perf');
    expect(fetchSpy).not.toHaveBeenCalled();

    stopWithRouteMetric?.();
  });

  it('returns early when telemetry env config is absent', async () => {
    vi.stubEnv('VITE_PERFORMANCE_TELEMETRY_URL', '');
    vi.stubEnv('VITE_PERFORMANCE_TELEMETRY_SAMPLE_RATE', '1');
    const addWindowListenerSpy = vi.spyOn(window, 'addEventListener');
    const { startPerformanceTelemetry } = await import('./performanceTelemetry');
    const { router } = createRouter();
    const browser = createTelemetryBrowser();

    const stop = startPerformanceTelemetry(router as any, browser);

    expect(stop).toBeUndefined();
    expect(addWindowListenerSpy).not.toHaveBeenCalled();
  });
});
