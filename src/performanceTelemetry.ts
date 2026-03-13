import { getActiveEnvironment, getActiveTenant } from './config';
import type { PlatformConnectivity, PlatformRuntime } from './platform/types';

type TelemetryMetricName = 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB' | 'route-transition';
type TelemetryMetricType = 'route-transition' | 'web-vital';
type TelemetryRating = 'good' | 'needs-improvement' | 'poor';

interface TelemetryConfig {
  endpointUrl: string | null;
  sampleRate: number;
}

interface TelemetryEvent {
  app: 'inspection-forms';
  environmentId: string | null;
  href: string;
  metric: TelemetryMetricName;
  path: string;
  rating: TelemetryRating;
  tenantId: string | null;
  timestamp: string;
  type: TelemetryMetricType;
  value: number;
}

interface TelemetryReporter {
  flush: () => void;
  isEnabled: () => boolean;
  reportMetric: (metric: Omit<TelemetryEvent, 'app' | 'environmentId' | 'href' | 'path' | 'tenantId' | 'timestamp'>) => void;
}

interface TelemetryBrowserAdapters {
  connectivity: Pick<PlatformConnectivity, 'fetch' | 'sendBeacon'>;
  runtime: Pick<
    PlatformRuntime,
    | 'addDocumentEventListener'
    | 'addWindowEventListener'
    | 'clearTimeout'
    | 'getDocumentVisibilityState'
    | 'getLocation'
    | 'removeDocumentEventListener'
    | 'removeWindowEventListener'
    | 'setTimeout'
  >;
}

interface RouterLikeState {
  location: {
    pathname: string;
  };
  navigation: {
    state: string;
    location?: {
      pathname: string;
    };
  };
}

interface RouterLike {
  state: RouterLikeState;
  subscribe: (subscriber: (state: RouterLikeState) => void) => () => void;
}

const TELEMETRY_FLUSH_DELAY_MS = 5_000;

const metricThresholds: Record<Exclude<TelemetryMetricName, 'route-transition'>, { poor: number; needsImprovement: number }> = {
  CLS: { poor: 0.25, needsImprovement: 0.1 },
  FCP: { poor: 3_000, needsImprovement: 1_800 },
  INP: { poor: 500, needsImprovement: 200 },
  LCP: { poor: 4_000, needsImprovement: 2_500 },
  TTFB: { poor: 1_800, needsImprovement: 800 },
};

export const clampSampleRate = (value: string | undefined): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.min(1, Math.max(0, parsed));
};

export const classifyMetric = (metric: TelemetryMetricName, value: number): TelemetryRating => {
  if (metric === 'route-transition') {
    if (value > 2_500) {
      return 'poor';
    }

    if (value > 1_200) {
      return 'needs-improvement';
    }

    return 'good';
  }

  const thresholds = metricThresholds[metric];
  if (value > thresholds.poor) {
    return 'poor';
  }

  if (value > thresholds.needsImprovement) {
    return 'needs-improvement';
  }

  return 'good';
};

const resolveTelemetryConfig = (): TelemetryConfig => ({
  endpointUrl: import.meta.env.VITE_PERFORMANCE_TELEMETRY_URL?.trim() || null,
  sampleRate: clampSampleRate(import.meta.env.VITE_PERFORMANCE_TELEMETRY_SAMPLE_RATE),
});

const shouldSampleTelemetry = (sampleRate: number, random = Math.random): boolean => sampleRate > 0 && random() <= sampleRate;

export const createTelemetryReporter = (
  config: TelemetryConfig,
  transport: (events: TelemetryEvent[]) => void,
  random = Math.random,
  runtime: Pick<PlatformRuntime, 'clearTimeout' | 'getLocation' | 'setTimeout'>,
): TelemetryReporter => {
  const enabled = Boolean(config.endpointUrl) && shouldSampleTelemetry(config.sampleRate, random);
  let queue: TelemetryEvent[] = [];
  let timer: number | undefined;

  const flush = () => {
    if (!enabled || queue.length === 0) {
      return;
    }

    const batch = queue;
    queue = [];
    if (timer !== undefined) {
      runtime.clearTimeout(timer);
      timer = undefined;
    }

    transport(batch);
  };

  const scheduleFlush = () => {
    if (timer !== undefined) {
      return;
    }

    timer = runtime.setTimeout(() => {
      timer = undefined;
      flush();
    }, TELEMETRY_FLUSH_DELAY_MS);
  };

  return {
    flush,
    isEnabled: () => enabled,
    reportMetric: (metric) => {
      if (!enabled) {
        return;
      }

      const location = runtime.getLocation();
      queue.push({
        app: 'inspection-forms',
        environmentId: getActiveEnvironment()?.environmentId ?? null,
        href: location?.href ?? '',
        path: location?.pathname ?? '',
        tenantId: getActiveTenant()?.tenantId ?? null,
        timestamp: new Date().toISOString(),
        ...metric,
      });

      scheduleFlush();
    },
  };
};

const createTransport = (
  endpointUrl: string,
  connectivity: Pick<PlatformConnectivity, 'fetch' | 'sendBeacon'>
) => (events: TelemetryEvent[]) => {
  const payload = JSON.stringify({ events });
  const body = new Blob([payload], { type: 'application/json' });

  if (connectivity.sendBeacon(endpointUrl, body)) {
    return;
  }

  void connectivity.fetch(endpointUrl, {
    body: payload,
    headers: {
      'Content-Type': 'application/json',
    },
    keepalive: true,
    method: 'POST',
  });
};

