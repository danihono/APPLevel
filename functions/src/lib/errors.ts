import { HttpsError } from 'firebase-functions/v2/https';

type HttpsErrorCode =
  | 'cancelled'
  | 'unknown'
  | 'invalid-argument'
  | 'deadline-exceeded'
  | 'not-found'
  | 'already-exists'
  | 'permission-denied'
  | 'resource-exhausted'
  | 'failed-precondition'
  | 'aborted'
  | 'out-of-range'
  | 'unimplemented'
  | 'internal'
  | 'unavailable'
  | 'data-loss'
  | 'unauthenticated';

export function assertCondition(
  condition: unknown,
  code: HttpsErrorCode,
  message: string,
): asserts condition {
  if (!condition) {
    throw new HttpsError(code, message);
  }
}
