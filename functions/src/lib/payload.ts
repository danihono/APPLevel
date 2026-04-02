import { Timestamp } from 'firebase-admin/firestore';
import { assertCondition } from './errors';

type PayloadObject = Record<string, unknown>;

function getField(data: unknown, fieldName: string): unknown {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  return (data as PayloadObject)[fieldName];
}

export function requiredString(data: unknown, fieldName: string): string {
  const value = getField(data, fieldName);
  assertCondition(
    typeof value === 'string' && value.trim().length > 0,
    'invalid-argument',
    `O campo "${fieldName}" e obrigatorio.`,
  );
  return value;
}

export function optionalString(data: unknown, fieldName: string): string | undefined {
  const value = getField(data, fieldName);
  if (value == null) {
    return undefined;
  }

  assertCondition(
    typeof value === 'string',
    'invalid-argument',
    `O campo "${fieldName}" precisa ser texto.`,
  );

  return value.trim().length > 0 ? value : undefined;
}

export function requiredNumber(data: unknown, fieldName: string): number {
  const value = getField(data, fieldName);
  assertCondition(
    typeof value === 'number' && Number.isFinite(value),
    'invalid-argument',
    `O campo "${fieldName}" precisa ser numerico.`,
  );
  return value;
}

export function optionalNumber(data: unknown, fieldName: string): number | undefined {
  const value = getField(data, fieldName);
  if (value == null) {
    return undefined;
  }

  assertCondition(
    typeof value === 'number' && Number.isFinite(value),
    'invalid-argument',
    `O campo "${fieldName}" precisa ser numerico.`,
  );
  return value;
}

export function optionalBoolean(data: unknown, fieldName: string): boolean | undefined;
export function optionalBoolean(data: unknown, fieldName: string, fallback: boolean): boolean;
export function optionalBoolean(
  data: unknown,
  fieldName: string,
  fallback?: boolean,
): boolean | undefined {
  const value = getField(data, fieldName);
  if (value == null) {
    return fallback;
  }

  assertCondition(
    typeof value === 'boolean',
    'invalid-argument',
    `O campo "${fieldName}" precisa ser booleano.`,
  );
  return value;
}

export function optionalStringArray(data: unknown, fieldName: string): string[] | undefined {
  const value = getField(data, fieldName);
  if (value == null) {
    return undefined;
  }

  assertCondition(
    Array.isArray(value),
    'invalid-argument',
    `O campo "${fieldName}" precisa ser uma lista.`,
  );

  const items = value
    .map((entry) => {
      assertCondition(
        typeof entry === 'string',
        'invalid-argument',
        `Cada item de "${fieldName}" precisa ser texto.`,
      );
      return entry;
    })
    .filter((entry) => entry.trim().length > 0);

  return items;
}

export function optionalRecord(
  data: unknown,
  fieldName: string,
): Record<string, string> | undefined {
  const value = getField(data, fieldName);
  if (value == null) {
    return undefined;
  }

  assertCondition(
    typeof value === 'object' && !Array.isArray(value),
    'invalid-argument',
    `O campo "${fieldName}" precisa ser um objeto.`,
  );

  const result: Record<string, string> = {};

  for (const [entryKey, entryValue] of Object.entries(value as PayloadObject)) {
    assertCondition(
      typeof entryValue === 'string',
      'invalid-argument',
      `O valor de "${fieldName}.${entryKey}" precisa ser texto.`,
    );
    result[entryKey] = entryValue;
  }

  return result;
}

function parseTimestampValue(value: unknown): Timestamp | undefined {
  if (value instanceof Timestamp) {
    return value;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Timestamp.fromDate(value);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Timestamp.fromMillis(value);
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return Timestamp.fromDate(parsed);
    }
  }

  if (value && typeof value === 'object') {
    const seconds = (value as { seconds?: unknown }).seconds;
    const nanoseconds = (value as { nanoseconds?: unknown }).nanoseconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
      return new Timestamp(seconds, typeof nanoseconds === 'number' ? nanoseconds : 0);
    }
  }

  return undefined;
}

export function optionalTimestamp(data: unknown, fieldName: string): Timestamp | undefined {
  const value = getField(data, fieldName);
  if (value == null) {
    return undefined;
  }

  const timestamp = parseTimestampValue(value);
  assertCondition(
    !!timestamp,
    'invalid-argument',
    `O campo "${fieldName}" precisa ser uma data valida.`,
  );
  return timestamp;
}