const reportWebVital = (reporter: TelemetryReporter, metric: Exclude<TelemetryMetricName, 'route-transition'>, value: number) => {
  reporter.reportMetric({
    metric,
    rating: classifyMetric(metric, value),
    type: 'web-vital',
    value,
  });
};

const observePaintMetrics = (reporter: TelemetryReporter) => {
  const paintObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntriesByName('first-contentful-paint')) {
      reportWebVital(reporter, 'FCP', entry.startTime);
    }
  });

  paintObserver.observe({ entryTypes: ['paint'] });
};

const observeLcp = (
  reporter: TelemetryReporter,
  runtime: Pick<PlatformRuntime, 'addDocumentEventListener' | 'addWindowEventListener' | 'getDocumentVisibilityState'>
) => {
  let lastLcp = 0;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      lastLcp = entry.startTime;
    }
  });

  observer.observe({ buffered: true, type: 'largest-contentful-paint' });
  const flushLcp = () => {
    if (lastLcp > 0) {
      reportWebVital(reporter, 'LCP', lastLcp);
      lastLcp = 0;
    }
  };

  runtime.addWindowEventListener('pagehide', flushLcp, { once: true });
  runtime.addDocumentEventListener('visibilitychange', () => {
    if (runtime.getDocumentVisibilityState() === 'hidden') {
      flushLcp();
    }
  });
};

const observeCls = (reporter: TelemetryReporter, runtime: Pick<PlatformRuntime, 'addWindowEventListener'>) => {
  let cls = 0;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
      if (!entry.hadRecentInput) {
        cls += entry.value ?? 0;
      }
    }
  });

  observer.observe({ buffered: true, type: 'layout-shift' });
  const flushCls = () => {
    reportWebVital(reporter, 'CLS', cls);
    cls = 0;
  };

  runtime.addWindowEventListener('pagehide', flushCls, { once: true });
};

const observeInp = (reporter: TelemetryReporter, runtime: Pick<PlatformRuntime, 'addWindowEventListener'>) => {
  let maxInp = 0;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as Array<PerformanceEntry & { duration?: number; interactionId?: number }>) {
      if ((entry.interactionId ?? 0) > 0) {
        maxInp = Math.max(maxInp, entry.duration ?? 0);
      }
    }
  });

  observer.observe({ buffered: true, durationThreshold: 40, type: 'event' } as PerformanceObserverInit);
  const flushInp = () => {
    if (maxInp > 0) {
      reportWebVital(reporter, 'INP', maxInp);
      maxInp = 0;
    }
  };

  runtime.addWindowEventListener('pagehide', flushInp, { once: true });
};

const reportTtfb = (reporter: TelemetryReporter) => {
  const [navigationEntry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  if (!navigationEntry) {
    return;
  }

  reportWebVital(reporter, 'TTFB', navigationEntry.responseStart);
};

export const attachRouterPerformanceTelemetry = (
  router: RouterLike,
  reporter: Pick<TelemetryReporter, 'reportMetric'>,
  now: () => number = () => performance.now(),
) => {
  let pendingPath: string | null = null;
  let navigationStartTime = 0;
  let lastSettledPath = router.state.location.pathname;

  return router.subscribe((state) => {
    const targetPath = state.navigation.location?.pathname ?? null;

    if (state.navigation.state !== 'idle' && targetPath && targetPath !== lastSettledPath) {
      pendingPath = targetPath;
      navigationStartTime = now();
      return;
    }

    if (state.navigation.state === 'idle' && pendingPath && state.location.pathname === pendingPath) {
      const duration = Math.max(0, now() - navigationStartTime);
      reporter.reportMetric({
        metric: 'route-transition',
        rating: classifyMetric('route-transition', duration),
        type: 'route-transition',
        value: duration,
      });
      lastSettledPath = pendingPath;
      pendingPath = null;
    }
  });
};

const supportsPerformanceObserver = (): boolean => typeof PerformanceObserver !== 'undefined';

export const startPerformanceTelemetry = (router: RouterLike, browser: TelemetryBrowserAdapters) => {
  const config = resolveTelemetryConfig();
  if (!config.endpointUrl) {
    return;
  }

  const reporter = createTelemetryReporter(config, createTransport(config.endpointUrl, browser.connectivity), Math.random, browser.runtime);
  if (!reporter.isEnabled()) {
    return;
  }

  const unsubscribeRouter = attachRouterPerformanceTelemetry(router, reporter);
  const flush = () => reporter.flush();
  const handleVisibilityChange = () => {
    if (browser.runtime.getDocumentVisibilityState() === 'hidden') {
      flush();
    }
  };

  if (supportsPerformanceObserver()) {
    observePaintMetrics(reporter);
    observeLcp(reporter, browser.runtime);
    observeCls(reporter, browser.runtime);
    observeInp(reporter, browser.runtime);
  }

  browser.runtime.addWindowEventListener('pagehide', flush);
  browser.runtime.addDocumentEventListener('visibilitychange', handleVisibilityChange);
  reportTtfb(reporter);

  return () => {
    unsubscribeRouter();
    browser.runtime.removeWindowEventListener('pagehide', flush);
    browser.runtime.removeDocumentEventListener('visibilitychange', handleVisibilityChange);
  };
};
