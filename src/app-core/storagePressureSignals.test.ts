import { describe, expect, it, vi } from 'vitest';
import { emitStoragePressureEvent, subscribeToStoragePressure } from './storagePressureSignals';

describe('storagePressureSignals', () => {
  it('emits storage pressure events to subscribers and unsubscribes cleanly', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToStoragePressure(listener);

    emitStoragePressureEvent({
      tenantId: 'tenant-a',
      userId: 'user-1',
      scopeKey: 'tenant-a:user-1',
      message: 'quota exceeded',
      at: 123,
    });

    expect(listener).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      userId: 'user-1',
      scopeKey: 'tenant-a:user-1',
      message: 'quota exceeded',
      at: 123,
    });

    unsubscribe();
    listener.mockClear();

    emitStoragePressureEvent({
      tenantId: 'tenant-a',
      userId: 'user-1',
      scopeKey: 'tenant-a:user-1',
      message: 'quota exceeded again',
      at: 124,
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores malformed events without a detail payload', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToStoragePressure(listener);

    window.dispatchEvent(new Event('app-storage-pressure'));

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
