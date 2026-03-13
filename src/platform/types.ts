import type { Router as RemixRouter } from '@remix-run/router';
import type { RouteObject } from 'react-router-dom';

export interface PlatformKeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key?(index: number): string | null;
  readonly length?: number;
}

export interface PlatformBroadcastChannel {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: 'message', listener: EventListenerOrEventListenerObject): void;
}

export interface PlatformRouting {
  mode: 'browser';
  createRouter(routes: RouteObject[]): RemixRouter;
}

export interface PlatformStorage {
  getLocalStorage(): PlatformKeyValueStorage | null;
  getIndexedDb(): IDBFactory | null;
  createBroadcastChannel(name: string): PlatformBroadcastChannel | null;
}

export interface PlatformFileAccess {
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
  downloadBlob(blob: Blob, fileName: string): void;
  generateId(): string;
}

export interface PlatformAuthSessionPersistence {
  getStorage(): PlatformKeyValueStorage | null;
}

export interface PlatformConnectivity {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  getOnlineStatus(): boolean | null;
  sendBeacon(url: string, data?: BodyInit | null): boolean;
  estimateStorage(): Promise<StorageEstimate | null>;
}

export interface PlatformTelemetry {
  start(router: RemixRouter): void | (() => void);
}

export interface PlatformUpdates {
  register(): void;
}

export interface PlatformRuntime {
  dispatchWindowEvent(event: Event): void;
  addWindowEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean): void;
  removeWindowEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  addDocumentEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean): void;
  removeDocumentEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  getLocation(): Location | null;
  getDocumentVisibilityState(): DocumentVisibilityState | null;
  getElementById(id: string): HTMLElement | null;
  scrollTo(options: ScrollToOptions): void;
  setTimeout(handler: TimerHandler, timeout?: number): number;
  clearTimeout(handle: number): void;
  setInterval(handler: TimerHandler, timeout?: number): number;
  clearInterval(handle: number): void;
}

export interface Platform {
  id: 'web';
  routing: PlatformRouting;
  storage: PlatformStorage;
  fileAccess: PlatformFileAccess;
  authSession: PlatformAuthSessionPersistence;
  connectivity: PlatformConnectivity;
  telemetry: PlatformTelemetry;
  updates: PlatformUpdates;
  runtime: PlatformRuntime;
}
