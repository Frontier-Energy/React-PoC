export const CONTENT_GOVERNANCE_SCHEMA_VERSION = '2026-03-09';
export const CONTENT_RUNTIME_COMPATIBILITY_VERSION = 1;

export interface RuntimeCompatibilityEnvelope {
  minRuntimeVersion?: number;
  maxRuntimeVersion?: number;
}

interface ContentEnvelope<T> {
  schemaVersion?: string;
  artifactVersion?: string;
  compatibility?: RuntimeCompatibilityEnvelope;
  schema?: T;
  labels?: T;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const unwrapContentEnvelope = <T>(payload: unknown, valueKey: 'schema' | 'labels') => {
  if (!isPlainObject(payload)) {
    return {
      artifactVersion: 'legacy',
      schemaVersion: CONTENT_GOVERNANCE_SCHEMA_VERSION,
      compatibility: undefined,
      payload,
    };
  }

  const envelope = payload as ContentEnvelope<T>;
  if (!(valueKey in envelope)) {
    return {
      artifactVersion: 'legacy',
      schemaVersion: CONTENT_GOVERNANCE_SCHEMA_VERSION,
      compatibility: undefined,
      payload,
    };
  }

  return {
    artifactVersion:
      typeof envelope.artifactVersion === 'string' && envelope.artifactVersion.trim()
        ? envelope.artifactVersion.trim()
        : 'legacy',
    schemaVersion:
      typeof envelope.schemaVersion === 'string' && envelope.schemaVersion.trim()
        ? envelope.schemaVersion.trim()
        : CONTENT_GOVERNANCE_SCHEMA_VERSION,
    compatibility: isPlainObject(envelope.compatibility) ? envelope.compatibility : undefined,
    payload: envelope[valueKey],
  };
};

export const assertRuntimeCompatibility = (compatibility: RuntimeCompatibilityEnvelope | undefined, subject: string) => {
  if (!compatibility) {
    return;
  }

  const min = compatibility.minRuntimeVersion;
  const max = compatibility.maxRuntimeVersion;
  if (min !== undefined && (!Number.isInteger(min) || min > CONTENT_RUNTIME_COMPATIBILITY_VERSION)) {
    throw new Error(`${subject} requires runtime version ${String(min)} or newer`);
  }
  if (max !== undefined && (!Number.isInteger(max) || max < CONTENT_RUNTIME_COMPATIBILITY_VERSION)) {
    throw new Error(`${subject} only supports runtime version ${String(max)} or older`);
  }
};
